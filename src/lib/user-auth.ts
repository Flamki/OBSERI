import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_AUTH_URL =
  "https://ep-sparkling-fire-az1kiqlk.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  name?: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function authUrl() {
  return (
    process.env.NEON_AUTH_BASE_URL ??
    process.env.VITE_NEON_AUTH_URL ??
    DEFAULT_AUTH_URL
  ).replace(/\/$/, "");
}

export function authJwksUrl() {
  return `${authUrl()}/.well-known/jwks.json`;
}

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token || token.length > 8_192) {
    throw new UserAuthError("Sign in to continue.", 401);
  }

  try {
    jwks ??= createRemoteJWKSet(new URL(authJwksUrl()), {
      timeoutDuration: 3_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["EdDSA"],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Token subject is missing");
    }
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    throw new UserAuthError("Your session is invalid or expired. Sign in again.", 401);
  }
}

export class UserAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UserAuthError";
  }
}
