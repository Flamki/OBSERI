import { describe, expect, it } from "vitest";

import { authJwksUrl, requireUser, UserAuthError } from "./user-auth";

describe("user auth", () => {
  it("uses the project-scoped Neon Auth JWKS endpoint", () => {
    expect(authJwksUrl()).toBe(
      "https://ep-sparkling-fire-az1kiqlk.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json",
    );
  });

  it("rejects requests without a bearer token before touching the network", async () => {
    const result = requireUser(new Request("https://obseri.com/api/workspace"));
    await expect(result).rejects.toBeInstanceOf(UserAuthError);
    await expect(result).rejects.toHaveProperty("status", 401);
  });

  it("rejects oversized bearer tokens", async () => {
    const request = new Request("https://obseri.com/api/workspace", {
      headers: { Authorization: `Bearer ${"x".repeat(8_193)}` },
    });
    const result = requireUser(request);
    await expect(result).rejects.toBeInstanceOf(UserAuthError);
    await expect(result).rejects.toHaveProperty("status", 401);
  });
});
