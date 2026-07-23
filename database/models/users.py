from .__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
import datetime
import hashlib
import hmac
import bcrypt
import uuid


class AuthException(Exception):
    ...


class User(SQLBase):
    __tablename__ = "users"

    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True, nullable=False)
    name = sql.Column(sql.String, index=True, unique=True, nullable=False)
    email = sql.Column(sql.String, index=True, unique=True)
    role = sql.Column(sql.String)
    division = sql.Column(sql.String)
    hashed_password = sql.Column(sql.String, nullable=False)
    created_date = sql.Column(sql.DateTime, default=datetime.datetime.now, nullable=False)

    auths = orm.relationship("Auth", back_populates="user", lazy="selectin",
                             cascade="all, delete-orphan", passive_deletes=True)
    subscriptions = orm.relationship("Subscription", back_populates="user",
                                     cascade="all, delete-orphan", lazy="selectin")

    def set_password(self, password: str):
        self.hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.hashed_password:
            return False
        stored = self.hashed_password
        # Старые пользователи (из дампа) имеют werkzeug-хэши pbkdf2/scrypt —
        # проверяем их без зависимости от werkzeug, новые — bcrypt.
        if stored.startswith(("pbkdf2:", "scrypt:")):
            return _check_werkzeug_hash(stored, password)
        try:
            return bcrypt.checkpw(password.encode('utf-8'), stored.encode('utf-8'))
        except ValueError:
            return False


def _check_werkzeug_hash(stored: str, password: str) -> bool:
    try:
        method, salt, hexhash = stored.split("$", 2)
        if method.startswith("pbkdf2:"):
            parts = method.split(":")           # pbkdf2:sha256[:iterations]
            algo = parts[1]
            iterations = int(parts[2]) if len(parts) > 2 else 260000
            digest = hashlib.pbkdf2_hmac(algo, password.encode(), salt.encode(), iterations)
        elif method.startswith("scrypt:"):
            _, n, r, p = method.split(":")      # scrypt:N:r:p
            digest = hashlib.scrypt(password.encode(), salt=salt.encode(),
                                    n=int(n), r=int(r), p=int(p), maxmem=132 * 1024 * 1024)
        else:
            return False
        return hmac.compare_digest(digest.hex(), hexhash)
    except Exception:
        return False


class Auth(SQLBase):
    __tablename__ = "authentications"

    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True, nullable=False)
    session_token = sql.Column(sql.String, unique=True, default=lambda: str(uuid.uuid4()), nullable=False)
    user_agent = sql.Column(sql.String)
    created_at = sql.Column(sql.DateTime, default=datetime.datetime.now, nullable=False)
    last_activity = sql.Column(sql.DateTime, default=datetime.datetime.now, nullable=False)
    logout_at = sql.Column(sql.DateTime)

    user_id = sql.Column(sql.Integer, sql.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user = orm.relationship("User", back_populates="auths", lazy="selectin")