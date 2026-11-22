# Hugging Face Space (Docker SDK): the full Next.js app with live generation, Piper voice and MP4 export.
# The Space repository holds only this Dockerfile and README.md; the code is cloned from GitHub at REF.
# Space secrets (Settings -> Variables and secrets): AWS_BEARER_TOKEN_BEDROCK (required for generation),
# optional AWS_REGION, BEDROCK_MODEL_*. Without the key the examples still work.
FROM node:24-bookworm-slim

ARG REPO=https://github.com/trungminhdo4-glitch/viedo-generation-.git
ARG REF=main

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Piper (C++ release; the app uses its --json-input interface) and the voice of the bundled examples.
RUN curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xz -C /opt \
 && ln -s /opt/piper/piper /usr/local/bin/piper \
 && mkdir -p /opt/voices \
 && curl -fsSL -o /opt/voices/en_US-ljspeech-high.onnx https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx \
 && curl -fsSL -o /opt/voices/en_US-ljspeech-high.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json

WORKDIR /app
RUN git clone --depth 1 --branch "$REF" "$REPO" . && git log -1 --format='build of %h %s' \
 && npm ci \
 && PLAYWRIGHT_BROWSERS_PATH=/opt/pw npx playwright install --with-deps chromium \
 && npm run build \
 && chown -R node:node /app

ENV NODE_ENV=production PORT=7860 HOSTNAME=0.0.0.0 \
    PIPER_VOICE=/opt/voices/en_US-ljspeech-high.onnx PLAYWRIGHT_BROWSERS_PATH=/opt/pw \
    LESSON_PUBLIC=1
USER node
EXPOSE 7860
CMD ["npx", "next", "start", "-p", "7860", "-H", "0.0.0.0"]
