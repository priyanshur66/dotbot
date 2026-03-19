const { randomUUID } = require("crypto");

const AGENT_ACTION_TYPES = {
  WALLET_SIGNATURE_REQUIRED: "wallet_signature_required",
  BACKEND_TX_SUBMITTED: "backend_tx_submitted",
  READ_RESULT: "read_result",
  ERROR: "error",
};

const AGENT_ACTION_STATUSES = {
  PENDING_USER_SIGNATURE: "pending_user_signature",
  COMPLETED: "completed",
  FAILED: "failed",
};

function createAgentAction(payload) {
  return {
    id: payload.id || `act_${randomUUID()}`,
    type: payload.type,
    tool: payload.tool,
    status: payload.status,
    txRequest: payload.txRequest,
    txHash: payload.txHash,
    result: payload.result,
  };
}

module.exports = {
  AGENT_ACTION_TYPES,
  AGENT_ACTION_STATUSES,
  createAgentAction,
};
