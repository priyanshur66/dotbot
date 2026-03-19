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

  const app = createApp({
    deploymentService,
    tokenRegistryService,
    envStatus: {
      rpcUrlConfigured: true,
      backendPrivateKeyConfigured: true,
      convexUrlConfigured: true,
    },
    ...overrides,
  });

  return { app, deploymentService, tokenRegistryService };
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

  test("POST /api/tokens/deploy happy path shape", async () => {
    const { app, deploymentService, tokenRegistryService } = makeTestApp();
    deploymentService.deployToken.mockResolvedValue({
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
    });
    tokenRegistryService.createLaunchRecord.mockResolvedValue({
      id: "convex-record-id",
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
    });
    expect(deploymentService.deployToken).toHaveBeenCalledTimes(1);
    expect(deploymentService.deployToken).toHaveBeenCalledWith({
      name: "My Token",
      symbol: "MTK",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(tokenRegistryService.createLaunchRecord).toHaveBeenCalledWith({
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
    });
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
});
