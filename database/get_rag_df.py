from sqlalchemy import select
from sqlalchemy.orm import Session
import pandas as pd

from .engine import engine_sync
from .models.news import News, ParseNews
from .models.alerts import ImpactSignal
from .models.projects import Project, Developer, City


def get_rag_df():
    stmt = (
        select(
            News.id.label("news_id"),
            News.content.label("text"),
            Project.name.label("project_name"),
            Developer.name.label("developer"),
            News.date.label("date"),
            News.source.label("source"),
            ParseNews.url.label("url"),
            ImpactSignal.risk_level.label("risk"),
            City.name.label("city"),
        )
        .join(ParseNews, ParseNews.id == News.id)
        .outerjoin(ImpactSignal, ImpactSignal.news_id == News.id)
        .outerjoin(Project, Project.id == ImpactSignal.project_id)
        .outerjoin(Developer, Developer.id == ImpactSignal.developer_id)
        .outerjoin(City, City.id == ImpactSignal.city_id)
    )

    with Session(engine_sync) as session:
        result = session.execute(stmt).mappings().all()
    df = pd.DataFrame(result)
    return df