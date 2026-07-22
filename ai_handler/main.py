from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from pydantic import BaseModel

from rag.ragdb import init_vector_db, create_rag, Rag, update_chunks
from config.settings import settings
from dpsk import dpsk


class QueryRequest(BaseModel):
    query: str

class UpdateRequest(BaseModel):
    path: str = "data/new_news.parquet"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_vector_db()
    app.state.rag = create_rag()
    yield


app = FastAPI(lifespan=lifespan)


def get_rag() -> Rag:
    return app.state.rag


@app.post("/ask")
async def ask(request: QueryRequest, rag: Rag = Depends(get_rag),):
    context, urls = rag.get_context(request.query)
    llm = dpsk(settings.OPENAI_API_KEY, prompt="Ты — модель аналитик. На вход тебе представлен контекст из новостей и пользовательский запрос. Отвечай исключительно исходя из фактов, без собственного мнения. При использовании фактов из контекста обязательно указывай ссылку из метаданных в круглых скобках без каких-либо изменений.")
    answer = llm.chat(f"Контекст:\n{context}\n\nЗапрос:\n{request.query}")
    return f"{answer}\n\nСсылки на источники:\n{"\n".join(urls)}"


@app.post("/update")
async def update_rag(request: UpdateRequest, rag: Rag = Depends(get_rag),):
    new_df, new_chunks, new_embeddings = update_chunks()
    rag.add_new_data(new_df, new_chunks, new_embeddings)
    return {
        "status": "updated",
        "documents": len(new_df),
        "chunks": len(new_chunks),
    }