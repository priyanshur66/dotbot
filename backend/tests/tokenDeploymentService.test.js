const {
  TOKEN_DECIMALS,
  TOKEN_SUPPLY,
  createTokenDeploymentService,
} = require("../src/services/tokenDeploymentService");
const { OnChainError } = require("../src/lib/errors");

function fullSupplyUnits() {
  return BigInt(TOKEN_SUPPLY) * 10n ** BigInt(TOKEN_DECIMALS);
}

function buildMocks(options = {}) {
  const order = [];
  const network = options.network || { chainId: 11155111n, name: "sepolia" };

  let transferAttempt = 0;
  let ownershipAttempt = 0;

  const provider = {
    getNetwork: jest.fn(async () => {
      order.push("getNetwork");
      return network;
    }),
    getCode: jest.fn(async () => {
      order.push("getCode");
      if (Array.isArray(options.codeSequence) && options.codeSequence.length > 0) {
        return options.codeSequence.shift();
      }
      return "0x60016001";
    }),
    getTransactionCount: jest.fn(async () => {
      order.push("getTransactionCount");
      return 1;
    }),
    getFeeData: jest.fn(async () => {
      order.push("getFeeData");
      return {
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 1n,
        gasPrice: 10n,
      };
    }),
  };

  const wallet = {
    address: "0x9999999999999999999999999999999999999999",
  };

  const deployTx = { hash: "0xdeploytx" };
  const transferTx = {
    hash: "0xtransfertx",
    wait: jest.fn(async () => {
      order.push("waitTransferTx");
      return { status: 1 };
    }),
  };
  const ownershipTx = {
    hash: "0xownershiptx",
    wait: jest.fn(async () => {
      order.push("waitOwnershipTx");
      return { status: 1 };
    }),
  };

  const deployContract = {
    deploymentTransaction: jest.fn(() => {
      order.push("deploymentTransaction");
      return deployTx;
    }),
    waitForDeployment: jest.fn(async () => {
      order.push("waitForDeployment");
    }),
    getAddress: jest.fn(async () => {
      order.push("getAddress");
      return "0x123450000000000000000000000000000000abcd";
    }),
  };

  const handoffContract = {
    transfer: jest.fn(async () => {
      order.push("transfer");
      transferAttempt += 1;
      if (transferAttempt <= (options.transferFailures || 0)) {
        throw new Error("transfer failed");
      }
      return transferTx;
    }),
    transferOwnership: jest.fn(async () => {
      order.push("transferOwnership");
      ownershipAttempt += 1;
      if (ownershipAttempt <= (options.ownershipFailures || 0)) {
        throw new Error("ownership failed");
      }
      return ownershipTx;
    }),
  };

  const factory = {
    deploy: jest.fn(async () => {
      order.push("deploy");
      return deployContract;
    }),
  };

  const ethersLib = {
    JsonRpcProvider: jest.fn(() => provider),
    Wallet: jest.fn(() => wallet),
    ContractFactory: jest.fn(() => factory),
    Contract: jest.fn(() => handoffContract),
    parseUnits: jest.fn((value, decimals) => BigInt(value) * 10n ** BigInt(decimals)),
  };

  return {
    order,
    provider,
    wallet,
    deployContract,
    handoffContract,
    factory,
    transferTx,
    ownershipTx,
    ethersLib,
  };
}

