"""RAG-эндпоинт для интерфейса: POST /api/rag/query.

Сценарий: запрос аналитика → поиск релевантных новостей → ответ DeepSeek
со ссылками на источники.

Работает в два эшелона:
  1. Если поднят сервис ai_handler (векторный поиск bge-m3 + faiss +
     реранкер) — запрос проксируется в него (AI_HANDLER_URL из настроек).
  2. Иначе — встроенный облегчённый ретривер: TF-IDF по новостям прямо
     из Postgres + вызов DeepSeek по HTTP (httpx). Без ключа
     (OPENAI_API_KEY) возвращает режим retrieval_only — найденные
     новости без сгенерированного текста; интерфейс это показывает.

Формат ответа одинаковый в обоих случаях:
  { query, mode, model, answer|null, note|null,
    sources: [{news_id, title, date, source, url, score, risk_score,
               level, project_name}] }
"""
import math
import re
from collections import Counter

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from config.settings import settings
from deps import DbSess
from database import ImpactSignal, News

rag_router = APIRouter(prefix="/rag")


class RagQuery(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    top_k: int = Field(5, ge=1, le=10)


# ---------------------------------------------------------------------------
# Облегчённый ретривер: TF-IDF с простым русским стеммингом
# ---------------------------------------------------------------------------

_TOKEN_RX = re.compile(r"[а-яёa-z0-9]{2,}")
_SUFFIXES = sorted([
    "иями", "ями", "ами", "иях", "ях", "ах", "ией",
    "ой", "ей", "ий", "ый", "ая", "яя", "ое", "ее", "ые", "ие",
    "ов", "ев", "ам", "ям", "ом", "ем", "их", "ых", "ую", "юю",
    "а", "я", "о", "е", "у", "ю", "ы", "и", "ь", "й",
], key=len, reverse=True)
_STOP = {
    "и", "в", "на", "с", "по", "за", "для", "от", "до", "из", "у", "о", "об",
    "не", "что", "как", "это", "при", "мы", "вы", "он", "она", "они", "его",
    "ее", "их", "же", "ли", "бы", "к", "со", "все", "был", "была", "были",
    "быть", "есть", "то", "но", "а", "или", "также", "уже", "еще",
}


def _stem(word: str) -> str:
    if len(word) <= 4:
        return word
    for suf in _SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[:-len(suf)]
    return word


def _tokenize(text: str) -> list[str]:
    words = _TOKEN_RX.findall((text or "").lower().replace("ё", "е"))
    return [_stem(w) for w in words if w not in _STOP]


class _TfIdfIndex:
    def __init__(self):
        self.vectors: dict[str, dict[str, float]] = {}
        self.norms: dict[str, float] = {}
        self.idf: dict[str, float] = {}

    def build(self, docs: dict[str, str]) -> None:
        tokenized = {doc_id: Counter(_tokenize(text)) for doc_id, text in docs.items()}
        n_docs = max(len(tokenized), 1)
        df: Counter = Counter()
        for counts in tokenized.values():
            df.update(counts.keys())
        self.idf = {t: math.log((n_docs + 1) / (c + 1)) + 1.0 for t, c in df.items()}
        for doc_id, counts in tokenized.items():
            total = sum(counts.values()) or 1
            vec = {t: (c / total) * self.idf[t] for t, c in counts.items()}
            self.vectors[doc_id] = vec
            self.norms[doc_id] = math.sqrt(sum(w * w for w in vec.values())) or 1.0

    def search(self, query: str, top_k: int) -> list[tuple[str, float]]:
        q_counts = Counter(_tokenize(query))
        if not q_counts:
            return []
        total = sum(q_counts.values())
        q_vec = {t: (c / total) * self.idf.get(t, 1.0) for t, c in q_counts.items()}
        q_norm = math.sqrt(sum(w * w for w in q_vec.values())) or 1.0
        scored = []
        for doc_id, vec in self.vectors.items():
            dot = sum(w * vec.get(t, 0.0) for t, w in q_vec.items())
            if dot > 0:
                scored.append((doc_id, dot / (q_norm * self.norms[doc_id])))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]


_index_cache: dict = {"stamp": None, "index": None}


async def _get_index(db_sess) -> _TfIdfIndex:
    from sqlalchemy import func
    stamp = (
        (await db_sess.execute(select(func.count(News.id)))).scalar(),
        str((await db_sess.execute(select(func.max(News.created_at)))).scalar()),
    )
    if _index_cache["stamp"] != stamp or _index_cache["index"] is None:
        rows = (await db_sess.execute(select(News.id, News.title, News.content))).all()
        index = _TfIdfIndex()
        index.build({nid: f"{title}\n{(content or '')[:4000]}" for nid, title, content in rows})
        _index_cache.update(stamp=stamp, index=index)
    return _index_cache["index"]


def _ui_level(score: float | None) -> str | None:
    if score is None:
        return None
    return "RED" if score >= 70 else "YELLOW" if score >= 35 else "GREEN"


