FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_CACHE=1 \
    PATH="/root/.local/bin:$PATH" \
    PYTHONPATH="/app:/app/backend"

RUN pip3 install poetry
RUN apt-get update && apt-get install -y libpq-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp
COPY pyproject.toml poetry.lock /tmp/
RUN poetry config virtualenvs.create false && poetry install --only main,backend --no-root

WORKDIR /app
COPY backend/ ./backend/
COPY database/ ./database/
COPY config/ ./config/

CMD uvicorn backend.main:app --host 0.0.0.0 --port 8000
FROM base AS debug
CMD fastapi dev --entrypoint backend.main:app --host 0.0.0.0 --port 8000