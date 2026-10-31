"""對話UI的受控HTTP故障替身，僅限loopback及新建隔離SQLite，絕非真實SQL故障證據。"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def create_preview():
    # 先設定，再匯入會讀.env的應用；不使用正式庫、模型或預算帳本。
    os.environ["MES_MODE"] = "simulation"
    os.environ["OPENAI_API_KEY"] = ""
    os.environ["AI_TEST_BUDGET_USD"] = "0"
    from app.main import create_app
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles

    app = create_app(ROOT / ".local" / "ux-http-fixture.db")
    flag = ROOT / ".local" / "ux-http-fixture.flag"

    @app.middleware("http")
    async def fault(request, call_next):
        mode = flag.read_text(encoding="utf-8-sig").strip() if flag.exists() else ""
        guide = request.url.path.endswith("/guide")
        workspace = request.url.path == "/api/workspace"
        if workspace and mode == "workspace-fail":
            return JSONResponse({"message": "HTTP清單讀取故障替身"}, status_code=503)
        if request.url.path.endswith("/reconcile") and mode == "reconcile-fail":
            return JSONResponse({"message": "HTTP查核故障替身"}, status_code=503)
        if guide and request.method == "POST" and mode == "save-fail":
            return JSONResponse({"message": "HTTP保存故障替身"}, status_code=503)
        response = await call_next(request)
        if workspace and mode == "hold-workspace" and request.query_params.get("module") == "report" and request.query_params.get("equipment") == "MC37":
            while flag.exists():
                await asyncio.sleep(0.05)
        if mode == "pending" and request.url.path.endswith("/confirm"):
            return JSONResponse({"message": "HTTP提交回應遺失替身"}, status_code=503)
        if mode == "pending" and request.method == "GET" and (guide or "/proposals/" in request.url.path):
            data = json.loads(b"".join([part async for part in response.body_iterator]))
            if data.get("proposal"):
                data["proposal"]["status"] = "pending"
            return JSONResponse(data, status_code=response.status_code)
        if guide and request.method == "POST" and mode == "save-lost":
            return JSONResponse({"message": "HTTP保存回應遺失替身"}, status_code=503)
        if guide and ((mode == "hold-save" and request.method == "POST") or (mode == "hold-read" and request.method == "GET")):
            # 測試者移除旗標才放行，不以固定延遲猜測操作已完成。
            while flag.exists():
                await asyncio.sleep(0.05)
        return response

    app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True))
    return app


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8007)
    args = parser.parse_args()
    uvicorn.run(create_preview(), host="127.0.0.1", port=args.port)
