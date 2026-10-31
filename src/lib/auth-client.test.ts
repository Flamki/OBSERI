import { afterEach, beforeEach, expect, it, vi } from "vitest";

const token = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/auth", () => ({
  createInternalNeonAuth: () => ({ adapter: {}, getJWTToken: token }),
}));
vi.mock("@neondatabase/auth/react/adapters", () => ({ BetterAuthReactAdapter: () => ({}) }));
import { authFetch, setActiveWorkspaceOwner, suspendWorkspaceAccess } from "./auth-client";

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://obseri.com" }, dispatchEvent: vi.fn() });
  token.mockReset().mockResolvedValue("test-token");
  setActiveWorkspaceOwner("shared");
});
afterEach(() => vi.unstubAllGlobals());

it("cancels pending workspace requests on revocation and blocks further requests", async () => {
  const fetchMock = vi.fn(
    (_input, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const pending = authFetch("/api/workspace");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  suspendWorkspaceAccess("shared");
  await rejected;
  await expect(authFetch("/api/workspace", { method: "PUT" })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("does not send a delayed write after the workspace changes during authentication", async () => {
  let resolveToken!: (value: string) => void;
  token.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
  );
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const oldWrite = authFetch("/api/workspace", { method: "PUT" });
  setActiveWorkspaceOwner("personal");
  resolveToken("test-token");
  await expect(oldWrite).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).not.toHaveBeenCalled();
  await authFetch("/api/workspace");
  expect(fetchMock.mock.calls[0][1].headers.get("x-obseri-workspace-owner")).toBe("personal");
});
