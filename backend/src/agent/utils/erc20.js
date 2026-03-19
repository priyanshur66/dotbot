const ethers = require("ethers");
const { AgentBadRequestError } = require("../../lib/errors");

const ERC20_TOOL_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function transferOwnership(address newOwner)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

const erc20Interface = new ethers.Interface(ERC20_TOOL_ABI);

function normalizeAddress(address, fieldName = "address") {
  try {
    return ethers.getAddress(address);
  } catch (_error) {
    throw new AgentBadRequestError(`\`${fieldName}\` must be a valid Ethereum address`, {
      [fieldName]: address,
    });
  }
}

function normalizeAddressOrUndefined(address, fieldName = "address") {
  if (!address) {
    return undefined;
  }
  return normalizeAddress(address, fieldName);
}

function matchesAddress(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalizeAddress(left) === normalizeAddress(right);
}

async function resolveTokenDecimals(contract, explicitDecimals) {
  if (
    Number.isFinite(explicitDecimals) &&
    Number(explicitDecimals) >= 0 &&
    Number(explicitDecimals) <= 36
  ) {
    return Number(explicitDecimals);
  }

  try {
    return Number(await contract.decimals());
  } catch (_error) {
    return 18;
  }
}

function parseTokenAmountToRaw(amount, decimals) {
  if (amount === undefined || amount === null || amount === "") {
    throw new AgentBadRequestError("`amount` is required");
  }

  const normalizedAmount = String(amount).trim();
  if (!normalizedAmount) {
    throw new AgentBadRequestError("`amount` is required");
  }

  try {
    return ethers.parseUnits(normalizedAmount, decimals).toString();
  } catch (_error) {
    throw new AgentBadRequestError("`amount` is invalid for token decimals", {
      amount: normalizedAmount,
      decimals,
    });
  }
}

function formatRawAmount(rawAmount, decimals) {
  return ethers.formatUnits(BigInt(rawAmount), decimals);
}

function createWalletTxRequest({ to, data, chainId, from }) {
  const tx = {
    to: normalizeAddress(to, "to"),
    data,
    value: "0x0",
    chainId: Number(chainId),
  };

  if (from) {
    tx.from = normalizeAddress(from, "from");
  }

  return tx;
}

function createContract(tokenAddress, providerOrSigner) {
  const normalized = normalizeAddress(tokenAddress, "tokenAddress");
  return new ethers.Contract(normalized, ERC20_TOOL_ABI, providerOrSigner);
}

function encodeCall(functionName, args) {
  return erc20Interface.encodeFunctionData(functionName, args);
}

module.exports = {
  ERC20_TOOL_ABI,
  normalizeAddress,
  normalizeAddressOrUndefined,
  matchesAddress,
  resolveTokenDecimals,
  parseTokenAmountToRaw,
  formatRawAmount,
  createWalletTxRequest,
  createContract,
  encodeCall,
};
