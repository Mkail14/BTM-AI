"""
Fabrique de sons de Tamilya : Stable Audio Open Small sur un serveur gratuit Hugging Face (CPU).

POST /son {"texte": "rain on a tin roof", "secondes": 8} -> audio/webm (Opus, mono, 48 kHz)
GET  /    -> {"pret": true/false}

Le Space est privé : seul un appel avec la clé Hugging Face du compte passe.
On fabrique chaque son une seule fois ; le site le garde ensuite.
"""

import io
import os
import subprocess
import threading
import time

import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from stable_audio_tools import get_pretrained_model
from stable_audio_tools.inference.generation import generate_diffusion_cond

torch.set_num_threads(os.cpu_count() or 2)

app = FastAPI()
state = {"model": None, "config": None, "error": None}
# Un seul son à la fois par serveur : deux en même temps sur 2 cœurs vont deux fois moins vite chacun.
busy = threading.Lock()


def load():
    try:
        model, config = get_pretrained_model("stabilityai/stable-audio-open-small")
        state["model"], state["config"] = model.to("cpu").eval(), config
    except Exception as exc:  # noqa: BLE001
        state["error"] = repr(exc)


threading.Thread(target=load, daemon=True).start()


class Demande(BaseModel):
    texte: str = Field(min_length=3, max_length=300)
    secondes: float = Field(default=8, ge=1, le=11)


@app.get("/")
def health():
    return {"pret": state["model"] is not None, "erreur": state["error"]}


@app.post("/son")
def son(d: Demande):
    if state["model"] is None:
        raise HTTPException(503, state["error"] or "modèle en chargement")
    with busy:
        start = time.time()
        config = state["config"]
        with torch.inference_mode():
            audio = generate_diffusion_cond(
                state["model"],
                steps=8,
                conditioning=[{"prompt": d.texte, "seconds_total": d.secondes}],
                sample_size=config["sample_size"],
                sampler_type="pingpong",
                device="cpu",
            )
        rate = config["sample_rate"]
        audio = audio[0, :, : int(d.secondes * rate)].float()
        audio = audio / audio.abs().max().clamp(min=1e-6) * 0.9
        wav = io.BytesIO()
        torchaudio.save(wav, audio.mean(0, keepdim=True), rate, format="wav")
        # Opus mono 48 kb/s : léger pour le débit de Mayotte, comme les sons de public/sons.
        webm = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-c:a", "libopus", "-b:a", "48k", "-f", "webm", "pipe:1"],
            input=wav.getvalue(),
            capture_output=True,
            check=True,
        ).stdout
        return Response(webm, media_type="audio/webm", headers={"X-Secondes-Calcul": f"{time.time() - start:.1f}"})
