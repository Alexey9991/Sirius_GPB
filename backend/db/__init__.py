from urllib.parse import urlparse
from sqlalchemy.orm import Session
import sqlalchemy.orm as orm
import sqlalchemy as sa
import os

SqlAlchemyBase = orm.declarative_base()

__factory = None
__engine = None


def get_database_url():
    """
    Determine database URL from environment variables.

    Priority:
    1. DATABASE_URL environment variable (for direct connection string)
    2. DB_TYPE + DB_HOST + DB_PORT + DB_NAME + DB_USER + DB_PASSWORD
    3. Default SQLite (DB_FILE)

    Examples:
    - SQLite: sqlite:////path/to/db.sqlite3
    - PostgreSQL: postgresql://user:password@localhost:5432/dbname
    - MySQL: mysql+pymysql://user:password@localhost:3306/dbname
    """

    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")

    db_type = os.getenv("DB_TYPE", "sqlite").lower()

    if db_type == "sqlite":
        db_file = os.getenv("DB_FILE", "db.sqlite3")
        return f"sqlite:///{db_file}?check_same_thread=False"

    elif db_type in ("postgresql", "postgres"):
        db_user = os.getenv("DB_USER", "postgres")
        db_password = os.getenv("DB_PASSWORD", "")
        db_host = os.getenv("DB_HOST", "localhost")
        db_port = os.getenv("DB_PORT", "5432")
        db_name = os.getenv("DB_NAME", "siriusgpb")

        if db_password:
            return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        else:
            return f"postgresql://{db_user}@{db_host}:{db_port}/{db_name}"

    elif db_type in ("mysql", "mariadb"):
        db_driver = os.getenv("DB_DRIVER", "pymysql")
        db_user = os.getenv("DB_USER", "root")
        db_password = os.getenv("DB_PASSWORD", "")
        db_host = os.getenv("DB_HOST", "localhost")
        db_port = os.getenv("DB_PORT", "3306")
        db_name = os.getenv("DB_NAME", "siriusgpb")

        if db_password:
            return f"mysql+{db_driver}://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        else:
            return f"mysql+{db_driver}://{db_user}@{db_host}:{db_port}/{db_name}"

    else:
        raise ValueError(f"Unsupported database type: {db_type}")


def global_init(db_url=None):
    global __factory, __engine
    if __factory:
        return __engine
    if not db_url:
        db_url = get_database_url()
    if not db_url or not db_url.strip():
        raise Exception("Database URL is required")

    try:
        print(f"🔌 Connecting to database: {mask_credentials(db_url)}")
        engine = sa.create_engine(db_url, echo=False)
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
            print(f"✓ Database connection successful")

        __factory = orm.sessionmaker(bind=engine)
        __engine = engine
        from . import __all_models
        SqlAlchemyBase.metadata.create_all(engine)
        print(f"✓ Database tables initialized")
        return engine

    except Exception as e:
        print(f"✗ Database initialization failed: {e}")
        raise


def create_session() -> Session:
    global __factory
    if not __factory:
        raise RuntimeError("Database not initialized. Call global_init() first.")
    return __factory()


def get_engine():
    return __engine


def mask_credentials(db_url: str) -> str:
    parsed = urlparse(db_url)
    if parsed.password:
        masked_url = db_url.replace(parsed.password, "***")
        return masked_url
    return db_url