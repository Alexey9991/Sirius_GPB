FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_CACHE=1 \
    PATH="/root/.local/bin:$PATH" \
    PYTHONPATH="/app"

RUN pip3 install poetry
WORKDIR /tmp
COPY pyproject.toml poetry.lock /tmp/
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev build-essential python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY database/ ./database/
COPY config/ ./config/
COPY ai_handler/ .

CMD uvicorn main:app --host 0.0.0.0 --port 8088
FROM base AS debug
CMD fastapi dev --entrypoint main:app --host 0.0.0.0 --port 8088