from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from nltk.corpus import stopwords
import pandas as pd
import numpy as np
import pymorphy3
import faiss
import nltk
import re

from dpsk import dpsk


embedder = SentenceTransformer("BAAI/bge-m3")
nltk.download('stopwords')
stopwords = set(stopwords.words('russian'))
cache = {}
morph = pymorphy3.MorphAnalyzer()


class Rag:
    def __init__(self, all_chunks, raw_document, embeddings, llm_api_key, reranker):
        self.all_chunks = all_chunks
        self.raw_document = raw_document
        self.index = self.init_index(embeddings)
        self.llm_preprocess = dpsk(llm_api_key, prompt="Ты - модель предобработчик текста. На вход тебе предоставлен текст и правила, строго следуя которым ты должен вернуть измененный текст.")
        self.eval_dataset = None
        self.reranker = reranker

    def init_index(self, embeddings):
        if len(embeddings) == 0:
            raise ValueError('Нет эмбеддингов для индексации')
        index = faiss.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings.astype(np.float32))
        return index

    def add_new_data(self, raw_document, chunks, embeddings):
        if not chunks:
            return
        if len(chunks) != len(embeddings):
            raise ValueError("Количество чанков и эмбеддингов не совпадает")
        self.raw_document = pd.concat([self.raw_document, raw_document], ignore_index=True)
        self.all_chunks.extend(chunks)
        self.index.add(embeddings)
        self.eval_dataset = None

    def encode(self, text):
        text = _clean(text)
        return embedder.encode([text], convert_to_numpy=True).astype("float32")

    def search(self, query, k=5):
        ids = []
        _, ids_base = self.index.search(self.encode(query), k)
        ids.extend(ids_base[0])
        _, ids_llm = self.index.search(self.encode(self._llm_query_extract(query)), k)
        ids.extend(ids_llm[0])
        _, ids_kw = self.index.search(self.encode(self._keyword_extract(query)), k)
        ids.extend(ids_kw[0])
        seen = set()
        candidates = [i for i in ids if not (i in seen or seen.add(i))]
        return self._rerank(query, candidates, k)

    def _llm_query_extract(self, query, prompt=None):
        prompt = prompt or f"""Подготовь запрос пользователя для поиска документов в RAG.
Удали лишний текст и речевой мусор, сохрани смысл и важные термины. Оставь только информацию, полезную для поиска.
Сохрани названия технологий, продуктов, людей, организаций, дат, ошибок и другие важные сущности.
Не добавляй новых фактов и не отвечай на запрос.
Верни только улучшенный поисковый запрос одной строкой.
Запрос:
{query}"""
        return self.llm_preprocess.chat(prompt)

    def _keyword_extract(self, query, prompt=None):
        prompt = prompt or f"""Выдели из запроса пользователя ключевые сущности для поиска в базе документов.
Нужны только:
- названия ЖК (жилых комплексов)
- названия застройщиков
- города
- организации
- даты
- другие уникальные названия
Не добавляй общие слова.
Верни только список ключевых слов через пробел.
Запрос:
{query}"""
        return self.llm_preprocess.chat(prompt)

    def _rerank(self, query, candidate_ids, top_k):
        if self.reranker is None:
            return candidate_ids[:top_k]
        pairs = [(query, self.all_chunks[idx]["text"]) for idx in candidate_ids]
        scores = self.reranker.predict(pairs)
        ranked = sorted(zip(candidate_ids, scores), key=lambda x: x[1], reverse=True)
        return [idx for idx, _ in ranked[:top_k]]

    def get_chunks(self, query, k=5):
        ids = self.search(query, k)
        return [self.all_chunks[i] for i in ids]

    def get_context(self, query, k=5, sep="\n\n"):
        chunks = self.get_chunks(query, k)
        return [sep.join(chunk["text"] for chunk in chunks), set(chunk['url'] for chunk in chunks)]

    def get_news_ids(self, query, k=5):
        ids = self.search(query, k)
        return {self.all_chunks[i]["news_id"] for i in ids}

    def _add_eval_query(self, queries, query, news_id):
        queries.setdefault(query, set()).add(news_id)

    def _build_project_queries(self, queries, row):
        if pd.notna(row["project_name"]):
            query = f"Проанализируй ЖК {row['project_name']}. Выдели риски"
            self._add_eval_query(queries, query, row["news_id"])

    def _build_developer_queries(self, queries, row):
        if pd.notna(row["developer"]):
            query = f"Проанализируй застройщика {row['developer']}. Выдели риски"
            self._add_eval_query(queries, query, row["news_id"])

    def _collect_eval_queries(self):
        queries = {}
        for _, row in self.raw_document.iterrows():
            self._build_project_queries(queries, row)
            self._build_developer_queries(queries, row)
        return queries

    def build_eval_dataset(self, force=False):
        if self.eval_dataset is not None and not force:
            return self.eval_dataset
        queries = self._collect_eval_queries()
        self.eval_dataset = [{"query": q, "relevant_news_ids": ids} for q, ids in queries.items()]
        return self.eval_dataset

    def _calc_metrics(self, retrieved, relevant):
        tp = len(retrieved & relevant)
        precision = tp / len(retrieved) if retrieved else 0
        recall = tp / len(relevant) if relevant else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        return precision, recall, f1

    def _calc_mrr(self, ranked_news_ids, relevant):
        for rank, news_id in enumerate(ranked_news_ids, start=1):
            if news_id in relevant:
                return 1.0 / rank
        return 0.0

    def get_ranked_news_ids(self, query, k=5):
        ids = self.search(query, k)
        return [self.all_chunks[i]["news_id"] for i in ids]

    def evaluate(self, k=5):
        if self.eval_dataset is None:
            self.build_eval_dataset()
        scores = []
        mrr_scores = []
        for sample in self.eval_dataset:
            ranked_news_ids = self.get_ranked_news_ids(sample["query"], k)
            retrieved = set(ranked_news_ids)
            relevant = sample["relevant_news_ids"]
            scores.append(self._calc_metrics(retrieved, relevant))
            mrr_scores.append(self._calc_mrr(ranked_news_ids, relevant))
        return {"precision": np.mean([x[0] for x in scores]), "recall": np.mean([x[1] for x in scores]),
                "f1": np.mean([x[2] for x in scores]), "mrr": np.mean(mrr_scores), }


