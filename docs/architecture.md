# Obseri architecture

## The Soul model

A Soul is one deployable website presence composed of six layers:

1. **Knowledge** — public sources, normalized pages, searchable chunks, freshness, and citations.
2. **Personality** — identity, purpose, tone, traits, greeting, behavioral instructions, and guardrails.
3. **Voice** — browser or Voicebox profile, language, speed, pitch, and consent metadata.
4. **Appearance** — accent, launcher, glass intensity, welcome label, and position.
5. **Channels** — widget, API, and signed outbound webhooks.
6. **Memory** — conversations, messages, lead intent, citations, and knowledge gaps.

## Current request path

```text
URL -> /api/ingest -> safe bounded fetch -> normalized pages -> overlapping chunks
visitor question -> /api/chat -> lexical retrieval -> grounded answer + citations
Studio publish -> /api/souls/publish -> sanitized runtime copy
host website -> obseri-widget.js -> isolated /widget/:soulId iframe
widget answer -> /api/souls/:id/events -> signed customer webhook
voice -> browser speech or Voicebox REST adapter
```

The deterministic answer path works without credentials. When an OpenAI-compatible provider is configured, only retrieved evidence and bounded conversation history are sent to it; page content is explicitly treated as untrusted evidence.

## Production boundaries

- **Identity and tenancy:** Supabase Auth plus Postgres RLS from `supabase/migrations/202607130001_obseri_core.sql`.
- **Ingestion:** queue one job per source and crawl in an isolated worker. Crawl4AI is a strong browser-crawler boundary for JavaScript-heavy pages. Honor robots directives, publisher terms, per-domain budgets, and removal requests.
- **Knowledge search:** begin with Postgres full-text retrieval and citations. The schema includes optional pgvector embeddings for hybrid search; choose the vector dimension with the production embedding model before applying the migration.
- **Published runtime:** store immutable published Soul revisions in durable storage/cache. The public loader returns sanitized config and knowledge, never signing secrets or owner data.
- **Conversation service:** rate-limit by Soul, origin, IP risk, and plan. Persist messages asynchronously and redact configured sensitive fields.
- **Voice:** keep Voicebox as a separate REST service. Store voice artifacts privately, encrypt provider tokens, record consent, support revocation, and prohibit non-consensual impersonation.
- **Webhooks:** encrypt signing secrets, enqueue deliveries, retry with exponential backoff, retain response metadata, and dead-letter repeated failures.
- **Observability:** structured logs, ingestion metrics, answer latency/groundedness sampling, webhook delivery health, abuse alerts, and cost budgets.

## Security decisions already present

- Only HTTP(S) public targets; URL credentials and obvious local/private destinations are blocked.
- Every crawl redirect is revalidated, response bytes are bounded, and upstream calls time out.
- Captured HTML is normalized to text and never rendered into product pages.
- Chat responses cite retrieved chunks and have an evidence-only fallback.
- Voice cloning requires affirmative consent and a recorded rights basis.
- Widget publication removes conversation history and webhook secrets from public payloads.
- Webhooks sign `timestamp.body` with HMAC-SHA256 in `x-obseri-signature`.

Before internet exposure, add DNS resolution and egress filtering to close DNS-rebinding gaps, authenticate owner APIs, verify allowed widget domains, add CSRF/origin policy, and move runtime state from memory to the database/cache.

## Reference repositories

Sibling repositories under `Desktop/obseri` are architecture references with independent licenses and release cycles. Voicebox is integrated over HTTP under its MIT license. Keep upstream integrations behind explicit service boundaries rather than merging histories or vendoring large code paths into this application repository.
