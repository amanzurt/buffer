import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("env module importa sin lanzar error cuando SKIP_ENV_VALIDATION=true", async () => {
    process.env.SKIP_ENV_VALIDATION = "true";
    const { env } = await import("../env");
    expect(env).toBeDefined();
  });
});
