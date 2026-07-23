FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_CACHE=1 \
    PATH="/root/.local/bin:$PATH" \
    PYTHONPATH="/app:/app/backend"

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev build-essential python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Зависимости backend ставим через pip напрямую (диапазоны версий взяты из
# pyproject.toml, группы main + backend). Так pip сам подбирает бинарные
# wheel'ы под платформу сборки (в т.ч. linux/arm64), в отличие от строгой
# установки по poetry.lock, где для greenlet нет arm64-артефакта.
RUN pip3 install --no-cache-dir \
        "sqlalchemy>=2.0.51,<3" "asyncpg>=0.31,<0.32" \
        "psycopg[binary]>=3.3.4,<4" greenlet \
        "pandas>=2.2,<3" "pydantic>=2.13.4,<3" "pydantic-settings>=2.14.2,<3" \
        "httpx>=0.28.1,<0.29" "bcrypt>=5,<6" \
        "fastapi[standard]>=0.139,<0.140" "uvicorn>=0.51,<0.52" \
        "python-multipart>=0.0.32,<0.0.33"

WORKDIR /app
COPY backend/ ./backend/
COPY database/ ./database/
COPY config/ ./config/

CMD uvicorn backend.main:app --host 0.0.0.0 --port 8000
FROM base AS debug
CMD fastapi dev --entrypoint backend.main:app --host 0.0.0.0 --port 8000