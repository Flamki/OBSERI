import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const NEON_AUTH_URL =
  import.meta.env.VITE_NEON_AUTH_URL ??
  "https://ep-sparkling-fire-az1kiqlk.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth";

const neonAuth = createInternalNeonAuth(NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

export const authClient = neonAuth.adapter;

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    const token = await neonAuth.getJWTToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
