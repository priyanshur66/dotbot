const { validateAndLoadEnv } = require("../src/config/env");
const { ConfigError } = require("../src/lib/errors");

describe("env validation", () => {
  test("throws ConfigError when required env vars are missing", () => {
    expect(() =>
      validateAndLoadEnv({}, { strict: true })
    ).toThrow(ConfigError);
  });

  test("loads default port when PORT is not provided", () => {
    const result = validateAndLoadEnv(
      {
        RPC_URL: "http://localhost:8545",
        BACKEND_PRIVATE_KEY:
          "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
        CONVEX_URL: "https://example.convex.cloud",
      },
      { strict: true }
    );

    expect(result.port).toBe(3000);
    expect(result.rpcUrl).toBe("http://localhost:8545");
    expect(result.rpcWriteUrl).toBe("http://localhost:8545");
    expect(result.envStatus).toEqual({
      rpcUrlConfigured: true,
      rpcWriteUrlConfigured: false,
      backendPrivateKeyConfigured: true,
      convexUrlConfigured: true,
    });
  });
});
