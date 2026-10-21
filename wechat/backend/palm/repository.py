"""Storage facade. The provider is selected explicitly, never by fallback."""
from functools import wraps
from flask import current_app

def provider():
    if current_app.config['STORAGE_BACKEND'] == 'cloudbase':
        from . import cloud_repository
        return cloud_repository
    from . import sqlite_repository
    return sqlite_repository

def dispatch(name):
    def call(*args, **kwargs):
        return getattr(provider(), name)(*args, **kwargs)
    call.__name__ = name
    return call

user_by_id = dispatch('user_by_id')
user_by_key = dispatch('user_by_key')
register_user = dispatch('register_user')
update_username = dispatch('update_username')
update_password = dispatch('update_password')
update_avatar = dispatch('update_avatar')
list_item_rows = dispatch('list_item_rows')
item_summary = dispatch('item_summary')
usage_rows = dispatch('usage_rows')
maintenance_rows = dispatch('maintenance_rows')
event_row = dispatch('event_row')
monthly_totals = dispatch('monthly_totals')
repair_totals = dispatch('repair_totals')
create_item = dispatch('create_item')
update_item = dispatch('update_item')
delete_item = dispatch('delete_item')
set_item_target = dispatch('set_item_target')
set_item_pin = dispatch('set_item_pin')
swap_photo_key = dispatch('swap_photo_key')
event_boundary = dispatch('event_boundary')
disposal_by_item = dispatch('disposal_by_item')
create_event = dispatch('create_event')
update_event = dispatch('update_event')
delete_event = dispatch('delete_event')
quick_use_today = dispatch('quick_use_today')
create_disposal = dispatch('create_disposal')
update_disposal = dispatch('update_disposal')
delete_disposal = dispatch('delete_disposal')
item_row = dispatch('item_row')
record_row = dispatch('record_row')
