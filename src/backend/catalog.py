from __future__ import annotations

from typing import Protocol

from ..repository import EVENTS, PROJECTS
from ..schemas import Event, Project, RiskLevel


class ProjectCatalog(Protocol):
    def list_projects(self, query: str = "", level: str = "ALL") -> list[Project]: ...
    def get_project(self, project_id: str) -> Project | None: ...
    def get_project_by_name(self, name: str) -> Project | None: ...
    def get_event(self, event_id: str) -> Event | None: ...
    def list_events(self, level: str = "ALL", limit: int = 100) -> list[Event]: ...
    def list_alerts(self, level: str = "ALL", limit: int = 100) -> list[Event]: ...
    def events_for_project(self, project_name: str) -> list[Event]: ...


class DemoProjectCatalog:
    """Temporary adapter. Replace with a database-backed catalog in production."""

    def list_projects(self, query: str = "", level: str = "ALL") -> list[Project]:
        needle = query.casefold().strip()
        return [
            project
            for project in PROJECTS
            if (level == "ALL" or project.level.value == level)
            and (not needle or needle in f"{project.name} {project.city} {project.developer}".casefold())
        ]

    def get_project(self, project_id: str) -> Project | None:
        return next((project for project in PROJECTS if project.id == project_id), None)

    def get_project_by_name(self, name: str) -> Project | None:
        normalized = name.casefold()
        return next((project for project in PROJECTS if project.name.casefold() == normalized), None)

    def get_event(self, event_id: str) -> Event | None:
        return next((event for event in EVENTS if event.id == event_id), None)

    def list_events(self, level: str = "ALL", limit: int = 100) -> list[Event]:
        items = [event for event in EVENTS if level == "ALL" or event.level.value == level]
        return items[:limit]

    def list_alerts(self, level: str = "ALL", limit: int = 100) -> list[Event]:
        items = [
            event
            for event in EVENTS
            if event.level != RiskLevel.GREEN and (level == "ALL" or event.level.value == level)
        ]
        return items[:limit]

    def events_for_project(self, project_name: str) -> list[Event]:
        normalized = project_name.casefold()
        return [event for event in EVENTS if event.project_name.casefold() == normalized]
