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
            drivername=self.DRIVER + "psycopg",
            username=self.USER,
            password=self.PASSWORD,
            host=self.HOST,
            port=self.PORT,
            database=self.NAME,
            query={},  # type: ignore
        )
        return database_url


class Settings(BaseSettings):
    database: DatabaseSettings = DatabaseSettings()
    FORBIDDEN_TABLES: list[str] = ["users", "authentications", "alerts", "subscriptions"]
    OPENAI_API_KEY: str = ""                 # ключ DeepSeek (совместимый OpenAI-клиент)
    DEEPSEEK_API_URL: str = "https://api.deepseek.com/chat/completions"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    AI_HANDLER_URL: str = "http://ai_handler:8088"   # внешний RAG-сервис (если поднят)


settings = Settings()