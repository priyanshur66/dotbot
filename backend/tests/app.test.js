const request = require("supertest");
const { createApp } = require("../src/app");

function makeTestApp(overrides = {}) {
  const deploymentService = {
    deployToken: jest.fn(),
  };
  const tokenRegistryService = {
    createLaunchRecord: jest.fn(),
    listAllTokenLaunches: jest.fn(),
    listTokenLaunchesByOwner: jest.fn(),
  };
  const launchOrchestrator = {
    deployAndPersistLaunch: jest.fn(),
  };
  const chatHistoryService = {
    createThread: jest.fn(),
    listThreadsByWallet: jest.fn(),
    getThreadWithMessages: jest.fn(),
    appendMessage: jest.fn(),
  };
  const agentService = {
    chat: jest.fn(),
    getNetworkInfo: jest.fn(async () => ({
      chainId: 420420417,
      name: "polkadot_hub_testnet",
    })),
  };

  const app = createApp({
    deploymentService,
    tokenRegistryService,
    launchOrchestrator,
    chatHistoryService,
    agentService,
    envStatus: {
      rpcUrlConfigured: true,
      rpcWriteUrlConfigured: true,
      backendPrivateKeyConfigured: true,
      convexUrlConfigured: true,
    },
    ...overrides,
  });

  return {
    app,
    deploymentService,
    tokenRegistryService,
    launchOrchestrator,
    chatHistoryService,
    agentService,
  };
}

