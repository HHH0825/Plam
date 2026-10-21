"""Stable cover IDs, separate from user categories and legacy item types."""
from .validation import InputError

# IDs match the editable vector catalogue; existing IDs stay stable.
ICON_CATALOGUE_VERSION = 3
ICON_KEYS = frozenset('phone tablet laptop monitor camera headphones watch gamepad chair lamp fan purifier vacuum cup thermos bowl pan umbrella toiletries shirt coat pants shoes backpack book notebook pen folder bike ebike car suitcase dumbbell yoga-mat ball racket toolbox screwdriver drill storage-box keyboard mouse charger power-bank router external-drive usb-drive printer projector ereader fridge washing-machine air-conditioner television rice-cooker microwave air-fryer kettle coffee-machine iron hair-dryer electric-toothbrush shaver scale lunch-box cutlery perfume comb dress skirt hat scarf gloves glasses handbag wallet calculator stapler pencil-case helmet stroller child-seat jump-rope swim-goggles tent tape-measure flashlight guitar plush-toy necklace lipstick foundation compact eyeshadow mascara serum face-cream sheet-mask makeup-remover makeup-brush'.split())


def cover_fields(data, row=None):
    if row is not None and not {'cover_mode', 'cover_icon_key'} & data.keys():
        return {}  # Older clients must not clear an existing cover.
    saved = dict(row or {})
    mode = data.get('cover_mode', saved.get('cover_mode') or ('photo' if saved.get('photo_key') else 'icon'))
    key = data.get('cover_icon_key', saved.get('cover_icon_key'))
    if mode not in ('photo', 'icon'):
        raise InputError('请选择有效的物品封面方式')
    if key is not None and (not isinstance(key, str) or key not in ICON_KEYS):
        raise InputError('请选择有效的预设图标')
    if mode == 'photo' and not saved.get('photo_key'):
        raise InputError('请先上传照片，上传成功后会自动切换封面')
    return {'cover_mode': mode, 'cover_icon_key': key}


def cover_payload(row):
    saved = dict(row)
    return {'cover_mode': saved.get('cover_mode') or ('photo' if saved.get('photo_key') else 'icon'),
            'cover_icon_key': saved.get('cover_icon_key')}


def cover_mutation(fn):
    """Use workflow receipts for SQLite cover writes as well as cloud writes."""
    from functools import wraps
    @wraps(fn)
    def wrapped(*args, **kwargs):
        from flask import g, request
        from .cloud_runtime import enabled
        data = request.get_json(silent=True)
        if enabled() or request.method not in ('POST', 'PUT') or not isinstance(data, dict) or not {'cover_mode', 'cover_icon_key'} & data.keys():
            return fn(*args, **kwargs)
        from .purchases import mutation
        g.cover_transaction = True
        g.cover_removed_photos = []
        try:
            response = mutation(fn)(*args, **kwargs)
            if response.status_code < 400:
                from .photo import remove_photo_file
                for key in g.cover_removed_photos:
                    remove_photo_file(key)
            return response
        finally:
            g.pop('cover_transaction', None)
            g.pop('cover_removed_photos', None)
    return wrapped
