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
  matchesAddress,
} = require("../utils/erc20");

function createErc20TransferTool({ provider, backendSigner, chainId, emitActions }) {
  return tool(
    async (input) => {
      const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
      const toAddress = normalizeAddress(input.toAddress, "toAddress");
      const fromAddress = normalizeAddress(input.fromAddress, "fromAddress");

      const readContract = createContract(tokenAddress, provider);
      const decimals = await resolveTokenDecimals(readContract, input.decimals);
      const rawAmount = parseTokenAmountToRaw(input.amount, decimals);
      const backendAddress = normalizeAddress(backendSigner.address, "backendSigner");

      if (matchesAddress(fromAddress, backendAddress)) {
        const contract = createContract(tokenAddress, backendSigner);
        const tx = await contract.transfer(toAddress, BigInt(rawAmount));
        await tx.wait();

        emitActions([
          createAgentAction({
            type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
            tool: "erc20_transfer",
            status: AGENT_ACTION_STATUSES.COMPLETED,
            txHash: tx.hash,
            result: {
              tokenAddress,
              fromAddress,
              toAddress,
              rawAmount,
              decimals,
              mode: "backend",
            },
          }),
        ]);

        return JSON.stringify({
          success: true,
          tool: "erc20_transfer",
          mode: "backend",
          txHash: tx.hash,
        });
      }

      const data = encodeCall("transfer", [toAddress, BigInt(rawAmount)]);
      const txRequest = createWalletTxRequest({
        to: tokenAddress,
        data,
        chainId,
        from: fromAddress,
      });

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.WALLET_SIGNATURE_REQUIRED,
          tool: "erc20_transfer",
          status: AGENT_ACTION_STATUSES.PENDING_USER_SIGNATURE,
          txRequest,
          result: {
            tokenAddress,
            fromAddress,
            toAddress,
            rawAmount,
            decimals,
            mode: "wallet",
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "erc20_transfer",
        mode: "wallet",
        txRequest,
      });
    },
    {
      name: "erc20_transfer",
      description:
        "Transfer ERC20 tokens. Executes on backend signer only when fromAddress is backend wallet; otherwise prepares wallet transaction request for user signature.",
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
  createErc20TransferTool,
};
