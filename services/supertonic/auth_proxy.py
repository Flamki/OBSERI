import hmac
import os

import httpx
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, Response

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
upstream = "http://127.0.0.1:7789"


@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{upstream}/docs")
        if response.status_code != 200:
            raise RuntimeError("voice engine is not ready")
        return {"status": "ready"}
    except Exception:
        return JSONResponse({"status": "starting"}, status_code=503)


@app.api_route("/{path:path}", methods=["GET", "POST"])
async def proxy(request: Request, path: str, authorization: str | None = Header(default=None)):
    expected = f"Bearer {os.environ['OBSERI_SUPERTONIC_API_KEY']}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    body = await request.body()
    headers = {
        "content-type": request.headers.get("content-type", "application/json"),
        "accept": request.headers.get("accept", "*/*"),
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                request.method,
                f"{upstream}/{path}",
                params=request.query_params,
                content=body,
                headers=headers,
            )
    except httpx.HTTPError:
        return JSONResponse({"detail": "Voice engine unavailable"}, status_code=503)

    forwarded_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower().startswith("x-") or key.lower() == "content-disposition"
    }
    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type"),
        headers=forwarded_headers,
    )
