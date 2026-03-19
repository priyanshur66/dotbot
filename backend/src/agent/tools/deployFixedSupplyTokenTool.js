const { z } = require("zod");
const { tool } = require("@langchain/core/tools");
const {
  AGENT_ACTION_TYPES,
  AGENT_ACTION_STATUSES,
  createAgentAction,
} = require("../types/agentAction");
const { normalizeAddress } = require("../utils/erc20");

function deriveSymbolFromName(name) {
  const normalizedName = String(name || "").trim();
  const compact = normalizedName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return "TOKEN";
  }

  const words = normalizedName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const acronym = words.map((word) => word[0]).join("");
  if (acronym.length >= 2) {
    return acronym.slice(0, 8);
  }

  return compact.slice(0, 8);
}

function createDeployFixedSupplyTokenTool({
  launchOrchestrator,
  deploymentService,
  emitActions,
  walletAddress,
}) {
  return tool(
    async (input) => {
      const connectedWalletAddress = normalizeAddress(walletAddress, "walletAddress");
      const finalOwnerAddress = connectedWalletAddress;

      const tokenName = input.name.trim();
      const tokenSymbol =
        typeof input.symbol === "string" && input.symbol.trim()
          ? input.symbol.trim().toUpperCase()
          : deriveSymbolFromName(tokenName);
      const launchResult = launchOrchestrator
        ? await launchOrchestrator.deployAndPersistLaunch({
            name: tokenName,
            symbol: tokenSymbol,
            finalOwnerAddress,
          })
        : {
            deployed: await deploymentService.deployToken({
              name: tokenName,
              symbol: tokenSymbol,
              finalOwnerAddress,
            }),
            launchRecordId: null,
            launchStatus: "completed",
          };
      const { deployed, launchRecordId, launchStatus } = launchResult;

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
          tool: "deploy_fixed_supply_token",
          status: AGENT_ACTION_STATUSES.COMPLETED,
          txHash: deployed.transactions?.deploy || null,
          result: {
            tokenAddress: deployed.tokenAddress,
            ownerAddress: deployed.ownerAddress,
            launchedByAddress: deployed.launchedByAddress,
            transactions: deployed.transactions,
            network: deployed.network,
            launchRecordId,
            launchStatus,
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "deploy_fixed_supply_token",
        deployed,
        launchRecordId,
        launchStatus,
      });
    },
    {
      name: "deploy_fixed_supply_token",
      description:
        "Deploy a fixed-supply ERC20 token. Use connected wallet as final owner/admin and auto-derive symbol from token name if not provided.",
      schema: z.object({
        name: z.string().min(1),
        symbol: z.string().min(1).optional(),
        finalOwnerAddress: z.string().optional(),
        ownerAddress: z.string().optional(),
        adminAddress: z.string().optional(),
      }),
    }
  );
}

module.exports = {
  createDeployFixedSupplyTokenTool,
  deriveSymbolFromName,
};
