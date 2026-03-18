const request = require("supertest");
const { createApp } = require("../src/app");

function makeTestApp(overrides = {}) {
  const deploymentService = {
    deployToken: jest.fn(),
  };

  const app = createApp({
    deploymentService,
    envStatus: {
      rpcUrlConfigured: true,
      backendPrivateKeyConfigured: true,
    },
    ...overrides,
  });

  return { app, deploymentService };
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
    const { app, deploymentService } = makeTestApp();
    deploymentService.deployToken.mockResolvedValue({
      tokenAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x1111111111111111111111111111111111111111",
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

    const response = await request(app).post("/api/tokens/deploy").send({
      name: "My Token",
      symbol: "MTK",
      ownerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({
      tokenAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x1111111111111111111111111111111111111111",
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
    expect(deploymentService.deployToken).toHaveBeenCalledTimes(1);
    expect(deploymentService.deployToken).toHaveBeenCalledWith({
      name: "My Token",
      symbol: "MTK",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });
  });
});
