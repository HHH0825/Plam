from .validation import natural_today
"""Read only dashboard and analysis endpoints."""

from datetime import date

from flask import Blueprint, g, jsonify

from .analytics import build_insights, build_stats, recent_months
from .repository import list_item_rows, monthly_totals, repair_totals


bp = Blueprint("insights", __name__)


@bp.get("/api/mp/stats")
def stats():
    from .purchases import item_totals, spending
    result = build_stats(list_item_rows(g.user_id), item_totals(g.user_id))
    from .validation import money
    from .rewards import capacity
    result['capacity'] = capacity()
    result['all_fixed_expense_total'] = money(spending(g.user_id)['cents'])
    return jsonify(result)


@bp.get("/api/mp/insights")
def insights():
    today = natural_today()
    months = recent_months(today)
    grouped = monthly_totals(g.user_id, months[0])
    from .purchases import ledger
    grouped['fixed'] = {}
    grouped['principal'] = {}
    for payment in ledger():
        month = payment['paid_on'][:7]
        grouped['fixed'][month] = grouped['fixed'].get(month, 0) + payment['cost_cents']
        grouped['principal'][month] = grouped['principal'].get(month, 0) + payment['principal_cents']
    monthly = {month: {key: grouped[key].get(month, 0) for key in ("purchase", "maintenance", "proceeds", "fixed", "principal")}
               for month in months}
    return jsonify(build_insights(today, list_item_rows(g.user_id, today=today.isoformat()),
                                  months, monthly, repair_totals(g.user_id)))
