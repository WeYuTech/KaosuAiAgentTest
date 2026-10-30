from fastapi.testclient import TestClient
import pytest
from app.main import create_app


@pytest.mark.parametrize("module,filters,key,expected", [
    ("report", {"execution_id":"2002"}, "WIP_OPI_WDOEACICO_HIST_SID", ["2002"]),
    ("report", {"execution_id":"不存在"}, "WIP_OPI_WDOEACICO_HIST_SID", []),
    ("schedule", {"schedule_id":"1002"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1002"]),
    ("report", {"schedule_id":"1001"}, "WIP_OPI_WDOEACICO_HIST_SID", ["2001","2002"]),
    ("mold", {"schedule_id":"1003"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1003"]),
    ("schedule", {"schedule_id":"不存在"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("mold", {"schedule_id":"不存在"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("report", {"execution_id":"2001","schedule_id":"1002"}, "WIP_OPI_WDOEACICO_HIST_SID", []),
    ("schedule", {"execution_id":"2002"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1001"]),
    ("mold", {"execution_id":"2002"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1001"]),
    ("schedule", {"execution_id":"不存在"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("mold", {"execution_id":"不存在"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("schedule", {"execution_id":"2001","schedule_id":"1002"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("mold", {"execution_id":"2001","history":"running"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1001"]),
    ("mold", {"execution_id":"2003","history":"running"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("mold", {"execution_id":"2001","history":"pending"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", []),
    ("mold", {"execution_id":"2003","history":"pending"}, "ZZ_KAOSU_PROD_SCHEDULE_SID", ["1002"]),
])
def test_查詢識別碼精確定位且不存在或交集不符回空(tmp_path,module,filters,key,expected):
    with TestClient(create_app(db_path=tmp_path/"id-query.db")) as client:
        client.post("/api/session/demo",json={"identity":"supervisor"})
        response=client.get("/api/workspace",params={"module":module,**filters})
        assert response.status_code==200,response.text
        result=response.json()
        assert sorted(r[key] for r in result["records"])==expected
        assert result["total"]==len(expected)

@pytest.mark.parametrize("module,part_no,expected", [
    ("report", "EPS-B", ["2002"]),
    ("schedule", "EPS-B", ["1001"]),
    ("mold", "EPS-B", ["1001"]),
    ("report", "不存在", []),
    ("schedule", "不存在", []),
    ("mold", "不存在", []),
])
def test_品號依明細關聯篩選三模組(tmp_path, module, part_no, expected):
    with TestClient(create_app(db_path=tmp_path / "part-query.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        response = client.get("/api/workspace", params={"module": module, "part_no": part_no})
        assert response.status_code == 200, response.text
        key = "WIP_OPI_WDOEACICO_HIST_SID" if module == "report" else "ZZ_KAOSU_PROD_SCHEDULE_SID"
        assert sorted(r[key] for r in response.json()["records"]) == expected


@pytest.mark.parametrize("filters,parts,molds,orders", [
    ({"catalog": "parts", "search": "右側"}, ["EPS-B"], [], []),
    ({"catalog": "parts", "search": "eps-a"}, ["EPS-A"], [], []),
    ({"catalog": "parts", "search": "不存在"}, [], [], []),
    ({"catalog": "molds", "part_no": "EPS-B"}, ["EPS-B"], ["MOLD-A"], ["WO-A", "WO-B"]),
    ({"catalog": "molds", "part_no": "不存在"}, [], [], []),
    ({"catalog": "work_orders", "mold_no": "MOLD-A", "wo": "WO-B"}, ["EPS-A", "EPS-B"], ["MOLD-A"], ["WO-B"]),
    ({"catalog": "molds", "mold_no": "不存在"}, ["EPS-A", "EPS-B"], [], []),
])
def test_選項搜尋不回作業列且保留模具全部品號明細(tmp_path, filters, parts, molds, orders):
    with TestClient(create_app(db_path=tmp_path / "catalog-query.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        response = client.get("/api/workspace", params={"module": "schedule", **filters})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["records"] == [] and result["total"] == 0
        catalogs = result["catalogs"]
        assert [p["PART_NO"] for p in catalogs["parts"]] == parts
        assert [m["TOL_NO"] for m in catalogs["molds"]] == molds
        assert [w["WO"] for w in catalogs["work_orders"]] == orders
        if molds:
            assert [d["PART_NO"] for d in catalogs["molds"][0]["DETAILS"]] == ["EPS-A", "EPS-B"]


@pytest.mark.parametrize("module", ["schedule", "report", "mold"])
def test_模具編號別名支援部分搜尋與未知回空(tmp_path, module):
    with TestClient(create_app(db_path=tmp_path / "mold-query.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        assert client.get("/api/workspace", params={"module": module, "mold_no": "old-a"}).json()["total"] > 0
        assert client.get("/api/workspace", params={"module": module, "mold_no": "不存在"}).json()["total"] == 0


def confirm(client, module, action, args):
    result = client.post("/api/proposals", json={"module": module, "action": action, "args": args})
    assert result.status_code == 200, result.text
    proposal = result.json()["proposal"]
    result = client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "succeeded"
    return result.json()


def test_排程確認卡包含後端解析明細且不依賴目前查詢頁面(tmp_path):
    from app.store import digest
    with TestClient(create_app(db_path=tmp_path / "resolved-card.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-SPLIT", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "details": [{"part_no": "EPS-A", "wo": "WO-A", "mold_detail_id": "63", "cavities": 2}, {"part_no": "EPS-A", "wo": "WO-A", "mold_detail_id": "64", "cavities": 3}]}
        response = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
        assert response.status_code == 200, response.text
        proposal = response.json()["proposal"]
        details = proposal["target"]["schedule_details"]
        assert [(d["mold_detail_id"], d["mold_detail_no"], d["mold_detail_name"], d["cavities"]) for d in details] == [("63", "MOLD-SPLIT-L", "同品號左模穴", 2), ("64", "MOLD-SPLIT-R", "同品號右模穴", 3)]
        assert digest({k: v for k, v in proposal.items() if k != "digest"}) == proposal["digest"]
        assert client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True}).status_code == 200
        args["schedule_id"] = proposal["target"]["schedule_id"]
        args["details"] = [{"detail_id": d["detail_id"], "part_no": d["part_no"], "wo": d["wo"], "cavities": d["cavities"] + 1} for d in reversed(details)]
        assert client.get("/api/workspace?module=schedule&equipment=不存在").json()["records"] == []
        changed = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args}).json()["proposal"]
        resolved = changed["target"]["schedule_details"]
        assert [(d["mold_detail_no"], d["cavities"]) for d in resolved] == [("MOLD-SPLIT-R", 4), ("MOLD-SPLIT-L", 3)]
        assert digest({k: v for k, v in changed.items() if k != "digest"}) == changed["digest"]
        changed["target"]["schedule_details"][0]["mold_detail_no"] = "偽造模穴"
        assert digest({k: v for k, v in changed.items() if k != "digest"}) != changed["digest"]


def test_排程草稿確認後才出現且跨八點正確歸日(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "schedule.db")) as client:
        assert client.post("/api/session/demo", json={"identity": "planner"}).status_code == 200
        args = {
            "equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A",
            "start_time": "2026-10-31 07:59", "cycle_seconds": 60,
            "target_shots": 10, "status": "RUN", "priority": 3,
            "comment": "跨日驗收",
            "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}],
        }
        before = client.get("/api/workspace?module=schedule").json()
        result = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
        assert result.status_code == 200, result.text
        proposal = result.json()["proposal"]
        assert client.get("/api/workspace?module=schedule").json() == before
        result = client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
        assert result.status_code == 200, result.text
        assert result.json()["status"] == "succeeded"
        records = client.get("/api/workspace?module=schedule").json()["records"]
        saved = next(row for row in records if row["COMMENT"] == "跨日驗收")
        assert saved["SCHEDULE_DATE"] == "2026-10-30"
        assert saved["SCHEDULE_END_TIME"] == "2026-10-31 08:09:00"
        assert saved["DETAILS"][0]["TARGET_PCS"] == 20


def test_新排程保存立即產生全部明細歷程包含零模穴空工單(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "trigger-insert.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-31 07:59", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": "即時歷程", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}, {"part_no": "EPS-B", "wo": "", "cavities": 0}]}
        result = confirm(client, "schedule", "schedule.save", args)
        saved = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "即時歷程")
        rows = [r for r in client.get("/api/workspace?module=report").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == saved["ZZ_KAOSU_PROD_SCHEDULE_SID"]]
        assert len(rows) == 2
        assert {r["WIP_OPI_WDOEACICO_HIST_SID"] for r in rows} == {d["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"] for d in saved["DETAILS"]}
        assert all(r["CHECK_IN_TIME"] is None and r["ZZ_MODLE_UPLOAD_START"] is None and r["COMPLETED"] == "N" for r in rows)
        blank = next(r for r in rows if r["OPI_CAV"] == 0)
        assert blank["WO"] is None
        assert all(r["CREATE_USER"] == "SQLtrigger_user" and r["SHIFT_DAY"] == "2026-10-30" for r in rows)
        assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" for c in result["changes"])


def test_同品號多模具明細可明確選取新增並各自同步歷程(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "split-mold.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        options = client.get("/api/workspace?module=schedule&catalog=molds&part_no=EPS-A&mold_no=MOLD-SPLIT").json()["catalogs"]["molds"]
        assert len(options) == 1
        assert [(d["TOL_DETALS_SID"], d["PART_NO"]) for d in options[0]["DETAILS"]] == [("63", "EPS-A"), ("64", "EPS-A")]
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-SPLIT", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": "同品號多明細", "details": [{"mold_detail_id": "63", "part_no": "EPS-A", "wo": "WO-A", "cavities": 2}, {"mold_detail_id": "64", "part_no": "EPS-A", "wo": "", "cavities": 0}]}
        confirm(client, "schedule", "schedule.save", args)
        saved = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "同品號多明細")
        assert {d["TOL_DETALS_SID"] for d in saved["DETAILS"]} == {"63", "64"}
        rows = client.get("/api/workspace", params={"module": "report", "schedule_id": saved["ZZ_KAOSU_PROD_SCHEDULE_SID"]}).json()["records"]
        assert {r["ZZ_TOL_DETALS_NO"] for r in rows} == {"MOLD-SPLIT-L", "MOLD-SPLIT-R"}
        assert sorted(r["OPI_CAV"] for r in rows) == [0, 2]


def test_修改同品號多明細保留原模具明細識別且重排順序不改關聯(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "split-update.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-SPLIT", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": "多明細修改", "details": [{"mold_detail_id": "63", "part_no": "EPS-A", "wo": "WO-A", "cavities": 2}, {"mold_detail_id": "64", "part_no": "EPS-A", "wo": "WO-A", "cavities": 1}]}
        confirm(client, "schedule", "schedule.save", args)
        saved = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "多明細修改")
        ids = {d["TOL_DETALS_SID"]: d["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"] for d in saved["DETAILS"]}
        args.update(schedule_id=saved["ZZ_KAOSU_PROD_SCHEDULE_SID"], details=[{"detail_id": ids["64"], "part_no": "EPS-A", "wo": "WO-A", "cavities": 4}, {"detail_id": ids["63"], "part_no": "EPS-A", "wo": "WO-A", "cavities": 3}])
        confirm(client, "schedule", "schedule.save", args)
        updated = client.get("/api/workspace", params={"module": "schedule", "schedule_id": args["schedule_id"]}).json()["records"][0]
        assert {d["TOL_DETALS_SID"]: (d["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"], d["TARGET_PCS"]) for d in updated["DETAILS"]} == {"63": (ids["63"], 30), "64": (ids["64"], 40)}
        rows = client.get("/api/workspace", params={"module": "report", "schedule_id": args["schedule_id"]}).json()["records"]
        assert {r["ZZ_TOL_DETALS_NO"]: r["OPI_CAV"] for r in rows} == {"MOLD-SPLIT-L": 3, "MOLD-SPLIT-R": 4}
        args["details"][1].update(detail_id=ids["64"], mold_detail_id="63")
        response = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
        assert response.status_code == 422 and "排程明細識別碼不可重複" in response.json()["detail"]["message"]
        assert client.get("/api/workspace", params={"module": "schedule", "schedule_id": args["schedule_id"]}).json()["records"][0] == updated


@pytest.mark.parametrize("details", [
    [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}],
    [{"mold_detail_id": "61", "part_no": "EPS-A", "wo": "WO-A", "cavities": 2}],
    [{"mold_detail_id": "63", "part_no": "EPS-B", "wo": "WO-B", "cavities": 2}],
    [{"mold_detail_id": "63", "part_no": "EPS-A", "wo": "WO-A", "cavities": 2}, {"mold_detail_id": "63", "part_no": "EPS-A", "wo": "WO-A", "cavities": 1}],
])
def test_模具明細歧義跨模具錯品號或重複都拒絕且不猜第一筆(tmp_path, details):
    with TestClient(create_app(db_path=tmp_path / "split-invalid.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-SPLIT", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "details": details}
        before = client.get("/api/workspace?module=schedule").json()
        response = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
        assert response.status_code == 422
        if "mold_detail_id" not in details[0]:
            assert response.json()["detail"]["code"] == "ambiguous"
            assert "63" in response.json()["detail"]["message"] and "64" in response.json()["detail"]["message"]
        assert client.get("/api/workspace?module=schedule").json() == before


def test_保存排程同步既有歷程模穴與刪除但保留完工上下模時間(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "trigger-update.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        confirm(client, "report", "report.cavities", {"execution_id": "2001", "cavities": 9})
        confirm(client, "report", "report.complete", {"schedule_id": "1001"})
        before = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2001")
        args = {"schedule_id": "1001", "equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "details": [{"detail_id": "1101", "part_no": "EPS-A", "wo": "WO-A", "cavities": 3}]}
        result = confirm(client, "schedule", "schedule.save", args)
        records = {r["WIP_OPI_WDOEACICO_HIST_SID"]: r for r in client.get("/api/workspace?module=report").json()["records"]}
        assert "2002" not in records
        assert "1101" not in records  # 舊合成資料以明細關聯維持既有歷程識別碼。
        after = records["2001"]
        assert after["OPI_CAV"] == 3 and after["SCHEDULE_CUR_CAV"] == 3
        assert after["EQP_NO"] == "MC36" and after["SHIFT_DAY"] == "2026-10-31"
        assert after["SHIFT_START_TIME_1"] == "2026-10-31 08:00:00"
        for field in ("ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "CHECK_IN_TIME", "REAL_CHECK_IN_TIME", "COMPLETED", "COMPLETED_USER", "COMPLETED_TIME"):
            assert after[field] == before[field]
        assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" and c["field"] == "OPI_CAV" and c["before"] == 9 and c["after"] == 3 for c in result["changes"])


@pytest.mark.parametrize("replacement", [False, True])
def test_已有報工的排程明細不得刪除或換工單且草稿失敗不改資料(tmp_path, replacement):
    with TestClient(create_app(db_path=tmp_path / "trigger-protected.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        confirm(client, "report", "report.add", {"execution_id": "2002", "ok": 10, "defects": []})
        before_schedule = client.get("/api/workspace?module=schedule").json()
        before_report = client.get("/api/workspace?module=report").json()
        details = [{"detail_id": "1101", "part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]
        if replacement:
            details.append({"detail_id": "1102", "part_no": "EPS-B", "wo": "", "cavities": 0})
        args = {"schedule_id": "1001", "equipment": "MC37", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-30 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "details": details}
        response = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "linked_reports"
        assert client.get("/api/workspace?module=schedule").json() == before_schedule
        assert client.get("/api/workspace?module=report").json() == before_report


def test_新增人工報工與不良原因並區分未知物聯網產量(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "report.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        confirm(client, "report", "report.add", {"execution_id": "2001", "ok": 98, "defects": [{"code": "NG01", "quantity": 2}]})
        rows = client.get("/api/workspace?module=report").json()["records"]
        first = next(r for r in rows if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2001")
        assert first["MANUAL_OK"] == 98
        assert first["MANUAL_NG"] == 2
        assert first["IOT_QUANTITY"] == 250
        assert first["IOT_INFERRED_OK"] == 248
        assert first["REPORTS"][0]["DEFECTS"][0]["NG_CODE_QTY"] == 2
        unknown = next(r for r in rows if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2002")
        assert unknown["IOT_QUANTITY"] is None
        assert unknown["IOT_INFERRED_OK"] is None


def test_修改報工可以增加新原因且刪除同步移除明細(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "edit-report.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        confirm(client, "report", "report.add", {"execution_id": "2001", "ok": 98, "defects": [{"code": "NG01", "quantity": 2}]})
        def first():
            return next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2001")
        report_id = first()["REPORTS"][0]["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"]
        confirm(client, "report", "report.update", {"report_id": report_id, "ok": 95, "defects": [{"code": "NG01", "quantity": 2}, {"code": "NG02", "quantity": 3}]})
        assert first()["MANUAL_OK"] == 95
        assert first()["MANUAL_NG"] == 5
        assert len(first()["REPORTS"][0]["DEFECTS"]) == 2
        confirm(client, "report", "report.delete", {"report_id": report_id})
        assert first()["REPORTS"] == []
        assert first()["MANUAL_OK"] == 0
        again = client.post("/api/proposals", json={"module": "report", "action": "report.delete", "args": {"report_id": report_id}})
        assert again.status_code == 422


def test_模穴只影響指定執行且完工影響同排程全部工單與下一排程(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "complete.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        confirm(client, "report", "report.cavities", {"execution_id": "2001", "cavities": 3})
        rows = {r["WIP_OPI_WDOEACICO_HIST_SID"]: r for r in client.get("/api/workspace?module=report").json()["records"]}
        assert rows["2001"]["OPI_CAV"] == 3
        assert rows["2002"]["OPI_CAV"] == 1
        confirm(client, "report", "report.complete", {"schedule_id": "1001"})
        rows = {r["WIP_OPI_WDOEACICO_HIST_SID"]: r for r in client.get("/api/workspace?module=report").json()["records"]}
        assert rows["2001"]["COMPLETED"] == "Y"
        assert rows["2002"]["COMPLETED"] == "Y"
        assert rows["2003"]["COMPLETED"] == "N"
        assert rows["2003"]["REAL_CHECK_IN_TIME"] == rows["2001"]["COMPLETED_TIME"]
        assert rows["2004"]["REAL_CHECK_IN_TIME"] is None
        repeat = client.post("/api/proposals", json={"module": "report", "action": "report.complete", "args": {"schedule_id": "1001"}})
        assert repeat.status_code == 422


def test_四階段須依序且下模同步完工清除還原六時間(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "mold.db")) as client:
        client.post("/api/session/demo", json={"identity": "technician"})
        skipped = client.post("/api/proposals", json={"module": "mold", "action": "mold.mount_finish", "args": {"schedule_id": "1003"}})
        assert skipped.status_code == 422
        for action in ["mold.mount_start", "mold.mount_finish", "mold.unmount_start", "mold.unmount_finish"]:
            confirm(client, "mold", action, {"schedule_id": "1003"})
        def current():
            return next(r for r in client.get("/api/workspace?module=mold").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == "1003")
        row = current()
        assert row["COMPLETED"] == "Y"
        assert row["CHECK_IN_TIME"] == row["ZZ_MODLE_UPLOAD_START"]
        assert row["CHECK_OUT_TIME"] == row["ZZ_MODLE_REMOVE_END"]
        assert row["COMPLETED_TIME"]
        confirm(client, "mold", "mold.clear", {"schedule_id": "1003"})
        row = current()
        assert row["COMPLETED"] == "N"
        assert row["COMPLETED_TIME"] is None
        for field in ["CHECK_IN_TIME", "CHECK_OUT_TIME", "ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START", "ZZ_MODLE_REMOVE_END"]:
            assert row[field] is None


def test_新排程修改後可以在隔離環境走完上模報工下模(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "journey.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-30 09:00", "cycle_seconds": 60, "target_shots": 10, "status": "TRY", "comment": "完整生命週期", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]}
        confirm(client, "schedule", "schedule.save", args)
        row = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "完整生命週期")
        sid = row["ZZ_KAOSU_PROD_SCHEDULE_SID"]
        args.update(schedule_id=sid, target_shots=15, status="RUN")
        args["details"][0]["detail_id"] = row["DETAILS"][0]["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"]
        confirm(client, "schedule", "schedule.save", args)
        row = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid)
        assert row["DETAILS"][0]["TARGET_PCS"] == 30
        confirm(client, "mold", "mold.mount_start", {"schedule_id": sid})
        confirm(client, "mold", "mold.mount_finish", {"schedule_id": sid})
        row = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid)
        confirm(client, "report", "report.add", {"execution_id": row["WIP_OPI_WDOEACICO_HIST_SID"], "ok": 29, "defects": [{"code": "NG01", "quantity": 1}]})
        confirm(client, "mold", "mold.unmount_start", {"schedule_id": sid})
        confirm(client, "mold", "mold.unmount_finish", {"schedule_id": sid})
        row = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid)
        assert row["MANUAL_OK"] == 29
        assert row["COMPLETED"] == "Y"


@pytest.mark.parametrize("args", [
    {"execution_id": "2001", "ok": 1, "defects": [], "comment": {"unexpected": "物件"}},
    {"execution_id": "2001", "ok": 1.5, "defects": []},
    {"execution_id": "2001", "ok": -1, "defects": []},
    {"execution_id": "2001", "ok": 10 ** 400, "defects": []},
    {"execution_id": "2001", "ok": 1, "defects": [{"code": "不存在", "quantity": 1}]},
    {"execution_id": "2001", "ok": 1, "defects": [{"code": "NG01", "quantity": 1}, {"code": "NG01", "quantity": 2}]},
    {"execution_id": "2001", "ok": 1, "defects": [], "LOGIN_USER": "偽造"},
])
def test_不合法報工不建立可執行草稿且資料不變(tmp_path, args):
    with TestClient(create_app(db_path=tmp_path / "invalid.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        before = client.get("/api/workspace?module=report").json()
        result = client.post("/api/proposals", json={"module": "report", "action": "report.add", "args": args})
        assert result.status_code == 422, result.text
        assert client.get("/api/workspace?module=report").json() == before


def test_排程可依工單設備日期查詢並以數值排序分頁(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "query.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        for shots in (2, 10):
            confirm(client, "schedule", "schedule.save", {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-30 09:00", "cycle_seconds": 60, "target_shots": shots, "status": "RUN", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]})
        result = client.get("/api/workspace", params={"module": "schedule", "equipment": "MC36", "wo": "WO-A", "date": "2026-10-30", "sort": "TARGET_SHOT", "page_size": 1, "page": 1}).json()
        assert result["total"] == 3
        assert result["records"][0]["TARGET_SHOT"] == 2
        result = client.get("/api/workspace", params={"module": "schedule", "equipment": "MC36", "sort": "TARGET_SHOT", "page_size": 1, "page": 2}).json()
        assert result["records"][0]["TARGET_SHOT"] == 10
        assert client.get("/api/workspace?module=schedule&wo=WO").json()["total"] == 0


def test_模具可依廠別模具與歷史狀態篩選並多欄排序(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "mold-query.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        assert client.get("/api/workspace?module=mold&fac=fac1").json()["total"] == 0
        result = client.get("/api/workspace?module=mold&factory=fac2&mold=mold-a&history=pending&sort=EQP_NO,-SCHEDULE_START_TIME").json()
        assert [r["ZZ_KAOSU_PROD_SCHEDULE_SID"] for r in result["records"]] == ["1003", "1002"]
        assert client.get("/api/workspace?module=mold&fac=unknown").json()["total"] == 0
        assert client.get("/api/workspace?module=report&history=running").json()["total"] == 2
        assert client.get("/api/workspace?module=mold&completed=Y").json()["total"] == 0
        confirm(client, "report", "report.complete", {"schedule_id": "1001"})
        assert client.get("/api/workspace?module=mold&completed=Y").json()["total"] == 1


@pytest.mark.parametrize("date", ["2026-02-30", "2026-10-31~2026-10-30", "不是日期"])
def test_查詢不合法日期回可理解錯誤(tmp_path, date):
    with TestClient(create_app(db_path=tmp_path / "bad-date.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        assert client.get("/api/workspace", params={"module": "schedule", "date": date}).status_code == 422


def test_極大排程時間計算不溢位成伺服器錯誤(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "overflow.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        result = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-30 09:00", "cycle_seconds": 2147483647, "target_shots": 2147483647, "status": "RUN", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]}})
        assert result.status_code == 422


def test_目標件數乘積超過原資料庫精度於草稿階段拒絕(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "decimal-overflow.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        result = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-30 09:00", "cycle_seconds": 1, "target_shots": 2147483647, "status": "RUN", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2147483647}]}})
        assert result.status_code == 422


def test_資料庫整數精度模穴不接受小數隱性捨入(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "cav-decimal.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        result = client.post("/api/proposals", json={"module": "report", "action": "report.cavities", "args": {"execution_id": "2001", "cavities": 1.5}})
        assert result.status_code == 422


def test_模具目前設備看板包含閒置機台而歷史只列已上模(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "mold-board.db")) as client:
        client.post("/api/session/demo", json={"identity": "technician"})
        running = client.get("/api/workspace?module=mold&history=running").json()
        assert running["total"] == 2
        by_equipment = {r["EQP_NO"]: r for r in running["records"]}
        assert by_equipment["MC37"]["ZZ_KAOSU_PROD_SCHEDULE_SID"] == "1001"
        assert by_equipment["MC36"]["ZZ_KAOSU_PROD_SCHEDULE_SID"] is None
        assert by_equipment["MC36"]["CANDIDATES"][0]["schedule_id"] == "1003"
        history = client.get("/api/workspace?module=mold&history=history").json()
        assert [r["ZZ_KAOSU_PROD_SCHEDULE_SID"] for r in history["records"]] == ["1001"]


def test_模型可查詢班別依據且不用人員自行輸入班別(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "shift-catalog.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        catalogs = client.get("/api/workspace?module=schedule").json()["catalogs"]
        assert catalogs["shift_settings"][0]["SHIFT_START_TIME_1"] == "08:00"
        assert catalogs["shift_settings"][0]["SHIFT_END_DATE_2"] == 1


@pytest.mark.parametrize("utc_time, expected_start, expected_day", [("2026-10-31T00:00:00+00:00", "2026-10-31 07:00:00", "2026-10-30"), ("2026-10-31T01:00:00+00:00", "2026-10-31 08:00:00", "2026-10-31")])
def test_明確時區時間依MES伺服器時區計算08點生產日(tmp_path, utc_time, expected_start, expected_day):
    with TestClient(create_app(db_path=tmp_path / "offset.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        confirm(client, "schedule", "schedule.save", {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": utc_time, "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": "時區驗收", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]})
        row = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "時區驗收")
        assert row["SCHEDULE_START_TIME"] == expected_start
        assert row["SCHEDULE_DATE"] == expected_day
