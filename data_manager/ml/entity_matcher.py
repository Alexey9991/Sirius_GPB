from difflib import SequenceMatcher
from typing import Optional
from sqlalchemy.orm import Session

from database.models.projects import City, Developer, Project


SIMILARITY_THRESHOLD = 0.75


def _best_match(name: str, existing_names: dict[int, str]) -> Optional[int]:
    norm = name.lower().strip()
    if not norm:
        return None

    best_id = None
    best_score = 0.0

    for eid, ename in existing_names.items():
        score = SequenceMatcher(None, norm, ename.lower().strip()).ratio()
        if score > best_score:
            best_score = score
            best_id = eid

    return best_id if best_score >= SIMILARITY_THRESHOLD else None


def resolve_city(name: Optional[str], session: Session) -> Optional[int]:
    if not name or not name.strip():
        return None

    norm = name.lower().strip()
    record = session.query(City).filter(City.name.ilike(norm)).first()
    if record:
        return record.id

    all_cities = {c.id: c.name for c in session.query(City).all()}
    matched_id = _best_match(norm, {k: v for k, v in all_cities.items()})
    if matched_id is not None:
        return matched_id

    new_city = City(name=norm.title())
    session.add(new_city)
    session.flush()
    return new_city.id


def resolve_developer(name: Optional[str], session: Session) -> Optional[int]:
    if not name or not name.strip():
        return None

    norm = name.lower().strip()
    record = session.query(Developer).filter(Developer.name.ilike(norm)).first()
    if record:
        return record.id

    all_developers = {d.id: d.name for d in session.query(Developer).all()}
    matched_id = _best_match(norm, {k: v for k, v in all_developers.items()})
    if matched_id is not None:
        return matched_id

    new_dev = Developer(name=norm.title())
    session.add(new_dev)
    session.flush()
    return new_dev.id


def resolve_project(
    name: Optional[str], developer_id: Optional[int],
    city_id: Optional[int], session: Session) -> Optional[str]:
    if not name or not name.strip():
        return None

    norm = name.lower().strip()
    record = session.query(Project).filter(Project.name.ilike(norm)).first()
    if record:
        return record.id

    all_projects = {p.id: p.name for p in session.query(Project).all()}
    matched_id = _best_match(norm, {k: v for k, v in all_projects.items()})
    if matched_id is not None:
        return matched_id

    new_project = Project(name=norm.title(), developer_id=developer_id, city_id=city_id)
    session.add(new_project)
    session.flush()
    return new_project.id