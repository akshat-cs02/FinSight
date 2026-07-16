# =============== Builder ===============
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# System deps needed for tensorflow / numpy / xgboost wheels + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps into a venv we can copy later.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install gunicorn==21.2.0 websockets

# =============== Runtime ===============
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    TF_CPP_MIN_LOG_LEVEL=3

WORKDIR /app

# Runtime libs only (libgomp1 = OpenMP for xgboost/lightgbm).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Bring venv from builder.
COPY --from=builder /opt/venv /opt/venv

# Application code.
COPY ./app ./app
COPY run.py .

# Create writable data dirs.
RUN mkdir -p /app/models/trained /app/logs /app/data && chmod -R 755 /app/models /app/logs /app/data

# Default env. DATABASE_URL/secret keys etc get injected by the platform
# (Render, Railway, Fly.io) at container-start, NOT baked into the image.
ENV MODEL_PATH=/app/models/trained \
    DATABASE_URL=sqlite:////app/data/finsight.db \
    LOG_FILE=/app/logs/app.log \
    ENVIRONMENT=production \
    PORT=8000

EXPOSE 8000

# Honour $PORT from the cloud; default to 8000 locally.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/health || exit 1

# Single worker is the safe default — multiple uvicorn workers on a shared
# async event loop for our WebSocket + signal loop can cause duplication.
# For Render free tier (1 dyno × 750 MB) this is the sweet spot.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
