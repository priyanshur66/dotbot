const { getAddress } = require("ethers");
const { createLaunchTokenTool, deriveSymbolFromName } = require("../src/agent/tools/launchTokenTool");

describe("launchTokenTool", () => {
  test("derives symbol from token name", () => {
    expect(deriveSymbolFromName("Fast Fun Token")).toBe("FFT");
    expect(deriveSymbolFromName("hello-world")).toBe("HW");
    expect(deriveSymbolFromName("  ")).toBe("TOKEN");
  });

  test("returns successful launch payload and emits completed action", async () => {
    const launchOrchestrator = {
      deployAndPersistLaunch: jest.fn(async () => ({
        deployed: {
          tokenAddress: "0x123450000000000000000000000000000000abcd",
          poolAddress: "0x456780000000000000000000000000000000abcd",
          creatorAddress: "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1",
          quoteTokenAddress: "0x999990000000000000000000000000000000abcd",
          transactions: {
            launch: "0xlaunch",
            deploy: "0xlaunch",
            tokenTransfer: null,
            ownershipTransfer: null,
          },
          network: { chainId: 420420417, name: "polkadot_hub_testnet" },
        },
        launchRecordId: "launch_1",
        launchStatus: "completed",
      })),
    };
    const emitActions = jest.fn();
    const tool = createLaunchTokenTool({
      launchOrchestrator,
      emitActions,
      walletAddress: "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1",
    });

    const raw = await tool.invoke({ name: "Fast Fun Token" });
    const parsed = JSON.parse(raw);

    expect(parsed).toMatchObject({
      success: true,
      name: "Fast Fun Token",
      symbol: "FFT",
      tokenAddress: "0x123450000000000000000000000000000000abcd",
      launchStatus: "completed",
    });
    expect(launchOrchestrator.deployAndPersistLaunch).toHaveBeenCalledWith({
      name: "Fast Fun Token",
      symbol: "FFT",
      creatorAddress: getAddress("0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1"),
    });
    expect(emitActions).toHaveBeenCalledWith([
      expect.objectContaining({
        tool: "launch_token",
        status: "completed",
      }),
    ]);
  });

  test("returns failure payload and emits failed action when launch fails", async () => {
    const launchOrchestrator = {
      deployAndPersistLaunch: jest.fn(async () => {
        const error = new Error("Priority is too low");
        error.code = "ON_CHAIN_TRANSACTION_FAILED";
        error.details = {
          name: "ffr token",
          symbol: "FFR",
          creatorAddress: "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1",
          launchStatus: "failed",
          recovery: "RPC rejected the launch transaction as too low priority.",
        };
        throw error;
      }),
    };
    const emitActions = jest.fn();
    const tool = createLaunchTokenTool({
      launchOrchestrator,
      emitActions,
      walletAddress: "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1",
    });

    const raw = await tool.invoke({ name: "ffr token" });
    const parsed = JSON.parse(raw);

    expect(parsed).toMatchObject({
      success: false,
      name: "ffr token",
      symbol: "FFR",
      launchStatus: "failed",
      errorCode: "ON_CHAIN_TRANSACTION_FAILED",
      errorMessage: "RPC rejected the launch transaction as too low priority.",
    });
    expect(emitActions).toHaveBeenCalledWith([
      expect.objectContaining({
        tool: "launch_token",
        status: "failed",
      }),
    ]);
  });
});
