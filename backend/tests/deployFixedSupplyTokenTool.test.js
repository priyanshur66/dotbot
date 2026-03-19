const { getAddress } = require("ethers");
const {
  createDeployFixedSupplyTokenTool,
  deriveSymbolFromName,
} = require("../src/agent/tools/deployFixedSupplyTokenTool");

describe("deployFixedSupplyTokenTool defaults", () => {
  test("derives symbol from token name", () => {
    expect(deriveSymbolFromName("Alpha Beta Token")).toBe("ABT");
    expect(deriveSymbolFromName("hello-world")).toBe("HW");
    expect(deriveSymbolFromName("  ")).toBe("TOKEN");
  });

  test("always uses connected wallet address and auto-derived symbol", async () => {
    const launchOrchestrator = {
      deployAndPersistLaunch: jest.fn(async () => ({
        deployed: {
          tokenAddress: "0x123450000000000000000000000000000000abcd",
          ownerAddress: "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1",
          launchedByAddress: "0x6574a247978Ee3074DffD1d9626Ed5BC7DD28b46",
          network: { chainId: 420420417, name: "unknown" },
          decimals: 18,
          totalSupply: "1000000000",
          transactions: {
            deploy: "0xdeploy",
            tokenTransfer: "0xtransfer",
            ownershipTransfer: "0xownership",
          },
        },
        launchRecordId: "launch_1",
        launchStatus: "completed",
      })),
    };
    const emitActions = jest.fn();
    const connectedWalletAddress = "0x2c60e247978Ee3074DffD1d9626Ed5BC7DD211C1";
    const tool = createDeployFixedSupplyTokenTool({
      launchOrchestrator,
      deploymentService: null,
      emitActions,
      walletAddress: connectedWalletAddress,
    });

    await tool.invoke({
      name: "Alpha Beta Token",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      adminAddress: "0x1111111111111111111111111111111111111111",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(launchOrchestrator.deployAndPersistLaunch).toHaveBeenCalledWith({
      name: "Alpha Beta Token",
      symbol: "ABT",
      finalOwnerAddress: getAddress(connectedWalletAddress),
    });
    expect(emitActions).toHaveBeenCalledTimes(1);
  });
});
