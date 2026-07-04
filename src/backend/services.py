from __future__ import annotations

from datetime import datetime
from typing import Protocol

from ..schemas import AnalysisResponse, Driver, ImpactAnalysisResponse, RiskLevel
from .catalog import ProjectCatalog


class AnalysisService(Protocol):
    def analyze(self, project_name: str) -> AnalysisResponse: ...
    def explain_impact(self, event_id: str, question: str) -> ImpactAnalysisResponse: ...


class DemoAnalysisService:
    """Deterministic adapter to replace with the real ML/RAG orchestration."""

    def __init__(self, catalog: ProjectCatalog):
        self.catalog = catalog

    def analyze(self, project_name: str) -> AnalysisResponse:
        name = project_name.casefold()
        is_red = "север" in name or "берег" in name
        is_yellow = "лес" in name or "квартал" in name
        level = RiskLevel.RED if is_red else RiskLevel.YELLOW if is_yellow else RiskLevel.GREEN
        score = {RiskLevel.RED: 86, RiskLevel.YELLOW: 57, RiskLevel.GREEN: 18}[level]
        values = {
            RiskLevel.RED: [91, 88, 74, 63],
            RiskLevel.YELLOW: [55, 22, 48, 35],
            RiskLevel.GREEN: [18, 10, 16, 22],
        }[level]
        labels = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"]
        project = self.catalog.get_project_by_name(project_name)
        related = self.catalog.events_for_project(project_name)
        fallback_events = self.catalog.list_events(limit=2)
        return AnalysisResponse(
            project_id=project.id if project else None,
            project_name=project_name,
            level=level,
            score=score,
            summary="Демонстрационный ответ API. Здесь должен быть итог модели с объяснением найденных риск-сигналов.",
            drivers=[
                Driver(name=label, value=value, text="Объяснение вклада фактора")
                for label, value in zip(labels, values)
            ],
            events=related or fallback_events,
            model_version="reference-1",
            analyzed_at=datetime.now().astimezone(),
        )

    def explain_impact(self, event_id: str, question: str) -> ImpactAnalysisResponse:
        event = self.catalog.get_event(event_id)
        if event is None:
            raise ValueError("event not found")

        profiles = {
            RiskLevel.RED: {
                "verdict": "Существенно повышает риск проекта",
                "detail": "Новость указывает на прямой негативный фактор, способный повлиять на сроки, юридическую устойчивость и денежный поток проекта. Сигнал требует ручной проверки первоисточника и сопоставления с проектной документацией.",
                "delta": 18,
                "confidence": 92,
                "factors": ["Высокая значимость источника", "Прямое упоминание проекта", "Негативный юридический или операционный сигнал"],
                "recommendations": ["Запросить подтверждающие документы", "Проверить влияние на график финансирования", "Назначить ответственному аналитику"],
            },
            RiskLevel.YELLOW: {
                "verdict": "Умеренно повышает риск проекта",
                "detail": "Событие формирует ранний предупреждающий сигнал, но само по себе ещё не подтверждает критическое ухудшение. Влияние зависит от повторяемости подобных публикаций и официальной реакции застройщика.",
                "delta": 7,
                "confidence": 81,
                "factors": ["Косвенное влияние на сроки", "Нейтральная официальная позиция", "Требуется подтверждение"],
                "recommendations": ["Продолжить мониторинг", "Проверить официальные раскрытия", "Сравнить с предыдущими событиями"],
            },
            RiskLevel.GREEN: {
                "verdict": "Не повышает текущий риск",
                "detail": "Новость подтверждает нормальный ход проекта и не содержит значимых негативных сигналов. Она может немного снизить неопределённость, но не отменяет необходимость регулярного мониторинга.",
                "delta": -3,
                "confidence": 87,
                "factors": ["Положительная динамика строительства", "Нет юридических претензий", "Нейтральный или позитивный фон"],
                "recommendations": ["Сохранить плановый мониторинг", "Проверить следующий отчёт о готовности"],
            },
        }
        profile = profiles[event.level]
        return ImpactAnalysisResponse(
            event_id=event.id,
            project_name=event.project_name,
            question=question,
            verdict=profile["verdict"],
            detailed_analysis=profile["detail"],
            risk_delta=profile["delta"],
            confidence=profile["confidence"],
            factors=profile["factors"],
            recommendations=profile["recommendations"],
            generated_at=datetime.now().astimezone(),
        )
