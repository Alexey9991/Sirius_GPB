from database.models.__meta__ import SQLBase
from database.models.news import *
from database.models.projects import *
from database.models.users import *
from database.models.alerts import *


import sys

TABLES: dict[str, SQLBase] = {}
for name, obj in list(sys.modules[__name__].__dict__.items()):
    if isinstance(obj, type) and issubclass(obj, SQLBase) and obj is not SQLBase:
        TABLES[obj.__tablename__] = obj