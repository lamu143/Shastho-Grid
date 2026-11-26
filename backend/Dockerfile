FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

COPY app ./app
COPY data ./data
COPY start.sh ./start.sh
RUN uv pip install --system --no-cache --no-deps . && chmod +x ./start.sh

EXPOSE 8000

CMD ["./start.sh"]
