"""Groq TTS Proxy - OpenAI-compatible TTS server using Groq Orpheus API"""
from fastapi import FastAPI, Request, Response, HTTPException
import httpx
import os

app = FastAPI(title="Groq TTS Proxy")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = "https://api.groq.com/openai/v1"

VOICES = ["troy", "austin", "daniel", "autumn", "diana", "hannah"]

@app.get("/")
async def root():
    return {"status": "ok", "service": "Groq TTS Proxy"}

@app.get("/v1/audio/voices")
@app.get("/audio/voices")
@app.get("/v1/voices")
@app.get("/voices")
async def get_voices():
    return {"voices": VOICES}

@app.post("/v1/audio/speech")
@app.post("/audio/speech")
async def speech(request: Request):
    body = await request.json()

    model = body.get("model", "")
    if not model.startswith("canopylabs/"):
        body["model"] = "canopylabs/orpheus-v1-english"

    if body.get("voice") not in VOICES:
        body["voice"] = "troy"

    # Groq requires response_format
    if "response_format" not in body:
        body["response_format"] = "wav"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{GROQ_BASE}/audio/speech",
            json=body,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return Response(content=resp.content, media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8880)
