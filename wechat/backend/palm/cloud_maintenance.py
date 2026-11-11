"""Bounded garbage collection. Run explicitly or with an existing free scheduled trigger."""
import time
from datetime import datetime, timedelta, timezone
from flask import current_app, g
from . import cloud_repository as repo
from .cloud_runtime import begin
from .cloud_storage import storage
from .cloud_client import CloudBaseError


def run(now=None, max_operations=40):
    if current_app.config['STORAGE_BACKEND'] != 'cloudbase': raise ValueError('Cloud mode required')
    if getattr(g, 'cloud_tx', None): raise RuntimeError('Maintenance cannot share a business transaction')
    instant = now or datetime.now(timezone.utc)
    cutoff = (instant - timedelta(days=30)).isoformat(timespec='seconds')
    epoch = int(instant.timestamp())
    deadline = time.monotonic() + 20
    operations = 0
    client = repo.db()
    def available(): return operations < max_operations and time.monotonic() < deadline
    # Immediately hide expired rows before any child/file deletion. Transactions are small.
    rows = client.page(repo.collection('items'), {'purging': False, 'deleted_at': {'$ne': None, '$lte': cutoff}}, limit=5)
    for candidate in rows:
        if not available(): break
        begin()
        try:
            row = repo.get('items', candidate['id'])
            from .local_migration import retain_cloud
            if row and retain_cloud(row['user_id']):
                client.finish_transaction(g.cloud_tx)
                g.cloud_tx = None
                continue
            if row and row['deleted_at'] and repo.expiry(row['deleted_at']) <= instant and not row.get('purging'):
                g.user_id = row['user_id']
                from .local_migration import gate
                from .membership import put
                state = gate()
                put('local_migration_gate', 'current', {**state, 'version': state['version'] + 1})
                repo.touch(row, {'purging': True})
                if not repo.get('trash_expired', row['id']):
                    repo.put('trash_expired', row['id'], {'user_id': row['user_id'], 'expired_at': repo.expiry(row['deleted_at']).isoformat()})
                repo.queue_photo(row['photo_key'])
            client.finish_transaction(g.cloud_tx, commit=True)
            g.cloud_tx = None
            operations += 1
        except Exception:
            client.finish_transaction(g.cloud_tx)
            g.cloud_tx = None
            raise
    # Parents cannot be restored or changed while purging. Child counts can exceed 100.
    for row in client.page(repo.collection('items'), {'purging': True}, limit=5):
        empty = True
        # Retain financial history; detach links in bounded, conflict-safe steps.
        for name in ('fixed_expenses', 'expense_payments'):
            if not available(): return operations
            linked = client.page(repo.collection(name), {'user_id': row['user_id'], 'item_id': row['id']}, limit=10)
            if linked: empty = False
            for child in linked:
                if not available(): return operations
                begin()
                try:
                    latest = repo.get(name, child['id'])
                    if latest and latest.get('item_id') == row['id']:
                        repo.change(name, child['id'], {'item_id': None, 'item_removed': True,
                                                      'revision': latest.get('revision', 0) + 1})
                    client.finish_transaction(g.cloud_tx, commit=True)
                    g.cloud_tx = None
                    operations += 1
                except Exception:
                    client.finish_transaction(g.cloud_tx)
                    g.cloud_tx = None
                    raise
        for name in ('maintenance_records', 'disposal_records', 'usage_records'):
            if not available(): return operations
            children = client.page(repo.collection(name), {'user_id': row['user_id'], 'item_id': row['id']}, limit=10)
            if children: empty = False
            for child in children:
                if not available(): return operations
                client.delete(repo.collection(name), child['_id'])
                operations += 1
        if empty and available():
            client.delete(repo.collection('items'), row['_id'])
            operations += 1
    for row in client.page(repo.collection('storage_gc'), {'due_at': {'$lte': epoch}}, limit=10):
        if not available(): return operations
        try:
            storage().delete(row['object_id'])
        except CloudBaseError as error:
            # Persist backoff so one unavailable object cannot starve later work.
            attempts = min(int(row.get('attempts', 0)) + 1, 32)
            delay = min(300 * (2 ** min(attempts - 1, 9)), 24 * 3600)
            client.update(repo.collection('storage_gc'), row['_id'], {
                'attempts': attempts, 'due_at': epoch + delay,
                'last_error_code': error.code, 'last_request_id': error.request_id,
            })
            current_app.logger.warning('storage_gc_retry code=%s request_id=%s attempt=%s',
                                       error.code, error.request_id, attempts)
        else:
            client.delete(repo.collection('storage_gc'), row['_id'])
        # Failed attempts also consume the bounded maintenance budget.
        operations += 1
    for name, field, expiry in (('wechat_sessions', 'expires_at', epoch),
                                ('request_receipts', 'expires_at', epoch),
                                ('photo_uploads', 'created_at', epoch - 24 * 3600)):
        if not available(): return operations
        for row in client.page(repo.collection(name), {field: {'$lte': expiry}}, limit=5):
            if not available(): return operations
            client.delete(repo.collection(name), row['_id'])
            operations += 1
    return operations


if __name__ == '__main__':
    import json
    from . import create_app, initialize_app
    app = initialize_app(create_app())
    with app.app_context(): print(json.dumps({'processed': run(), 'bounded': True}))
