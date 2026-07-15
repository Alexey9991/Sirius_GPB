FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1

ENV PATH="/root/.local/bin:$PATH"

RUN pip3 install poetry

WORKDIR /tmp
COPY pyproject.toml poetry.lock /tmp/

RUN poetry config virtualenvs.create false && poetry install --only main --no-root

ENV PYTHONPATH /app
WORKDIR /app
COPY backend/ .

FROM base AS debug
CMD fastapi dev --entrypoint main:app --host 0.0.0.0 --port 8000