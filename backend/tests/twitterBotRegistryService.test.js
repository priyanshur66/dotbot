const {
  createTwitterBotRegistryService,
} = require("../src/services/twitterBotRegistryService");

describe("twitter bot registry service", () => {
  test("upserts one config per wallet", async () => {
    const convexClient = {
      mutation: jest.fn(async () => "cfg_1"),
      query: jest.fn(),
    };

    const service = createTwitterBotRegistryService({
      convexUrl: "https://example.convex.cloud",
      convexClient,
    });

    const result = await service.upsertConfig({
      walletAddress: "0x1111111111111111111111111111111111111111",
      twitterHandle: "@alice",
      enabled: true,
    });

    expect(result).toEqual({
      id: "cfg_1",
      walletAddress: "0x1111111111111111111111111111111111111111",
      twitterHandle: "@alice",
      twitterHandleNormalized: "alice",
      enabled: true,
    });
    expect(convexClient.mutation).toHaveBeenCalledWith("twitterBot:upsertConfig", {
      walletAddress: "0x1111111111111111111111111111111111111111",
      twitterHandle: "@alice",
      twitterHandleNormalized: "alice",
      enabled: true,
    });
  });

  test("lists enabled configs", async () => {
    const convexClient = {
      mutation: jest.fn(),
      query: jest.fn(async () => [
        {
          _id: "cfg_1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          twitterHandle: "@alice",
          twitterHandleNormalized: "alice",
          enabled: true,
          lastSeenTweetId: "10",
          lastSeenTweetAt: 1700000000000,
          lastPolledAt: 1700000005000,
          createdAt: 1700000000000,
          updatedAt: 1700000005000,
        },
      ]),
    };

    const service = createTwitterBotRegistryService({
      convexUrl: "https://example.convex.cloud",
      convexClient,
    });

    const rows = await service.listEnabledConfigs();

    expect(rows).toEqual([
      expect.objectContaining({
        id: "cfg_1",
        twitterHandle: "@alice",
        enabled: true,
      }),
    ]);
  });
});
