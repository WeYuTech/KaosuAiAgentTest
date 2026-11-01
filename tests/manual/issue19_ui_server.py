"""Issue #19 的隔離 UI 故障接頭；只監聽 loopback，不使用模型或正式資料。

旗標 .local/issue19-ui.flag：message-rejected／message-unknown／空白。
前兩者只替換訊息 HTTP 回應，用於原句恢復；不代表模型、SQL 或業務寫入驗收。
"""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def create_preview():
    os.environ.update(MES_MODE="simulation", OPENAI_API_KEY="", AI_TEST_BUDGET_USD="0", MES_SQL_ACCEPTANCE="0")
    from app.main import create_app
    from app import model
    from app.store import Store
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles

    model.budget_store = lambda: Store(ROOT / ".local/issue19-ui-budget.db")
    app = create_app(ROOT / ".local/issue19-ui.db")
    flag = ROOT / ".local/issue19-ui.flag"
    log = ROOT / ".local/issue19-ui-http.jsonl"

    @app.middleware("http")
    async def fault(request, call_next):
        mode = flag.read_text(encoding="utf-8-sig").strip() if flag.exists() else ""
        if request.method == "POST" and request.url.path.endswith("/messages") and mode in {"message-rejected", "message-unknown"}:
            response = JSONResponse({"message": "隔離訊息拒絕替身" if mode == "message-rejected" else "隔離訊息送達未知替身"}, status_code=422 if mode == "message-rejected" else 503)
        else:
            response = await call_next(request)
            if request.url.path == "/api/health" and mode.startswith("message-"):
                body = json.loads(b"".join([part async for part in response.body_iterator]))
                body.update(model_configured=True, ui_fixture=True)
                response = JSONResponse(body, status_code=response.status_code)
        with log.open("a", encoding="utf-8") as output:
            output.write(json.dumps({"method": request.method, "path": request.url.path, "status": response.status_code, "fixture": mode}) + "\n")
        return response

    app.mount("/", StaticFiles(directory=ROOT / "frontend/dist", html=True))
    return app


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8021)
    args = parser.parse_args()
    uvicorn.run(create_preview(), host="127.0.0.1", port=args.port, access_log=False)
