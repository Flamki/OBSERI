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
| Visitor experience simulator     | Done and live             | Renders the website behind the real assistant with desktop, tablet, mobile, theme, launcher, accent, and placement controls                                              |
| Website ingestion                | Done and live             | Same-origin discovery, robots and sitemap support, bounded depth/page limits, canonicalization, deduplication, revisions, refresh validators, and visible crawl progress |
| Retrieval and chat               | Done and live             | Source-grounded answers, visible citations, deterministic fallback, and an OpenAI-compatible hosted provider                                                             |
| Personality                      | Done and live             | Name, role, purpose, tone, traits, greeting, instructions, unknown response, and guardrails                                                                              |
| Consistent neural voice          | Done and live             | Ten Supertonic presets route through the authenticated Mumbai voice service; a selected voice never changes silently during a call                                       |
| Browser voice                    | Done and live             | Instant device speech synthesis remains an explicit engine choice, while device speech recognition handles voice input                                                   |
| Voicebox presets                 | Done locally              | 50 Kokoro voices verified across English, Spanish, French, Hindi, Italian, Japanese, Portuguese, and Chinese                                                             |
| Voice cloning                    | Done locally              | Consent-gated Voicebox profile and sample workflow with `self`, `permission`, or `licensed` rights basis                                                                 |
| Voice preview cache              | Done locally              | Repeated generated previews are served from cache instead of regenerating audio                                                                                          |
| Public Voicebox service          | Waiting on infrastructure | Requires a public GPU worker; unavailable voices fail clearly instead of substituting a different speaker                                                               |
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
- Explicit browser text-to-speech option and browser speech recognition
- Ten consistent Supertonic 3 neural presets with lazy model loading, WebGPU/WASM routing,
  immutable model revision pinning, per-style loading, and strict voice identity
- Voicebox preset discovery, profile creation, cached speech generation, speed control, and cloning
  consent

### Delivery

- Public widget route and embeddable asynchronous loader
- Widget appearance, launcher position, accent, and welcome-label controls
- Signed webhook events for conversation updates and detected leads
- JSON workspace export for local backup
- Vercel deployment with `obseri.com`, `www.obseri.com`, and the project alias

## Verified release checks

Last verified on **17 July 2026**:

- Full production build passes
- Repository lint passes with zero errors
- Production dependency audit reports zero vulnerabilities
- Landing, Studio, chat health, ingestion health, and voice-profile endpoints return HTTP `200`
- Live grounded chat returns a source citation
- Live crawl completes successfully and produces searchable chunks
- A private-network scan target is rejected with HTTP `400`
- Local Voicebox container reports healthy with zero restarts and no OOM failure
- All 50 enabled Kokoro preset voices return valid WAV audio locally
- Supertonic loads its pinned ONNX assets in Chrome, generates and plays a 44.1 kHz preview, and
  exposes the same ten preset identities across devices
- The production Supertonic route returns authenticated WAV audio through Vercel and the AWS
  CloudFront edge; unauthenticated origin requests return HTTP `401`
- No API keys or local environment files are tracked by Git

## Search and discovery

The public landing page targets high-intent language that matches how buyers describe the product:

- AI chatbot for a website
- AI chatbot trained on website content
- AI voice agent for a website
- voice and text website assistant
- source-grounded customer support chatbot

Technical search assets are shipped from stable public URLs:

- `/favicon.ico` and `/obseri-favicon.svg` use the same Obseri woven mark
- `/robots.txt` allows the public site and protects API and widget endpoints
- `/sitemap.xml` lists canonical indexable pages
- `/llms.txt` provides a concise product description for AI discovery systems
- `/site.webmanifest` provides installable product identity and icons
- `/obseri-social-card.png` supplies a 1200x630 Open Graph and social preview
- `/obseri-search-logo.png` supplies the crawlable 512x512 organization logo

The home page includes a self-referencing canonical URL, complete Open Graph and Twitter metadata,
and JSON-LD for `Organization`, `WebSite`, and `SoftwareApplication`. Soul Studio and embedded widget
routes are excluded from search results because they contain customer-specific application state.

After a brand or metadata release, use Google Search Console to submit `/sitemap.xml`, inspect
`https://obseri.com/`, and request re-indexing. Search engines control recrawl timing, so a previous
favicon or snippet may remain visible until their cached result is refreshed.

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
| `OBSERI_VOICE_MODEL`        | Optional low-latency model for streamed live voice turns         |
| `OBSERI_SUPERTONIC_URL`     | Private URL for the pre-warmed Supertonic container              |
| `OBSERI_SUPERTONIC_API_KEY` | Shared server-only bearer secret for the Supertonic container    |
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

Until that worker exists, production exposes on-device Supertonic and browser voices instead of
advertising a Voicebox catalogue that cannot generate audio.

## Cloud neural voice

Supertonic 3 is Obseri's consistent open-weight voice layer. Ten stable presets appear in Studio, so
a selected voice stays the same across laptop and mobile. Normal calls now use an authenticated,
pre-warmed server instead of downloading roughly 400 MB of model data into each visitor's browser.
The Obseri web API is the only client of that server; its bearer credential never reaches the widget.

