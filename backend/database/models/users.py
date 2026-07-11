from database.models.__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy
import datetime
import bcrypt
import uuid


class AuthException(Exception):
    ...


class User(SQLBase):
    __tablename__ = "users"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    name = sqlalchemy.Column(sqlalchemy.String, index=True, unique=True)
    email = sqlalchemy.Column(sqlalchemy.String, index=True, unique=True)
    role = sqlalchemy.Column(sqlalchemy.String)
    division = sqlalchemy.Column(sqlalchemy.String)
    hashed_password = sqlalchemy.Column(sqlalchemy.String)
    created_date = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now)

    auths = orm.relationship("Auth", back_populates="user", cascade="all, delete-orphan")
    subscription = orm.relationship("Subscription", back_populates="user",
                                    cascade="all, delete-orphan", lazy="selectin")

    def set_password(self, password: str):
        self.hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.hashed_password:
            return False
        return bcrypt.checkpw(password.encode('utf-8'), self.hashed_password.encode('utf-8'))


class Auth(SQLBase):
    __tablename__ = "authentications"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    session_token = sqlalchemy.Column(sqlalchemy.String, unique=True, default=lambda: str(uuid.uuid4()))
    user_agent = sqlalchemy.Column(sqlalchemy.String)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now)
    last_activity = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now)
    logout_at = sqlalchemy.Column(sqlalchemy.DateTime)

    user_id = sqlalchemy.Column(sqlalchemy.Integer, sqlalchemy.ForeignKey("users.id"))
    user = orm.relationship("User", back_populates="auths", lazy="selectin")