// Usage: node --env-file=.env.production.local scripts/manage-plan-grant.mjs grant EMAIL PLAN REASON
// Revoke: node --env-file=.env.production.local scripts/manage-plan-grant.mjs revoke EMAIL
// Operator-only CLI. No public API, password changes, or payment-provider mutations.
import postgres from "postgres";
import { randomUUID } from "node:crypto";
const [action, rawEmail, plan, reason] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!["grant", "revoke"].includes(action) || !email?.includes("@"))
  throw new Error("Specify grant EMAIL PLAN REASON or revoke EMAIL.");
if (
  action === "grant" &&
  (!["launch", "growth", "scale", "enterprise"].includes(plan) || !reason?.trim())
)
  throw new Error("A valid plan and reason are required.");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Database configuration required.");
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    const users =
      await tx`select id, "emailVerified" as verified from neon_auth."user" where lower(email) = ${email}`;
    if (users.length !== 1 || !users[0].verified)
      throw new Error("Expected one existing, verified account for this email.");
    const owner = users[0].id;
    await tx`select pg_advisory_xact_lock(hashtext(${owner}))`;
    if (action === "grant") {
      const paid =
        await tx`select 1 from obseri_billing_subscriptions where owner_user_id = ${owner}
        and status in ('active', 'authenticated', 'pending') limit 1`;
      if (paid.length)
        throw new Error(
          "Account has a payment subscription; review it before granting complimentary access.",
        );
    }
    await tx`update obseri_plan_grants set revoked_at = now() where owner_user_id = ${owner} and revoked_at is null`;
    if (action === "grant")
      await tx`insert into obseri_plan_grants (id, owner_user_id, plan_id, reason)
        values (${randomUUID()}, ${owner}, ${plan}, ${reason.trim()})`;
  });
  console.log(
    action === "grant"
      ? `Complimentary ${plan} access granted to ${email}. No payment subscription created.`
      : `Complimentary access revoked for ${email}.`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
