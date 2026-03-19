const ethers = require("ethers");
const { compileTokenContract } = require("./contractCompiler");
const { ConfigError, OnChainError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

const TOKEN_DECIMALS = 18;
const TOKEN_SUPPLY = "1000000000";
const DEFAULT_DEPLOY_MAX_ATTEMPTS = 3;
const DEFAULT_PRIORITY_BUMP_WEI = 5_000_000_000n;
const DEFAULT_MIN_PRIORITY_FEE_WEI = 5_000_000_000n;
const DEFAULT_MIN_MAX_FEE_WEI = 25_000_000_000n;
const DEFAULT_CODE_READY_MAX_ATTEMPTS = 20;
const DEFAULT_CODE_READY_POLL_MS = 500;
const DEFAULT_HANDOFF_MAX_ATTEMPTS = 3;
const DEFAULT_HANDOFF_BACKOFF_MS = 700;

function toNetworkInfo(network) {
  return {
    chainId: Number(network.chainId),
    name: network.name,
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parsePositiveBigInt(value, fallback) {
  try {
    const parsed = BigInt(value);
    if (parsed < 1n) {
      return fallback;
    }
    return parsed;
  } catch (_error) {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeFixedSupplyAmount(ethersLib) {
  if (typeof ethersLib.parseUnits === "function") {
    return ethersLib.parseUnits(TOKEN_SUPPLY, TOKEN_DECIMALS);
  }
  return BigInt(TOKEN_SUPPLY) * 10n ** BigInt(TOKEN_DECIMALS);
}

function toLogSafe(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toLogSafe(item));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = toLogSafe(nested);
    }
    return output;
  }
  return value;
}

function collectErrorMessages(error) {
  const fragments = [];
  const queue = [error];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (typeof current === "string") {
      fragments.push(current);
      continue;
    }

    if (current instanceof Error) {
      if (current.message) {
        fragments.push(current.message);
      }
      if (current.cause) {
        queue.push(current.cause);
      }
    }

    if (typeof current === "object") {
      for (const key of [
        "message",
        "shortMessage",
        "reason",
        "details",
        "data",
        "error",
        "cause",
      ]) {
        if (current[key]) {
          queue.push(current[key]);
        }
      }
    }
  }

  return fragments.join(" | ").toLowerCase();
}

function isRetryablePriorityError(error) {
  const text = collectErrorMessages(error);
  return (
    text.includes("priority is too low") ||
    text.includes("replacement transaction underpriced") ||
    text.includes("nonce too low")
  );
}

function createTokenDeploymentService({
  rpcUrl,
  rpcWriteUrl,
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

  const effectiveWriteRpcUrl = rpcWriteUrl || rpcUrl;
  const provider = new ethersLib.JsonRpcProvider(effectiveWriteRpcUrl);
  const wallet = new ethersLib.Wallet(backendPrivateKey, provider);
  const deployMaxAttempts = parsePositiveInt(
    process.env.DEPLOY_TX_MAX_ATTEMPTS,
    DEFAULT_DEPLOY_MAX_ATTEMPTS
  );
  const priorityBumpWei = parsePositiveBigInt(
    process.env.DEPLOY_TX_PRIORITY_BUMP_WEI,
    DEFAULT_PRIORITY_BUMP_WEI
  );
  const minPriorityFeeWei = parsePositiveBigInt(
    process.env.DEPLOY_TX_MIN_PRIORITY_FEE_WEI,
    DEFAULT_MIN_PRIORITY_FEE_WEI
  );
  const minMaxFeeWei = parsePositiveBigInt(
    process.env.DEPLOY_TX_MIN_MAX_FEE_WEI,
    DEFAULT_MIN_MAX_FEE_WEI
  );
  const codeReadyMaxAttempts = parsePositiveInt(
    process.env.DEPLOY_CODE_READY_MAX_ATTEMPTS,
    DEFAULT_CODE_READY_MAX_ATTEMPTS
  );
  const codeReadyPollMs = parsePositiveInt(
    process.env.DEPLOY_CODE_READY_POLL_MS,
    DEFAULT_CODE_READY_POLL_MS
  );
  const handoffMaxAttempts = parsePositiveInt(
    process.env.DEPLOY_HANDOFF_MAX_ATTEMPTS,
    DEFAULT_HANDOFF_MAX_ATTEMPTS
  );
  const handoffBackoffMs = parsePositiveInt(
    process.env.DEPLOY_HANDOFF_BACKOFF_MS,
    DEFAULT_HANDOFF_BACKOFF_MS
  );

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
    let deployAttempt = 0;

    async function buildDeployOverrides(attemptNumber) {
      const nonce = await provider.getTransactionCount(wallet.address, "pending");
      const feeData = await provider.getFeeData();
      const bump = priorityBumpWei * BigInt(Math.max(attemptNumber - 1, 0));
      const overrides = {
        nonce,
      };

      if (feeData.maxFeePerGas !== null || feeData.maxPriorityFeePerGas !== null) {
        const observedMaxFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
        const observedPriority = feeData.maxPriorityFeePerGas ?? 0n;
        const basePriority =
          observedPriority > minPriorityFeeWei ? observedPriority : minPriorityFeeWei;
        const baseMaxFeeCandidate = observedMaxFee > minMaxFeeWei ? observedMaxFee : minMaxFeeWei;
        const baseMaxFee =
          baseMaxFeeCandidate > basePriority * 2n
            ? baseMaxFeeCandidate
            : basePriority * 2n;

        overrides.maxPriorityFeePerGas = basePriority + bump;
        overrides.maxFeePerGas = baseMaxFee + bump * 2n;
      } else if (feeData.gasPrice !== null) {
        const baseGasPrice =
          feeData.gasPrice > minMaxFeeWei ? feeData.gasPrice : minMaxFeeWei;
        overrides.gasPrice = baseGasPrice + bump;
      } else {
        overrides.maxPriorityFeePerGas = minPriorityFeeWei + bump;
        overrides.maxFeePerGas = minMaxFeeWei + bump * 2n;
      }

      return overrides;
    }

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
          rpcUrl,
          rpcWriteUrl: effectiveWriteRpcUrl,
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

      let contract;
      let lastDeployError;

      for (let attemptNumber = 1; attemptNumber <= deployMaxAttempts; attemptNumber += 1) {
        const attemptStartedAt = Date.now();
        const deployOverrides = await buildDeployOverrides(attemptNumber);
        deployAttempt = attemptNumber;

        serviceLogger.info({
          operation,
          stage: "contractDeploy.attempt",
          status: "start",
          context: {
            attemptNumber,
            deployMaxAttempts,
            deployOverrides: toLogSafe(deployOverrides),
          },
        });

        try {
          contract = await factory.deploy(name, symbol, deployOverrides);
          serviceLogger.info({
            operation,
            stage: "contractDeploy.attempt",
            status: "success",
            durationMs: Date.now() - attemptStartedAt,
            context: {
              attemptNumber,
              deployOverrides: toLogSafe(deployOverrides),
            },
          });
          break;
        } catch (attemptError) {
          lastDeployError = attemptError;
          const retryable =
            attemptNumber < deployMaxAttempts && isRetryablePriorityError(attemptError);

          serviceLogger[retryable ? "warn" : "error"]({
            operation,
            stage: "contractDeploy.attempt",
            status: "failure",
            durationMs: Date.now() - attemptStartedAt,
            error: attemptError,
            context: {
              attemptNumber,
              deployMaxAttempts,
              retryable,
              deployOverrides: toLogSafe(deployOverrides),
            },
          });

          if (!retryable) {
            throw attemptError;
          }
        }
      }

      if (!contract) {
        throw lastDeployError;
      }

      const deployTx = contract.deploymentTransaction();
      transactions.deploy = deployTx?.hash || null;
      serviceLogger.info({
        operation,
        stage,
        status: "success",
        context: {
          deployTxHash: transactions.deploy,
          deployAttempt,
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

      stage = "waitForCodeReady";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
        context: {
          tokenAddress,
          codeReadyMaxAttempts,
          codeReadyPollMs,
        },
      });
      let codeReady = false;
      for (let attemptNumber = 1; attemptNumber <= codeReadyMaxAttempts; attemptNumber += 1) {
        stage = "waitForCodeReady.poll";
        const code = await provider.getCode(tokenAddress);
        if (code && code !== "0x") {
          codeReady = true;
          serviceLogger.info({
            operation,
            stage,
            status: "success",
            context: {
              tokenAddress,
              attemptNumber,
            },
          });
          break;
        }

        if (attemptNumber < codeReadyMaxAttempts) {
          await sleep(codeReadyPollMs);
        }
      }
      if (!codeReady) {
        throw new Error("Contract code not ready after deployment");
      }

      const fullSupplyAmount = computeFixedSupplyAmount(ethersLib);

      async function executePostDeployStep({
        stepName,
        transactionKey,
        execute,
        logContext,
      }) {
        let lastError;
        for (let attemptNumber = 1; attemptNumber <= handoffMaxAttempts; attemptNumber += 1) {
          stage = `${stepName}.attempt`;
          const attemptStartedAt = Date.now();
          const reboundContract = new ethersLib.Contract(tokenAddress, artifact.abi, wallet);

          serviceLogger.info({
            operation,
            stage,
            status: "start",
            context: {
              attemptNumber,
              handoffMaxAttempts,
              tokenAddress,
            },
          });

          try {
            const tx = await execute(reboundContract);
            transactions[transactionKey] = tx?.hash || null;
            await tx.wait();

            stage = stepName;
            serviceLogger.info({
              operation,
              stage,
              status: "success",
              durationMs: Date.now() - attemptStartedAt,
              context: {
                attemptNumber,
                txHash: transactions[transactionKey],
                ...(logContext || {}),
              },
            });
            return;
          } catch (attemptError) {
            lastError = attemptError;
            const retryable = attemptNumber < handoffMaxAttempts;

            serviceLogger[retryable ? "warn" : "error"]({
              operation,
              stage,
              status: "failure",
              durationMs: Date.now() - attemptStartedAt,
              error: attemptError,
              context: {
                attemptNumber,
                handoffMaxAttempts,
                retryable,
                tokenAddress,
              },
            });

            if (!retryable) {
              throw attemptError;
            }

            await sleep(handoffBackoffMs * attemptNumber);
          }
        }

        throw lastError;
      }

      stage = "transferTokens";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      await executePostDeployStep({
        stepName: "transferTokens",
        transactionKey: "tokenTransfer",
        execute: (reboundContract) => reboundContract.transfer(finalOwnerAddress, fullSupplyAmount),
        logContext: {
          transferAmount: fullSupplyAmount.toString(),
        },
      });

      stage = "transferOwnership";
      serviceLogger.info({
        operation,
        stage,
        status: "start",
      });
      await executePostDeployStep({
        stepName: "transferOwnership",
        transactionKey: "ownershipTransfer",
        execute: (reboundContract) => reboundContract.transferOwnership(finalOwnerAddress),
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
        deployAttempt,
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

      if (isRetryablePriorityError(error)) {
        details.recovery =
          "RPC rejected tx with low priority in transaction pool. Configure a dedicated write endpoint via RPC_WRITE_URL and retry, or wait for txpool eviction.";
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
          deployAttempt,
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
