FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/supertonic-cache \
    PORT=7788

RUN apt-get update \
    && apt-get install --no-install-recommends -y curl libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "supertonic[serve]==1.3.1" "httpx==0.28.1"

# Bake the immutable model into the image. A new instance only opens the ONNX
# sessions; it never downloads model files while a visitor is waiting.
RUN python -c "from supertonic import TTS; TTS(auto_download=True)"

WORKDIR /srv/obseri-voice
COPY auth_proxy.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 7788
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:${PORT}/health || exit 1

CMD ["./entrypoint.sh"]
