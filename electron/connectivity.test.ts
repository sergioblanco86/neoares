import { describe, expect, it, vi } from "vitest";
import { hasInternetConnection } from "./connectivity";

describe("hasInternetConnection", () => {
  it("reports online when the connectivity endpoint responds", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(hasInternetConnection(request)).resolves.toBe(true);
  });

  it("reports offline when the connectivity request fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(hasInternetConnection(request)).resolves.toBe(false);
  });
});
