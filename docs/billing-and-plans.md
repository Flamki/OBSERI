# Billing and plan model

Status: implementation baseline, July 2026. Listed prices are the final Razorpay plan amounts. Finance must configure the correct GST/tax treatment and invoice fields in the merchant account before launch.

## Business rule

Obseri must never sell unlimited model, crawl, or voice usage. Every self-serve plan has a hard included allowance. When an allowance is exhausted, the customer must upgrade or contact sales; Obseri does not create an unbounded provider bill in the background.

## Cost envelope

Current shared production infrastructure is expected to start near **$60–$80/month**:

- Vercel Pro: $20/month, including $20 of infrastructure usage credit.
- Neon Launch planning reserve: about $15/month at intermittent load. Current public rates are $0.106/CU-hour and $0.35/GB-month.
- AWS voice service budget: $25/month while the existing CPU service is used.
- Monitoring, email, storage, and operational reserve: $10–$20/month.

Variable-cost safety budgets used for plan design:

- Managed real-time voice: **₹10–₹12/minute**, including speech, model, networking, and a provider-change buffer. Current ElevenAgents pricing is $0.08/minute before every possible surrounding cost.
- Text answer: **₹0.20/response** internal reserve, including retrieval and model generation.
- Incremental crawl/index work: **₹0.04/page processed** internal reserve.
- Razorpay: **2% plus 18% GST on the fee**, or about 2.36% of collected revenue for standard domestic payments.

These are conservative budgets, not customer-facing overage rates. Review real p50/p95 costs after the first 20 paying customers and every quarter thereafter.

## Customer plans

| Plan       | Monthly | Websites | Indexed pages | Text responses / month | Voice / month |  Seats | Refresh            | Retention |
| ---------- | ------: | -------: | ------------: | ---------------------: | ------------: | -----: | ------------------ | --------: |
| Free       |      ₹0 |        1 |            30 |                    100 |         5 min |      1 | Manual             |    7 days |
| Launch     |  ₹3,499 |        1 |           300 |                  1,000 |        30 min |      1 | Manual incremental |   30 days |
| Growth     | ₹10,999 |        3 |         2,000 |                  5,000 |       120 min |      5 | Manual incremental |   90 days |
| Scale      | ₹34,999 |       10 |        10,000 |                 20,000 |       300 min |     15 | Manual incremental |  365 days |
| Enterprise |  Custom |   Custom |        Custom |              Committed |     Committed | Custom | Custom             |    Custom |

Annual billing is priced at 85% of twelve monthly payments (15% discount). The public UI should highlight Growth, not Scale.

### Full-allowance contribution check

The table below assumes every customer consumes every included text response, voice minute, and indexed-page allowance in the same month, using the upper ₹12/minute voice reserve. It reserves 18% of the listed amount for indirect tax and includes the estimated Razorpay fee, but excludes shared fixed infrastructure.

| Plan   | Monthly revenue | Reserved variable cost | Payment fee | Contribution |  Contribution margin |
| ------ | --------------: | ---------------------: | ----------: | -----------: | -------------------: |
| Launch |          ₹3,499 |                   ₹572 |         ₹83 |       ₹2,310 | 77.9% of net revenue |
| Growth |         ₹10,999 |                 ₹2,520 |        ₹260 |       ₹6,541 | 70.2% of net revenue |
| Scale  |         ₹34,999 |                 ₹8,000 |        ₹826 |      ₹20,834 | 70.2% of net revenue |

At the 15% annual discount, the conservative contribution margin remains approximately 75% for Launch and 65% for Growth and Scale. This is why Growth includes 120—not 150—managed voice minutes, and Scale includes 300—not 500. Higher allowances would make the plans fragile at full utilization.

### Enterprise boundary

Enterprise is not “unlimited.” It starts with a committed monthly volume and a scoped order form. It can add SSO, audit controls, a private voice/model deployment, custom region and retention, an SLA, procurement support, and dedicated capacity. Do not promise private GPU capacity until its infrastructure cost is included in the contract.

## Overage policy

Self-serve overages are disabled at launch. The API returns `usage_limit_reached` before provider work begins. Customers can upgrade immediately or contact sales for committed capacity. Prepaid packs should not be advertised until a one-time-payment, grant-consumption, refund, and expiry flow has shipped and been tested.

## Meter definitions

- **Website:** one distinct configured root domain. Subdomains count separately unless explicitly aliased.
- **Indexed page:** the latest active canonical document, not every historical revision.
- **Text response:** one successfully generated assistant answer. Failed requests and blocked abuse do not count.
- **Voice minute:** successfully delivered synthesized speech across live agents and Studio previews. Usage is measured from the audio duration and rounded up per generated segment; provider failures do not count.
- **Seat:** an accepted workspace member with access during the billing period.
- **Retention:** how long conversation content remains available. Aggregated, non-identifying billing totals may be retained longer.

## Enforcement order

1. Authenticate the owner or resolve the public widget to its owning workspace.
2. Reserve usage atomically before expensive provider work.
3. Run the crawl/model/voice request.
4. Commit actual usage after success, or release the reservation after a provider failure.
5. Return a typed `usage_limit_reached` response with upgrade and pack options.

Never trust a successful browser callback as proof of payment. Razorpay webhooks are authoritative, signature-verified, idempotent, stored before processing, and supplemented by an API fetch when the customer needs immediate confirmation.

## Launch requirements

- [x] Database tables for subscriptions, usage ledgers, reservations, grants, and webhook idempotency.
- [x] Hard enforcement on website creation, indexing, text responses, and voice minutes.
- [x] Billing UI for current plan, renewal, usage, invoices, cancellation, and upgrades.
- [x] Server-side checkout confirmation plus signed, idempotent webhook processing.
- [x] Repeatable Razorpay plan provisioning script (`npm run billing:setup`).
- [ ] Razorpay live account and Subscriptions access approved.
- [ ] Six live plan IDs and the live key pair stored as server-only Vercel variables.
- [ ] Webhook secret stored in Vercel and endpoint enabled at `/api/billing/webhook`.
- [ ] Checkout, cancellation, plan change, webhook replay, failed renewal, and refund tested in Razorpay test mode.
- [ ] Spend alerts on Vercel, Neon, AWS, and model/voice providers.

Automated refresh schedules and team-member invitations are not launch-enabled yet. The catalog reserves their future entitlement shape, but the customer-facing plan features must remain manual refresh and single-owner access until those workers and screens ship.

## Pricing review triggers

Review prices immediately if any of these occur:

- voice p95 cost exceeds ₹12/minute;
- a plan’s fully loaded gross margin is below 65% for two months;
- more than 10% of paid accounts repeatedly hit a limit;
- provider failures force material duplicate processing;
- enterprise requests require dedicated always-on GPU capacity.
