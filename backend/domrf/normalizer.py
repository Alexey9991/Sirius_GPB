from __future__ import annotations

import datetime as dt
import re
from typing import Any


def normalize_domrf_object(
    raw: dict[str, Any],
    *,
    object_id: int,
    source_url: str,
) -> dict[str, Any]:
    payload = _unwrap_payload(raw)
    normalized = {
        "domrf_object_id": str(_first_value(payload, "objectId", "objId", "houseId", "id") or object_id),
        "name": _first_value(
            payload,
            "objectName",
            "projectName",
            "complexName",
            "jkName",
            "nameObj",
            "name",
        ),
        "address": _first_value(payload, "address", "objectAddress", "fullAddress", "addr"),
        "city": _first_value(payload, "city", "cityName", "settlement", "localityName"),
        "region": _first_value(payload, "region", "regionName", "subjectName", "subjectRfName"),
        "developer_name": _first_value(
            payload,
            "developerName",
            "builderName",
            "devName",
            "organizationName",
            "developer",
        ),
        "developer_inn": _first_value(payload, "developerInn", "builderInn", "inn"),
        "developer_ogrn": _first_value(payload, "developerOgrn", "builderOgrn", "ogrn"),
        "status": _first_value(payload, "constructionStatus", "statusName", "status"),
        "planned_rve_date": _to_date(_first_value(
            payload,
            "plannedRveDate",
            "planRveDate",
            "rvePlanDate",
            "objReady100PercDt",
            "deadline",
        )),
        "actual_rve_date": _to_date(_first_value(
            payload,
            "actualRveDate",
            "factRveDate",
            "rveActualDate",
            "commissioningDate",
        )),
        "construction_progress": _to_float(_first_value(
            payload,
            "constructionProgress",
            "constructionReadiness",
            "readiness",
            "percentReady",
            "objReadyPercent",
        )),
        "documents": _first_value(payload, "documents", "projectDeclarations", "declarations") or [],
        "photos": _first_value(payload, "photos", "progressPhotos", "constructionPhotos") or [],
        "source_url": source_url,
    }
    normalized["risk_hints"] = _risk_hints(normalized)
    return normalized


def _unwrap_payload(raw: dict[str, Any]) -> Any:
    current: Any = raw
    for key in ("data", "payload", "result", "object", "house", "item", "items", "content"):
        if isinstance(current, dict) and isinstance(current.get(key), (dict, list)):
            current = current[key]
    if isinstance(current, list) and current:
        return current[0]
    return current


def _key(value: str) -> str:
    return re.sub(r"[^a-zа-я0-9]", "", value.lower())


def _walk(value: Any):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _walk(nested)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)


def _first_value(payload: Any, *aliases: str) -> Any:
    aliases_normalized = {_key(alias) for alias in aliases}
    for obj in _walk(payload):
        for key, value in obj.items():
            if _key(str(key)) in aliases_normalized and value not in (None, ""):
                return value
    return None


def _to_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat()
    text = str(value)
    match = re.search(r"\d{4}-\d{2}-\d{2}", text)
    if match:
        return match.group(0)
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", text)
    if match:
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"
    return text


def _to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"\d+(?:[,.]\d+)?", str(value))
    if not match:
        return None
    return float(match.group(0).replace(",", "."))


def _risk_hints(data: dict[str, Any]) -> list[dict[str, str]]:
    hints: list[dict[str, str]] = []
    planned = data.get("planned_rve_date")
    actual = data.get("actual_rve_date")
    progress = data.get("construction_progress")
    today = dt.date.today()

    if planned:
        try:
            planned_date = dt.date.fromisoformat(str(planned)[:10])
        except ValueError:
            planned_date = None
        if planned_date and not actual:
            days_left = (planned_date - today).days
            if progress is not None and days_left <= 180 and progress < 70:
                hints.append({
                    "level": "high",
                    "type": "construction_delay",
                    "summary": "До планового ввода меньше 180 дней, строительная готовность ниже 70%.",
                })
            elif progress is not None and days_left <= 365 and progress < 50:
                hints.append({
                    "level": "medium",
                    "type": "construction_delay",
                    "summary": "До планового ввода меньше года, строительная готовность ниже 50%.",
                })
            if planned_date < today and not actual:
                hints.append({
                    "level": "high",
                    "type": "overdue_rve",
                    "summary": "Плановая дата ввода уже прошла, фактический ввод не найден.",
                })

    if not data.get("photos"):
        hints.append({
            "level": "low",
            "type": "missing_construction_photos",
            "summary": "В ответе источника не найдены фото хода строительства.",
        })
    return hints
