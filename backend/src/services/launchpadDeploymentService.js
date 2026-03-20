const path = require("path");
const ethers = require("ethers");
const { compileContract } = require("./contractCompiler");
const { ConfigError, OnChainError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

const EVENT_HUB_FILE = path.resolve(__dirname, "../../contracts/EventHub.sol");
const MOCK_USDT_FILE = path.resolve(__dirname, "../../contracts/MockUSDT.sol");
const LAUNCHPAD_FILE = path.resolve(__dirname, "../../contracts/Launchpad.sol");
const AMM_POOL_FILE = path.resolve(__dirname, "../../contracts/AmmPool.sol");

const EVENT_HUB_NAME = "EventHub";
const MOCK_USDT_NAME = "MockUSDT";
const LAUNCHPAD_NAME = "Launchpad";
const AMM_POOL_NAME = "AmmPool";

const DEFAULT_POOL_ALLOCATION_BPS = 8_000;
const DEFAULT_SWAP_FEE_BPS = 100;
const DEFAULT_CREATOR_FEE_SHARE_BPS = 5_000;
const DEFAULT_QUOTE_LIQUIDITY_UNITS = "50000";
const DEFAULT_BOOTSTRAP_QUOTE_MULTIPLIER = 1_000n;
const DEFAULT_MIN_PRIORITY_GAS_PRICE_WEI = 1_000_000_000_000n;
const DEFAULT_MAX_FEE_MULTIPLIER = 2n;
const DEFAULT_LEGACY_GAS_PRICE_MULTIPLIER = 3n;
const GAS_LIMIT_BUFFER_NUMERATOR = 12n;
const GAS_LIMIT_BUFFER_DENOMINATOR = 10n;
const POLKADOT_HUB_TESTNET_CHAIN_ID = 420420417;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function toNetworkInfo(network) {
  return {
    chainId: Number(network.chainId),
    name: network.name,
  };
}

function toLogSafe(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toLogSafe(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = toLogSafe(nested);
    }
    return out;
  }
  return value;
}

function normalizeOptionalAddress(value) {
  if (!value) {
    return "";
  }
  try {
    return ethers.getAddress(value);
  } catch (_error) {
    return "";
  }
}

function bigintMax(left, right) {
  return left > right ? left : right;
}

