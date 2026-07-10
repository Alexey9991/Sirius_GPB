from .news import *
from .projects import *
from .users import *
from .alerts import *


import sys
import os

TABLES = {}
for name, obj in list(sys.modules[__name__].__dict__.items()):
    if isinstance(obj, type) and issubclass(obj, SqlAlchemyBase) and obj is not SqlAlchemyBase:
        TABLES[obj.__tablename__] = obj

FORBIDDEN_TABLES = os.getenv("FORBIDDEN_TABLES")
print(FORBIDDEN_TABLES)