def _lemma(word):
    if word not in cache:
        cache[word] = morph.parse(word)[0].normal_form
    return cache[word]


def _clean(text):
    if not isinstance(text, str):
        return ""
    text = re.sub(r'[^\w\s]', '', text.lower())
    text = re.sub(r'\d+', '', text)
    cleaned = []
    for word in text.split():
        if len(word) <= 2 or word in stopwords:
            continue
        try:
            normal = _lemma(word)
            if normal not in stopwords and len(normal) > 2:
                cleaned.append(normal)
        except:
            continue
    return " ".join(cleaned)


def _prepare_chunks(df):
    chunk_size = 550
    chunk_overlap = 120
    separators = ["\n\n", "\n", ". ", ", ", " ", ""]
    text_splitter = _create_text_splitter(chunk_size, chunk_overlap, len, separators)
    all_chunks = []
    for _, row in df.iterrows():
        all_chunks.extend(_chunk_document(row, text_splitter))
    return all_chunks


def _create_text_splitter(chunk_size, chunk_overlap, length_function, separators):
    return RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap,
                                          length_function=length_function, separators=separators, )


def _chunk_document(row, text_splitter):
    chunks = text_splitter.split_text(row["text"])
    result = []
    for chunk_id, chunk in enumerate(chunks):
        result.append({
            "news_id": row["news_id"],
            "chunk_id": chunk_id,
            "url": row["url"],
            "text": f'ЖК: {row["project_name"]} застройщик: {row["developer"]} уровень риска: {row["risk"]} дата: {row["date"]} город: {row["city"]} источник: {row["source"]} ссылка: {row["url"]} {chunk}',
        })
    return result


def init_chunks_embeddings(chunks):
    embeddings = list(map(_clean, [chunk["text"] for chunk in chunks]))
    embeddings = embedder.encode(embeddings, convert_to_numpy=True, show_progress_bar=True)
    return embeddings


def prepare_vdb_data(df):
    all_chunks = _prepare_chunks(df)
    embeddings = init_chunks_embeddings(all_chunks)
    return [all_chunks, embeddings]