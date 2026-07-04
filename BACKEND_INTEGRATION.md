# Backend integration

The Flask application is assembled in `src/backend/factory.py`. HTTP routes only
depend on protocols, so production adapters can be introduced without changing
the frontend contract.

## Database

Set `DATABASE_URL` to any SQLAlchemy 2 compatible URL. PostgreSQL example:

```powershell
$env:DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/risk_intelligence"
$env:AUTO_CREATE_DB="false"
python -m alembic upgrade head
python -m src.api
```

`AUTO_CREATE_DB=true` is intended only for local SQLite development and tests.
Production environments should apply Alembic migrations during deployment.
Use `/health` for process liveness and `/ready` for database readiness checks.

The current migration owns these application tables:

- `user_favorites`
- `analysis_history`
- `risk_changes`

Project and news tables belong to the source-data integration and are accessed
through `ProjectCatalog`.

## Replacement points

- Implement `ProjectCatalog` from `src/backend/catalog.py` to read real projects
  and events. Pass the implementation to `create_app(project_catalog=...)`.
- Implement `AnalysisService` from `src/backend/services.py` to call the real
  ML/RAG pipeline. It owns both project analysis and the news-impact explanation
  used by `POST /api/v1/ai/impact`. Pass it to `create_app(analysis_service=...)`.
- `SqlAlchemySavedStateRepository` already supports PostgreSQL and other
  SQLAlchemy dialects. Replace it only if persistence is owned by another service.
- Replace `current_user_id()` in `src/backend/routes.py` with the authenticated
  user identity. `X-User-ID` is a temporary integration header, not production
  authentication.

## Dependency composition

```python
from src.backend import create_app

app = create_app(
    project_catalog=RealProjectCatalog(...),
    analysis_service=RealAnalysisService(...),
)
```

Keep the Pydantic response models in `src/schemas.py` stable or update
`src/app/static/js/api.js` at the same time.

## Push notifications

The current frontend requests the browser Notification permission and can show
notifications while the application is open. Delivery when the application is
fully closed requires a production Web Push adapter: a service worker, stored
browser subscriptions and a backend sender with VAPID credentials.