describe("API", () => {
  test("GET /health returns status and env presence", async () => {
    const { app } = makeTestApp();
    const response = await request(app).get("/health");
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      env: {
        rpcUrlConfigured: true,
        rpcWriteUrlConfigured: true,
        backendPrivateKeyConfigured: true,
        convexUrlConfigured: true,
      },
    });
  });

  test("POST /api/tokens/deploy returns 400 for missing name", async () => {
    const { app } = makeTestApp();
    const response = await request(app).post("/api/tokens/deploy").send({
      symbol: "TOK",
      ownerAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("BAD_REQUEST");
  });

  test("POST /api/tokens/deploy returns 400 for missing symbol", async () => {
    const { app } = makeTestApp();
    const response = await request(app).post("/api/tokens/deploy").send({
      name: "Token",
      ownerAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("BAD_REQUEST");
  });

  test("POST /api/tokens/deploy returns 400 for missing owner/admin", async () => {
    const { app } = makeTestApp();
    const response = await request(app).post("/api/tokens/deploy").send({
      name: "Token",
      symbol: "TOK",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("BAD_REQUEST");
  });

  test("POST /api/tokens/deploy returns 400 when owner/admin mismatch", async () => {
    const { app } = makeTestApp();
    const response = await request(app).post("/api/tokens/deploy").send({
      name: "Token",
      symbol: "TOK",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      adminAddress: "0x2222222222222222222222222222222222222222",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("BAD_REQUEST");
  });

  test("POST /api/tokens/deploy returns 400 for invalid address", async () => {
    const { app } = makeTestApp();
    const response = await request(app).post("/api/tokens/deploy").send({
      name: "Token",
      symbol: "TOK",
      ownerAddress: "not-an-address",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("BAD_REQUEST");
  });

  test("POST /api/tokens/deploy uses launch orchestrator and returns launch status", async () => {
    const { app, launchOrchestrator, tokenRegistryService } = makeTestApp();
    launchOrchestrator.deployAndPersistLaunch.mockResolvedValue({
      launchRecordId: "convex-record-id",
      launchStatus: "completed",
      deployed: {
        tokenAddress: "0x3333333333333333333333333333333333333333",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        launchedByAddress: "0x9999999999999999999999999999999999999999",
        network: {
          chainId: 8453,
          name: "base",
        },
        decimals: 18,
        totalSupply: "1000000000",
        transactions: {
          deploy: "0xdeploy",
          tokenTransfer: "0xtransfer",
          ownershipTransfer: "0xownership",
        },
      },
    });

    const response = await request(app).post("/api/tokens/deploy").send({
      name: "My Token",
      symbol: "MTK",
      ownerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({
      tokenAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      launchedByAddress: "0x9999999999999999999999999999999999999999",
      network: {
        chainId: 8453,
        name: "base",
      },
      decimals: 18,
      totalSupply: "1000000000",
      transactions: {
        deploy: "0xdeploy",
        tokenTransfer: "0xtransfer",
        ownershipTransfer: "0xownership",
      },
      launchRecordId: "convex-record-id",
      launchStatus: "completed",
    });
    expect(launchOrchestrator.deployAndPersistLaunch).toHaveBeenCalledWith({
      name: "My Token",
      symbol: "MTK",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(tokenRegistryService.createLaunchRecord).not.toHaveBeenCalled();
  });

  test("GET /api/tokens/launched returns stored launch records", async () => {
    const { app, tokenRegistryService } = makeTestApp();
    tokenRegistryService.listAllTokenLaunches.mockResolvedValue([
      {
        id: "1",
        tokenAddress: "0x3333333333333333333333333333333333333333",
        ownerAddress: "0x1111111111111111111111111111111111111111",
      },
    ]);

    const response = await request(app).get("/api/tokens/launched");
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      count: 1,
      tokens: [
        {
          id: "1",
          tokenAddress: "0x3333333333333333333333333333333333333333",
          ownerAddress: "0x1111111111111111111111111111111111111111",
        },
      ],
    });
  });

  test("GET /api/tokens/by-owner/:ownerAddress returns filtered records", async () => {
    const { app, tokenRegistryService } = makeTestApp();
    tokenRegistryService.listTokenLaunchesByOwner.mockResolvedValue([
      {
        id: "1",
        tokenAddress: "0x3333333333333333333333333333333333333333",
        ownerAddress: "0x1111111111111111111111111111111111111111",
      },
    ]);

    const response = await request(app).get(
      "/api/tokens/by-owner/0x1111111111111111111111111111111111111111"
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      ownerAddress: "0x1111111111111111111111111111111111111111",
      count: 1,
      tokens: [
        {
          id: "1",
          tokenAddress: "0x3333333333333333333333333333333333333333",
          ownerAddress: "0x1111111111111111111111111111111111111111",
        },
      ],
    });
    expect(tokenRegistryService.listTokenLaunchesByOwner).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111"
    );
  });

  test("POST /api/agent/threads creates a thread", async () => {
    const { app, chatHistoryService } = makeTestApp();
    chatHistoryService.createThread.mockResolvedValue({
      thread: {
        id: "thread_1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        title: "Deploy token",
        lastMessageAt: 1742370000000,
        createdAt: 1742369000000,
      },
    });

    const response = await request(app).post("/api/agent/threads").send({
      walletAddress: "0x1111111111111111111111111111111111111111",
      title: "Deploy token",
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.thread.id).toBe("thread_1");
  });

  test("GET /api/agent/threads lists wallet threads", async () => {
    const { app, chatHistoryService } = makeTestApp();
    chatHistoryService.listThreadsByWallet.mockResolvedValue({
      walletAddress: "0x1111111111111111111111111111111111111111",
      threads: [
        {
          id: "thread_1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          title: "Deploy token",
          lastMessageAt: 1742370000000,
          createdAt: 1742369000000,
        },
      ],
    });

    const response = await request(app).get(
      "/api/agent/threads?walletAddress=0x1111111111111111111111111111111111111111"
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.threads[0].id).toBe("thread_1");
  });

  test("GET /api/agent/threads/:threadId returns thread + messages", async () => {
    const { app, chatHistoryService } = makeTestApp();
    chatHistoryService.getThreadWithMessages.mockResolvedValue({
      thread: {
        id: "thread_1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        title: "Deploy token",
        lastMessageAt: 1742370000000,
        createdAt: 1742369000000,
      },
      messages: [
        {
          id: "msg_1",
          threadId: "thread_1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          role: "user",
          content: "deploy token",
          actions: [],
          createdAt: 1742369001000,
          requestId: "req_1",
        },
      ],
    });

    const response = await request(app).get(
      "/api/agent/threads/thread_1?walletAddress=0x1111111111111111111111111111111111111111"
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.thread.id).toBe("thread_1");
    expect(response.body.messages).toHaveLength(1);
  });

  test("POST /api/agent/threads/:threadId/reply persists user then assistant", async () => {
    const { app, chatHistoryService, agentService } = makeTestApp();
    const appendOrder = [];

    chatHistoryService.appendMessage
      .mockImplementationOnce(async () => {
        appendOrder.push("user");
        return {
          message: {
            id: "msg_user",
            threadId: "thread_1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            role: "user",
            content: "deploy adf token",
            actions: [],
            createdAt: 1742369001000,
            requestId: "req_1",
          },
          thread: {
            id: "thread_1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            title: "Deploy adf token",
            lastMessageAt: 1742369001000,
            createdAt: 1742369000000,
          },
        };
      })
      .mockImplementationOnce(async () => {
        appendOrder.push("assistant");
        return {
          message: {
            id: "msg_assistant",
            threadId: "thread_1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            role: "assistant",
            content: "Deployment prepared.",
            actions: [{ id: "act_1", tool: "deploy_fixed_supply_token" }],
            createdAt: 1742369002000,
            requestId: "req_1",
          },
          thread: {
            id: "thread_1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            title: "Deploy adf token",
            lastMessageAt: 1742369002000,
            createdAt: 1742369000000,
          },
        };
      });

    chatHistoryService.getThreadWithMessages.mockResolvedValue({
      thread: {
        id: "thread_1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        title: "Deploy adf token",
        lastMessageAt: 1742369001000,
        createdAt: 1742369000000,
      },
      messages: [
        {
          id: "msg_user",
          threadId: "thread_1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          role: "user",
          content: "deploy adf token",
          actions: [],
          createdAt: 1742369001000,
          requestId: "req_1",
        },
      ],
    });

    agentService.chat.mockResolvedValue({
      message: "Deployment prepared.",
      actions: [{ id: "act_1", tool: "deploy_fixed_supply_token" }],
      network: { chainId: 420420417, name: "polkadot_hub_testnet" },
      backendWalletAddress: "0x9999999999999999999999999999999999999999",
      model: "openai/gpt-4.1-mini",
    });

    const response = await request(app)
      .post("/api/agent/threads/thread_1/reply")
      .send({
        walletAddress: "0x1111111111111111111111111111111111111111",
        content: "deploy adf token",
        stream: false,
      });

    expect(response.statusCode).toBe(200);
    expect(appendOrder).toEqual(["user", "assistant"]);
    expect(response.body.message.id).toBe("msg_assistant");
    expect(response.body.actions).toEqual([{ id: "act_1", tool: "deploy_fixed_supply_token" }]);
  });
});
