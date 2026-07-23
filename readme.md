# RAG-Система анализа новостного потока | БВ 26
Для мониторинга импакт-сигналов рынка недвижимости.

Архитектура: PostgreSQL 18 (pgvector) · FastAPI-бэкенд с новым UI ·
`data_manager` (парсер → валидатор → BERT-риск → LLM-извлечение → impact_signals) ·
`ai_handler` (векторный RAG: bge-m3 + faiss + реранкер).
Интерфейс работает «от готовой таблицы impact_signals».

## Быстрый старт

```bash
# 1. Конфигурация (внутри докера DB_HOST=postgres уже прописан)
cp config/.env.example config/.env
#    → впишите ключ DeepSeek в OPENAI_API_KEY (иначе RAG отдаёт только источники)

# 2. Поднять базу и бэкенд с интерфейсом
docker compose up -d --build postgres backend

# 3. Загрузить данные боевого дампа (news, projects, impact_signals + разметка категорий)
./scripts/restore_dump.sh
docker compose restart backend

# Интерфейс: http://localhost:8000  (вход: demo / demo1234)
```

`ai_handler` (полноценный векторный RAG) и `data_manager` (пайплайн) — опциональны:
`docker compose up -d ai_handler` — скачает модели эмбеддингов и реранкера (тяжёлые);
пока он не поднят, бэкенд отвечает на RAG-запросы встроенным поиском + DeepSeek напрямую.

## Как устроен RAG (страница «ИИ-анализ потока»)

`POST /api/rag/query` в бэкенде:
1. если жив `ai_handler` (AI_HANDLER_URL) — проксирует запрос в него
   (bge-m3 + faiss + реранкер + DeepSeek);
2. иначе — встроенный ретривер TF-IDF по таблице news + DeepSeek по HTTP;
3. без ключа — режим `retrieval_only`: релевантные новости со ссылками без
   сгенерированного текста (интерфейс это явно показывает).

## Мониторинг

Интерфейс считает риск объектов из impact_signals (оценка модели 0–100):
объекты с сигналами появляются в «Объектах» с реальными индексами, карточка
объекта показывает связанные новости со ссылками на первоисточники и
категории риска (risk_category — размечается в restore_dump.sh, замените
выводом LLM-пайплайна, когда он начнёт писать её сам).

## Что изменено относительно исходного main (ветка test)

- `backend/api/routers/rag.py` — новый RAG-эндпоинт (прокси в ai_handler + встроенный fallback);
- `database/models/alerts.py` — колонка `impact_signals.risk_category`;
- `database/models/users.py` — вход работает и со старыми (werkzeug) хэшами из дампа;
- `backend/main.py` — миграция колонки + демо-пользователь при старте;
- `ai_handler/main.py` — исправлены префиксы роутеров (сервис не стартовал);
- `static/js/api.js` — оценки объектов считаются по полным данным сигналов,
  добавлен `ragQuery`, поиск не падает целиком при ошибке одной таблицы;
- `static/js/pages/ai-analysis.js` — кнопка «Запустить ИИ-анализ» вызывает
  реальный RAG вместо заглушки с setTimeout;
- `config/.env.example` — DB_HOST=postgres для докера, ключ DeepSeek, AI_HANDLER_URL;
- `scripts/restore_dump.sh` + `database/dumps/database.sql` — загрузка данных.
