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
  createWalletTxRequest,
  encodeCall,
} = require("../utils/erc20");

function createErc20PrepareApprovalTool({
  provider,
  backendSigner,
  chainId,
  emitActions,
}) {
  return tool(
    async (input) => {
      const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
      const ownerAddress = normalizeAddress(input.ownerAddress, "ownerAddress");
      const spenderAddress = normalizeAddress(
        input.spenderAddress || backendSigner.address,
        "spenderAddress"
      );

      const contract = createContract(tokenAddress, provider);
      const decimals = await resolveTokenDecimals(contract, input.decimals);
      const rawAmount = parseTokenAmountToRaw(input.amount, decimals);
      const data = encodeCall("approve", [spenderAddress, BigInt(rawAmount)]);
      const txRequest = createWalletTxRequest({
        to: tokenAddress,
        data,
        chainId,
        from: ownerAddress,
      });

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.WALLET_SIGNATURE_REQUIRED,
          tool: "erc20_prepare_approval",
          status: AGENT_ACTION_STATUSES.PENDING_USER_SIGNATURE,
          txRequest,
          result: {
            tokenAddress,
            ownerAddress,
            spenderAddress,
            rawAmount,
            decimals,
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "erc20_prepare_approval",
        txRequest,
      });
    },
    {
      name: "erc20_prepare_approval",
      description:
        "Prepare ERC20 approve transaction. Default spender should be backend wallet unless user requests a different spender.",
      schema: z.object({
        tokenAddress: z.string().min(1),
        ownerAddress: z.string().min(1),
        amount: z.union([z.string(), z.number()]),
        spenderAddress: z.string().optional(),
        decimals: z.number().int().min(0).max(36).optional(),
      }),
    }
  );
}

module.exports = {
  createErc20PrepareApprovalTool,
};
