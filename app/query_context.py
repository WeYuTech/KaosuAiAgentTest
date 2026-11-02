"""選取與資料檢視共用的有界查詢；版本獨立於業務草稿。"""
from fastapi import HTTPException

KEYS = {"equipment", "date", "schedule_id", "execution_id", "page", "page_size", "history",
        "factory", "mold", "completed", "wo", "sort", "part_no", "mold_no", "catalog", "search"}
ALIASES = {"eqp_no": "equipment", "schedule_date": "date", "fac": "factory", "tol_no": "mold"}


def validate(raw):
    if not isinstance(raw, dict) or set(raw) - KEYS - ALIASES.keys():
        raise HTTPException(422, "查詢包含未允許的條件")
    result = {}
    for key, value in raw.items():
        key = ALIASES.get(key, key)
        if value is None or value == "":
            continue
        if key in {"page", "page_size"}:
            if isinstance(value, bool) or not str(value).isdigit():
                raise HTTPException(422, "頁碼與每頁筆數須為正整數")
            value = int(value)
            if value < 1 or key == "page_size" and value > 100:
                raise HTTPException(422, "頁碼需大於零，每頁筆數須為 1 至 100")
        elif not isinstance(value, str) or len(value) > 200:
            raise HTTPException(422, "查詢文字長度或格式不正確")
        else:
            value = value.strip()
        result[key] = value
    result.setdefault("page", 1)
    result.setdefault("page_size", 20)
    return result


def view(conversation):
    return conversation.get("query_context") or {"version": 0, "filters": {"page": 1, "page_size": 20}}
