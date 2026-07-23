#!/usr/bin/env bash
# Восстановление дампа боевой базы (database/dumps/database.sql, pg_dump -Fc)
# в контейнер postgres из docker-compose + подготовка данных для интерфейса.
#
# Использование:
#   ./scripts/restore_dump.sh                 # дамп по умолчанию
#   ./scripts/restore_dump.sh path/to/dump    # свой файл
#
# Идемпотентно: pg_restore --clean --if-exists, разметка категорий поверх.
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:-database/dumps/database.sql}"
[ -f "$DUMP" ] || { echo "Дамп не найден: $DUMP"; exit 1; }

echo "→ Копирую дамп в контейнер postgres…"
docker compose cp "$DUMP" postgres:/tmp/database.sql

echo "→ Восстанавливаю (pg_restore, схема+данные, поверх существующих)…"
docker compose exec -T postgres pg_restore -U postgres -d siriusgpb \
  --clean --if-exists --no-owner --no-privileges /tmp/database.sql \
  || true   # pg_restore считает warnings ошибками; результат проверяем ниже

echo "→ Размечаю категории риска для интерфейса (risk_category)…"
docker compose exec -T postgres psql -U postgres -d siriusgpb -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE impact_signals ADD COLUMN IF NOT EXISTS risk_category VARCHAR;

-- Эвристическая разметка по тексту новости (замените выводом LLM-пайплайна,
-- когда он начнёт писать категорию сам). Приоритет сверху вниз.
UPDATE impact_signals s
SET risk_category = CASE
  WHEN x.t ~* 'банкрот|конкурсн\w+ производств' THEN 'Финансовый риск'
  WHEN x.t ~* 'уголовн|мошеннич|растрат|хищени|обманут\w+ дольщик|прокуратур|следственн|арбитраж|\mсуд\w*|\mиск\w{0,3}\M'
    THEN 'Юридический риск'
  WHEN x.t ~* 'заморо(жен|зк|зил)|остановк\w+ строительств|приостановл\w+ строительств|долгостро|срыв\w* срок|перенос\w* (срок|сдач|ввод)|задерж|не в графике'
    THEN 'Срыв сроков'
  WHEN x.t ~* 'снят\w* с продаж|остановк\w+ продаж|штраф|неустойк|задолженност|просрочк|эскроу'
    THEN 'Финансовый риск'
  WHEN x.t ~* 'жалоб|недовольн|протест|митинг|пикет|трещин|дефект' THEN 'Репутация'
  WHEN coalesce(s.risk_level, 0) >= 70 THEN 'Рыночный риск'
  ELSE 'Информационный фон'
END
FROM news n, LATERAL (SELECT lower(n.title || ' ' || left(coalesce(n.content, ''), 3000)) AS t) x
WHERE n.id = s.news_id;

ANALYZE;
SQL

echo "→ Проверка:"
docker compose exec -T postgres psql -U postgres -d siriusgpb -tA -c \
  "SELECT 'projects: '||COUNT(*) FROM projects UNION ALL
   SELECT 'news: '||COUNT(*) FROM news UNION ALL
   SELECT 'impact_signals: '||COUNT(*) FROM impact_signals UNION ALL
   SELECT 'категория «'||risk_category||'»: '||COUNT(*) FROM impact_signals GROUP BY risk_category;"
echo "✓ Готово. Перезапустите backend: docker compose restart backend"
