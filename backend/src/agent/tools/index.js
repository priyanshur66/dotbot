const { createLaunchTokenTool } = require("./launchTokenTool");
const { createErc20CheckBalanceTool } = require("./erc20CheckBalanceTool");
const { createErc20TransferTool } = require("./erc20TransferTool");
const { createErc20TransferOwnershipTool } = require("./erc20TransferOwnershipTool");
const { createErc20PrepareApprovalTool } = require("./erc20PrepareApprovalTool");
const { createErc20BackendTransferFromTool } = require("./erc20BackendTransferFromTool");

function createAgentTools(context) {
  return [
    createLaunchTokenTool(context),
    createErc20CheckBalanceTool(context),
    createErc20TransferTool(context),
    createErc20TransferOwnershipTool(context),
    createErc20PrepareApprovalTool(context),
    createErc20BackendTransferFromTool(context),
  ];
}

module.exports = {
  createAgentTools,
};
