const ethers = require("ethers");
const { compileTokenContract } = require("./contractCompiler");
const { ConfigError, OnChainError } = require("../lib/errors");

const TOKEN_DECIMALS = 18;
const TOKEN_SUPPLY = "1000000000";

function toNetworkInfo(network) {
  return {
    chainId: Number(network.chainId),
    name: network.name,
  };
}

function createTokenDeploymentService({
  rpcUrl,
  backendPrivateKey,
  compiler = compileTokenContract,
  ethersLib = ethers,
}) {
  if (!rpcUrl) {
    throw new ConfigError("RPC_URL is required for deployment service");
  }
  if (!backendPrivateKey) {
    throw new ConfigError("BACKEND_PRIVATE_KEY is required for deployment service");
  }

  const provider = new ethersLib.JsonRpcProvider(rpcUrl);
  const wallet = new ethersLib.Wallet(backendPrivateKey, provider);

  let compiledArtifactPromise;

  function getCompiledArtifact() {
    if (!compiledArtifactPromise) {
      compiledArtifactPromise = compiler();
    }
    return compiledArtifactPromise;
  }

  async function init() {
    await getCompiledArtifact();
  }

  async function getNetwork() {
    const network = await provider.getNetwork();
    return toNetworkInfo(network);
  }

  async function deployToken({ name, symbol, finalOwnerAddress }) {
    const artifact = await getCompiledArtifact();
    let network;
    const transactions = {
      deploy: null,
      tokenTransfer: null,
      ownershipTransfer: null,
    };

    let tokenAddress;

    try {
      network = await getNetwork();

      const factory = new ethersLib.ContractFactory(
        artifact.abi,
        artifact.bytecode,
        wallet
      );

      const contract = await factory.deploy(name, symbol);
      const deployTx = contract.deploymentTransaction();
      transactions.deploy = deployTx?.hash || null;

      await contract.waitForDeployment();
      tokenAddress = await contract.getAddress();

      const currentBalance = await contract.balanceOf(wallet.address);
      const transferTx = await contract.transfer(finalOwnerAddress, currentBalance);
      transactions.tokenTransfer = transferTx.hash;
      await transferTx.wait();

      const ownershipTx = await contract.transferOwnership(finalOwnerAddress);
      transactions.ownershipTransfer = ownershipTx.hash;
      await ownershipTx.wait();

      return {
        tokenAddress,
        ownerAddress: finalOwnerAddress,
        launchedByAddress: wallet.address,
        network,
        decimals: TOKEN_DECIMALS,
        totalSupply: TOKEN_SUPPLY,
        transactions,
      };
    } catch (error) {
      const details = {
        tokenAddress: tokenAddress || null,
        ownerAddress: finalOwnerAddress,
        launchedByAddress: wallet.address,
        network: network || null,
        decimals: TOKEN_DECIMALS,
        totalSupply: TOKEN_SUPPLY,
        transactions,
        partialFailure: Boolean(tokenAddress),
      };

      let errorMessage = "Failed during on-chain deployment flow";

      if (tokenAddress) {
        errorMessage =
          "Token contract deployed, but final handoff failed during post-deploy transactions";
        details.recovery =
          "Deployment succeeded but handoff did not fully complete. The backend wallet still controls recovery and can retry token/ownership transfer.";
      }

      throw new OnChainError(errorMessage, details, error);
    }
  }

  return {
    init,
    getNetwork,
    getDeployerAddress: () => wallet.address,
    deployToken,
  };
}

module.exports = {
  TOKEN_DECIMALS,
  TOKEN_SUPPLY,
  createTokenDeploymentService,
};
