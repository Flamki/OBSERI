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

## First 30-day scorecard

- 20 tailored demos built from real prospect websites
- 8 founder calls with the widget installed during the call
- 5 paid founder packages
- 80%+ answers judged supported by a visible source in the curated test set
- Under 4 seconds median text response on the configured production model
- At least 10 useful visitor questions or knowledge gaps surfaced per customer
- Zero voice profiles without recorded rights basis and consent
