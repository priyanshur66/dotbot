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

function createLaunchTokenTool({ launchOrchestrator, emitActions, walletAddress }) {
  return tool(
    async (input) => {
      const creatorAddress = normalizeAddress(walletAddress, "walletAddress");
      const tokenName = input.name.trim();
      const tokenSymbol =
        typeof input.symbol === "string" && input.symbol.trim()
          ? input.symbol.trim().toUpperCase()
          : deriveSymbolFromName(tokenName);

      const launchResult = await launchOrchestrator.deployAndPersistLaunch({
        name: tokenName,
        symbol: tokenSymbol,
        creatorAddress,
      });
      const { deployed, launchRecordId, launchStatus } = launchResult;

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
          tool: "launch_token",
          status: AGENT_ACTION_STATUSES.COMPLETED,
          txHash: deployed.transactions?.launch || deployed.transactions?.deploy || null,
          result: {
            tokenAddress: deployed.tokenAddress,
            poolAddress: deployed.poolAddress,
            creatorAddress: deployed.creatorAddress,
            quoteTokenAddress: deployed.quoteTokenAddress,
            transactions: deployed.transactions,
            network: deployed.network,
            launchRecordId,
            launchStatus,
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "launch_token",
        deployed,
        launchRecordId,
        launchStatus,
      });
    },
    {
      name: "launch_token",
      description:
        "Launch a fixed-supply token into the launchpad with an initial USDT AMM pool. Use the connected wallet as creator and auto-derive symbol from name when omitted.",
      schema: z.object({
        name: z.string().min(1),
        symbol: z.string().min(1).optional(),
      }),
    }
  );
}

module.exports = {
  createLaunchTokenTool,
  deriveSymbolFromName,
};
