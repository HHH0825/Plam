from .validation import natural_today
"""Monthly snapshots from currently saved, non-deleted records."""
import calendar
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from .database import get_db
from .repository import list_item_rows
from .validation import InputError, money


def month_bounds(month, today):
    if not isinstance(month, str) or not re.fullmatch(r'\d{4}-\d{2}', month):
        raise InputError('月份格式应为 YYYY-MM')
    try:
        start = date.fromisoformat(month + '-01')
    except ValueError:
        raise InputError('月份无效') from None
    if start > today:
        raise InputError('不能查看未来月份')
    return start, min(today, date(start.year, start.month, calendar.monthrange(start.year, start.month)[1]))


def monthly_events(user_id, start, end):
    from .cloud_runtime import enabled
    if enabled():
        from .cloud_repository import monthly_events as cloud_events
        return cloud_events(user_id, start, end)
    result = {}
    for kind, table, column, amount in (
        ('maintenance', 'maintenance_records', 'maintained_on', 'cost_cents'),
        ('disposal', 'disposal_records', 'disposed_on', 'proceeds_cents'),
    ):
        aggregate = f'COALESCE(SUM(e.{amount}), 0)' if amount else '0'
        result[kind] = dict(get_db().execute(
            f'''SELECT COUNT(*) AS count, {aggregate} AS cents FROM {table} e
                JOIN items i ON i.id = e.item_id
                WHERE i.user_id = ? AND i.deleted_at IS NULL AND e.{column} BETWEEN ? AND ?''',
            (user_id, start.isoformat(), end.isoformat()),
        ).fetchone())
    return result


def build_monthly_report(month, today, rows, events):
    start, cutoff = month_bounds(month, today)
    first, last = start.isoformat(), cutoff.isoformat()
    purchases, memories = [], []
    purchase_cents = 0
    from .covers import cover_payload
    from .photo import photo_version
    def cover(row):
        saved = dict(row)
        return {**cover_payload(row), 'photo_url': f"/api/mp/items/{row['id']}/photo" if saved.get('photo_key') else None,
                'photo_version': photo_version(saved.get('photo_key'))}
    for row in rows:
        if first <= row['purchase_date'] <= last:
            purchase_cents += row['purchase_cents']
            purchases.append({'id': row['id'], 'name': row['name'], 'icon_type': row['icon_type'], **cover(row),
                              'purchase_date': row['purchase_date'], 'purchase_price': money(row['purchase_cents'])})
    purchases.sort(key=lambda item: (item['purchase_date'], item['id']), reverse=True)
    highest = max((row['purchase_cents'] for row in rows if first <= row['purchase_date'] <= last), default=None)
    leaders = [
        {'id': row['id'], 'name': row['name'], 'icon_type': row['icon_type'],
         'purchase_price': money(row['purchase_cents']),
         'share': str((Decimal(row['purchase_cents']) * 100 / Decimal(purchase_cents)).quantize(
             Decimal('0.01'), rounding=ROUND_HALF_UP)) if purchase_cents else None}
        for row in rows if first <= row['purchase_date'] <= last and row['purchase_cents'] == highest
    ]
    leaders.sort(key=lambda item: item['id'], reverse=True)
    fixed = events.get('fixed', {'count': 0, 'cents': 0, 'principal_cents': 0})
    return {
        'month': month, 'today': today.isoformat(), 'cutoff_date': last,
        'is_current': month == today.strftime('%Y-%m'),
        'totals': {'purchase_count': len(purchases), 'purchase_total': money(purchase_cents),
                   'maintenance_total': money(events['maintenance']['cents']),
                   'disposal_total': money(events['disposal']['cents']),
                   'fixed_expense_total': money(fixed['cents']), 'installment_principal_total': money(fixed['principal_cents']),
                   'cashflow_net': money(purchase_cents + events['maintenance']['cents'] + fixed['cents'] - events['disposal']['cents']),
                   'usage_count': 0},  # Deprecated compatibility field; usage is not monthly activity.
        'purchases': purchases, 'memories': memories, 'purchase_leaders': leaders,
        'has_activity': bool(purchases or fixed['count'] or events['maintenance']['count'] or events['disposal']['count']),
    }


def monthly_report(user_id, month=None, today=None):
    today = today or natural_today()
    month = month if month is not None else today.strftime('%Y-%m')
    start, cutoff = month_bounds(month, today)
    from .purchases import spending
    events = monthly_events(user_id, start, cutoff)
    events['fixed'] = spending(user_id, start.isoformat(), cutoff.isoformat())
    return build_monthly_report(month, today, list_item_rows(user_id, today=today.isoformat()), events)
