const { OnChainError } = require("../lib/errors");
const { createNoopLogger, sanitizeForLogging } = require("../lib/logging");

function createTokenLaunchOrchestrator({
  deploymentService,
  tokenRegistryService,
  logger,
}) {
  const orchestratorLogger = logger || createNoopLogger();

  async function persistLaunchRecord({
    deployed,
    tokenName,
    tokenSymbol,
    launchStatus,
  }) {
    return tokenRegistryService.createLaunchRecord({
      tokenAddress: deployed.tokenAddress,
      tokenName,
      tokenSymbol,
      ownerAddress: deployed.ownerAddress,
      launchedByAddress: deployed.launchedByAddress,
      chainId: deployed.network?.chainId,
      networkName: deployed.network?.name,
      totalSupply: deployed.totalSupply,
      decimals: deployed.decimals,
      launchStatus,
      deployTxHash: deployed.transactions?.deploy,
      tokenTransferTxHash: deployed.transactions?.tokenTransfer,
      ownershipTransferTxHash: deployed.transactions?.ownershipTransfer,
    });
  }

  function partialDeploymentFromError(error) {
    const details = error?.details || {};
    if (!details.partialFailure || !details.tokenAddress) {
      return null;
    }

    return {
      tokenAddress: details.tokenAddress,
      ownerAddress: details.ownerAddress,
      launchedByAddress: details.launchedByAddress,
      network: details.network || null,
      totalSupply: details.totalSupply,
      decimals: details.decimals,
      transactions: details.transactions || {
        deploy: null,
        tokenTransfer: null,
        ownershipTransfer: null,
      },
    };
  }

  async function deployAndPersistLaunch({ name, symbol, finalOwnerAddress }) {
    const startedAt = Date.now();
    orchestratorLogger.info({
      operation: "service.launchOrchestrator.deployAndPersist",
      stage: "start",
      status: "start",
      context: {
        name,
        symbol,
        finalOwnerAddress,
      },
    });

    try {
      const deployed = await deploymentService.deployToken({
        name,
        symbol,
        finalOwnerAddress,
      });

      const launchRecord = await persistLaunchRecord({
        deployed,
        tokenName: name,
        tokenSymbol: symbol,
        launchStatus: "completed",
      });

      orchestratorLogger.info({
        operation: "service.launchOrchestrator.deployAndPersist",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          tokenAddress: deployed.tokenAddress,
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
      const isPartialOnChainFailure =
        error instanceof OnChainError &&
        Boolean(error?.details?.partialFailure && error?.details?.tokenAddress);

      if (isPartialOnChainFailure) {
        const partialDeployed = partialDeploymentFromError(error);

        try {
          const launchRecord = await persistLaunchRecord({
            deployed: partialDeployed,
            tokenName: name,
            tokenSymbol: symbol,
            launchStatus: "handoff_pending",
          });

          error.details.launchRecordId = launchRecord.id;
          error.details.launchStatus = "handoff_pending";

          orchestratorLogger.warn({
            operation: "service.launchOrchestrator.deployAndPersist",
            stage: "partial.persisted",
            status: "failure",
            durationMs: Date.now() - startedAt,
            context: {
              tokenAddress: partialDeployed.tokenAddress,
              launchRecordId: launchRecord.id,
              launchStatus: "handoff_pending",
            },
          });
        } catch (persistError) {
          error.details.registryPersistenceError = sanitizeForLogging({
            message: persistError instanceof Error ? persistError.message : String(persistError),
          });

          orchestratorLogger.error({
            operation: "service.launchOrchestrator.deployAndPersist",
            stage: "partial.persist.failure",
            status: "failure",
            durationMs: Date.now() - startedAt,
            context: {
              tokenAddress: partialDeployed?.tokenAddress,
            },
            error: persistError,
          });
        }
      }

      orchestratorLogger.error({
        operation: "service.launchOrchestrator.deployAndPersist",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        context: {
          name,
          symbol,
          finalOwnerAddress,
        },
        error,
      });

      throw error;
    }
  }

  return {
    deployAndPersistLaunch,
  };
}

module.exports = {
  createTokenLaunchOrchestrator,
};
