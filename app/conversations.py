"""聊天清單與中繼資料；沿用既有 JSON 儲存，不建立業務資料表。"""
from fastapi import HTTPException


def metadata(conversation):
    messages = conversation.get("messages", [])
    first = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
    titles = {"report": "生產報工", "schedule": "生產排程", "mold": "模具上下模"}
    return {
        "id": conversation["id"], "module": conversation["module"],
        "title": conversation.get("title") or first[:60] or titles[conversation["module"]],
        "is_pinned": bool(conversation.get("is_pinned")),
        "is_archived": bool(conversation.get("is_archived")),
        "is_deleted": bool(conversation.get("is_deleted")),
        "metadata_version": conversation.get("metadata_version", 0),
        "created_at": conversation["created_at"],
        "updated_at": conversation.get("updated_at", conversation["created_at"]),
        "message_count": len(messages),
    }


def owned(conversation, actor):
    if not conversation or conversation["actor_id"] != actor["id"] or conversation["module"] not in actor["roles"]:
        raise HTTPException(404, "找不到此對話")
    return conversation


def update_metadata(db, store, conversation, patch, version, instant):
    if version != conversation.get("metadata_version", 0):
        raise HTTPException(409, {"code": "conversation_metadata_stale", "message": "聊天紀錄已更新，請重新讀取後再操作。"})
    if "title" in patch:
        patch["title"] = patch["title"].strip()
        if not patch["title"]:
            raise HTTPException(422, "聊天室名稱不可空白")
    if patch.get("is_archived") or patch.get("is_deleted"):
        processing = (conversation.get("processing") or {}).get("expires_at", "") > instant
        unresolved = any(p.get("conversation_id") == conversation["id"] and p["status"] in {"pending", "unknown"}
                         for p in store.all(db, "PROPOSAL"))
        if processing or unresolved:
            raise HTTPException(409, {"code": "conversation_unresolved", "message": "請先完成、取消或查核原操作，再封存或刪除聊天。"})
    conversation.update(patch)
    conversation["metadata_version"] = version + 1
    conversation["updated_at"] = instant
    store.put(db, "CONVERSATION", conversation["id"], conversation)
    return metadata(conversation)
