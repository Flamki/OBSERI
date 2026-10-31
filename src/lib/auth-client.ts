import { createInternalNeonAuth, type ReactBetterAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const NEON_AUTH_URL =
  import.meta.env.VITE_NEON_AUTH_URL ??
  "https://ep-sparkling-fire-az1kiqlk.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth";

const neonAuth = createInternalNeonAuth(NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

// @neondatabase/auth 0.4 beta's internal factory currently exposes the correct
// Better Auth React client at runtime but infers its hook atoms in TypeScript.
// Keep the internal factory for getJWTToken(), and narrow the public adapter to
// the React API that BetterAuthReactAdapter actually returns.
export const authClient = neonAuth.adapter as unknown as ReactBetterAuthClient;

let workspaceOwner = "";
export function setActiveWorkspaceOwner(owner: string) {
  workspaceOwner = owner;
}
export function getActiveWorkspaceOwner() {
  return workspaceOwner;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const target = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.origin,
  );
  if (target.origin !== window.location.origin)
    throw new Error("Authenticated requests must stay on this site.");
  const headers = new Headers(init.headers);
  if (workspaceOwner) headers.set("x-obseri-workspace-owner", workspaceOwner);
  if (!headers.has("Authorization")) {
    const token = await neonAuth.getJWTToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
