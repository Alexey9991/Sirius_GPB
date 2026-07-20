from .models.__meta__ import SQLBase
from .models.news import *
from .models.projects import *
from .models.users import *
from .models.alerts import *


import sys

TABLES: dict[str, SQLBase] = {}
for name, obj in list(sys.modules[__name__].__dict__.items()):
    if isinstance(obj, type) and issubclass(obj, SQLBase) and obj is not SQLBase:
        TABLES[obj.__tablename__] = obj