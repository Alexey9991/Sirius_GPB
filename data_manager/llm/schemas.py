from enum import Enum
from typing import Optional
from pydantic import BaseModel


class RealEstateRiskCategory(str, Enum):
    MACROECONOMIC = "Макроэкономические"
    FINANCIAL = "Финансовые"
    MARKET = "Рыночные"
    LEGAL = "Правовые"
    REGULATORY = "Регуляторные"
    TECHNICAL = "Технические"
    CONSTRUCTION = "Строительные"
    OPERATIONAL = "Эксплуатационные"
    ENVIRONMENTAL = "Экологические"
    NATURAL = "Природные"
    SOCIAL = "Социальные"
    POLITICAL = "Политические"
    LIQUIDITY = "Риски ликвидности"
    REPUTATIONAL = "Репутационные"
    OTHER = "Прочие"


class Region(str, Enum):
    ADYGEA = "Республика Адыгея"
    ALTAI_REPUBLIC = "Республика Алтай"
    BASHKORTOSTAN = "Республика Башкортостан"
    BURYATIA = "Республика Бурятия"
    DAGESTAN = "Республика Дагестан"
    INGUSHETIA = "Республика Ингушетия"
    KABARDINO_BALKARIA = "Кабардино-Балкарская Республика"
    KALMYKIA = "Республика Калмыкия"
    KARACHAY_CHERKESSIA = "Карачаево-Черкесская Республика"
    KARELIA = "Республика Карелия"
    KOMI = "Республика Коми"
    CRIMEA = "Республика Крым"
    MARI_EL = "Республика Марий Эл"
    MORDOVIA = "Республика Мордовия"
    SAKHA = "Республика Саха (Якутия)"
    NORTH_OSSETIA = "Республика Северная Осетия — Алания"
    TATARSTAN = "Республика Татарстан"
    TUVA = "Республика Тыва"
    UDMURTIA = "Удмуртская Республика"
    KHAKASSIA = "Республика Хакасия"
    CHECHNYA = "Чеченская Республика"
    CHUVASHIA = "Чувашская Республика"

    ALTAI_KRAI = "Алтайский край"
    KAMCHATKA_KRAI = "Камчатский край"
    KRASNODAR_KRAI = "Краснодарский край"
    KRASNOYARSK_KRAI = "Красноярский край"
    PERM_KRAI = "Пермский край"
    PRIMORSKY_KRAI = "Приморский край"
    STAVROPOL_KRAI = "Ставропольский край"
    KHABAROVSK_KRAI = "Хабаровский край"
    ZABAYKALSKY_KRAI = "Забайкальский край"

    AMUR_OBLAST = "Амурская область"
    ARKHANGELSK_OBLAST = "Архангельская область"
    ASTRAKHAN_OBLAST = "Астраханская область"
    BELGOROD_OBLAST = "Белгородская область"
    BRYANSK_OBLAST = "Брянская область"
    VLADIMIR_OBLAST = "Владимирская область"
    VOLGOGRAD_OBLAST = "Волгоградская область"
    VOLOGDA_OBLAST = "Вологодская область"
    VORONEZH_OBLAST = "Воронежская область"
    IVANOVO_OBLAST = "Ивановская область"
    IRKUTSK_OBLAST = "Иркутская область"
    KALININGRAD_OBLAST = "Калининградская область"
    KALUGA_OBLAST = "Калужская область"
    KEMEROVO_OBLAST = "Кемеровская область — Кузбасс"
    KIROV_OBLAST = "Кировская область"
    KOSTROMA_OBLAST = "Костромская область"
    KURGAN_OBLAST = "Курганская область"
    KURSK_OBLAST = "Курская область"
    LENINGRAD_OBLAST = "Ленинградская область"
    LIPETSK_OBLAST = "Липецкая область"
    MAGADAN_OBLAST = "Магаданская область"
    MOSCOW_OBLAST = "Московская область"
    MURMANSK_OBLAST = "Мурманская область"
    NIZHNY_NOVGOROD_OBLAST = "Нижегородская область"
    NOVGOROD_OBLAST = "Новгородская область"
    NOVOSIBIRSK_OBLAST = "Новосибирская область"
    OMSK_OBLAST = "Омская область"
    ORENBURG_OBLAST = "Оренбургская область"
    ORYOL_OBLAST = "Орловская область"
    PENZA_OBLAST = "Пензенская область"
    PSKOV_OBLAST = "Псковская область"
    ROSTOV_OBLAST = "Ростовская область"
    RYAZAN_OBLAST = "Рязанская область"
    SAMARA_OBLAST = "Самарская область"
    SARATOV_OBLAST = "Саратовская область"
    SAKHALIN_OBLAST = "Сахалинская область"
    SVERDLOVSK_OBLAST = "Свердловская область"
    SMOLENSK_OBLAST = "Смоленская область"
    TAMBOV_OBLAST = "Тамбовская область"
    TVER_OBLAST = "Тверская область"
    TOMSK_OBLAST = "Томская область"
    TULA_OBLAST = "Тульская область"
    TYUMEN_OBLAST = "Тюменская область"
    ULYANOVSK_OBLAST = "Ульяновская область"
    CHELYABINSK_OBLAST = "Челябинская область"
    YAROSLAVL_OBLAST = "Ярославская область"

    MOSCOW = "Москва"
    SAINT_PETERSBURG = "Санкт-Петербург"
    SEVASTOPOL = "Севастополь"

    JEWISH_AUTONOMOUS_OBLAST = "Еврейская автономная область"

    CHUKOTKA_AUTONOMOUS_OKRUG = "Чукотский автономный округ"
    KHANTY_MANSI_AUTONOMOUS_OKRUG = "Ханты-Мансийский автономный округ — Югра"
    NENETS_AUTONOMOUS_OKRUG = "Ненецкий автономный округ"
    YAMALO_NENETS_AUTONOMOUS_OKRUG = "Ямало-Ненецкий автономный округ"


class Signal(BaseModel):
    risk_score: int
    category: RealEstateRiskCategory
    location: Optional[Region] = None
    developer: Optional[str] = None
    zk: Optional[str] = None


class SignalsResponse(BaseModel):
    signals: list[Signal]
