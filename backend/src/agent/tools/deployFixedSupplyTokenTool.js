const { z } = require("zod");
const { tool } = require("@langchain/core/tools");
const {
  AGENT_ACTION_TYPES,
  AGENT_ACTION_STATUSES,
  createAgentAction,
} = require("../types/agentAction");
const { normalizeAddress } = require("../utils/erc20");

function createDeployFixedSupplyTokenTool({ launchOrchestrator, deploymentService, emitActions }) {
  return tool(
    async (input) => {
      const targetOwner =
        input.finalOwnerAddress || input.ownerAddress || input.adminAddress;
      const finalOwnerAddress = normalizeAddress(targetOwner, "finalOwnerAddress");

      const tokenName = input.name.trim();
      const tokenSymbol = input.symbol.trim();
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
        "Deploy a fixed-supply ERC20 token and transfer token supply and ownership to final owner. Use for requests to create/deploy new token.",
      schema: z.object({
        name: z.string().min(1),
        symbol: z.string().min(1),
        finalOwnerAddress: z.string().optional(),
        ownerAddress: z.string().optional(),
        adminAddress: z.string().optional(),
      }),
    }
  );
}

module.exports = {
  createDeployFixedSupplyTokenTool,
};
