FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_CACHE=1

ENV PATH="/root/.local/bin:$PATH"

RUN pip3 install poetry

WORKDIR /tmp
COPY pyproject.toml poetry.lock /tmp/

RUN poetry config virtualenvs.create false && poetry install --only main --no-root --no-cache

ENV PYTHONPATH /app
WORKDIR /app
COPY backend/ .
COPY config/ /app/config/

FROM base AS debug
CMD fastapi dev --entrypoint main:app --host 0.0.0.0 --port 8000