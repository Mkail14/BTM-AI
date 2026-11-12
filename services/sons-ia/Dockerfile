FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

# Torch CPU seulement (pas de carte graphique sur le serveur gratuit) : bien plus léger.
RUN pip install --no-cache-dir --user torch==2.7.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --user stable-audio-tools==0.0.20 fastapi==0.115.6 "uvicorn[standard]==0.34.0"

COPY --chown=user app.py .
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
