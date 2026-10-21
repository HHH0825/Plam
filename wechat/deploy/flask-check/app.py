"""CloudBase deployment probe. Contains no PALM accounts or business data."""

from datetime import datetime, timezone

from flask import Flask, jsonify, request

app = Flask(__name__)


@app.get("/")
@app.get("/healthz")
def health():
    return jsonify(
        ok=True,
        message="Hello World from Flask!",
        diagnostic_bundle="palm-flask-check-v1",
        method=request.method,
        path=request.path,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/json")
def sample_json():
    return jsonify(code=200, data={"a": 123})


@app.post("/echo")
def echo():
    return jsonify(code=200, requestBody=request.get_json(silent=True) or {})
