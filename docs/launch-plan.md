# Obseri founder launch plan

## The wedge

Sell a finished website presence, not “another chatbot.”

> We turn your existing website into a source-grounded, voiced guide in 48 hours—designed in your brand and connected to your lead flow.

- Initial buyer: design-led SaaS founders, agencies, high-consideration services, and product-marketing teams
- Founder package: one Soul, up to 250 public pages, custom personality, voice setup, embed installation, lead webhook, and two weeks of tuning
- Suggested first price: $750 setup plus $149/month managed operation
- Proof: live before/after website demo, citation accuracy, visitor questions discovered, qualified lead events, and owner time saved

## Demo flow

1. Paste the prospect’s URL in Soul Studio and let Obseri learn a bounded set of pages.
2. Show the page and chunk evidence rather than hiding ingestion behind a spinner.
3. Shape a personality from their actual brand language.
4. Ask a hard product question and open the cited source.
5. Speak a question and audition browser/Voicebox output.
6. Publish the widget and trigger a signed test webhook.
7. Explain which parts are already local and which production adapters are enabled for the pilot.

## Before the first external pilot

- Deploy a private staging environment with authentication and the production schema.
- Store published Soul revisions durably and require ownership to publish.
- Add allowed-domain verification and public widget rate limits.
- Put browser crawling in an isolated worker with robots/terms handling and per-domain budgets.
- Configure one model provider with token/cost limits and keep deterministic fallback.
- Configure Voicebox only for customers who need it; document and retain voice consent.
- Queue webhook deliveries with retries and expose delivery logs.
- Add privacy, acceptable-use, voice-use, crawler identification, removal, export, and deletion policies.
- Instrument citation use, failed answers, latency, crawl failure, and lead delivery.

## Before self-serve billing

- Stripe checkout, plan enforcement, metering, cancellation, and failed-payment recovery
- Account verification, workspace invitations, audit log, export, and deletion
- Scheduled recrawls with freshness controls and content-change reindexing
- Hybrid retrieval evaluation set and grounded-answer regression checks
- Abuse detection, prompt-injection regression tests, secret rotation, backups, and restore drills
- Multi-region/runtime cost review for crawler, model, voice, and storage workloads

## Deferred voice-provider backlog

The pilot continues on the currently configured Obseri voice path. Managed-provider expansion is
deliberately deferred until production keys and measured traffic are available; it is not a reason
to buy GPU capacity now.

- [ ] Add restricted, server-only `SARVAM_API_KEY` and `ELEVENLABS_API_KEY` values to the production environment.
- [ ] Implement Sarvam streaming STT/TTS behind the Obseri voice interfaces for Indian and code-switched conversations.
- [ ] Implement ElevenLabs streaming premium voices and consent-backed voice cloning behind the same interfaces.
- [ ] Pin a provider and speaker for the lifetime of each call; do not use cross-provider or cross-voice fallback.
- [ ] Add automatic greeting, VAD, barge-in, cancellation, and incremental audio playback to the managed route.
- [ ] Meter actual audio seconds, TTS characters, provider failures, and p50/p95 first-audio latency by region.
- [ ] Run quality, interruption, concurrency, consent, and spend-limit tests before enabling the routes for customers.
- [ ] Recalculate plan prices and allowances from measured unit economics rather than advertised provider rates.
- [ ] Reconsider self-hosted GPU serving only after sustained provider spend exceeds the fully loaded hosting cost or an enterprise customer requires private deployment.

This backlog does not change the current customer plans or runtime behavior.

## First 30-day scorecard

- 20 tailored demos built from real prospect websites
- 8 founder calls with the widget installed during the call
- 5 paid founder packages
- 80%+ answers judged supported by a visible source in the curated test set
- Under 4 seconds median text response on the configured production model
- At least 10 useful visitor questions or knowledge gaps surfaced per customer
- Zero voice profiles without recorded rights basis and consent
