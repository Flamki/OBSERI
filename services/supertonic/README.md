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

The first live deployment is a single AWS `t3.small` in Mumbai with 2 vCPU and 2 GiB RAM. A
representative request used roughly 530 MiB after warm-up, and the container is capped below host
memory with swap available only as an OOM safety net. Re-benchmark before increasing concurrency.

- Keep at least one warm process. Scale horizontally because the official server serializes
  inference per process.
- Do not expose the EC2 origin broadly. The live security group accepts port `7788` only from the
  AWS-managed CloudFront origin-facing prefix list.
- Keep the image in private ECR, require IMDSv2, encrypt the volume, and operate the host through
  Systems Manager instead of SSH.
- Store `OBSERI_SUPERTONIC_API_KEY` in Secrets Manager and the web host's encrypted environment. Do
  not put it in user data, source control, browser code, or public build variables.
- Put a no-cache HTTPS edge in front of the origin and forward all methods and request bodies.
- Use standard T-instance CPU credits or an equivalent hard cost cap. Benchmark time-to-first-audio,
  throughput, and throttling before enabling additional replicas.

The public health endpoint is `GET /health`. Speech endpoints require the bearer secret.
