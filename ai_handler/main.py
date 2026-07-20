from sentence_transformers import CrossEncoder
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from pydantic import BaseModel

from database.get_rag_df import get_rag_df
from rag import Rag, prepare_vdb_data
from config.settings import settings


def create_rag() -> Rag:
    df = get_rag_df().head(100)
    all_chunks, embeddings = prepare_vdb_data(df)
    return Rag(
        all_chunks=all_chunks,
        raw_document=df,
        embeddings=embeddings,
        llm_api_key=settings.OPENAI_API_KEY,
        reranker=CrossEncoder("BAAI/bge-reranker-v2-m3"))


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
async def ask(request: QueryRequest, rag: Rag = Depends(get_rag),):
    context, urls = rag.get_context(request.query)

    return {
        "context": context,
        "urls": list(urls),
    }


@app.post("/update")
async def update_rag(rag: Rag = Depends(get_rag)):
    new_df = get_rag_df()
    new_chunks, new_embeddings = prepare_vdb_data(new_df)
    rag.add_new_data(
        raw_document=new_df,
        chunks=new_chunks, embeddings=new_embeddings)
    return {
        "status": "updated",
        "added_documents": len(new_df),
        "added_chunks": len(new_chunks),
    }