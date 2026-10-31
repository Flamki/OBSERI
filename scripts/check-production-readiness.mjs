// Opt-in read-only checks inside Vercel, where sensitive values remain available.
// Never print credentials, database URLs, provider response bodies, or user data.
import prices from "../src/lib/billing-prices.json" with { type: "json" };
if (process.env.OBSERI_VERIFY_DEPLOYMENT === "1") {
  const { default: postgres } = await import("postgres");
  const results = {};
  const names = [
    "DATABASE_URL",
    "NEON_AUTH_BASE_URL",
    "VITE_NEON_AUTH_URL",
    "OBSERI_WIDGET_SESSION_SECRET",
    "OBSERI_SECRET_ENCRYPTION_KEY",
    "CRON_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ];
  results.configuration = Object.fromEntries(
    names.map((name) => [name, Boolean(process.env[name]) && !/redacted/i.test(process.env[name])]),
  );
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
  try {
    await sql.begin("read only", async (tx) => {
      const tables =
        await tx`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('obseri_analytics_events', 'obseri_leads')`;
      results.database = { connected: true, conversionTables: tables.map((row) => row.table_name) };
    });
  } catch (error) {
    results.database = { connected: false, errorCode: error.code || error.name };
  } finally {
    await sql.end({ timeout: 2 });
  }

  const key = process.env.RAZORPAY_KEY_ID || "";
  results.billingMode = key.startsWith("rzp_live_")
    ? "live"
    : key.startsWith("rzp_test_")
      ? "test"
      : "unknown";
  try {
    const authorization = `Basic ${Buffer.from(`${key}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
    const response = await fetch("https://api.razorpay.com/v1/plans?count=100", {
      headers: { authorization },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    results.billing = {
      authenticated: response.ok,
      httpStatus: response.status,
      plans: response.ok
        ? body.items?.map((plan) => ({
            currency: plan.item?.currency,
            amount: plan.item?.amount,
            period: plan.period,
            interval: plan.interval,
          }))
        : undefined,
      errorCode: body.error?.code,
      usdVariablesConfigured: ["LAUNCH", "GROWTH", "SCALE"].every((plan) =>
        ["MONTHLY", "ANNUAL"].every((cycle) =>
          Boolean(process.env[`RAZORPAY_PLAN_${plan}_${cycle}_USD`]),
        ),
      ),
    };
    const suffix = prices.currency === "INR" ? "" : `_${prices.currency}`;
    results.billing.catalogCurrency = prices.currency;
    results.billing.configuredPlans = [];
    for (const plan of ["launch", "growth", "scale"]) {
      for (const cycle of ["monthly", "annual"]) {
        const id =
          process.env[
            `RAZORPAY_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}${suffix}`
          ]?.trim();
        const provider = body.items?.find((item) => item.id === id);
        results.billing.configuredPlans.push({
          plan,
          cycle,
          valid: Boolean(
            id &&
            provider &&
            provider.item?.currency === prices.currency &&
            provider.item?.amount === prices[plan][cycle] &&
            provider.interval === 1 &&
            provider.period === (cycle === "annual" ? "yearly" : "monthly"),
          ),
        });
      }
    }
  } catch (error) {
    results.billing = { authenticated: false, errorCode: error.name };
  }
  console.log("OBSERI_READINESS_REPORT=" + JSON.stringify(results));
  if (
    !Object.values(results.configuration).every(Boolean) ||
    !results.database?.connected ||
    results.database.conversionTables?.length !== 2 ||
    !results.billing?.authenticated ||
    !results.billing.configuredPlans?.every((plan) => plan.valid)
  ) {
    throw new Error("Production readiness checks failed; see the status-only report above.");
  }
}

// Separate, explicit provisioning action; never enabled on normal builds.
if (process.env.OBSERI_PROVISION_BILLING_PLANS === "1") {
  await import("./setup-razorpay-plans.mjs");
}
