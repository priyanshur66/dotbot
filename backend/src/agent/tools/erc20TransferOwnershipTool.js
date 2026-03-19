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
  createWalletTxRequest,
  encodeCall,
  matchesAddress,
} = require("../utils/erc20");

function createErc20TransferOwnershipTool({
  backendSigner,
  chainId,
  emitActions,
}) {
  return tool(
    async (input) => {
      const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
      const newOwnerAddress = normalizeAddress(input.newOwnerAddress, "newOwnerAddress");
      const currentOwnerAddress = normalizeAddress(
        input.currentOwnerAddress,
        "currentOwnerAddress"
      );
      const backendAddress = normalizeAddress(backendSigner.address, "backendSigner");

      if (matchesAddress(currentOwnerAddress, backendAddress)) {
        const contract = createContract(tokenAddress, backendSigner);
        const tx = await contract.transferOwnership(newOwnerAddress);
        await tx.wait();

        emitActions([
          createAgentAction({
            type: AGENT_ACTION_TYPES.BACKEND_TX_SUBMITTED,
            tool: "erc20_transfer_ownership",
            status: AGENT_ACTION_STATUSES.COMPLETED,
            txHash: tx.hash,
            result: {
              tokenAddress,
              currentOwnerAddress,
              newOwnerAddress,
              mode: "backend",
            },
          }),
        ]);

        return JSON.stringify({
          success: true,
          tool: "erc20_transfer_ownership",
          mode: "backend",
          txHash: tx.hash,
        });
      }

      const data = encodeCall("transferOwnership", [newOwnerAddress]);
      const txRequest = createWalletTxRequest({
        to: tokenAddress,
        data,
        chainId,
        from: currentOwnerAddress,
      });

      emitActions([
        createAgentAction({
          type: AGENT_ACTION_TYPES.WALLET_SIGNATURE_REQUIRED,
          tool: "erc20_transfer_ownership",
          status: AGENT_ACTION_STATUSES.PENDING_USER_SIGNATURE,
          txRequest,
          result: {
            tokenAddress,
            currentOwnerAddress,
            newOwnerAddress,
            mode: "wallet",
          },
        }),
      ]);

      return JSON.stringify({
        success: true,
        tool: "erc20_transfer_ownership",
        mode: "wallet",
        txRequest,
      });
    },
    {
      name: "erc20_transfer_ownership",
      description:
        "Transfer token contract ownership. Backend executes when currentOwnerAddress is backend wallet; otherwise prepare wallet transaction request.",
      schema: z.object({
        tokenAddress: z.string().min(1),
        currentOwnerAddress: z.string().min(1),
        newOwnerAddress: z.string().min(1),
      }),
    }
  );
}

module.exports = {
  createErc20TransferOwnershipTool,
};
