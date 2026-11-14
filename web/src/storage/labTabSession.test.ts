import { describe, expect, it } from "vitest";
import { claimLabTabHandoff, publishLabTabHandoff, revokeLabTabHandoff } from "./labTabSession";

function memory(): Storage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
    clear: () => items.clear(),
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
}

describe("lab tab session", () => {
  it("lets a new tab enter with the username just published", () => {
    const local = memory();
    const session = memory();
    publishLabTabHandoff("ada", local, 1_000);
    expect(claimLabTabHandoff(local, session, 1_500)).toBe("ada");
    expect(claimLabTabHandoff(local, memory(), 1_500)).toBe("ada");
    expect(claimLabTabHandoff(memory(), session, 80_000)).toBe("ada");
  });

  it("drops a handoff after logout and after it goes stale", () => {
    const local = memory();
    const session = memory();
    publishLabTabHandoff("ada", local, 1_000);
    revokeLabTabHandoff(local, 2_000);
    expect(claimLabTabHandoff(local, session, 2_100)).toBeNull();

    publishLabTabHandoff("ada", local, 3_000);
    expect(claimLabTabHandoff(local, memory(), 3_000 + 2 * 60 * 1000 + 1)).toBeNull();
  });
});
