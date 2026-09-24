# Build from repository root. One process and one loaded GPU model per service.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* && python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY services/transcription/requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY services/transcription/ .

FROM dependencies AS tests
RUN python -m unittest discover -s tests -v

FROM dependencies AS model
RUN python download_model.py

FROM dependencies AS runtime
COPY --from=model /models /models
ENV MODEL_PATH=/models/large-v3 HF_HUB_OFFLINE=1
USER 10001:10001
EXPOSE 8001
HEALTHCHECK --start-period=120s --interval=30s --timeout=5s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3)"
CMD ["uvicorn", "app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--no-access-log"]
