from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl


# API CONTRACT
# ------------
# These Pydantic models describe JSON consumed by app/static/js/app.js. Backend may
# use any database schema internally, but responses must be converted to these
# models. Renaming/removing a field here requires the same change in
# app/static/js/api.js, app/static/js/app.js and API_CONTRACT.md.


class RiskLevel(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


class Project(BaseModel):
    id: str
    name: str
    city: str
    developer: str
    score: int = Field(ge=0, le=100)
    level: RiskLevel
    completion: int = Field(ge=0, le=100)
    updated_at: datetime


class Event(BaseModel):
    id: str
    project_name: str
    title: str
    summary: str
    category: str
    sentiment: str
    level: RiskLevel
    source: str
    published_at: datetime
    source_url: str


class Driver(BaseModel):
    name: str
    value: int = Field(ge=0, le=100)
    text: str


class AnalysisRequest(BaseModel):
    project_name: str = Field(min_length=2, max_length=200)


class AnalysisResponse(BaseModel):
    # The large-model result must be validated and normalized to this structure
    # before it is returned. Do not send unparsed free-form model text directly
    # to the frontend.
    project_id: str | None
    project_name: str
    level: RiskLevel
    score: int = Field(ge=0, le=100)
    summary: str
    drivers: list[Driver]
    events: list[Event]
    model_version: str
    analyzed_at: datetime


class OverviewStats(BaseModel):
    projects_total: int
    critical_projects: int
    events_today: int
    sources_online: int


class Overview(BaseModel):
    stats: OverviewStats
    favorites: list[Project]
    recent_events: list[Event]
