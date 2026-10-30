from fastapi.testclient import TestClient
from app.main import create_app


def test_零模穴空工單可完成排程修改上下模與完工確認(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "empty-order.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})

        def perform(module, action, args):
            response = client.post("/api/proposals", json={"module": module, "action": action, "args": args})
            assert response.status_code == 200, response.text
            card = response.json()["proposal"]
            assert card["target"]["affected_orders"] == ["WO-A"]
            result = client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True})
            assert result.status_code == 200, result.text
            assert result.json()["status"] == "succeeded"

        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A",
                "start_time": "2026-10-30 09:00", "cycle_seconds": 60, "target_shots": 10,
                "status": "RUN", "comment": "空工單完整生命週期",
                "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2},
                            {"part_no": "EPS-B", "wo": "", "cavities": 0}]}
        perform("schedule", "schedule.save", args)
        saved = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == args["comment"])
        sid = saved["ZZ_KAOSU_PROD_SCHEDULE_SID"]
        args.update(schedule_id=sid, target_shots=12)
        for detail, row in zip(args["details"], saved["DETAILS"]):
            detail["detail_id"] = row["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"]
        perform("schedule", "schedule.save", args)
        for action in ("mold.mount_start", "mold.mount_finish", "report.complete", "mold.unmount_start", "mold.unmount_finish"):
            perform(action.split(".")[0], action, {"schedule_id": sid})
        records = [r for r in client.get("/api/workspace?module=report").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid]
        assert len(records) == 2
        assert all(r["COMPLETED"] == "Y" and r["CHECK_OUT_TIME"] for r in records)
