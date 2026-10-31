# Visitor intelligence and contact capture

This release connects a website visit to a conversation and an explicit contact request. It does not claim measured conversion lift or infer a purchase from a chat message.

## Experience

- The landing page introduces Observe → Assist → Convert through an explicitly labelled interactive example. Live voice and existing chat demonstrations remain available.
- The embed opens text chat by default; voice stays available. On pricing, plans, product, and service paths, a dismissible help invitation appears after 20 seconds, at most once per tab.
- The visitor can submit a name, email, request, and explicit permission to be contacted. Success is displayed only after durable storage accepts the request. Retrying a request does not create another lead or webhook.
- Studio → Conversions shows tracked sessions, page views, conversations, contact requests, source attribution, journeys, and owner-marked outcomes. The inbox includes untracked requests. Studio test conversations are excluded from lead counts.
- Signed `lead.captured` webhooks start at Launch. The existing durable retry worker delivers failed attempts. `lead.detected` remains an intent event for compatibility and should not be treated as a submitted contact.

## Measurement

The funnel counts distinct tracked sessions → sessions with a conversation → those conversing sessions with a contact request, within the selected 7- or 30-day window. All submitted requests are counted separately, including requests without analytics consent. “Qualified” includes “Won”; these outcomes are set by the website owner and are not payment or order verification.

Source is the first observed `utm_source`, external referrer hostname, or Direct in the reporting period. A session uses a random ID in tab-scoped storage with a 30-minute timeout; it is not a cross-device unique visitor. Storage-disabled browsers use page-scoped memory. SPA path changes are detected within three seconds. Events are batched, bounded, retried up to three times, and deduplicated by event ID. Delivery is best effort; blockers, missing consent, and navigation/network failures can reduce measured traffic.

Totals aggregate the full reporting window. Sources and pages show the top eight, journeys the latest 30 sessions and up to 40 events each, and the inbox/export the latest 100 requests. This is a pilot-scale reporting surface, not an unlimited historical warehouse.

## Collection controls

Install settings generate these embed attributes:

| Attribute                 | Behaviour                                                                   |
| ------------------------- | --------------------------------------------------------------------------- |
| `data-analytics="off"`    | Disable behavioural event collection. Chat and contact requests still work. |
| `data-proactive="off"`    | Disable automatic help invitations.                                         |
| `data-consent="required"` | Wait for the site's consent manager before tracking.                        |

The published server setting can also disable analytics. After changing settings, publish and replace the site's embed. If consent is required, dispatch this event after the visitor's choice on each page:

```js
window.dispatchEvent(
  new CustomEvent("obseri:consent", {
    detail: { granted: true },
  }),
);
```

Dispatch `granted: false` to stop collection, discard queued events, and remove the session ID. Do Not Track and Global Privacy Control disable analytics regardless of that event. Contact permission is separately requested in the contact form.

Analytics does not capture keystrokes, form values, raw IP addresses, or arbitrary event properties. Query strings/fragments are removed; email-like, long numeric, and long hexadecimal path segments are redacted. Referrers retain only hostnames and campaign values are constrained. Account, admin, checkout, login, and auth routes are excluded from browser events. Sites with sensitive custom paths should disable analytics until their collection requirements are reviewed.

Raw events and structured contacts are pruned after 30 days by the authenticated `/api/internal/webhooks/drain` endpoint. Vercel runs it daily at approximately 03:00 UTC, so removal can take up to another day. Initial webhook delivery is immediate; the daily job provides a bounded retry fallback (25 deliveries per run). More frequent retries require an external scheduler or a different hosting plan. This is separate from conversation retention and webhook delivery history. Existing conversation messages and outbound webhook payloads can contain contact details under their existing lifecycle.

## Deploy in order

1. Apply additive migration `004_conversion_analytics.sql` to production. It creates the analytics and lead tables without rewriting existing customer data.
2. Keep the existing six INR provider plan variables. The shared catalog preserves their exact amounts; checkout validates currency, price and billing period before creating/changing subscriptions. USD billing is deferred pending merchant approval.
3. Build a separate candidate with `--prod --skip-domain --build-env OBSERI_VERIFY_DEPLOYMENT=1`. The build verifies database tables, required configuration and all six provider mappings using read-only calls. Do not enable plan provisioning for this release.
4. Smoke-test the candidate, then promote it. Ensure the daily authenticated job is registered and runs. If candidate creation moves the default team alias, restore that alias until promotion.
5. Verify landing, pricing, auth gates and widget/contact endpoints in production. Browser fixture tests cover the owner dashboard; they are not a completed live payment or real customer conversion.

