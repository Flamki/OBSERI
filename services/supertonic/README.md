# Obseri cloud voice

This container runs the official Supertonic HTTP server behind a small bearer-authenticated proxy.
The model is downloaded during the image build, not during a visitor call.

## Run locally

```bash
docker build -t obseri-supertonic services/supertonic
docker run --rm -p 7788:7788 \
  -e OBSERI_SUPERTONIC_API_KEY=replace-with-a-long-random-secret \
  obseri-supertonic
```

Configure the Obseri web application with:

```dotenv
OBSERI_SUPERTONIC_URL=http://127.0.0.1:7788
OBSERI_SUPERTONIC_API_KEY=replace-with-a-long-random-secret
```

## Production shape

- Deploy this directory as a container on Cloud Run, ECS/Fargate, Fly, Railway, or another service that supports at least one warm instance.
- Allocate at least 2 vCPU and 4 GiB RAM initially; benchmark with representative call traffic before changing it.
- Keep minimum instances at 1. Scale horizontally because the official server serializes inference per process.
- Put the service in the same region as the Obseri web API. Do not call it directly from browsers.
- Set the same strong `OBSERI_SUPERTONIC_API_KEY` secret on this service and on the Obseri web application.
- Point `OBSERI_SUPERTONIC_URL` at the private service URL when the platform supports private networking.

The public health endpoint is `GET /health`. Speech endpoints require the bearer secret.