function createLaunchpadDeploymentService({
  rpcUrl,
  rpcWriteUrl,
  backendPrivateKey,
  protocolTreasuryAddress,
  eventHubAddress,
  quoteTokenAddress,
  launchpadAddress,
  logger,
}) {
  const serviceLogger = logger || createNoopLogger();

  if (!rpcUrl) {
    throw new ConfigError("RPC_URL is required for launchpad deployment service");
  }
  if (!backendPrivateKey) {
    throw new ConfigError("BACKEND_PRIVATE_KEY is required for launchpad deployment service");
  }

  const effectiveWriteRpcUrl = rpcWriteUrl || rpcUrl;
  const provider = new ethers.JsonRpcProvider(effectiveWriteRpcUrl);
  const wallet = new ethers.Wallet(backendPrivateKey, provider);
  const resolvedProtocolTreasury =
    normalizeOptionalAddress(protocolTreasuryAddress) || wallet.address;
  const configuredEventHub = normalizeOptionalAddress(eventHubAddress);
  const configuredQuoteToken = normalizeOptionalAddress(quoteTokenAddress);
  const configuredLaunchpad = normalizeOptionalAddress(launchpadAddress);

  const poolAllocationBps = parsePositiveInt(
    process.env.LAUNCHPAD_POOL_ALLOCATION_BPS,
    DEFAULT_POOL_ALLOCATION_BPS
  );
  const swapFeeBps = parsePositiveInt(process.env.LAUNCHPAD_SWAP_FEE_BPS, DEFAULT_SWAP_FEE_BPS);
  const creatorFeeShareBps = parsePositiveInt(
    process.env.LAUNCHPAD_CREATOR_FEE_SHARE_BPS,
    DEFAULT_CREATOR_FEE_SHARE_BPS
  );
  const quoteTokenDecimals = 6;
  const initialQuoteLiquidity = ethers.parseUnits(
    process.env.LAUNCHPAD_INITIAL_USDT_LIQUIDITY || DEFAULT_QUOTE_LIQUIDITY_UNITS,
    quoteTokenDecimals
  );
  const bootstrapQuoteMintAmount =
    initialQuoteLiquidity *
    BigInt(
      parsePositiveInt(
        process.env.LAUNCHPAD_BOOTSTRAP_USDT_MULTIPLIER,
        Number(DEFAULT_BOOTSTRAP_QUOTE_MULTIPLIER)
      )
    );
  const configuredMinPriorityGasPrice = BigInt(
    process.env.RPC_WRITE_MIN_PRIORITY_GAS_PRICE_WEI || DEFAULT_MIN_PRIORITY_GAS_PRICE_WEI
  );
  const configuredLegacyGasPrice = process.env.RPC_WRITE_GAS_PRICE_WEI
    ? BigInt(process.env.RPC_WRITE_GAS_PRICE_WEI)
    : null;
  const forceLegacyTransactions =
    String(process.env.RPC_WRITE_USE_LEGACY || "").toLowerCase() === "true";

  async function buildTxOverrides(estimateGasFn) {
    const [feeData, latestBlock, network] = await Promise.all([
      provider.getFeeData(),
      provider.getBlock("latest"),
      provider.getNetwork(),
    ]);

    const gasPrice = configuredLegacyGasPrice || feeData.gasPrice || latestBlock?.baseFeePerGas || 0n;
    const baseFeePerGas = latestBlock?.baseFeePerGas || gasPrice || configuredMinPriorityGasPrice;
    const priorityFeePerGas = bigintMax(
      feeData.maxPriorityFeePerGas || 0n,
      configuredMinPriorityGasPrice
    );
    const maxFeePerGas = bigintMax(
      feeData.maxFeePerGas || 0n,
      (baseFeePerGas * DEFAULT_MAX_FEE_MULTIPLIER) + priorityFeePerGas
    );

    const estimatedGas = estimateGasFn ? await estimateGasFn() : null;
    const gasLimit = estimatedGas
      ? (estimatedGas * GAS_LIMIT_BUFFER_NUMERATOR) / GAS_LIMIT_BUFFER_DENOMINATOR
      : null;

    const shouldUseLegacyTransactions =
      forceLegacyTransactions || Number(network.chainId) === POLKADOT_HUB_TESTNET_CHAIN_ID;

    if (shouldUseLegacyTransactions) {
      const legacyGasPrice = configuredLegacyGasPrice || bigintMax(
        gasPrice * DEFAULT_LEGACY_GAS_PRICE_MULTIPLIER,
        configuredMinPriorityGasPrice
      );
      return {
        ...(gasLimit ? { gasLimit } : {}),
        type: 0,
        gasPrice: legacyGasPrice,
      };
    }

    return {
      ...(gasLimit ? { gasLimit } : {}),
      maxPriorityFeePerGas: priorityFeePerGas,
      maxFeePerGas,
    };
  }

  let artifactsPromise;
  let infrastructurePromise;

  function getArtifacts() {
    if (!artifactsPromise) {
      artifactsPromise = Promise.all([
        compileContract({ contractFile: EVENT_HUB_FILE, contractName: EVENT_HUB_NAME }),
        compileContract({ contractFile: MOCK_USDT_FILE, contractName: MOCK_USDT_NAME }),
        compileContract({ contractFile: LAUNCHPAD_FILE, contractName: LAUNCHPAD_NAME }),
        compileContract({ contractFile: AMM_POOL_FILE, contractName: AMM_POOL_NAME }),
      ]).then(([eventHub, mockUsdt, launchpad, ammPool]) => ({
        eventHub,
        mockUsdt,
        launchpad,
        ammPool,
      }));
    }
    return artifactsPromise;
  }

  async function getNetwork() {
    const network = await provider.getNetwork();
    return toNetworkInfo(network);
  }

  async function ensureDeployedContract(factoryArtifact, args, label) {
    const factory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
    const deployOverrides = await buildTxOverrides();
    const contract = await factory.deploy(...args, deployOverrides);
    const deployTx = contract.deploymentTransaction();
    await contract.waitForDeployment();
    const deployedAddress = await contract.getAddress();
    serviceLogger.info({
      operation: "service.launchpad.deployContract",
      stage: "success",
      status: "success",
      context: {
        label,
        address: deployedAddress,
        txHash: deployTx?.hash || null,
      },
    });
    return {
      address: deployedAddress,
      txHash: deployTx?.hash || null,
    };
  }

  async function ensureInfrastructure() {
    if (!infrastructurePromise) {
      infrastructurePromise = (async () => {
        const startedAt = Date.now();
        const artifacts = await getArtifacts();
        const network = await getNetwork();
        let deploymentBlock = await provider.getBlockNumber();

        let resolvedEventHubAddress = configuredEventHub;
        let resolvedQuoteTokenAddress = configuredQuoteToken;
        let resolvedLaunchpadAddress = configuredLaunchpad;

        if (!resolvedEventHubAddress) {
          const deployed = await ensureDeployedContract(
            artifacts.eventHub,
            [wallet.address],
            "eventHub"
          );
          resolvedEventHubAddress = deployed.address;
          deploymentBlock = await provider.getBlockNumber();
        }

        if (!resolvedQuoteTokenAddress) {
          const deployed = await ensureDeployedContract(
            artifacts.mockUsdt,
            [wallet.address],
            "mockUsdt"
          );
          resolvedQuoteTokenAddress = deployed.address;
          deploymentBlock = await provider.getBlockNumber();
        }

        if (!resolvedLaunchpadAddress) {
          const deployed = await ensureDeployedContract(
            artifacts.launchpad,
            [
              resolvedQuoteTokenAddress,
              resolvedEventHubAddress,
              resolvedProtocolTreasury,
              poolAllocationBps,
              initialQuoteLiquidity,
              swapFeeBps,
              creatorFeeShareBps,
              wallet.address,
            ],
            "launchpad"
          );
          resolvedLaunchpadAddress = deployed.address;
          deploymentBlock = await provider.getBlockNumber();
        }

        const eventHub = new ethers.Contract(resolvedEventHubAddress, artifacts.eventHub.abi, wallet);
        const mockUsdt = new ethers.Contract(resolvedQuoteTokenAddress, artifacts.mockUsdt.abi, wallet);
        const launchpad = new ethers.Contract(
          resolvedLaunchpadAddress,
          artifacts.launchpad.abi,
          wallet
        );

        const registeredLaunchpad = await eventHub.launchpad();
        if (!registeredLaunchpad || registeredLaunchpad.toLowerCase() !== resolvedLaunchpadAddress.toLowerCase()) {
          const txOverrides = await buildTxOverrides(() =>
            eventHub.setLaunchpad.estimateGas(resolvedLaunchpadAddress)
          );
          const tx = await eventHub.setLaunchpad(resolvedLaunchpadAddress, txOverrides);
          await tx.wait();
        }

        const currentBalance = await mockUsdt.balanceOf(wallet.address);
        if (currentBalance < initialQuoteLiquidity) {
          const mintTarget = bootstrapQuoteMintAmount > initialQuoteLiquidity ? bootstrapQuoteMintAmount : initialQuoteLiquidity;
          const txOverrides = await buildTxOverrides(() =>
            mockUsdt.mint.estimateGas(wallet.address, mintTarget)
          );
          const mintTx = await mockUsdt.mint(wallet.address, mintTarget, txOverrides);
          await mintTx.wait();
        }

        const allowance = await mockUsdt.allowance(wallet.address, resolvedLaunchpadAddress);
        if (allowance < initialQuoteLiquidity) {
          const txOverrides = await buildTxOverrides(() =>
            mockUsdt.approve.estimateGas(resolvedLaunchpadAddress, ethers.MaxUint256)
          );
          const approveTx = await mockUsdt.approve(
            resolvedLaunchpadAddress,
            ethers.MaxUint256,
            txOverrides
          );
          await approveTx.wait();
        }

        const infrastructure = {
          network,
          eventHubAddress: resolvedEventHubAddress,
          quoteTokenAddress: resolvedQuoteTokenAddress,
          launchpadAddress: resolvedLaunchpadAddress,
          protocolTreasuryAddress: resolvedProtocolTreasury,
          initialQuoteLiquidity: initialQuoteLiquidity.toString(),
          poolAllocationBps,
          swapFeeBps,
          creatorFeeShareBps,
          quoteTokenDecimals,
          deploymentBlock,
          backendWalletAddress: wallet.address,
        };

        serviceLogger.info({
          operation: "service.launchpad.ensureInfrastructure",
          stage: "success",
          status: "success",
          durationMs: Date.now() - startedAt,
          context: toLogSafe(infrastructure),
        });

        return infrastructure;
      })().catch((error) => {
        infrastructurePromise = undefined;
        throw error;
      });
    }

    return infrastructurePromise;
  }

  async function init() {
    await getArtifacts();
    await ensureInfrastructure();
  }

  async function launchToken({ name, symbol, creatorAddress }) {
    const operation = "service.launchpad.launchToken";
    const startedAt = Date.now();

    try {
      const infrastructure = await ensureInfrastructure();
      const artifacts = await getArtifacts();
      const creator = ethers.getAddress(creatorAddress);
      const launchpad = new ethers.Contract(
        infrastructure.launchpadAddress,
        artifacts.launchpad.abi,
        wallet
      );
      const eventHubInterface = new ethers.Interface(artifacts.eventHub.abi);

      const txOverrides = await buildTxOverrides(() =>
        launchpad.launchToken.estimateGas(name, symbol, creator)
      );
      const tx = await launchpad.launchToken(name, symbol, creator, txOverrides);
      const receipt = await tx.wait();

      let launchEvent = null;
      let liquidityEvent = null;

      for (const log of receipt.logs || []) {
        try {
          if (log.address.toLowerCase() === infrastructure.eventHubAddress.toLowerCase()) {
            const parsed = eventHubInterface.parseLog(log);
            if (parsed?.name === "TokenLaunched") {
              launchEvent = parsed;
            }
            if (parsed?.name === "LiquidityInitialized") {
              liquidityEvent = parsed;
            }
          }
        } catch (_error) {
          // ignore unrelated logs
        }
      }

      if (!launchEvent) {
        throw new Error("Launch transaction completed without TokenLaunched event");
      }

      const result = {
        tokenAddress: launchEvent.args.token,
        poolAddress: launchEvent.args.pool,
        quoteTokenAddress: infrastructure.quoteTokenAddress,
        eventHubAddress: infrastructure.eventHubAddress,
        creatorAddress: creator,
        ownerAddress: creator,
        launchedByAddress: wallet.address,
        network: infrastructure.network,
        decimals: 18,
        totalSupply: launchEvent.args.totalSupply.toString(),
        creatorAllocation: launchEvent.args.creatorAllocation.toString(),
        poolTokenAllocation: launchEvent.args.poolTokenAllocation.toString(),
        poolUsdtAllocation: launchEvent.args.poolUsdtAllocation.toString(),
        initialPrice: launchEvent.args.initialPriceQuoteE18.toString(),
        transactions: {
          launch: tx.hash,
          deploy: tx.hash,
          tokenTransfer: null,
          ownershipTransfer: null,
        },
        swapFeeBps: infrastructure.swapFeeBps,
        creatorFeeShareBps: infrastructure.creatorFeeShareBps,
        reserveTokenAfter: liquidityEvent?.args?.reserveToken?.toString() || null,
        reserveUsdtAfter: liquidityEvent?.args?.reserveUsdt?.toString() || null,
      };

      serviceLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: toLogSafe(result),
      });

      return result;
    } catch (error) {
      const onChainError = new OnChainError(
        "Failed to launch token through Launchpad",
        {
          name,
          symbol,
          creatorAddress,
        },
        error
      );
      onChainError.operation = operation;
      onChainError.stage = "failure";
      serviceLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: onChainError,
      });
      throw onChainError;
    }
  }

  return {
    init,
    getNetwork,
    getArtifacts,
    getInfrastructure: ensureInfrastructure,
    getBackendWalletAddress: () => wallet.address,
    getProvider: () => provider,
    launchToken,
  };
}

module.exports = {
  createLaunchpadDeploymentService,
};
