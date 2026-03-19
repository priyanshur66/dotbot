const { createTokenRegistryService } = require("../src/services/tokenRegistryService");

describe("token registry service", () => {
  test("creates launch record in Convex", async () => {
    const convexClient = {
      mutation: jest.fn(async () => "record-id"),
      query: jest.fn(),
    };

    const service = createTokenRegistryService({
      convexUrl: "https://example.convex.cloud",
      convexClient,
    });

    const result = await service.createLaunchRecord({
      tokenAddress: "0x3333333333333333333333333333333333333333",
      tokenName: "My Token",
      tokenSymbol: "MTK",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      launchedByAddress: "0x9999999999999999999999999999999999999999",
      chainId: 8453,
      networkName: "base",
      totalSupply: "1000000000",
      decimals: 18,
      deployTxHash: "0xdeploy",
      tokenTransferTxHash: "0xtransfer",
      ownershipTransferTxHash: "0xownership",
    });

    expect(result).toEqual({ id: "record-id" });
    expect(convexClient.mutation).toHaveBeenCalledWith(
      "tokenLaunches:createLaunchRecord",
      expect.objectContaining({
        tokenName: "My Token",
        tokenSymbol: "MTK",
        chainId: 8453,
      })
    );
  });

  test("lists launch records for owner", async () => {
    const convexClient = {
      mutation: jest.fn(),
      query: jest.fn(async () => [
        {
          _id: "record-id",
          tokenAddress: "0x3333333333333333333333333333333333333333",
          tokenName: "My Token",
          tokenSymbol: "MTK",
          ownerAddress: "0x1111111111111111111111111111111111111111",
          launchedByAddress: "0x9999999999999999999999999999999999999999",
          chainId: 8453,
          networkName: "base",
          totalSupply: "1000000000",
          decimals: 18,
          launchStatus: "completed",
          deployTxHash: "0xdeploy",
          tokenTransferTxHash: "0xtransfer",
          ownershipTransferTxHash: "0xownership",
          createdAt: 1700000000000,
        },
      ]),
    };

    const service = createTokenRegistryService({
      convexUrl: "https://example.convex.cloud",
      convexClient,
    });

    const rows = await service.listTokenLaunchesByOwner(
      "0x1111111111111111111111111111111111111111"
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: "record-id",
        ownerAddress: "0x1111111111111111111111111111111111111111",
      }),
    ]);
    expect(convexClient.query).toHaveBeenCalledWith(
      "tokenLaunches:listTokenLaunchesByOwner",
      {
        ownerAddress: "0x1111111111111111111111111111111111111111",
      }
    );
  });
});
