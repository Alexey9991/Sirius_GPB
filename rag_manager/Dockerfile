FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_CACHE=1 \
    PATH="/root/.local/bin:$PATH"

RUN pip3 install poetry
WORKDIR /tmp
COPY pyproject.toml poetry.lock /tmp/
RUN poetry config virtualenvs.create false && poetry install --only main,rag_manager --no-root

# Pre-download models during build to avoid slow startup
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; SentenceTransformer('BAAI/bge-m3'); CrossEncoder('BAAI/bge-reranker-v2-m3')"

ENV PYTHONPATH /app
WORKDIR /app
COPY database/ ./database/
COPY config/ ./config/
COPY rag_manager/ .

CMD uvicorn main:app --host 0.0.0.0 --port 8088
FROM base AS debug
CMD fastapi dev --entrypoint main:app --host 0.0.0.0 --port 8088