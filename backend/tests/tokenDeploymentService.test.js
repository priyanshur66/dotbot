const {
  createTokenDeploymentService,
} = require("../src/services/tokenDeploymentService");
const { OnChainError } = require("../src/lib/errors");

function buildMocks(options = {}) {
  const order = [];
  const network = options.network || { chainId: 11155111n, name: "sepolia" };

  const provider = {
    getNetwork: jest.fn(async () => {
      order.push("getNetwork");
      return network;
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

  const contract = {
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
    balanceOf: jest.fn(async () => {
      order.push("balanceOf");
      return 1000n;
    }),
    transfer: jest.fn(async () => {
      order.push("transfer");
      if (options.transferFailure) {
        throw new Error("transfer failed");
      }
      return transferTx;
    }),
    transferOwnership: jest.fn(async () => {
      order.push("transferOwnership");
      if (options.ownershipFailure) {
        throw new Error("ownership failed");
      }
      return ownershipTx;
    }),
  };

  const factory = {
    deploy: jest.fn(async () => {
      order.push("deploy");
      return contract;
    }),
  };

  const ethersLib = {
    JsonRpcProvider: jest.fn(() => provider),
    Wallet: jest.fn(() => wallet),
    ContractFactory: jest.fn(() => factory),
  };

  return {
    order,
    provider,
    wallet,
    contract,
    factory,
    transferTx,
    ownershipTx,
    ethersLib,
  };
}

describe("token deployment service", () => {
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

  test("deploys then transfers tokens then transfers ownership", async () => {
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
    expect(mocks.factory.deploy).toHaveBeenCalledWith("Token", "TOK");
    expect(mocks.contract.transfer).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      1000n
    );
    expect(mocks.contract.transferOwnership).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111"
    );
    expect(result.transactions).toEqual({
      deploy: "0xdeploytx",
      tokenTransfer: "0xtransfertx",
      ownershipTransfer: "0xownershiptx",
    });
    expect(mocks.order).toEqual([
      "getNetwork",
      "deploy",
      "deploymentTransaction",
      "waitForDeployment",
      "getAddress",
      "balanceOf",
      "transfer",
      "waitTransferTx",
      "transferOwnership",
      "waitOwnershipTx",
    ]);
  });

  test("returns partial failure metadata if post-deploy step fails", async () => {
    const mocks = buildMocks({ ownershipFailure: true });
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
