from sentence_transformers import CrossEncoder
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from pydantic import BaseModel

from database.get_rag_df import get_rag_df
from rag import Rag, prepare_vdb_data


def create_rag() -> Rag:
    df = get_rag_df()
    all_chunks, embeddings = prepare_vdb_data(df)

    reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

    return Rag(
        all_chunks=all_chunks,
        raw_document=df,
        embeddings=embeddings,
        llm_api="",
        reranker=reranker,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.rag = create_rag()
    yield


app = FastAPI(lifespan=lifespan)


def get_rag() -> Rag:
    return app.state.rag


class QueryRequest(BaseModel):
    query: str


class UpdateRequest(BaseModel):
    path: str = "data/new_news.parquet"


@app.post("/ask")
async def ask(
    request: QueryRequest,
    rag: Rag = Depends(get_rag),
):
    context, urls = rag.get_context(request.query)

    return {
        "context": context,
        "urls": list(urls),
    }


@app.post("/update")
async def update_rag(rag: Rag = Depends(get_rag)):
    # загружаем новые документы
    new_df = get_rag_df()

    # готовим новые чанки и эмбеддинги
    new_chunks, new_embeddings = prepare_vdb_data(new_df)

    # пополняем существующий RAG
    rag.add_new_data(
        raw_document=new_df,
        chunks=new_chunks,
        embeddings=new_embeddings,
    )

    return {
        "status": "updated",
        "added_documents": len(new_df),
        "added_chunks": len(new_chunks),
    }