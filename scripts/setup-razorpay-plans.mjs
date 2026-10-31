import prices from "../src/lib/billing-prices.json" with { type: "json" };

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

if (!keyId || !keySecret || /redacted/i.test(keyId + keySecret)) {
  throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
}

const suffix = prices.currency === "INR" ? "" : `_${prices.currency}`;
const plans = ["launch", "growth", "scale"].flatMap((id) =>
  ["monthly", "annual"].map((cycle) => [
    `RAZORPAY_PLAN_${id.toUpperCase()}_${cycle.toUpperCase()}${suffix}`,
    `Obseri ${id} - ${cycle} ${prices.currency}`,
    cycle === "annual" ? "yearly" : "monthly",
    prices[id][cycle],
  ]),
);

const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
const created = [];
// Reuse matching plans after an interrupted provisioning run. Razorpay plans
// cannot be deleted, so retries must not blindly create another six plans.
const existingPlans = [];
for (let skip = 0; ; skip += 100) {
  const response = await fetch(`https://api.razorpay.com/v1/plans?count=100&skip=${skip}`, {
    headers: { authorization },
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.items))
    throw new Error("Could not inspect existing billing plans.");
  existingPlans.push(...result.items);
  if (result.items.length < 100) break;
  if (skip >= 9900) throw new Error("Plan inventory is too large for automatic provisioning.");
}

for (const [environmentName, name, period, amount] of plans) {
  if (process.env[environmentName]?.trim()) {
    const id = process.env[environmentName].trim();
    const response = await fetch(`https://api.razorpay.com/v1/plans/${encodeURIComponent(id)}`, {
      headers: { authorization },
      signal: AbortSignal.timeout(10000),
    });
    const existing = await response.json();
    if (
      !response.ok ||
      existing.item?.currency !== prices.currency ||
      existing.item?.amount !== amount ||
      existing.period !== period ||
      existing.interval !== 1
    ) {
      throw new Error(
        `${environmentName} does not match the active billing catalog. Configure a matching plan.`,
      );
    }
    created.push([environmentName, id, "verified"]);
    continue;
  }
  const matching = existingPlans.find(
    (plan) =>
      plan.item?.name === name &&
      plan.item?.currency === prices.currency &&
      plan.item?.amount === amount &&
      plan.period === period &&
      plan.interval === 1 &&
      plan.notes?.product === "obseri",
  );
  if (matching) {
    created.push([environmentName, matching.id, "reused"]);
    continue;
  }
  const response = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      period,
      interval: 1,
      item: {
        name,
        amount,
        currency: prices.currency,
        description: "Obseri website intelligence and assistant subscription",
      },
      notes: { product: "obseri", environment: keyId.startsWith("rzp_live_") ? "live" : "test" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || typeof body.id !== "string") {
    throw new Error(body?.error?.description ?? `Could not create ${name}`);
  }
  created.push([environmentName, body.id, "created"]);
}

console.log("Razorpay plan configuration:");
for (const [environmentName, id, status] of created) {
  console.log(`${environmentName}=${id} (${status})`);
}
console.log("Store these values as server-only environment variables.");
