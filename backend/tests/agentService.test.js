const mockExecuteChat = jest.fn();
const mockGetNetwork = jest.fn();

jest.mock("ethers", () => {
  const mockProvider = {
    getNetwork: (...args) => mockGetNetwork(...args),
  };
  return {
    JsonRpcProvider: jest.fn(() => mockProvider),
    Wallet: jest.fn(() => ({
      address: "0x9999999999999999999999999999999999999999",
    })),
  };
});

jest.mock("../src/agent/llm/openRouterModel", () => ({
  DEFAULT_OPENROUTER_MODEL: "openai/gpt-4.1-mini",
  createOpenRouterModel: jest.fn(() => ({
    bindTools: jest.fn(),
  })),
}));

jest.mock("../src/agent/runtime/agentExecutor", () => ({
  createAgentExecutor: jest.fn(() => ({
    executeChat: (...args) => mockExecuteChat(...args),
  })),
}));

const { createAgentService } = require("../src/agent");
const { ConfigError } = require("../src/lib/errors");

describe("agent service chain enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteChat.mockReset();
    mockGetNetwork.mockReset();
  });

  test("uses backend chain id for agent execution even if client sends mismatched chain id", async () => {
    mockGetNetwork.mockResolvedValue({
      chainId: 420420417n,
      name: "polkadot_hub_testnet",
    });
    mockExecuteChat.mockResolvedValue({
      message: "ok",
      actions: [],
    });

    const service = createAgentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      openRouterApiKey: "test-key",
      deploymentService: {},
      launchOrchestrator: { deployAndPersistLaunch: jest.fn() },
    });

    await service.chat({
      messages: [{ role: "user", content: "hello" }],
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 1,
    });

    expect(mockExecuteChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 420420417,
        walletAddress: "0x1111111111111111111111111111111111111111",
      })
    );
  });

  test("throws ConfigError when backend RPC is not Polkadot Hub TestNet", async () => {
    mockGetNetwork.mockResolvedValue({
      chainId: 1n,
      name: "mainnet",
    });

    const service = createAgentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      openRouterApiKey: "test-key",
      deploymentService: {},
      launchOrchestrator: { deployAndPersistLaunch: jest.fn() },
    });

    await expect(
      service.chat({
        messages: [{ role: "user", content: "hello" }],
        walletAddress: "0x1111111111111111111111111111111111111111",
        chainId: 420420417,
      })
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
