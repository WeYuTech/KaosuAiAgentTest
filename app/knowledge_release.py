"""管理員以具體候選知識案例核對後發布；不自動訓練或修改業務規則。"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from dotenv import load_dotenv
from app.knowledge import retrieve
from app.store import Store, digest


ROOT = Path(__file__).resolve().parents[1]
CONTENT_FIELDS = ("id", "module", "text", "source", "reviewer")


class ReleaseRejected(Exception):
    """候選沒有完成可證明的回歸驗證。"""


def load_cases(path):
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise ReleaseRejected("案例檔必須是可讀取的 UTF-8 JSON。") from None
    cases = raw.get("cases") if isinstance(raw, dict) else None
    if not isinstance(cases, list) or not 1 <= len(cases) <= 20:
        raise ReleaseRejected("案例檔須包含 1 至 20 筆 cases。")
    for index, case in enumerate(cases, 1):
        if not isinstance(case, dict) or set(case) - {"question", "expected_contains", "forbidden_contains"}:
            raise ReleaseRejected(f"第 {index} 筆案例欄位不正確。")
        if not isinstance(case.get("question"), str) or not 1 <= len(case["question"].strip()) <= 8000:
            raise ReleaseRejected(f"第 {index} 筆案例缺少有效問題。")
        expected = case.get("expected_contains")
        if not isinstance(expected, list) or not expected:
            raise ReleaseRejected(f"第 {index} 筆案例的 expected_contains 不可為空。")
        forbidden = case.get("forbidden_contains", [])
        if not isinstance(forbidden, list) or any(not isinstance(item, str) or not item.strip() for item in expected + forbidden):
            raise ReleaseRejected(f"第 {index} 筆案例判準須為非空字串陣列。")
    return cases


def fixed_regression():
    run = subprocess.run([sys.executable, "-m", "pytest", "tests", "-q"], cwd=ROOT, capture_output=True)
    if run.returncode:
        raise ReleaseRejected("固定回歸測試未通過，候選保持未發布。")
    return {"suite": "公開 HTTP 與 CLI 回歸測試", "sha256": hashlib.sha256(run.stdout + run.stderr).hexdigest()}


def deny_prepare(*args, **kwargs):
    raise ReleaseRejected("候選知識回歸只允許查詢與回答，不得建立操作草稿。")


def candidate_matches(knowledge, candidate):
    return isinstance(knowledge, list) and any(
        isinstance(row, dict) and row.get("id") == candidate["id"]
        and row.get("candidate_hash") == candidate["candidate_hash"]
        and digest({key: row.get(key) for key in CONTENT_FIELDS}) == candidate["candidate_hash"]
        for row in knowledge
    )


def publish_candidate(feedback_id, source, cases, *, model_caller=None, regression_runner=None):
    with source.transaction() as db:
        entry = source.get(db, "FEEDBACK", feedback_id)
        published = [row for row in source.all(db, "KNOWLEDGE") if row.get("status") == "published"]
    if not entry or entry.get("status") != "reviewed":
        raise ReleaseRejected("回饋尚未經主管審核，不可發布。")
    approved_hash = digest(entry)
    corpus_hash = digest(sorted(published, key=lambda row: row["id"]))
    candidate = {key: entry[key] for key in CONTENT_FIELDS}
    candidate_hash = digest(candidate)
    candidate.update(status="published", version=candidate_hash[:12], candidate_hash=candidate_hash)
    fixed_receipt = (regression_runner or fixed_regression)()
    if model_caller is None:
        from app.model import respond
        model_caller = respond
        caller_kind = "OpenAI Responses（共用累計預算）"
    else:
        caller_kind = "測試注入模型邊界（非真實模型驗收）"
    results = []
    with TemporaryDirectory(prefix="kaosu-knowledge-regression-") as temporary:
        isolated = Store(Path(temporary) / "candidate.db")
        with isolated.transaction() as db:
            for item in published:
                isolated.put(db, "KNOWLEDGE", item["id"], item)
            isolated.put(db, "KNOWLEDGE", candidate["id"], candidate)
        for index, case in enumerate(cases, 1):
            found = retrieve(isolated, candidate["module"], case["question"])
            if not candidate_matches(found, candidate):
                raise ReleaseRejected(f"第 {index} 筆案例未檢索到此次候選內容，禁止發布。")
            from app.domain import seed_state
            conversation = {"module": candidate["module"], "context": {}, "messages": [{"role": "user", "content": case["question"]}]}
            result = model_caller(conversation, seed_state(), isolated, prepare_fn=deny_prepare)
            if not isinstance(result, dict) or result.get("action") is not None or result.get("proposal") is not None:
                raise ReleaseRejected(f"第 {index} 筆案例產生操作草稿，禁止發布。")
            if not candidate_matches(result.get("knowledge"), candidate):
                raise ReleaseRejected(f"第 {index} 筆模型結果未證明使用此次候選內容，禁止發布。")
            answer = result.get("content")
            if not isinstance(answer, str) or any(fragment not in answer for fragment in case["expected_contains"]) or any(fragment in answer for fragment in case.get("forbidden_contains", [])):
                raise ReleaseRejected(f"第 {index} 筆回答不符合案例判準，禁止發布。")
            summary = {"content": answer, "knowledge": [{key: row.get(key) for key in ("id", "version", "candidate_hash")} for row in result["knowledge"]]}
            results.append({"case_index": index, "case_hash": digest(case), "candidate_hash": candidate_hash,
                            "model_result_hash": digest(summary), "status": "passed"})
    receipt = {"time": datetime.now(timezone.utc).isoformat(), "fixed_regression": fixed_receipt,
               "candidate_hash": candidate_hash, "review_hash": approved_hash, "case_hash": digest(cases),
               "published_corpus_hash": corpus_hash, "model_caller": caller_kind,
               "model": os.getenv("OPENAI_MODEL", "gpt-6.1-sol"), "cases": results}
    with source.transaction() as db:
        fresh = source.get(db, "FEEDBACK", feedback_id)
        current_corpus = [row for row in source.all(db, "KNOWLEDGE") if row.get("status") == "published"]
        if digest(fresh) != approved_hash:
            raise ReleaseRejected("審核內容已變動，請重新驗證。")
        if digest(sorted(current_corpus, key=lambda row: row["id"])) != corpus_hash:
            raise ReleaseRejected("已發布知識在驗證期間變動，請重新驗證。")
        source.put(db, "KNOWLEDGE", feedback_id, {**candidate, "regression": receipt})
        source.put(db, "FEEDBACK", feedback_id, {**entry, "status": "published"})
    return candidate_hash


def release_cli(argv=None, *, model_caller=None, regression_runner=None):
    parser = argparse.ArgumentParser(description="驗證已審核候選知識與具體案例後發布")
    parser.add_argument("feedback_id")
    parser.add_argument("--db", type=Path, default=ROOT / ".local" / "operations.db")
    parser.add_argument("--case", type=Path, required=True, help="包含問題與回答判準的 JSON 案例檔")
    args = parser.parse_args(argv)
    load_dotenv(ROOT / ".env")
    try:
        cases = load_cases(args.case)
        version = publish_candidate(args.feedback_id, Store(args.db), cases, model_caller=model_caller, regression_runner=regression_runner)
    except ReleaseRejected as exc:
        raise SystemExit(str(exc)) from None
    except Exception:
        raise SystemExit("候選回歸未完成，保持未發布；請核對模型服務、預算與回歸紀錄。") from None
    print("已發布經候選案例驗證的知識版本：" + version[:12])
    return 0
