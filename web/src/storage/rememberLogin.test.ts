import { describe, expect, it } from "vitest";
import { REMEMBER_LOGIN_MS, parseRememberUntil, rememberUntil } from "./rememberLogin";

describe("remember login", () => {
  it("lasts three days from the login moment", () => {
    expect(rememberUntil(1_000)).toBe(1_000 + REMEMBER_LOGIN_MS);
    expect(REMEMBER_LOGIN_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("accepts a future expiry and rejects expired or broken records", () => {
    const now = 10_000;
    expect(parseRememberUntil(JSON.stringify({ expiresAt: now + 5 }), now)).toBe(now + 5);
    expect(parseRememberUntil(JSON.stringify({ expiresAt: now }), now)).toBeNull();
    expect(parseRememberUntil("{}", now)).toBeNull();
    expect(parseRememberUntil(null, now)).toBeNull();
  });
});
