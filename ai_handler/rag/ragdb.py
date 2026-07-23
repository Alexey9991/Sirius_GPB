from sentence_transformers import CrossEncoder
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from database.engine import engine_sync
from database.models.chunks import Chunk
from database.get_rag_df import get_rag_df
from .rag import Rag, prepare_vdb_data
from config.settings import settings


def _raw_connection():
    """Get a raw psycopg connection for DDL operations."""
    return engine_sync.raw_connection()


def init_vector_db():
    with _raw_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("""CREATE TABLE IF NOT EXISTS chunks (
                news_id TEXT NOT NULL,
                chunk_id INTEGER NOT NULL,
                url TEXT,
                text TEXT NOT NULL,
                embedding vector(1024),
                PRIMARY KEY (news_id, chunk_id));""")
            cur.execute(
                "CREATE INDEX IF NOT EXISTS chunks_embedding_idx "
                "ON chunks USING hnsw (embedding vector_cosine_ops);"
            )
        conn.commit()


def get_chunks_with_embeddings():
    with Session(engine_sync) as session:
        stmt = select(Chunk).order_by(Chunk.news_id, Chunk.chunk_id)
        rows = session.execute(stmt).scalars().all()

    chunks = []
    embeddings = []
    for chunk in rows:
        chunks.append({
            "news_id": chunk.news_id,
            "chunk_id": chunk.chunk_id,
            "url": chunk.url,
            "text": chunk.text,
        })
        embeddings.append(chunk.embedding)
    return chunks, embeddings


def create_rag() -> Rag:
    raw_document = get_rag_df()
    chunks, embeddings = get_chunks_with_embeddings()

    reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")
    return Rag(
        all_chunks=chunks,
        raw_document=raw_document,
        embeddings=embeddings,
        llm_api_key=settings.OPENAI_API_KEY,
        reranker=reranker,
    )


def save_chunks(chunks, embeddings):
    with Session(engine_sync) as session:
        for chunk_data, embedding in zip(chunks, embeddings):
            chunk = Chunk(
                news_id=chunk_data["news_id"],
                chunk_id=chunk_data["chunk_id"],
                url=chunk_data.get("url"),
                text=chunk_data["text"],
                embedding=embedding,
            )
            session.merge(chunk)
        session.commit()


def get_unique_news():
    df = get_rag_df()
    return df.drop_duplicates(subset=["url"]).reset_index(drop=True)


def update_chunks():
    df = get_unique_news()
    chunks, embeddings = prepare_vdb_data(df)
    news_ids = df["news_id"].tolist()
    if news_ids:
        with Session(engine_sync) as session:
            session.execute(
                delete(Chunk).where(Chunk.news_id.in_(news_ids))
            )
            session.commit()
    save_chunks(chunks, embeddings)
    return df, chunks, embeddings
