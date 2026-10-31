// Explicit release smoke test: temporary synthetic records, no payments or outbound webhooks.
// Run with production DB credentials and a deployment URL. For protected candidates set
// OBSERI_VERCEL_CLI to the installed Vercel CLI entrypoint; no secrets are printed.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
const exec = promisify(execFile);
const target = new URL(process.argv[2]);
if (target.protocol !== "https:") throw Error("An HTTPS deployment URL is required");
const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 15,
});
const id = `release-smoke-${randomUUID()}`;
const owner = `smoke-owner-${randomUUID()}`;
const token = `obswgt_${randomBytes(32).toString("base64url")}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const origin = "https://release-smoke.example";
const visitor = randomUUID();
const event = {
  id: randomUUID(),
  name: "page_view",
  path: "/pricing?email=private@example.com",
  source: "release-smoke",
};
const contact = {
  id: randomUUID(),
  conversationId: randomUUID(),
  sessionId: visitor,
  name: "Release smoke test",
  email: "release-smoke@example.com",
  message: "Synthetic deployment verification; delete after test.",
  consent: true,
  path: "/pricing",
};
async function request(path, { method = "GET", headers = {}, body } = {}) {
  if (process.env.OBSERI_VERCEL_CLI) {
    const args = [
      process.env.OBSERI_VERCEL_CLI,
      "curl",
      path,
      "--deployment",
      target.href,
      "--scope",
      "flamkis-projects",
      "--",
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      "--write-out",
      "\n%{http_code}",
      "--request",
      method,
    ];
    for (const [key, value] of Object.entries(headers)) args.push("--header", `${key}: ${value}`);
    if (body)
      args.push(
        "--header",
        "content-type: application/json",
        "--data-binary",
        JSON.stringify(body),
      );
    const { stdout } = await exec(process.execPath, args, { maxBuffer: 2_000_000 });
    const last = stdout.lastIndexOf("\n");
    return { status: Number(stdout.slice(last + 1)), body: stdout.slice(0, last) };
  }
  const response = await fetch(new URL(path, target), {
    method,
    headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.text() };
}
try {
  for (const method of ["GET", "POST"]) {
    assert.equal((await request("/api/internal/webhooks/drain", { method })).status, 401);
    assert.equal(
      (
        await request("/api/internal/webhooks/drain", {
          method,
          headers: { authorization: "Bearer invalid-release-smoke-token" },
        })
      ).status,
      401,
    );
  }
  const soul = {
    id,
    workspaceId: id,
    siteUrl: origin,
    channels: {
      widgetEnabled: true,
      allowedDomains: ["release-smoke.example"],
      analyticsEnabled: true,
      proactiveEnabled: true,
      consentRequired: true,
    },
    personality: { leadCapture: true },
  };
  await sql`insert into obseri_published_souls (soul_id, workspace_id, owner_user_id, owner_key_hash, widget_token_hash, soul, allowed_domains) values (${id},${id},${owner},${hash(randomUUID())},${hash(token)},${sql.json(soul)},${sql.json(["release-smoke.example"])})`;
  const sessionPath = `/api/widgets/${id}/session?token=${encodeURIComponent(token)}`;
  assert.equal(
    (await request(sessionPath, { headers: { origin: "https://wrong.example" } })).status,
    403,
    "unlisted domain must be rejected",
  );
  const session = await request(sessionPath, { headers: { origin } });
  assert.equal(session.status, 200, "widget session");
  const sessionBody = JSON.parse(session.body);
  assert.equal(sessionBody.consentRequired, true);
  const headers = { origin, authorization: `Bearer ${sessionBody.session}` };
  const analyticsPath = `/api/souls/${id}/analytics`;
  const leadsPath = `/api/souls/${id}/leads`;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(analyticsPath, {
          method: "POST",
          headers,
          body: { sessionId: visitor, events: [event] },
        })
      ).status,
      200,
      "analytics accepted",
    );
  assert.equal(
    (
      await request(analyticsPath, {
        method: "POST",
        headers: { ...headers, origin: "https://wrong.example" },
        body: { sessionId: visitor, events: [event] },
      })
    ).status,
    403,
    "origin mismatch rejected",
  );
  assert.equal(
    (await request(leadsPath, { method: "POST", headers, body: { ...contact, consent: false } }))
      .status,
    400,
    "contact requires explicit consent",
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await request(leadsPath, { method: "POST", headers, body: contact })).status,
      200,
      "contact accepted",
    );
  assert.equal((await request(analyticsPath)).status, 401, "owner data requires login");
  assert.equal(
    (await request(leadsPath, { method: "PATCH", body: { id: contact.id, status: "won" } })).status,
    401,
    "status changes require login",
  );
  const events = await sql`select path from obseri_analytics_events where soul_id=${id}`;
  assert.equal(events.length, 1, "events deduplicated");
  assert.equal(events[0].path, "/pricing", "queries stripped");
  const leads = await sql`select id,status,email from obseri_leads where soul_id=${id}`;
  assert.equal(leads.length, 1, "contacts deduplicated");
  assert.equal(leads[0].status, "new");
  assert.equal(leads[0].email, contact.email);
  const deliveries = await sql`select event_id from obseri_webhook_deliveries where soul_id=${id}`;
  assert.equal(deliveries.length, 0, "no outbound webhook for fixture");
  console.log(
    JSON.stringify({
      target: target.hostname,
      passed: true,
      checks: [
        "allowed origins",
        "signed session",
        "consent setting",
        "analytics ingestion and deduplication",
        "query redaction",
        "contact consent",
        "durable contact and deduplication",
        "owner read/write auth gates",
      ],
    }),
  );
} catch (error) {
  // Avoid logging child process arguments (they contain the temporary widget session).
  console.error(
    "Conversion smoke failed:",
    error instanceof assert.AssertionError ? error.message : error.name,
  );
  process.exitCode = 1;
} finally {
  try {
    await sql`delete from obseri_published_souls where soul_id=${id} and owner_user_id=${owner}`;
    const rateKeys = [
      `session:${id}:${origin}`,
      `tracking:${id}:${origin}:${visitor}`,
      `tracking:${id}:${origin}`,
      `contacts:${id}:${origin}`,
    ].map(hash);
    await sql`delete from obseri_rate_limits where rate_key = any(${rateKeys})`;
    console.log("Synthetic records cleaned up.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}