Rollback: promote the preceding known-good Vercel deployment. Leave the additive tables in place so any newly captured data is preserved. No existing subscriptions or provider plans are modified by deployment.

## Verification

```sh
npm test
npm run typecheck
npm run test:browser
npm run build
```

Store tests execute the real queries and migrations against embedded PostgreSQL using PGlite. Browser tests use controlled API fixtures for auth, account data, contact failures/retries, and dashboard outcomes; they do not prove live provider credentials or deployment readiness. Browser verification uses local Google Chrome via Playwright. Screenshots are written to ignored `test-results/`.

## Production readiness checks

Vercel CLI access is linked to `flamkis-projects/soft-dither-glow`. A candidate deployment uses `--prod --skip-domain`; it must not be promoted until the migration and verified INR provider plans are ready. Set build-only `OBSERI_VERIFY_DEPLOYMENT=1` to run `scripts/check-production-readiness.mjs` inside Vercel. It performs read-only database/provider checks and logs status only, never secret values. Sensitive variables returned as redaction markers by `vercel env pull` are not usable local credentials.

TanStack Start is pinned to the patched 1.168.60 release, with start-server-core 1.169.39, for CVE-2026-102989. See https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989. Do not bypass Vercel’s vulnerable-dependency deployment check.

### Earlier USD candidate checks — October 31, 2026 (before INR release)

- Vercel CLI authenticated successfully for the existing project. The live custom domain remains on deployment `dpl_5UhViXA19meyMQePxT4zQa6zErtY`.
- A separate protected candidate (`dpl_58pdAiGXRbrPEbB65jQrQhzftpTr`) built successfully with the security update. Read-only checks inside Vercel confirmed the sensitive configuration is available, the database connects, and the live Razorpay credentials authenticate.
- The account lists six INR plans and no configured USD plan variables. Creating the first USD plan failed with `Currency provided is not supported`. No subscription/payment was created. The full feature release has not been promoted.
- Migration 004 was executed twice in an isolated temporary schema on the real database, checked for event deduplication, and rolled back. The temporary schema was confirmed removed. Production conversion tables have not been created.
- Ask Razorpay whether this merchant account can create USD-denominated recurring subscription plans via `POST /v1/plans`, and what enablement is required. General international-payment support is not sufficient evidence that this subscription flow is enabled.
- These checks preceded the decision to ship the feature/security release with existing INR billing. See the release outcome below for current deployment status.

## INR release — October 31, 2026

- Applied migration 004 to the production database and verified both new tables. Existing records and subscriptions were not rewritten.
- All 39 unit/database tests and 5 browser tests passed; typecheck and production builds passed. Lint has no errors and nine pre-existing fast-refresh warnings.
- Candidate deployment verified production configuration and all six existing Razorpay INR plans against the shared catalog using read-only provider requests. No payment or subscription was created.
- Deployed endpoint smoke checks verified allowed origins, signed widget sessions, consent configuration, analytics persistence/deduplication, URL query stripping, contact consent/persistence/deduplication, and owner authentication gates. Temporary synthetic records were removed.
- The public landing and pricing pages were checked in Chrome on desktop/mobile, including the interactive demo and annual INR prices. No uncaught browser exceptions were observed during these flows.
- Vercel registered the daily maintenance job. A missing-token error found during rollout was fixed; GET and POST must reject both missing and invalid credentials with 401. The first scheduled authenticated invocation has not yet been observed.
- Authenticated owner-dashboard behaviour is covered with browser fixtures, not a live customer account. A completed real payment, renewal, and outbound customer webhook were not exercised.
- USD billing and international recurring-card acceptance remain pending Razorpay approval; this release retains INR pricing and existing provider plans.

The reproducible deployment check is `node --env-file=.env.production.local scripts/smoke-conversion-deployment.mjs https://obseri.com`. It creates and then removes a synthetic published record and related events/contacts; it does not send webhooks, emails or payments. For a protected candidate, set `OBSERI_VERCEL_CLI` to the installed Vercel CLI entrypoint.
