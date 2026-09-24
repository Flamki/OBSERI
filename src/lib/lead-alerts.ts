import type { SoulConversation } from "@/lib/soul";
import { extractContact, firstQuestion } from "@/lib/conversation-insights";

const EMAIL_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const DEFAULT_FROM = "Obseri <alerts@obseri.com>";
const STUDIO_URL = "https://obseri.com/app?view=conversations";

export type LeadAlertEmail = { subject: string; html: string; text: string };

export function isEmailAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_ADDRESS.test(value.trim());
}

/** Lead alerts are sent only when an email provider key is configured on the server. */
export function leadAlertsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

/** The owner-facing email for a new lead. Pure, so it can be tested without a provider. */
export function buildLeadAlertEmail(input: {
  siteUrl: string;
  agentName: string;
  conversation: SoulConversation;
  studioUrl?: string;
}): LeadAlertEmail {
  const host = hostOf(input.siteUrl);
  const contact = extractContact(input.conversation);
  const who = contact.email ?? contact.phone ?? "A visitor";
  const intent =
    input.conversation.leadIntent === "high"
      ? "Hot lead"
      : input.conversation.leadIntent === "medium"
        ? "Warm lead"
        : "New lead";
  const question = firstQuestion(input.conversation);
  const studioUrl = input.studioUrl ?? STUDIO_URL;
  const transcript = input.conversation.messages.slice(-12);
  // Header values must not carry line breaks.
  const subject = `${intent} on ${host}: ${who}`.replace(/[\r\n]+/g, " ").slice(0, 180);

  const text = [
    `${intent} on ${host}`,
    "",
    contact.email ? `Email: ${contact.email}` : "",
    contact.phone ? `Phone: ${contact.phone}` : "",
    question ? `First question: ${question}` : "",
    "",
    "Conversation:",
    ...transcript.map(
      (message) =>
        `${message.role === "visitor" ? "Visitor" : input.agentName}: ${message.content}`,
    ),
    "",
    `Open in Obseri: ${studioUrl}`,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");

  const rows = transcript
    .map((message) => {
      const visitor = message.role === "visitor";
      return `<tr><td style="padding:6px 0;">
        <div style="font-size:12px;color:#8a8a8f;margin-bottom:2px;">${visitor ? "Visitor" : escapeHtml(input.agentName)}</div>
        <div style="display:inline-block;max-width:460px;padding:10px 14px;border-radius:14px;font-size:14px;line-height:20px;${visitor ? "background:#0b0b0c;color:#ffffff;" : "background:#f3f3f1;color:#1f1f23;"}">${escapeHtml(message.content)}</div>
      </td></tr>`;
    })
    .join("");

  const details = [
    contact.email
      ? `<a href="mailto:${escapeHtml(contact.email)}" style="color:#0b0b0c;">${escapeHtml(contact.email)}</a>`
      : "",
    contact.phone ? escapeHtml(contact.phone) : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0b0b0c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ebebe8;border-radius:20px;padding:28px;">
<tr><td>
<div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ffe4ea;color:#c0264a;font-size:12px;font-weight:600;">${intent}</div>
<h1 style="margin:14px 0 6px;font-size:22px;line-height:28px;letter-spacing:-0.02em;">${escapeHtml(who)} on ${escapeHtml(host)}</h1>
${details ? `<p style="margin:0 0 6px;font-size:14px;color:#3d3d3a;">${details}</p>` : ""}
${question ? `<p style="margin:0;font-size:14px;color:#6f6e69;">&ldquo;${escapeHtml(question)}&rdquo;</p>` : ""}
</td></tr>
<tr><td style="padding-top:20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding-top:22px;">
<a href="${escapeHtml(studioUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b0b0c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open in Obseri</a>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8a8a8f;">Sent by Obseri because lead alerts are on for ${escapeHtml(host)}. Turn them off in Studio &rarr; Settings.</p>
</td></tr></table></body></html>`;

  return { subject, html, text };
}

/** Sends a lead alert through Resend. Returns false when not configured or delivery fails. */
export async function sendLeadAlert(to: string, email: LeadAlertEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !isEmailAddress(to)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.OBSERI_ALERT_FROM || DEFAULT_FROM,
        to: [to.trim()],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
