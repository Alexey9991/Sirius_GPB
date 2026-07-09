FROM dhi.io/python:3.12-dev AS builder

WORKDIR /app

RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=requirements.txt,target=/tmp/requirements.txt \
    pip install -r /tmp/requirements.txt flask flask-cors

FROM dhi.io/python:3.12

WORKDIR /app

COPY --from=builder /venv /venv
ENV PATH="/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

COPY app/ .

EXPOSE 5000

CMD ["/venv/bin/python", "-u", "main.py"]