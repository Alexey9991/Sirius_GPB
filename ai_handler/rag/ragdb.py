from pgvector.psycopg import register_vector
from sentence_transformers import CrossEncoder

from database.engine import session_maker_sync
from database.get_rag_df import get_rag_df
from .rag import Rag, prepare_vdb_data
from config.settings import settings


def get_connection():
    conn = session_maker_sync()
    register_vector(conn)
    return conn


def init_vector_db():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("""CREATE TABLE IF NOT EXISTS chunks (
                news_id BIGINT NOT NULL,
                chunk_id INTEGER NOT NULL,
                url TEXT,
                text TEXT NOT NULL,
                embedding VECTOR(1024) NOT NULL,
                PRIMARY KEY (news_id, chunk_id));""")
            cur.execute("CREATE INDEX IF NOT EXISTS chunks_embedding_idx " \
            "ON chunks USING hnsw (embedding vector_cosine_ops);")
        conn.commit()


def get_chunks_with_embeddings():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT news_id, chunk_id, url, text, embedding " \
            "FROM chunks ORDER BY news_id, chunk_id;")
            return cur.fetchall()


def create_rag() -> Rag:
    raw_document = get_rag_df()
    rows = get_chunks_with_embeddings()
    chunks = []
    embeddings = []

    for row in rows:
        chunks.append({
            "news_id": row["news_id"],
            "chunk_id": row["chunk_id"],
            "url": row["url"],
            "text": row["text"]
        })

        embeddings.append(row["embedding"])

    reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")
    return Rag(
        all_chunks=chunks,
        raw_document=raw_document,
        embeddings=embeddings,
        llm_api=settings.OPENAI_API_KEY,
        reranker=reranker)


def save_chunks(chunks, embeddings):
    with get_connection() as conn:
        with conn.cursor() as cur:
            for chunk, embedding in zip(chunks, embeddings):
                cur.execute(
                    """INSERT INTO chunks(news_id, chunk_id, url, text, embedding)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (news_id, chunk_id) DO UPDATE SET
                        url = EXCLUDED.url, text = EXCLUDED.text, embedding = EXCLUDED.embedding;""",
                    (chunk["news_id"], chunk["chunk_id"], chunk["url"], chunk["text"], embedding),)
        conn.commit()



def get_unique_news():
    df = get_rag_df()
    return df.drop_duplicates(subset=["url"]).reset_index(drop=True)


def update_chunks():
    df = get_unique_news()
    chunks, embeddings = prepare_vdb_data(df)
    news_ids = df["id"].tolist()
    if news_ids:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM chunks WHERE news_id = ANY(%s);", (news_ids,))
            conn.commit()
    save_chunks(chunks, embeddings)
    return df, chunks, embeddings