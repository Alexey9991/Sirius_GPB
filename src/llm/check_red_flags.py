import re
from pymorphy3 import MorphAnalyzer

morph = MorphAnalyzer()


def preprocess(text):
    if not isinstance(text, str):
        return ""

    # Нижний регистр
    text = text.lower()

    # Замена ё -> е
    text = text.replace("ё", "е")

    # Удаление HTML
    text = re.sub(r"<.*?>", " ", text)

    # Удаление ссылок
    text = re.sub(r"http\S+|www\.\S+", " ", text)

    # Оставляем только буквы и цифры
    text = re.sub(r"[^а-яa-z0-9\s]", " ", text)

    # Удаляем лишние пробелы
    text = re.sub(r"\s+", " ", text).strip()

    # Лемматизация
    lemmas = [
        morph.parse(word)[0].normal_form
        for word in text.split()
    ]

    return " ".join(lemmas)


def contains_red_flag(text, red_flag):
    pattern = rf"\b{re.escape(red_flag)}\w*"
    return bool(re.search(pattern, text, re.IGNORECASE))


def contains_red_flags(text, red_flags):
    preprocessed_text = preprocess(text)
    return any(contains_red_flag(preprocessed_text, flag) for flag in red_flags)


red_flags = [
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
