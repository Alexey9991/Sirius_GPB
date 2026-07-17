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

    @cached_property
    def database_url_sync(self) -> URL:
        database_url = URL(
            drivername=self.DRIVER + "psycopg2",
            username=self.USER,
            password=self.PASSWORD,
            host=self.HOST,
            port=self.PORT,
            database=self.NAME,
            query={},  # type: ignore
        )
        return database_url


class Settings(BaseSettings):
    HUGGING_FACE_TOKEN: str = None
    database: DatabaseSettings = DatabaseSettings()
    FORBIDDEN_TABLES: list[str] = ["users", "authentications", "alerts", "subscriptions"]


settings = Settings()