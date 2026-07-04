# RAG-Система анализа новостного потока | БВ 26
Для мониторинга импакт-сигналов рынка недвижимости

## Local development

Install the dependencies and start the Flask API:

```powershell
python -m pip install -r requirements.txt
python -m src.api
```

In another terminal, start the Streamlit frontend with real API calls enabled:

```powershell
$env:USE_MOCK_API="false"
streamlit run src/main.py
```

The API listens on `http://localhost:8000` and Streamlit on `http://localhost:8501`.

## Backend integration

The backend uses an application factory, dependency interfaces, SQLAlchemy 2 and
Alembic migrations. See [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) before
connecting the production database, project catalog, authentication or ML/RAG
service.
