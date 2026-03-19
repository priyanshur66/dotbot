const ethers = require("ethers");
const { compileTokenContract } = require("./contractCompiler");
const { ConfigError, OnChainError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

const TOKEN_DECIMALS = 18;
const TOKEN_SUPPLY = "1000000000";

function toNetworkInfo(network) {
  return {
    chainId: Number(network.chainId),
    name: network.name,
  };
}

function createTokenDeploymentService({
  rpcUrl,
  backendPrivateKey,
  compiler = compileTokenContract,
  ethersLib = ethers,
  logger,
}) {
  const serviceLogger = logger || createNoopLogger();

  if (!rpcUrl) {
    serviceLogger.error({
      operation: "service.deployment.create",
      stage: "validate.config",
      status: "failure",
      context: {
        missing: "rpcUrl",
      },
    });
    throw new ConfigError("RPC_URL is required for deployment service");
  }
  if (!backendPrivateKey) {
    serviceLogger.error({
      operation: "service.deployment.create",
      stage: "validate.config",
      status: "failure",
      context: {
        missing: "backendPrivateKey",
      },
    });
    throw new ConfigError("BACKEND_PRIVATE_KEY is required for deployment service");
  }

  const provider = new ethersLib.JsonRpcProvider(rpcUrl);
  const wallet = new ethersLib.Wallet(backendPrivateKey, provider);

  let compiledArtifactPromise;

  function getCompiledArtifact() {
    if (!compiledArtifactPromise) {
      const compileStartedAt = Date.now();
      serviceLogger.info({
        operation: "service.deployment.compile",
        stage: "start",
        status: "start",
      });

      compiledArtifactPromise = compiler()
        .then((artifact) => {
          serviceLogger.info({
            operation: "service.deployment.compile",
            stage: "success",
            status: "success",
            durationMs: Date.now() - compileStartedAt,
            context: {
              abiItems: Array.isArray(artifact?.abi) ? artifact.abi.length : undefined,
              hasBytecode: Boolean(artifact?.bytecode),
            },
          });
          return artifact;
        })
        .catch((error) => {
          compiledArtifactPromise = undefined;
          serviceLogger.error({
            operation: "service.deployment.compile",
            stage: "failure",
            status: "failure",
            durationMs: Date.now() - compileStartedAt,
            error,
          });
          throw error;
        });
    } else {
      serviceLogger.debug({
        operation: "service.deployment.compile",
        stage: "cache.hit",
        status: "success",
      });
    }
    return compiledArtifactPromise;
  }

  async function init() {
    const startedAt = Date.now();
    serviceLogger.info({
      operation: "service.deployment.init",
      stage: "start",
      status: "start",
    });
    await getCompiledArtifact();
    serviceLogger.info({
      operation: "service.deployment.init",
      stage: "success",
      status: "success",
      durationMs: Date.now() - startedAt,
    });
  }

  async function getNetwork() {
    const startedAt = Date.now();
    serviceLogger.info({
      operation: "service.deployment.network",
      stage: "start",
      status: "start",
    });
    try {
      const network = await provider.getNetwork();
      const normalized = toNetworkInfo(network);
      serviceLogger.info({
        operation: "service.deployment.network",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          network: normalized,
        },
      });
      return normalized;
    } catch (error) {
      serviceLogger.error({
        operation: "service.deployment.network",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  async function deployToken({ name, symbol, finalOwnerAddress }) {
    const operation = "service.deployment.deploy";
    const startedAt = Date.now();
    let artifact;
    let network;
    let stage = "prepare";
    const transactions = {
      deploy: null,
      tokenTransfer: null,
      ownershipTransfer: null,
    };

    let tokenAddress;

    try {
      serviceLogger.info({
        operation,
        stage: "start",
        status: "start",
        context: {
          name,
          symbol,
          finalOwnerAddress,
          deployerAddress: wallet.address,
        },
      });

      stage = "compileArtifact";
      artifact = await getCompiledArtifact();

      stage = "getNetwork";
      network = await getNetwork();

      stage = "createFactory";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
        context: {
          network,
        },
      });
      const factory = new ethersLib.ContractFactory(
        artifact.abi,
        artifact.bytecode,
        wallet
      );
      serviceLogger.info({
        operation,
        stage,
        status: "success",
      });

      stage = "contractDeploy";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      const contract = await factory.deploy(name, symbol);
      const deployTx = contract.deploymentTransaction();
      transactions.deploy = deployTx?.hash || null;
      serviceLogger.info({
        operation,
        stage,
        status: "success",
        context: {
          deployTxHash: transactions.deploy,
        },
      });

      stage = "waitForDeployment";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      await contract.waitForDeployment();
      tokenAddress = await contract.getAddress();
      serviceLogger.info({
        operation,
        stage,
        status: "success",
        context: {
          tokenAddress,
        },
      });

      stage = "transferTokens";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      const currentBalance = await contract.balanceOf(wallet.address);
      const transferTx = await contract.transfer(finalOwnerAddress, currentBalance);
      transactions.tokenTransfer = transferTx.hash;
      await transferTx.wait();
      serviceLogger.info({
        operation,
        stage,
        status: "success",
        context: {
          transferTxHash: transactions.tokenTransfer,
          transferAmount: currentBalance.toString(),
        },
      });

      stage = "transferOwnership";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      const ownershipTx = await contract.transferOwnership(finalOwnerAddress);
      transactions.ownershipTransfer = ownershipTx.hash;
      await ownershipTx.wait();
      serviceLogger.info({
        operation,
        stage,
        status: "success",
        context: {
          ownershipTxHash: transactions.ownershipTransfer,
        },
      });

      const result = {
        tokenAddress,
        ownerAddress: finalOwnerAddress,
        launchedByAddress: wallet.address,
        network,
        decimals: TOKEN_DECIMALS,
        totalSupply: TOKEN_SUPPLY,
        transactions,
      };

      serviceLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          tokenAddress: result.tokenAddress,
          ownerAddress: result.ownerAddress,
          network: result.network,
          transactions: result.transactions,
        },
      });
      return result;
    } catch (error) {
      if (error?.code === "CONTRACT_COMPILE_FAILED") {
        error.operation = operation;
        error.stage = stage;
        serviceLogger.error({
          operation,
          stage,
          status: "failure",
          durationMs: Date.now() - startedAt,
          error,
          context: {
            name,
            symbol,
            finalOwnerAddress,
          },
        });
        throw error;
      }

      const details = {
        stage,
        tokenAddress: tokenAddress || null,
        ownerAddress: finalOwnerAddress,
        launchedByAddress: wallet.address,
        network: network || null,
        decimals: TOKEN_DECIMALS,
        totalSupply: TOKEN_SUPPLY,
        transactions,
        partialFailure: Boolean(tokenAddress),
      };

      let errorMessage = "Failed during on-chain deployment flow";

      if (tokenAddress) {
        errorMessage =
          "Token contract deployed, but final handoff failed during post-deploy transactions";
        details.recovery =
          "Deployment succeeded but handoff did not fully complete. The backend wallet still controls recovery and can retry token/ownership transfer.";
      }

      const onChainError = new OnChainError(errorMessage, details, error);
      onChainError.operation = operation;
      onChainError.stage = stage;

      serviceLogger.error({
        operation,
        stage,
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: onChainError,
        context: {
          name,
          symbol,
          finalOwnerAddress,
          transactions,
          tokenAddress: tokenAddress || null,
          partialFailure: Boolean(tokenAddress),
        },
      });

      throw onChainError;
    }
  }

  return {
    init,
    getNetwork,
    getDeployerAddress: () => wallet.address,
    deployToken,
  };
}

module.exports = {
  TOKEN_DECIMALS,
  TOKEN_SUPPLY,
  createTokenDeploymentService,
};
