# Lumina Learn backend (FastAPI) for a VPS. Build from the repository root:
#   docker build -f deploy/backend/Dockerfile -t lumina-backend .
# Versions are pinned to releases older than the 7-day package cooldown.
# MODEL=mock needs no key; MODEL=bedrock also needs boto3 (BEDROCK=1 build arg) and the key at runtime.
FROM python:3.12-slim

ARG BEDROCK=0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LUMINA_DB=/data/lumina.db LUMINA_STORAGE=/data/storage MODEL=mock

RUN pip install --no-cache-dir \
      fastapi==0.115.6 uvicorn==0.32.1 python-multipart==0.0.20 pydantic==2.10.4 pypdf==5.1.0 \
 && if [ "$BEDROCK" = "1" ]; then pip install --no-cache-dir boto3==1.35.90; fi \
 && useradd --create-home --uid 10001 app && mkdir -p /data && chown app /data

WORKDIR /app
COPY lumina/ lumina/
COPY run_tests.py cli.py sample_dna.txt ./
COPY tests/ tests/
USER app
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health')"
CMD ["uvicorn", "lumina.app:app", "--host", "0.0.0.0", "--port", "8787", "--proxy-headers"]
