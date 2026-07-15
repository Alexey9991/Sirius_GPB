from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import cached_property
from sqlalchemy import URL


class DatabaseSettings(BaseSettings):
    DRIVER: str = "postgresql+"
    HOST: str = "localhost"
    PORT: int = 5432
    NAME: str = "siriusgpb"
    USER: str = "postgres"
    PASSWORD: str = "postgres"

    model_config = SettingsConfigDict(env_prefix="DB_")

    @cached_property
    def database_url(self) -> URL:
        database_url = URL(
            drivername=self.DRIVER + "asyncpg",
            username=self.USER,
            password=self.PASSWORD,
            host=self.HOST,
            port=self.PORT,
            database=self.NAME,
            query={},  # type: ignore
        )
        return database_url


class DomRfSettings(BaseSettings):
    OBJECT_URL_TEMPLATE: str | None = None
    ENDPOINTS: str = ""
    AUTH_TOKEN: str | None = None
    TIMEOUT: float = 20.0

    model_config = SettingsConfigDict(env_prefix="DOMRF_")

    @property
    def endpoint_templates(self) -> list[str]:
        templates: list[str] = []
        if self.OBJECT_URL_TEMPLATE:
            templates.append(self.OBJECT_URL_TEMPLATE)
        templates.extend(
            item.strip() for item in self.ENDPOINTS.split(",")
            if item.strip()
        )
        templates.extend([
            "https://xn--80az8a.xn--d1aqf.xn--p1ai/api/erz/main/object/{object_id}",
            "https://xn--80az8a.xn--d1aqf.xn--p1ai/api/object/{object_id}",
            "https://xn--80az8a.xn--d1aqf.xn--p1ai/сервисы/api/kn/object/{object_id}",
        ])
        return list(dict.fromkeys(templates))


class Settings(BaseSettings):
    database: DatabaseSettings = DatabaseSettings()
    domrf: DomRfSettings = DomRfSettings()
    FORBIDDEN_TABLES: list[str] = ["users", "authentications", "alerts", "subscriptions"]


settings = Settings()
