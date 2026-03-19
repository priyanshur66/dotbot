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
  parseTokenAmountToRaw,
} = require("../utils/erc20");

function createErc20BackendTransferFromTool({ provider, backendSigner, emitActions }) {
  return tool(
    async (input) => {
      const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
      const fromAddress = normalizeAddress(input.fromAddress, "fromAddress");
      const toAddress = normalizeAddress(input.toAddress, "toAddress");

      const readContract = createContract(tokenAddress, provider);
      const decimals = await resolveTokenDecimals(readContract, input.decimals);
      const rawAmount = parseTokenAmountToRaw(input.amount, decimals);

      const contract = createContract(tokenAddress, backendSigner);
      const tx = await contract.transferFrom(fromAddress, toAddress, BigInt(rawAmount));
      await tx.wait();

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
          tool: "erc20_backend_transfer_from",
          status: AGENT_ACTION_STATUSES.COMPLETED,
          txHash: tx.hash,
          result: {
            tokenAddress,
            fromAddress,
            toAddress,
            rawAmount,
            decimals,
            spenderAddress: backendSigner.address,
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "erc20_backend_transfer_from",
        txHash: tx.hash,
      });
    },
    {
      name: "erc20_backend_transfer_from",
      description:
        "Execute ERC20 transferFrom using backend wallet as spender after user has approved allowance.",
      schema: z.object({
        tokenAddress: z.string().min(1),
        fromAddress: z.string().min(1),
        toAddress: z.string().min(1),
        amount: z.union([z.string(), z.number()]),
        decimals: z.number().int().min(0).max(36).optional(),
      }),
    }
  );
}

module.exports = {
  createErc20BackendTransferFromTool,
};
