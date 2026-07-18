import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 15 * 60;

export class IntegrationSecurityError extends Error {
  constructor(
    message: string,
    readonly status = 401,
    readonly code = "integration_unauthorized",
  ) {
    super(message);
    this.name = "IntegrationSecurityError";
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new IntegrationSecurityError("A valid bearer token is required.");
  }
  return token;
}

export function normalizeAllowedDomains(values: string[]): string[] {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => {
      const withoutProtocol = value.replace(/^https?:\/\//, "");
      return withoutProtocol.split("/")[0]?.replace(/:\d+$/, "") ?? "";
    })
    .filter((value) =>
      /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value),
    );
  return [...new Set(normalized)].slice(0, 50);
}

export function originAllowed(origin: string, allowedDomains: string[]): boolean {
  let hostname: string;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }

  return allowedDomains.some((entry) => {
    const domain = entry.toLowerCase().replace(/^www\./, "");
    if (domain.startsWith("*.")) {
      const suffix = domain.slice(2);
      return hostname !== suffix && hostname.endsWith(`.${suffix}`);
    }
    return hostname === domain;
  });
}

type WidgetSession = {
  v: 1;
  soulId: string;
  origin: string;
  exp: number;
  nonce: string;
};

export function createWidgetSession(soulId: string, origin: string): string {
  const payload: WidgetSession = {
    v: 1,
    soulId,
    origin,
    exp: Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signSession(encoded);
  return `obs_sess.${encoded}.${signature}`;
}

export function verifyWidgetSession(token: string, soulId: string): WidgetSession {
  const [prefix, encoded, suppliedSignature] = token.split(".");
  if (prefix !== "obs_sess" || !encoded || !suppliedSignature) {
    throw new IntegrationSecurityError("The widget session is invalid.");
  }
  const expectedSignature = signSession(encoded);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new IntegrationSecurityError("The widget session is invalid.");
  }

  let payload: WidgetSession;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as WidgetSession;
  } catch {
    throw new IntegrationSecurityError("The widget session is invalid.");
  }
  if (
    payload.v !== 1 ||
    payload.soulId !== soulId ||
    !payload.origin ||
    !payload.nonce ||
    payload.exp <= Math.floor(Date.now() / 1_000)
  ) {
    throw new IntegrationSecurityError("The widget session has expired.");
  }
  return payload;
}

function signSession(encodedPayload: string): string {
  const secret = process.env.OBSERI_WIDGET_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new IntegrationSecurityError(
      "Widget sessions are not configured on this deployment.",
      503,
      "integration_not_configured",
    );
  }
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}
