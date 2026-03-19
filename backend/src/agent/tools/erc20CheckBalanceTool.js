const { z } = require("zod");
const { tool } = require("@langchain/core/tools");
const {
  AGENT_ACTION_TYPES,
  AGENT_ACTION_STATUSES,
  createAgentAction,
} = require("../types/agentAction");
const {
  normalizeAddress,
  createContract,
  resolveTokenDecimals,
  formatRawAmount,
} = require("../utils/erc20");

function createErc20CheckBalanceTool({ provider, emitActions }) {
  return tool(
    async (input) => {
      const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
      const accountAddress = normalizeAddress(input.accountAddress, "accountAddress");

      const contract = createContract(tokenAddress, provider);
      const decimals = await resolveTokenDecimals(contract, input.decimals);
      const rawBalance = (await contract.balanceOf(accountAddress)).toString();
      const balance = formatRawAmount(rawBalance, decimals);

      const result = {
        tokenAddress,
        accountAddress,
        rawBalance,
        balance,
        decimals,
      };

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.READ_RESULT,
          tool: "erc20_check_balance",
          status: AGENT_ACTION_STATUSES.COMPLETED,
          result,
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "erc20_check_balance",
        result,
      });
    },
    {
      name: "erc20_check_balance",
      description:
        "Read ERC20 balance for an account. Use for requests to check token balance.",
      schema: z.object({
        tokenAddress: z.string().min(1),
        accountAddress: z.string().min(1),
        decimals: z.number().int().min(0).max(36).optional(),
      }),
    }
  );
}

module.exports = {
  createErc20CheckBalanceTool,
};
