const { createAgentExecutor } = require("../src/agent/runtime/agentExecutor");
const { AgentToolExecutionError } = require("../src/lib/errors");

const mockToolInvoke = jest.fn();

jest.mock("../src/agent/tools", () => ({
  createAgentTools: jest.fn(() => [
    {
      name: "deploy_fixed_supply_token",
      invoke: (...args) => mockToolInvoke(...args),
    },
  ]),
}));

describe("agent executor tool error wrapping", () => {
  beforeEach(() => {
    mockToolInvoke.mockReset();
  });

  test("preserves underlying tool failure message and details", async () => {
    const model = {
      bindTools: jest.fn(() => ({
        invoke: jest.fn(async () => ({
          content: "",
          tool_calls: [
            {
              id: "call_1",
              name: "deploy_fixed_supply_token",
              args: {
                name: "hhg",
                symbol: "hhg",
              },
            },
          ],
        })),
      })),
    };

    const toolError = new Error("Failed during on-chain deployment flow");
    toolError.code = "ON_CHAIN_TRANSACTION_FAILED";
    toolError.statusCode = 502;
    toolError.details = {
      recovery:
        "RPC rejected tx with low priority in transaction pool. Configure RPC_WRITE_URL and retry.",
      tokenAddress: "0x123450000000000000000000000000000000abcd",
    };
    mockToolInvoke.mockRejectedValue(toolError);

    const executor = createAgentExecutor({
      model,
      provider: {},
      backendSigner: { address: "0x9999999999999999999999999999999999999999" },
      deploymentService: {},
      launchOrchestrator: {},
    });

    await expect(
      executor.executeChat({
        messages: [{ role: "user", content: "deploy hhg token" }],
        walletAddress: "0x1111111111111111111111111111111111111111",
        chainId: 420420417,
        systemPrompt: "system",
      })
    ).rejects.toMatchObject({
      name: AgentToolExecutionError.name,
      message: "Failed during on-chain deployment flow",
      details: expect.objectContaining({
        tool: "deploy_fixed_supply_token",
        toolErrorCode: "ON_CHAIN_TRANSACTION_FAILED",
        toolErrorStatusCode: 502,
        recovery:
          "RPC rejected tx with low priority in transaction pool. Configure RPC_WRITE_URL and retry.",
        tokenAddress: "0x1234...abcd",
      }),
    });
  });
});
