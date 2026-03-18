const { getAddress } = require("ethers");
const { ValidationError } = require("../lib/errors");

function normalizeDeployRequest(body) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";

  if (!name) {
    throw new ValidationError("Field `name` is required");
  }
  if (!symbol) {
    throw new ValidationError("Field `symbol` is required");
  }

  const ownerAddressRaw = body.ownerAddress;
  const adminAddressRaw = body.adminAddress;

  if (!ownerAddressRaw && !adminAddressRaw) {
    throw new ValidationError(
      "Either `ownerAddress` or `adminAddress` must be provided"
    );
  }

  let ownerAddress;
  let adminAddress;

  try {
    ownerAddress = ownerAddressRaw ? getAddress(ownerAddressRaw) : undefined;
  } catch (_error) {
    throw new ValidationError("`ownerAddress` is not a valid Ethereum address");
  }

  try {
    adminAddress = adminAddressRaw ? getAddress(adminAddressRaw) : undefined;
  } catch (_error) {
    throw new ValidationError("`adminAddress` is not a valid Ethereum address");
  }

  if (ownerAddress && adminAddress && ownerAddress !== adminAddress) {
    throw new ValidationError(
      "`ownerAddress` and `adminAddress` must match when both are provided"
    );
  }

  const finalOwnerAddress = ownerAddress || adminAddress;
  return {
    name,
    symbol,
    finalOwnerAddress,
  };
}

module.exports = {
  normalizeDeployRequest,
};
