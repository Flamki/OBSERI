import { assertPublicHttpUrlResolved } from "@/lib/scanner";

export type ObseriWebhookEvent = {
  id: string;
  type: "conversation.updated" | "lead.detected" | "webhook.test";
  createdAt: string;
  soulId: string;
  data: Record<string, unknown>;
};

export async function deliverWebhook(input: {
  url: string;
  secret: string;
  event: ObseriWebhookEvent;
}) {
  const url = await assertPublicHttpUrlResolved(input.url);
  if (!input.secret.startsWith("whsec_") || input.secret.length < 20) {
    throw new Error("The webhook signing secret is invalid.");
  }

  const body = JSON.stringify(input.event);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = await sign(`${timestamp}.${body}`, input.secret);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      "user-agent": "Obseri-Webhooks/1.0",
      "x-obseri-event": input.event.type,
      "x-obseri-event-id": input.event.id,
      "x-obseri-signature": `t=${timestamp},v1=${signature}`,
      "idempotency-key": input.event.id,
    },
    body,
    signal: AbortSignal.timeout(8_000),
  });

  const responseText = (await response.text()).slice(0, 500);
  if (!response.ok) {
    throw new Error(`Webhook destination returned HTTP ${response.status}.`);
  }
  return { status: response.status, response: responseText };
}

export function createWebhookEvent(
  type: ObseriWebhookEvent["type"],
  soulId: string,
  data: Record<string, unknown>,
): ObseriWebhookEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type,
    createdAt: new Date().toISOString(),
    soulId,
    data,
  };
}

async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
