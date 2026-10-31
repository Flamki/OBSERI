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
let workspaceRequests = new AbortController();
export function suspendWorkspaceAccess(owner: string) {
  if (owner === workspaceOwner) workspaceRequests.abort();
}
export function setActiveWorkspaceOwner(owner: string) {
  workspaceRequests.abort();
  workspaceRequests = new AbortController();
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
  // Capture the workspace before awaiting authentication; never send an old
  // workspace's write to a newly selected workspace.
  const owner = workspaceOwner;
  const signal = AbortSignal.any([
    workspaceRequests.signal,
    ...(init.signal ? [init.signal] : []),
    ...(input instanceof Request ? [input.signal] : []),
  ]);
  signal.throwIfAborted();
  const headers = new Headers(init.headers);
  if (owner) headers.set("x-obseri-workspace-owner", owner);
  if (!headers.has("Authorization")) {
    const token = await neonAuth.getJWTToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  signal.throwIfAborted();
  const response = await fetch(input, { ...init, headers, signal });
  if (
    (response.status === 401 || response.status === 403) &&
    !(target.pathname === "/api/team" && target.searchParams.get("view") === "access")
  ) {
    window.dispatchEvent(new Event("obseri-access-check"));
  }
  return response;
}
