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

function pickString(value, fallback = null) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildLaunchSuccessPayload({
  tokenName,
  tokenSymbol,
  creatorAddress,
  deployed,
  launchRecordId,
  launchStatus,
}) {
  return {
    success: true,
    launchStatus,
    name: tokenName,
    symbol: tokenSymbol,
    creatorAddress,
    tokenAddress: deployed.tokenAddress,
    poolAddress: deployed.poolAddress,
    quoteTokenAddress: deployed.quoteTokenAddress,
    transactions: deployed.transactions,
    network: deployed.network,
    launchRecordId,
  };
}

function buildLaunchFailurePayload({
  error,
  tokenName,
  tokenSymbol,
  creatorAddress,
}) {
  const details = error && typeof error === "object" && error.details ? error.details : {};
  const transactions =
    details && typeof details.transactions === "object"
      ? {
          launch: details.transactions.launch || null,
          deploy: details.transactions.deploy || null,
          tokenTransfer: details.transactions.tokenTransfer || null,
          ownershipTransfer: details.transactions.ownershipTransfer || null,
        }
      : {
          launch: null,
          deploy: null,
          tokenTransfer: null,
          ownershipTransfer: null,
        };

  const causeMessage =
    error &&
    typeof error === "object" &&
    error.cause &&
    typeof error.cause.message === "string"
      ? error.cause.message.trim()
      : null;

  return {
    success: false,
    launchStatus: pickString(details.launchStatus, "failed"),
    name: pickString(details.name, tokenName) || tokenName,
    symbol: pickString(details.symbol, tokenSymbol) || tokenSymbol,
    creatorAddress: pickString(details.creatorAddress, creatorAddress) || creatorAddress,
    tokenAddress: pickString(details.tokenAddress),
    poolAddress: pickString(details.poolAddress),
    quoteTokenAddress: pickString(details.quoteTokenAddress),
    transactions,
    network:
      details && typeof details.network === "object" && details.network
        ? details.network
        : null,
    launchRecordId: pickString(details.launchRecordId),
    errorCode:
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "TOKEN_LAUNCH_FAILED",
    errorMessage:
      pickString(details.recovery) ||
      causeMessage ||
      (error instanceof Error && error.message ? error.message : "Token launch failed."),
  };
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

      try {
        const launchResult = await launchOrchestrator.deployAndPersistLaunch({
          name: tokenName,
          symbol: tokenSymbol,
          creatorAddress,
        });
        const { deployed, launchRecordId, launchStatus } = launchResult;
        const successPayload = buildLaunchSuccessPayload({
          tokenName,
          tokenSymbol,
          creatorAddress,
          deployed,
          launchRecordId,
          launchStatus,
        });

        emitActions([
          createAgentAction({
            type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
            tool: "launch_token",
            status: AGENT_ACTION_STATUSES.COMPLETED,
            txHash: deployed.transactions?.launch || deployed.transactions?.deploy || null,
            result: successPayload,
          }),
        ]);

        return JSON.stringify({
          tool: "launch_token",
          ...successPayload,
        });
      } catch (error) {
        const failurePayload = buildLaunchFailurePayload({
          error,
          tokenName,
          tokenSymbol,
          creatorAddress,
        });

        emitActions([
          createAgentAction({
            type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
            tool: "launch_token",
            status: AGENT_ACTION_STATUSES.FAILED,
            txHash:
              failurePayload.transactions?.launch ||
              failurePayload.transactions?.deploy ||
              null,
            result: failurePayload,
          }),
        ]);

        return JSON.stringify({
          tool: "launch_token",
          ...failurePayload,
        });
      }
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
