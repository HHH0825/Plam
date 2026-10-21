from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from .photo import save_photo, delete_photo, ensure_thumbnail
from .repository import (item_row, list_item_rows, create_item, update_item, delete_item,
                         set_item_target, set_item_pin)
from .services import item_payload, ensure_purchase_date
from .validation import InputError, body, value, date_value, warranty_value, cents_value, icon_type_value
from .covers import cover_fields, cover_mutation
from .ledger import mutation as ledger_mutation, sync_purchase

bp = Blueprint("items", __name__)

@bp.put("/api/mp/items/<int:item_id>/daily-target")
def daily_target(item_id):
    item_row(item_id)
    from flask import abort
    abort(410, description='日均目标已停用，请更新小程序；相伴天数与费用仍保留')

@bp.route("/api/mp/items", methods=["GET", "POST"])
@cover_mutation
@ledger_mutation
def items():
    if request.method == "GET":
        query = request.args.get("q", "").strip()[:120]
        rows = list_item_rows(g.user_id, query=query)
        return jsonify([item_payload(row) for row in rows])
    data = body()
    name = value(data, "name", "物品名称")
    category = value(data, "category", "分类", 60)
    icon_type = icon_type_value(data, "other")
    purchased = date_value(data, "purchase_date", "购买日期")
    warranty = warranty_value(data, purchased)
    price = cents_value(data, "purchase_price", "购买价格")
    notes = value(data, "notes", "备注", 1000, False)
    status = data.get("status", "active")
    if status not in ("active", "idle"):
        raise InputError("新物品状态只能是使用中或闲置")
    from .locations import location_value
    location = location_value(data)
    item_id = create_item(g.user_id, name, category, icon_type, purchased, warranty, price, notes, status, location, **cover_fields(data))
    sync_purchase(item_id, data, new=True)
    return jsonify(item_payload(item_row(item_id), True)), 201

@bp.route("/api/mp/items/<int:item_id>", methods=["GET", "PUT", "DELETE"])
@cover_mutation
@ledger_mutation
def item_detail(item_id):
    row = item_row(item_id)
    if request.method == "GET":
        return jsonify(item_payload(row, True))
    if request.method == "DELETE":
        delete_item(item_id)
        return "", 204
    data = body()
    if 'payment_info' in data:
        from .cloud_versions import require_revision
        require_revision(dict(row))
    name = value(data, "name", "物品名称")
    category = value(data, "category", "分类", 60)
    icon_type = icon_type_value(data, row["icon_type"])
    purchased = date_value(data, "purchase_date", "购买日期")
    ensure_purchase_date(item_id, purchased)
    warranty = warranty_value(data, purchased, row["warranty_expires_on"])
    price = cents_value(data, "purchase_price", "购买价格")
    notes = value(data, "notes", "备注", 1000, False)
    status = data.get("status")
    allowed = ("disposed",) if row["status"] == "disposed" else ("active", "idle")
    if status not in allowed:
        raise InputError("已处置状态由处置记录决定；其他物品可设为使用中或闲置")
    from .locations import location_value
    extra = {"storage_location_id": location_value(data)} if "storage_location_id" in data else {}
    if row['status'] == 'disposed' and extra and extra['storage_location_id'] != dict(row).get('storage_location_id'):
        raise InputError('已处置物品保留最后收纳位置，不能重新分配')
    extra.update(cover_fields(data, row))
    update_item(item_id, g.user_id, name, category, icon_type, purchased, warranty, price, notes, status, **extra)
    sync_purchase(item_id, data)
    return jsonify(item_payload(item_row(item_id), True))

@bp.route("/api/mp/items/<int:item_id>/photo", methods=["GET", "POST", "DELETE"])
def item_photo(item_id):
    row = item_row(item_id)
    from .cloud_runtime import enabled
    if enabled() and request.method != 'DELETE':
        from flask import abort
        abort(415, description='云端照片请使用上传凭证或下载接口')
    if request.method == "GET":
        size = request.args.get("size", "full")
        if size not in ("thumb", "full"):
            raise InputError("照片尺寸只能为 thumb 或 full")
        if not row["photo_key"]:
            from flask import abort
            abort(404)
        key = ensure_thumbnail(row["photo_key"]) if size == "thumb" else row["photo_key"]
        return send_from_directory(current_app.config["PHOTO_DIR"], key, mimetype="image/jpeg")
    if request.method == "DELETE":
        delete_photo(item_id)
        return "", 204

    save_photo(item_id, request.files.get("photo"))
    return jsonify(item_payload(item_row(item_id), True))

@bp.put("/api/mp/items/<int:item_id>/pin")
def pin_item(item_id):
    item_row(item_id)
    data = body()
    if not isinstance(data.get("is_pinned"), bool):
        raise InputError("置顶状态必须为 true 或 false")
    set_item_pin(item_id, g.user_id, data["is_pinned"])
    return jsonify(item_payload(item_row(item_id)))
