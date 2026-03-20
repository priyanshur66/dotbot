const { OnChainError } = require("../lib/errors");
const { createNoopLogger, sanitizeForLogging } = require("../lib/logging");

function createTokenLaunchOrchestrator({
  launchpadDeploymentService,
  tokenRegistryService,
  logger,
}) {
  const orchestratorLogger = logger || createNoopLogger();

  async function persistLaunchRecord({ deployed, tokenName, tokenSymbol, launchStatus }) {
    return tokenRegistryService.upsertLaunchRecord({
      tokenAddress: deployed.tokenAddress,
      tokenName,
      tokenSymbol,
      creatorAddress: deployed.creatorAddress || deployed.ownerAddress,
      ownerAddress: deployed.ownerAddress || deployed.creatorAddress,
      launchedByAddress: deployed.launchedByAddress,
      chainId: deployed.network?.chainId,
      networkName: deployed.network?.name,
      totalSupply: deployed.totalSupply,
      decimals: deployed.decimals,
      launchStatus,
      deployTxHash: deployed.transactions?.deploy || deployed.transactions?.launch || null,
      tokenTransferTxHash: deployed.transactions?.tokenTransfer || null,
      ownershipTransferTxHash: deployed.transactions?.ownershipTransfer || null,
      poolAddress: deployed.poolAddress,
      quoteTokenAddress: deployed.quoteTokenAddress,
      eventHubAddress: deployed.eventHubAddress,
      creatorAllocation: deployed.creatorAllocation,
      poolTokenAllocation: deployed.poolTokenAllocation,
      poolUsdtAllocation: deployed.poolUsdtAllocation,
      initialPrice: deployed.initialPrice,
      launchTxHash: deployed.transactions?.launch || deployed.transactions?.deploy || null,
      swapFeeBps: deployed.swapFeeBps,
      creatorFeeShareBps: deployed.creatorFeeShareBps,
    });
  }

  function partialLaunchFromError(error) {
    const details = error?.details || {};
    if (!details.tokenAddress) {
      return null;
    }

    return {
      tokenAddress: details.tokenAddress,
      poolAddress: details.poolAddress || null,
      quoteTokenAddress: details.quoteTokenAddress || null,
      eventHubAddress: details.eventHubAddress || null,
      creatorAddress: details.creatorAddress || details.ownerAddress,
      ownerAddress: details.ownerAddress || details.creatorAddress,
      launchedByAddress: details.launchedByAddress,
      network: details.network || null,
      totalSupply: details.totalSupply,
      decimals: details.decimals || 18,
      creatorAllocation: details.creatorAllocation || null,
      poolTokenAllocation: details.poolTokenAllocation || null,
      poolUsdtAllocation: details.poolUsdtAllocation || null,
      initialPrice: details.initialPrice || null,
      swapFeeBps: details.swapFeeBps || null,
      creatorFeeShareBps: details.creatorFeeShareBps || null,
      transactions: details.transactions || {
        launch: null,
        deploy: null,
        tokenTransfer: null,
        ownershipTransfer: null,
      },
    };
  }

  async function launchAndPersist({ name, symbol, creatorAddress }) {
    const startedAt = Date.now();
    const operation = "service.launchOrchestrator.launchAndPersist";

    orchestratorLogger.info({
      operation,
      stage: "start",
      status: "start",
      context: {
        name,
        symbol,
        creatorAddress,
      },
    });

    try {
      const deployed = await launchpadDeploymentService.launchToken({
        name,
        symbol,
        creatorAddress,
      });

      const launchRecord = await persistLaunchRecord({
        deployed,
        tokenName: name,
        tokenSymbol: symbol,
        launchStatus: "completed",
      });

      orchestratorLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          tokenAddress: deployed.tokenAddress,
          poolAddress: deployed.poolAddress,
          launchRecordId: launchRecord.id,
          launchStatus: "completed",
        },
      });

      return {
        deployed,
        launchRecordId: launchRecord.id,
        launchStatus: "completed",
      };
    } catch (error) {
      const partialDeployed = error instanceof OnChainError ? partialLaunchFromError(error) : null;
      if (partialDeployed) {
        try {
          const launchRecord = await persistLaunchRecord({
            deployed: partialDeployed,
            tokenName: name,
            tokenSymbol: symbol,
            launchStatus: "launch_pending",
          });
          error.details.launchRecordId = launchRecord.id;
          error.details.launchStatus = "launch_pending";
        } catch (persistError) {
          error.details = {
            ...(error.details || {}),
            registryPersistenceError: sanitizeForLogging({
              message: persistError instanceof Error ? persistError.message : String(persistError),
            }),
          };
        }
      }

      orchestratorLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        context: {
          name,
          symbol,
          creatorAddress,
        },
        error,
      });
      throw error;
    }
  }

  return {
    launchAndPersist,
    deployAndPersistLaunch: async ({ name, symbol, creatorAddress, finalOwnerAddress }) =>
      launchAndPersist({
        name,
        symbol,
        creatorAddress: creatorAddress || finalOwnerAddress,
      }),
  };
}

module.exports = {
  createTokenLaunchOrchestrator,
};
