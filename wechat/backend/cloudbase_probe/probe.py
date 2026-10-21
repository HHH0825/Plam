"""Exercise only a dedicated collection and uniquely identified synthetic data."""

from datetime import datetime, timezone
from uuid import uuid4

from .client import CloudBaseError, integer_value

COLLECTION = "palm_cloud_probe"


def run_probe(client):
    run_id = uuid4().hex
    ids = [f"probe-{run_id}-{suffix}" for suffix in ("item", "repair-rollback", "repair-commit")]
    result = {"ok": False, "run_id": run_id, "collection": COLLECTION,
              "checks": [], "cleanup": False, "cleanup_status": "unverified",
              "remaining_test_ids": []}
    active_tx = None
    attempted_ids = set()
    first_insert_completed = False

    def record(name):
        result["checks"].append({"name": name, "passed": True})

    def verify(condition):
        if not condition:
            raise CloudBaseError(200, "VERIFICATION_FAILED")

    def fixture(doc_id, **values):
        return {"_id": doc_id, "probe_run": run_id,
                "created_at": datetime.now(timezone.utc).isoformat(), **values}

    def owned(document):
        return isinstance(document, dict) and document.get("probe_run") == run_id

    def read_price(expected, tx_id=None):
        document = client.get(COLLECTION, ids[0], tx_id)
        verify(owned(document) and document.get("name") == "猫爪物帐·中文测试")
        verify(integer_value(document.get("price_cents")) == expected)

    try:
        attempted_ids.add(ids[0])
        inserted = client.insert(COLLECTION, [fixture(ids[0], name="猫爪物帐·中文测试", price_cents=12345)])
        first_insert_completed = True
        verify(inserted == [ids[0]])
        read_price(12345)
        record("create_and_read")
        client.update(COLLECTION, ids[0], {"price_cents": -123})
        read_price(-123)
        record("update_and_integer_cents")

        active_tx = client.start_transaction()
        client.update(COLLECTION, ids[0], {"price_cents": 99999}, active_tx)
        attempted_ids.add(ids[1])
        client.insert(COLLECTION, [fixture(ids[1], repair_cents=250)], active_tx)
        read_price(99999, active_tx)
        verify(owned(client.get(COLLECTION, ids[1], active_tx)))
        client.finish_transaction(active_tx)
        active_tx = None
        read_price(-123)
        verify(client.get(COLLECTION, ids[1]) is None)
        record("transaction_rollback_two_documents")

        active_tx = client.start_transaction()
        client.update(COLLECTION, ids[0], {"price_cents": 4321}, active_tx)
        attempted_ids.add(ids[2])
        client.insert(COLLECTION, [fixture(ids[2], repair_cents=250)], active_tx)
        client.finish_transaction(active_tx, commit=True)
        active_tx = None
        read_price(4321)
        repair = client.get(COLLECTION, ids[2])
        verify(owned(repair) and integer_value(repair.get("repair_cents")) == 250)
        record("transaction_commit_two_documents")
        result["ok"] = True
    except CloudBaseError as error:
        result["error"] = {"http_status": error.status, "code": error.code,
                           "request_id": error.request_id}
        if error.code == "DATABASE_PERMISSION_DENIED":
            result["hint"] = "请核对管理员 API Key 的类型、权限及所属环境；集合保持 ADMINONLY"
            if error.status in (401, 403) and not first_insert_completed and active_tx is None:
                # The very first insert was explicitly rejected, unlike a timeout.
                # No later document was attempted and no transaction was started.
                attempted_ids.clear()
    finally:
        # A transaction whose completion was uncertain is rolled back first.
        rollback_uncertain = False
        if active_tx:
            try:
                client.finish_transaction(active_tx)
            except CloudBaseError:
                rollback_uncertain = True
                result["transaction_cleanup_uncertain"] = True
        for doc_id in ids:
            if doc_id not in attempted_ids:
                continue
            try:
                doc = client.get(COLLECTION, doc_id)
                if doc is not None:
                    verify(owned(doc))
                    client.delete(COLLECTION, doc_id)
                verify(client.get(COLLECTION, doc_id) is None)
            except CloudBaseError:
                result["remaining_test_ids"].append(doc_id)
        result["cleanup"] = not rollback_uncertain and not result["remaining_test_ids"]
        result["cleanup_status"] = ("not_needed" if not attempted_ids else
                                    "verified" if result["cleanup"] else "unverified")
        result["ok"] = result["ok"] and result["cleanup"]
        if result["cleanup"] and attempted_ids:
            record("delete_and_verify_absence")
    return result