describe("token deployment service", () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.DEPLOY_HANDOFF_BACKOFF_MS = "1";
    process.env.DEPLOY_CODE_READY_POLL_MS = "1";
    process.env.DEPLOY_HANDOFF_MAX_ATTEMPTS = "3";
    process.env.DEPLOY_CODE_READY_MAX_ATTEMPTS = "3";
    process.env.DEPLOY_TX_MAX_ATTEMPTS = "3";
    process.env.DEPLOY_TX_PRIORITY_BUMP_WEI = "5000000000";
    process.env.DEPLOY_TX_MIN_PRIORITY_FEE_WEI = "5000000000";
    process.env.DEPLOY_TX_MIN_MAX_FEE_WEI = "25000000000";
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  test("detects network from provider", async () => {
    const mocks = buildMocks({
      network: { chainId: 8453n, name: "base" },
    });
    const compileMock = jest.fn(async () => ({
      abi: [],
      bytecode: "0x6000",
    }));

    const service = createTokenDeploymentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      compiler: compileMock,
      ethersLib: mocks.ethersLib,
    });

    await service.init();
    const network = await service.getNetwork();

    expect(network).toEqual({
      chainId: 8453,
      name: "base",
    });
    expect(mocks.provider.getNetwork).toHaveBeenCalledTimes(1);
  });

  test("deploys then hands off fixed full supply and ownership", async () => {
    const mocks = buildMocks();
    const compileMock = jest.fn(async () => ({
      abi: [{ type: "constructor" }],
      bytecode: "0x6000",
    }));

    const service = createTokenDeploymentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      compiler: compileMock,
      ethersLib: mocks.ethersLib,
    });

    await service.init();
    const result = await service.deployToken({
      name: "Token",
      symbol: "TOK",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(compileMock).toHaveBeenCalledTimes(1);
    expect(mocks.factory.deploy).toHaveBeenCalledTimes(1);
    const deployCallArgs = mocks.factory.deploy.mock.calls[0];
    expect(deployCallArgs[0]).toBe("Token");
    expect(deployCallArgs[1]).toBe("TOK");
    expect(deployCallArgs[2]).toEqual(
      expect.objectContaining({
        nonce: 1,
        maxPriorityFeePerGas: 5_000_000_000n,
        maxFeePerGas: 25_000_000_000n,
      })
    );
    expect(mocks.handoffContract.transfer).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      fullSupplyUnits()
    );
    expect(mocks.handoffContract.transferOwnership).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111"
    );
    expect(result.transactions).toEqual({
      deploy: "0xdeploytx",
      tokenTransfer: "0xtransfertx",
      ownershipTransfer: "0xownershiptx",
    });
    expect(mocks.order).toContain("getCode");
    expect(mocks.order).not.toContain("balanceOf");
  });

  test("retries handoff steps and rebinds contract", async () => {
    process.env.DEPLOY_HANDOFF_MAX_ATTEMPTS = "3";
    const mocks = buildMocks({ transferFailures: 1 });
    const compileMock = jest.fn(async () => ({
      abi: [],
      bytecode: "0x6000",
    }));

    const service = createTokenDeploymentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      compiler: compileMock,
      ethersLib: mocks.ethersLib,
    });

    await service.deployToken({
      name: "Token",
      symbol: "TOK",
      finalOwnerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(mocks.handoffContract.transfer).toHaveBeenCalledTimes(2);
    expect(mocks.ethersLib.Contract).toHaveBeenCalled();
    expect(mocks.ethersLib.Contract.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test("returns partial failure metadata if handoff retries are exhausted", async () => {
    process.env.DEPLOY_HANDOFF_MAX_ATTEMPTS = "2";
    const mocks = buildMocks({ ownershipFailures: 5 });
    const compileMock = jest.fn(async () => ({
      abi: [],
      bytecode: "0x6000",
    }));

    const service = createTokenDeploymentService({
      rpcUrl: "http://localhost:8545",
      backendPrivateKey:
        "0x59c6995e998f97a5a0044966f0945382d5f6c6dbe8ec44f6f4eb6ac7b5f4b531",
      compiler: compileMock,
      ethersLib: mocks.ethersLib,
    });

    await expect(
      service.deployToken({
        name: "Token",
        symbol: "TOK",
        finalOwnerAddress: "0x1111111111111111111111111111111111111111",
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "ON_CHAIN_TRANSACTION_FAILED",
      details: {
        partialFailure: true,
        tokenAddress: "0x123450000000000000000000000000000000abcd",
        transactions: {
          deploy: "0xdeploytx",
          tokenTransfer: "0xtransfertx",
          ownershipTransfer: null,
        },
      },
    });

    try {
      await service.deployToken({
        name: "Token",
        symbol: "TOK",
        finalOwnerAddress: "0x1111111111111111111111111111111111111111",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OnChainError);
      expect(error.details.recovery).toContain("backend wallet still controls recovery");
    }
  });
});
