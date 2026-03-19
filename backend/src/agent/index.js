const ethers = require("ethers");
const { ConfigError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");
const {
  DEFAULT_OPENROUTER_MODEL,
  createOpenRouterModel,
} = require("./llm/openRouterModel");
const { buildAgentSystemPrompt } = require("./prompts/systemPrompt");
const { createAgentExecutor } = require("./runtime/agentExecutor");

const POLKADOT_HUB_TESTNET_CHAIN_ID = 420420417;

function createAgentService({
  rpcUrl,
  rpcWriteUrl,
  backendPrivateKey,
  openRouterApiKey,
  openRouterModel,
  openRouterSiteUrl,
  openRouterSiteName,
  deploymentService,
  launchOrchestrator,
  logger,
}) {
  const serviceLogger = logger || createNoopLogger();

  if (!rpcUrl) {
    throw new ConfigError("RPC_URL is required for agent service");
  }
  if (!backendPrivateKey) {
    throw new ConfigError("BACKEND_PRIVATE_KEY is required for agent service");
  }
  if (!openRouterApiKey) {
    throw new ConfigError("OPENROUTER_API_KEY is required for agent service");
  }
  if (!deploymentService) {
    throw new ConfigError("deploymentService is required for agent service");
  }
  if (!launchOrchestrator) {
    throw new ConfigError("launchOrchestrator is required for agent service");
  }

  const writeRpcUrl = rpcWriteUrl || rpcUrl;
  const provider = new ethers.JsonRpcProvider(writeRpcUrl);
  const backendSigner = new ethers.Wallet(backendPrivateKey, provider);
  const resolvedModel = openRouterModel || DEFAULT_OPENROUTER_MODEL;

  const model = createOpenRouterModel({
    apiKey: openRouterApiKey,
    model: resolvedModel,
    siteUrl: openRouterSiteUrl,
    siteName: openRouterSiteName,
  });

  const executor = createAgentExecutor({
    model,
    provider,
    backendSigner,
    deploymentService,
    launchOrchestrator,
    logger: serviceLogger,
  });

  let networkInfoPromise;

  async function getNetworkInfo() {
    if (!networkInfoPromise) {
      networkInfoPromise = provider.getNetwork().then((network) => ({
        chainId: Number(network.chainId),
        name: network.name,
      }));
    }

    return networkInfoPromise;
  }

  async function chat({ messages, walletAddress, chainId }) {
    const network = await getNetworkInfo();

    if (Number(network.chainId) !== POLKADOT_HUB_TESTNET_CHAIN_ID) {
      throw new ConfigError(
        "Agent backend must be connected to Polkadot Hub TestNet RPC",
        {
          expectedChainId: POLKADOT_HUB_TESTNET_CHAIN_ID,
          connectedChainId: Number(network.chainId),
        }
      );
    }

    const systemPrompt = buildAgentSystemPrompt({
      backendWalletAddress: backendSigner.address,
      chainId: network.chainId,
    });

    const response = await executor.executeChat({
      messages,
      walletAddress,
      chainId: network.chainId,
      systemPrompt,
    });

    return {
      ...response,
      model: resolvedModel,
      backendWalletAddress: backendSigner.address,
      network,
    };
  }

  return {
    chat,
    getNetworkInfo,
    getBackendWalletAddress: () => backendSigner.address,
    expectedChainId: POLKADOT_HUB_TESTNET_CHAIN_ID,
  };
}

module.exports = {
  POLKADOT_HUB_TESTNET_CHAIN_ID,
  createAgentService,
};
