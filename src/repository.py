from datetime import datetime

from .schemas import Event, Project, RiskLevel


# BACKEND INTEGRATION POINT: DATABASE
# -----------------------------------
# PROJECTS and EVENTS below are demo records only. Replace these lists with a
# repository/service that reads the same fields from the real database.
# Keep returning the Pydantic models Project and Event from schemas.py: the
# frontend relies on their JSON field names as documented in API_CONTRACT.md.
#
# Suggested replacement:
#   project_repository.list(query, level) -> list[Project]
#   project_repository.get_by_name(name)  -> Project | None
#   event_repository.list(level, limit)   -> list[Event]
#   event_repository.for_project(id)      -> list[Event]
#
# Do not put database credentials in this file. Read them from environment
# variables in the backend process (for example DATABASE_URL).


NOW = datetime.fromisoformat("2026-07-03T08:42:00+05:00")

PROJECTS = [
    Project(id="p-001", name="ЖК Северный берег", city="Москва", developer="ГК Север Девелопмент", score=86, level=RiskLevel.RED, completion=62, updated_at=NOW),
    Project(id="p-002", name="ЖК Лесной квартал", city="Санкт-Петербург", developer="СтройИнвест", score=57, level=RiskLevel.YELLOW, completion=78, updated_at=NOW),
    Project(id="p-003", name="ЖК Солнечный парк", city="Казань", developer="Городские проекты", score=18, level=RiskLevel.GREEN, completion=91, updated_at=NOW),
    Project(id="p-004", name="ЖК Речной порт", city="Нижний Новгород", developer="Домстрой", score=31, level=RiskLevel.GREEN, completion=49, updated_at=NOW),
]

EVENTS = [
    Event(id="e-001", project_name="ЖК Северный берег", title="Прокуратура начала проверку застройщика", summary="Ведомство проверяет соблюдение сроков и использование средств дольщиков.", category="Юридический риск", sentiment="NEGATIVE", level=RiskLevel.RED, source="Регион Онлайн", published_at=NOW, source_url="#"),
    Event(id="e-002", project_name="ЖК Лесной квартал", title="Застройщик обсуждает корректировку графика работ", summary="Критических изменений в проектной декларации пока не опубликовано.", category="Сроки", sentiment="NEUTRAL", level=RiskLevel.YELLOW, source="Рынок недвижимости", published_at=NOW, source_url="#"),
    Event(id="e-003", project_name="ЖК Солнечный парк", title="Строительная готовность нового корпуса достигла 91%", summary="Работы идут по графику, разрешительная документация актуальна.", category="Строительство", sentiment="POSITIVE", level=RiskLevel.GREEN, source="Строительный портал", published_at=NOW, source_url="#"),
]
