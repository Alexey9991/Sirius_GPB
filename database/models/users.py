from .__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
import datetime
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
        return bcrypt.checkpw(password.encode('utf-8'), self.hashed_password.encode('utf-8'))


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