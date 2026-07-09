import re
from functools import lru_cache
from pymorphy3 import MorphAnalyzer


_MORPH = MorphAnalyzer()


@lru_cache(maxsize=100_000)
def lemmatize(word):
    return _MORPH.parse(word)[0].normal_form


def preprocess(text):
    if not isinstance(text, str):
        return ''
    text = text.lower().replace('?', '?')
    text = re.sub(r'<.*?>', ' ', text)
    text = re.sub(r'http\S+|www\.\S+', ' ', text)
    text = re.sub(r'[^?-?a-z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return ' '.join(lemmatize(word) for word in text.split())


def contains_red_flag(text, red_flag):
    pattern = rf'\b{re.escape(red_flag)}\w*'
    return bool(re.search(pattern, text, re.IGNORECASE))


def contains_red_flags(text, red_flags=None):
    active_red_flags = RED_FLAGS if red_flags is None else red_flags
    preprocessed_text = preprocess(text)
    return any(contains_red_flag(preprocessed_text, flag) for flag in active_red_flags)


RED_FLAGS = [
    # Критические события
    "банкрот",
    "дефолт",
    "ликвид",
    "несостоятель",
    "конкурс",
    "наблюден",

    # Финансы
    "долг",
    "задолж",
    "неплатеж",
    "реструктур",
    "ликвидност",
    "убыт",
    "просроч",

    # Суды
    "иск",
    "суд",
    "арбитраж",
    "взыск",
    "оспар",

    # Правоохранительные органы
    "арест",
    "пристав",
    "конфиск",
    "уголов",
    "обвин",
    "задерж",
    "обыск",

    # Мошенничество
    "мошеннич",
    "хищен",
    "корруп",

    # Регуляторы
    "штраф",
    "санкц",
    "наруш",
    "провер",
    "предпис",
    "лиценз",
    "аннулир",

    # Строительство
    "замороз",
    "приостанов",
    "останов",
    "долгостро",
    "перенос",
    "срыв",

    # Кредиторы
    "кредитор",
    "требован",

    # Репутация
    "жалоб",
    "дольщик"
]
