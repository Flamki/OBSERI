# Obseri

Obseri gives a website knowledge, personality, voice, memory, and presence.

Enter a public URL and Obseri builds a source-grounded knowledge base. Shape the resulting
Soul in Studio, test what it knows, choose how it sounds, and publish it as an isolated website
widget. Conversation and lead events can be delivered to customer systems through signed
webhooks.

## Live release

- Production: [obseri.com](https://obseri.com)
- Soul Studio: [obseri.com/app](https://obseri.com/app)
- Application repository: [Flamki/OBSERI](https://github.com/Flamki/OBSERI)
- Voicebox integration branch:
  [Flamki/voicebox/tree/obseri-production](https://github.com/Flamki/voicebox/tree/obseri-production)

The current public deployment is a working **production preview**. It is suitable for product
demos and founder-led testing. The remaining infrastructure in
[Paid-production boundary](#paid-production-boundary) must be connected before accepting paid,
self-serve customers.

## Release status

| Area                             | Status                    | Current behavior                                                                                                                                                         |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landing experience               | Done and live             | Responsive premium landing page with optimized WebGL effects and quick-start URL entry                                                                                   |
| Soul Studio                      | Done and live             | Knowledge, personality, voice, live website simulation, integration, conversations, and settings in one workspace                                                        |
| Visitor experience simulator    | Done locally              | Renders the website behind the real assistant with desktop, tablet, mobile, theme, launcher, accent, and placement controls                                               |
| Website ingestion                | Done and live             | Same-origin discovery, robots and sitemap support, bounded depth/page limits, canonicalization, deduplication, revisions, refresh validators, and visible crawl progress |
| Retrieval and chat               | Done and live             | Source-grounded answers, visible citations, deterministic fallback, and an OpenAI-compatible hosted provider                                                             |
| Personality                      | Done and live             | Name, role, purpose, tone, traits, greeting, instructions, unknown response, and guardrails                                                                              |
| Browser voice                    | Done and live             | Instant device speech synthesis and speech recognition without hosted voice infrastructure                                                                               |
| Voicebox presets                 | Done locally              | 50 Kokoro voices verified across English, Spanish, French, Hindi, Italian, Japanese, Portuguese, and Chinese                                                             |
| Voice cloning                    | Done locally              | Consent-gated Voicebox profile and sample workflow with `self`, `permission`, or `licensed` rights basis                                                                 |
| Voice preview cache              | Done locally              | Repeated generated previews are served from cache instead of regenerating audio                                                                                          |
| Public Voicebox service          | Waiting on infrastructure | Requires a public GPU worker; production currently falls back safely to browser voices                                                                                   |
| Widget                           | Done and live             | Responsive isolated widget loader from `public/obseri-widget.js`                                                                                                         |
| Webhooks                         | Done                      | HMAC-SHA256 signatures, timestamps, event IDs, test delivery, and idempotency keys                                                                                       |
| Production schema                | Done, not provisioned     | Supabase/Postgres migrations cover accounts, workspaces, Souls, knowledge, conversations, voice consent, jobs, and webhook delivery                                      |
| Durable accounts and Studio data | Waiting on infrastructure | Studio currently persists in the browser; Supabase needs one additional active project slot                                                                              |
| Billing                          | Planned                   | Stripe adapters and self-serve plan enforcement are not connected                                                                                                        |
| Observability and abuse controls | Planned                   | Production rate limiting, owner API authentication, allowed-domain verification, queues, and monitoring remain required                                                  |

## What is implemented

### Knowledge and crawling

- Multi-page website discovery with configurable page and depth limits
- Same-origin enforcement, private-network blocking, redirect validation, and request timeouts
- `robots.txt`, sitemap discovery, include/exclude rules, canonical URL normalization, and URL ranking
- Conditional refresh through ETag and Last-Modified validators
- Content hashing, duplicate removal, revision history, source lifecycle, and crawl-run events
- Clean content extraction, semantic chunks, keyword extraction, structured-data detection, and
  source-level errors
- Searchable knowledge library, page inspection, manual content, document lifecycle controls, and
  retrieval testing

### Soul behavior

- Retrieval-grounded chat with citations back to original pages
- Configurable personality, greeting, behavioral instructions, guardrails, and escalation behavior
- Deterministic source-grounded answers when no hosted model is configured
- Fireworks-compatible production conversation and analysis configuration
- Browser text-to-speech and speech-to-text fallback
- Voicebox preset discovery, profile creation, cached speech generation, speed control, and cloning
  consent

### Delivery

- Public widget route and embeddable asynchronous loader
- Widget appearance, launcher position, accent, and welcome-label controls
- Signed webhook events for conversation updates and detected leads
- JSON workspace export for local backup
- Vercel deployment with `obseri.com`, `www.obseri.com`, and the project alias

## Verified release checks

Last verified on **15 July 2026**:

- Full production build passes
- Repository lint passes with zero errors
- Production dependency audit reports zero vulnerabilities
- Landing, Studio, chat health, ingestion health, and voice-profile endpoints return HTTP `200`
- Live grounded chat returns a source citation
- Live crawl completes successfully and produces searchable chunks
- A private-network scan target is rejected with HTTP `400`
- Local Voicebox container reports healthy with zero restarts and no OOM failure
- All 50 enabled Kokoro preset voices return valid WAV audio locally
- No API keys or local environment files are tracked by Git

Run the same code gates locally:

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

## Run locally

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 8080
```

Open:

- Landing: `http://127.0.0.1:8080/`
- Soul Studio: `http://127.0.0.1:8080/app`
- Ingestion health: `http://127.0.0.1:8080/api/ingest`
- Chat health: `http://127.0.0.1:8080/api/chat`

The local founder workspace needs no environment variables. Copy `.env.example` to `.env.local`
to connect hosted services. Never commit `.env.local` or provider credentials.

## Environment

| Variable                    | Purpose                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Hosted Supabase project URL for the durable data phase           |
| `VITE_SUPABASE_ANON_KEY`    | Browser-safe Supabase anonymous key                              |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase administration; never expose to the browser |
| `OBSERI_CRAWLER_API_URL`    | Optional isolated browser crawler for JavaScript-heavy websites  |
| `OBSERI_CRAWLER_API_KEY`    | Server-only crawler credential                                   |
| `OBSERI_AI_API_URL`         | OpenAI-compatible analysis endpoint                              |
| `OBSERI_AI_API_KEY`         | Server-only analysis credential                                  |
| `OBSERI_AI_MODEL`           | Analysis model identifier                                        |
| `OBSERI_CHAT_API_URL`       | Optional dedicated grounded-chat endpoint                        |
| `OBSERI_CHAT_API_KEY`       | Server-only grounded-chat credential                             |
| `OBSERI_CHAT_MODEL`         | Grounded-chat model identifier                                   |
| `OBSERI_VOICEBOX_URL`       | Public or local Voicebox REST base URL                           |
| `OBSERI_ENABLE_QWEN_VOICES` | Enables Qwen presets only when the worker has adequate GPU/RAM   |

Production provider values are stored as sensitive Vercel environment variables, not in this
repository.

## Voicebox

Voicebox remains an independent MIT-licensed service and repository. Obseri communicates with it
over REST rather than merging or vendoring its history.

The validated local checkout is expected at `Desktop\obseri\voicebox`:

```powershell
cd ..\..\..\voicebox
docker compose up -d --build
```

The local container maps Voicebox's internal port `17493` to `127.0.0.1:17600`. Configure Obseri
with:

```dotenv
OBSERI_VOICEBOX_URL=http://127.0.0.1:17600
OBSERI_ENABLE_QWEN_VOICES=false
```

CPU generation is functional but not appropriate for real-time, high-concurrency calls. New local
clips can take roughly 10–20 seconds, while cached clips are effectively immediate. A public,
pre-warmed GPU worker is therefore required for managed production voices, interruption-aware live
calls, Qwen voices, and scalable cloning.

Until that worker exists, production intentionally exposes browser voices instead of advertising a
Voicebox catalogue that cannot generate audio.

## Paid-production boundary

Two external infrastructure items block paid self-serve launch:

1. **Durable accounts and data.** Apply the included migrations to a dedicated Supabase project,
   connect authentication and RLS-backed persistence, migrate Studio state out of `localStorage`,
   and load published Soul revisions from durable storage. The current Supabase organization has
   reached its two-active-free-project limit, so it needs another project slot or plan upgrade.
2. **Public real-time voice.** Deploy the validated Voicebox branch on a public GPU worker, store
   generated previews in object storage/CDN, keep workers warm for live calls, and enforce consent,
   quotas, cancellation, and private sample storage.

Before charging customers, also complete:

- Owner authentication on ingestion, publishing, voice-cloning, and configuration APIs
- Per-Soul, origin, IP-risk, and plan rate limits
- Allowed-domain ownership verification for public widgets
- Durable queues for crawling, webhook retries, voice generation, and conversation persistence
- Encryption and lifecycle deletion for webhook secrets and voice samples
- Stripe plans, usage metering, limits, and billing webhooks
- Error tracking, structured logs, latency metrics, alerts, backups, and restore drills
- An isolated headless-browser crawler for JavaScript-heavy and protected websites
- Load, interruption, privacy, consent-revocation, and disaster-recovery testing

## Recommended next sequence

1. Add a dedicated Supabase project and apply `supabase/migrations`.
2. Replace browser-local workspace persistence with authenticated Supabase persistence.
3. Deploy Voicebox to a GPU host and configure `OBSERI_VOICEBOX_URL` in Vercel.
4. Pre-generate the public voice catalogue and serve previews from object storage/CDN.
5. Add API ownership, rate limits, domain verification, durable queues, and observability.
6. Run a private pilot before enabling Stripe and self-serve onboarding.

See [architecture](docs/architecture.md) for system boundaries and
[launch plan](docs/launch-plan.md) for pilot and paid-launch gates.
