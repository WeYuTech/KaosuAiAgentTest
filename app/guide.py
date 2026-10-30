"""版本化操作草稿；只保存需求，不查詢或寫入 MES 業務資料。"""
from copy import deepcopy
import math

from fastapi import HTTPException
from app.domain import actions


def reject(code, message, **params):
    raise HTTPException(409 if code in {"guide_stale", "conversation_busy", "outcome_unknown"} else 422,
                        {"code": code, "message": message, "params": params})


def initial():
    return {"version": 0, "action": None, "intent": None, "args": {}, "step": "action", "missing": ["action"], "ready": False}


def missing_fields(schema, value, path=""):
    missing = []
    kind = schema.get("type")
    valid = {"object": isinstance(value, dict), "array": isinstance(value, list), "string": isinstance(value, str),
             "integer": isinstance(value, int) and not isinstance(value, bool)}.get(kind, False)
    if not valid:
        reject("guide_invalid", "草稿欄位格式不符。", field=path, rule="type", expected=kind)
    if kind == "object":
        props = schema.get("properties", {})
        if set(value) - set(props):
            reject("guide_invalid", "草稿包含未允許欄位。", field=path, rule="additionalProperties")
        for key in schema.get("required", []):
            if key not in value or value[key] is None or (value[key] == "" and props[key].get("minLength", 0) > 0):
                missing.append(f"{path}.{key}".lstrip("."))
        for key, item in value.items():
            if item is not None and item != "":
                missing.extend(missing_fields(props[key], item, f"{path}.{key}".lstrip(".")))
    elif kind == "array":
        if len(value) > 500:
            reject("guide_invalid", "單次明細不可超過 500 筆。", field=path, rule="maxItems", maximum=500)
        if len(value) < schema.get("minItems", 0):
            missing.append(path)
        for index, item in enumerate(value):
            missing.extend(missing_fields(schema["items"], item, f"{path}[{index}]"))
    elif kind == "integer":
        if value < schema.get("minimum", -math.inf) or value > schema.get("maximum", math.inf):
            reject("guide_invalid", "草稿數量超出允許範圍。", field=path, rule="range", minimum=schema.get("minimum"), maximum=schema.get("maximum"))
    if "enum" in schema and value not in schema["enum"]:
        reject("guide_invalid", "草稿欄位不在允許選項內。", field=path, rule="enum", choices=schema["enum"])
    if kind == "string" and len(value) > schema.get("maxLength", 8000):
        reject("guide_invalid", "草稿文字過長。", field=path, rule="maxLength")
    return missing


def merge(current, module, patch):
    guide = deepcopy(current or initial())
    action = patch.get("action", guide["action"]) or None
    if action and (not isinstance(action, str) or action not in actions() or not action.startswith(module + ".")):
        reject("guide_action", "動作不屬於目前模組。", module=module)
    intent = patch.get("intent", guide.get("intent") if action == guide["action"] else None)
    if intent not in {None, "create", "update"} or (intent is not None and action != "schedule.save"):
        reject("guide_invalid", "請選擇排程新增或修改。", field="intent", rule="enum")
    supplied = patch.get("args") or {}
    if not isinstance(supplied, dict):
        reject("guide_invalid", "草稿欄位須為物件。", field="args", rule="type", expected="object")
    if "step" in patch and patch["step"] not in {"action", "target", "details", "review", "result"}:
        reject("guide_invalid", "未知引導步驟。", field="step", rule="enum")
    args = deepcopy(guide["args"]) if action == guide["action"] else {}
    if guide.get("intent") in {"create", "update"} and intent != guide.get("intent"):
        args = {}
    # 變更目標時，舊目標的數量／明細不能意外套用到新目標。
    if any(key in supplied and supplied[key] != args.get(key) and (key in args or supplied[key] in (None, "")) for key in ("execution_id", "report_id", "schedule_id")):
        args = {}
    if action == "schedule.save":
        if any(key in supplied and supplied[key] != args.get(key) for key in ("equipment", "part_no", "mold_no")):
            args.pop("details", None)
        if "part_no" in supplied and supplied["part_no"] != args.get("part_no"):
            args.pop("mold_no", None)
    for key, value in supplied.items():
        if value is None or value == "":
            args.pop(key, None)
        else:
            args[key] = deepcopy(value)
    if not action and args:
        reject("guide_action", "請先選擇動作。", module=module)
    missing = missing_fields(actions()[action], args) if action else ["action"]
    if action == "schedule.save":
        if intent is None:
            missing.insert(0, "intent")
        elif intent == "update" and not args.get("schedule_id"):
            missing.insert(0, "schedule_id")
        elif intent == "create" and args.get("schedule_id"):
            reject("guide_invalid", "新增排程不可帶入既有排程識別。", field="schedule_id", rule="create_target")
    guide.update(version=guide["version"] + 1, action=action, intent=intent, args=args, step=patch.get("step", guide["step"]), missing=missing, ready=not missing)
    guide.pop("proposal_id", None)
    return guide
