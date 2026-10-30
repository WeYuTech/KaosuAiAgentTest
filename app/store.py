"""本機隔離狀態、確認與稽核共用一個交易。"""
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

PREFIX = "ZZ_AI_AGENT_OPERATION_"


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as db:
            for name in ("STATE", "SESSION", "PROPOSAL", "LOG", "CONVERSATION", "FEEDBACK", "KNOWLEDGE", "BUDGET"):
                db.execute(f"CREATE TABLE IF NOT EXISTS {PREFIX}{name} (id TEXT PRIMARY KEY, data TEXT NOT NULL)")

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def get(db, table, key):
        row = db.execute(f"SELECT data FROM {PREFIX}{table} WHERE id=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    @staticmethod
    def put(db, table, key, value):
        db.execute(f"INSERT INTO {PREFIX}{table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", (key, dumps(value)))

    @staticmethod
    def all(db, table):
        return [json.loads(r[0]) for r in db.execute(f"SELECT data FROM {PREFIX}{table} ORDER BY rowid DESC")]


def changes(before, after):
    result = []
    old, new = before.get("tables", {}), after.get("tables", {})
    for table in sorted(old.keys() | new.keys()):
        a, b = old.get(table, {}), new.get(table, {})
        for key in sorted(a.keys() | b.keys()):
            ar, br = a.get(key, {}), b.get(key, {})
            for field in sorted(ar.keys() | br.keys()):
                if ar.get(field) != br.get(field):
                    result.append({"table": table, "key": key, "field": field, "before": ar.get(field), "after": br.get(field)})
    return result