The deployment image in [`services/supertonic`](services/supertonic) bakes the model into the image,
keeps the official engine loopback-only, and exposes it through a bearer-authenticated proxy. The
live deployment uses a single pre-warmed `t3.small` in AWS Mumbai (`ap-south-1`) with standard CPU
credits, encrypted `gp3` storage, IMDSv2, no SSH key or inbound SSH rule, and AWS Systems Manager for
operations. Its application port only accepts AWS CloudFront origin-facing traffic. CloudFront
provides the public HTTPS edge, the container image lives in private ECR, and the bearer credential
lives in Secrets Manager and Vercel's encrypted production environment.

The instance has a restart policy and a 2 GB swap safety net, while the container is capped below
the host's 2 GB memory. A monthly AWS Budget guardrail alerts `flamki@obseri.com` at 80% actual and
100% forecasted use of USD 25. The instance type is eligible for this account's AWS Free Plan, but
credits and free-plan eligibility are temporary; billing must still be reviewed before the six-month
credit window ends. The first deployment is intentionally CPU-capable. Add GPU capacity or managed
streaming TTS only when measured concurrency, time-to-first-audio, or voice quality requires it.

If the selected cloud voice is unavailable, the call stops with a clear retry message instead of
silently changing speakers. The original WebGPU/WASM runtime remains in the codebase for an explicit
future privacy mode, but it is not an automatic live-call substitute. Licensing and attribution are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Voice platform decision

**Decision: launch provider-first, retain a self-hosted path, and do not train a foundation voice
model.**

Obseri's product advantage is website understanding, retrieval quality, citations, personality,
page awareness, integrations, and the unified voice/text experience. Speech models are a
replaceable infrastructure layer. Training a competitive foundation model would consume capital
and research time without improving the core customer outcome today.

The production routing target is:

- **Sarvam** for Indian languages, Indian English, and code-switched conversations
- **ElevenLabs** for premium global voices, low-latency English, and managed voice cloning
- **Supertonic** for consistent, pre-warmed cloud speech and private deployment without mandatory GPU capacity
- **Browser speech** as an explicit zero-download voice choice, never a hidden replacement
- **Self-hosted open models through Voicebox** for private deployments, experiments, batch work,
  and a future cost-control path

All speech providers must sit behind Obseri-owned STT and TTS interfaces so a Soul is never locked
to one vendor. Live calls should use persistent WebSockets, streaming transcription, interruption
handling, streamed LLM tokens, and streamed audio playback. Provider selection should be measured
per language using time-to-first-audio, interruption recovery, quality, error rate, and cost.

### Real-time engine reference

Dograh's public voice engine validates the architecture Obseri should adopt without importing its
workflow-builder product. The useful pattern is a long-lived WebRTC media session feeding a
Pipecat-style frame pipeline, with streaming STT, streamed LLM tokens, incremental TTS audio,
server-side turn tracking, and immediate cancellation when the visitor interrupts. Its cascade uses
roughly 200 ms Silero VAD endpointing and can add a learned Smart Turn analyzer; its realtime mode
removes the separate STT and TTS hops by using a speech-to-speech provider. Predictable openings can
be pre-generated or human-recorded and cached, while dynamic turns continue through TTS.

Obseri will follow that boundary:

- WebRTC carries microphone and speaker audio; HTTP is reserved for setup, configuration, and text chat.
- The call worker owns VAD, turn detection, barge-in, cancellation, and latency telemetry.
- Website retrieval runs beside the call worker and returns a compact evidence context before the model turn.
- Native speech-to-speech is the lowest-latency premium route; streamed STT + LLM + TTS is the portable route.
- Supertonic remains a preview and private-deployment voice until it exposes true incremental audio.
- Cached greetings and common confirmations hide predictable inference without pretending cached audio is a live model.

Do not buy permanent GPU capacity until production traffic demonstrates that provider spend is
consistently higher than the complete self-hosted cost. That calculation must include idle time,
replicas, regional capacity, autoscaling, monitoring, engineering, and failure recovery—not only
the hourly GPU price. A Voicebox desktop worker is not itself a multi-tenant inference platform;
self-hosting at scale requires a separate autoscaled serving layer.

Revisit this decision when one or more of these conditions is true:

- sustained usage can keep GPU workers efficiently utilized;
- provider cost materially exceeds GPU infrastructure and operations;
- enterprise customers require VPC, on-premises, or private voice processing;
- self-hosted quality and latency pass controlled comparisons against the managed providers.

## Paid-production boundary

Two external infrastructure items block paid self-serve launch:

1. **Durable accounts and data.** Apply the included migrations to a dedicated Supabase project,
   connect authentication and RLS-backed persistence, migrate Studio state out of `localStorage`,
   and load published Soul revisions from durable storage. The current Supabase organization has
   reached its two-active-free-project limit, so it needs another project slot or plan upgrade.
2. **Full-duplex real-time voice.** Production Supertonic TTS is live, but natural phone-like calls
   still need streaming STT/TTS adapters behind Obseri-owned interfaces, beginning with Sarvam for
   Indian languages and ElevenLabs for premium global voices. Add interruption handling, quotas,
   cancellation, private sample storage, and provider health monitoring without cross-voice failover. Keep Voicebox as the
   self-hosted/private path until measured demand justifies GPU infrastructure.

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
3. Add Sarvam and ElevenLabs streaming adapters with explicit provider routing and no cross-voice fallback.
4. Cache public voice previews in object storage/CDN and benchmark full call latency by region.
5. Add API ownership, rate limits, domain verification, durable queues, and observability.
6. Run a private pilot before enabling Stripe and self-serve onboarding.

See [architecture](docs/architecture.md) for system boundaries and
[launch plan](docs/launch-plan.md) for pilot and paid-launch gates.
