FROM dhi.io/python:3.12-dev AS builder

WORKDIR /src

RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    pip install -r requirements.txt

FROM dhi.io/python:3.12

WORKDIR /src

COPY --from=builder /venv /venv
ENV PATH="/venv/bin:$PATH"

COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV API_HOST=0.0.0.0
ENV API_PORT=8000
ENV FLASK_DEBUG=false

# Expose both Streamlit (8501) and Flask API (8000) ports
EXPOSE 8501 8000

# Run startup script
ENTRYPOINT ["python"]
CMD ["-u", "startup.py"]
