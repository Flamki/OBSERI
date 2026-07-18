const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

if (!keyId || !keySecret) {
  throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
}

const plans = [
  ["RAZORPAY_PLAN_LAUNCH_MONTHLY", "Obseri Launch - Monthly", "monthly", 349_900],
  ["RAZORPAY_PLAN_LAUNCH_ANNUAL", "Obseri Launch - Annual", "yearly", 3_569_000],
  ["RAZORPAY_PLAN_GROWTH_MONTHLY", "Obseri Growth - Monthly", "monthly", 1_099_900],
  ["RAZORPAY_PLAN_GROWTH_ANNUAL", "Obseri Growth - Annual", "yearly", 11_219_000],
  ["RAZORPAY_PLAN_SCALE_MONTHLY", "Obseri Scale - Monthly", "monthly", 3_499_900],
  ["RAZORPAY_PLAN_SCALE_ANNUAL", "Obseri Scale - Annual", "yearly", 35_699_000],
];

const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
const created = [];

for (const [environmentName, name, period, amount] of plans) {
  if (process.env[environmentName]?.trim()) {
    created.push([environmentName, process.env[environmentName].trim(), "existing"]);
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
        currency: "INR",
        description: "Obseri website voice and chat agent subscription",
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