async def _retrieve(db_sess, query: str, top_k: int) -> list[dict]:
    index = await _get_index(db_sess)
    hits = index.search(query, top_k)
    if not hits:
        return []
    ids = [doc_id for doc_id, _ in hits]
    news_rows = (await db_sess.execute(select(News).where(News.id.in_(ids)))).scalars().all()
    news_map = {n.id: n for n in news_rows}
    signals = (await db_sess.execute(
        select(ImpactSignal).where(ImpactSignal.news_id.in_(ids))
        .order_by(ImpactSignal.risk_level.desc().nulls_last())
    )).scalars().all()
    sig_map: dict[str, ImpactSignal] = {}
    for sig in signals:
        sig_map.setdefault(sig.news_id, sig)

    sources = []
    for news_id, score in hits:
        news = news_map.get(news_id)
        if not news:
            continue
        sig = sig_map.get(news_id)
        risk = float(sig.risk_level) if sig and sig.risk_level is not None else None
        sources.append({
            "news_id": news.id,
            "title": news.title,
            "date": str(news.date or ""),
            "source": news.source or "",
            "url": (news.parse_news.url if news.parse_news else None),
            "score": round(float(score), 3),
            "risk_score": round(risk) if risk is not None else None,
            "risk_category": (sig.risk_category if sig else None),
            "level": _ui_level(risk),
            "project_name": (sig.project.name if sig and sig.project else None),
        })
    return sources


_SYSTEM_PROMPT = (
    "Ты — аналитик рисков рынка жилой недвижимости в банке. Отвечай кратко и по делу "
    "на русском языке. Используй ТОЛЬКО приведённые новости; ссылайся на них номерами "
    "в квадратных скобках, например [1]. Если информации недостаточно — прямо скажи. "
    "В конце дай короткий вывод об уровне риска, если уместно."
)


def _context_block(sources: list[dict]) -> str:
    parts = []
    for i, s in enumerate(sources, 1):
        risk = f" | риск {s['risk_score']}/100" if s.get("risk_score") is not None else ""
        obj = f" | объект: {s['project_name']}" if s.get("project_name") else ""
        parts.append(f"[{i}] {s['title']}\nДата: {s['date']} | Источник: {s['source']}{risk}{obj}")
    return "\n\n".join(parts)


async def _context_texts(db_sess, sources: list[dict]) -> str:
    ids = [s["news_id"] for s in sources]
    rows = (await db_sess.execute(select(News.id, News.content).where(News.id.in_(ids)))).all()
    content = {nid: (text or "")[:800] for nid, text in rows}
    parts = []
    for i, s in enumerate(sources, 1):
        risk = f" | риск {s['risk_score']}/100" if s.get("risk_score") is not None else ""
        obj = f" | объект: {s['project_name']}" if s.get("project_name") else ""
        parts.append(f"[{i}] {s['title']}\nДата: {s['date']} | Источник: {s['source']}{risk}{obj}\n"
                     f"{content.get(s['news_id'], '')}")
    return "\n\n".join(parts)


async def _call_deepseek(messages: list[dict]) -> tuple[str | None, str | None]:
    key = (settings.OPENAI_API_KEY or "").strip()
    if not key or key == "your_deepseek_key":
        return None, "no_key"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                settings.DEEPSEEK_API_URL,
                headers={"Authorization": f"Bearer {key}"},
                json={"model": settings.DEEPSEEK_MODEL, "messages": messages,
                      "temperature": 0.3, "max_tokens": 900},
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip(), None
    except Exception as e:
        return None, str(e)[:200]


async def _try_ai_handler(query: str) -> str | None:
    """Пробуем внешний RAG-сервис; None — если недоступен."""
    url = (settings.AI_HANDLER_URL or "").rstrip("/")
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=3)) as client:
            resp = await client.post(f"{url}/rag/ask", json={"query": query})
            resp.raise_for_status()
            payload = resp.json()
            return payload if isinstance(payload, str) else str(payload)
    except Exception:
        return None


@rag_router.post("/query")
async def rag_query(body: RagQuery, db_sess: DbSess):
    query = body.query.strip()

    # 1. Полноценный векторный RAG-сервис, если он запущен
    external = await _try_ai_handler(query)
    if external:
        return {"query": query, "mode": "ai_handler", "model": settings.DEEPSEEK_MODEL,
                "answer": external, "note": None, "sources": []}

    # 2. Встроенный ретривер + DeepSeek
    sources = await _retrieve(db_sess, query, body.top_k)
    if not sources:
        return {"query": query, "mode": "retrieval_only", "model": None, "answer": None,
                "note": "Релевантных новостей в базе не найдено.", "sources": []}

    context = await _context_texts(db_sess, sources)
    answer, err = await _call_deepseek([
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"Вопрос: {query}\n\nНовости:\n\n{context}"},
    ])
    if answer is not None:
        urls = [s["url"] for s in sources if s.get("url")]
        if urls:
            answer = f"{answer}\n\nСсылки на источники:\n" + "\n".join(urls)
        return {"query": query, "mode": "builtin_rag", "model": settings.DEEPSEEK_MODEL,
                "answer": answer, "note": None, "sources": sources}

    note = ("DeepSeek API не подключён: задайте OPENAI_API_KEY в config/.env."
            if err == "no_key" else f"DeepSeek недоступен ({err}); показаны найденные новости.")
    return {"query": query, "mode": "retrieval_only", "model": None, "answer": None,
            "note": note, "sources": sources}
