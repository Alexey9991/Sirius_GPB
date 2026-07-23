from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    email: str = Field("", max_length=100)
    role: str = Field("", max_length=100)
    division: str = Field("", max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    password_again: str = Field(..., min_length=6, max_length=100)
    policy_check: bool = False