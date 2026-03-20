"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import type { TokenCandle, TokenEvent, TokenLaunch } from "@/lib/tokens";

type TokenDetailResponse = {
  token?: TokenLaunch;
  message?: string;
};

type TokenEventsResponse = {
  events?: TokenEvent[];
  message?: string;
};

type TokenCandlesResponse = {
  candles?: TokenCandle[];
  message?: string;
};

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const POLKADOT_HUB_TESTNET = {
  chainId: 420420417,
  chainName: "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "Paseo",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: [
    "https://eth-rpc-testnet.polkadot.io/",
    "https://services.polkadothub-rpc.com/testnet/",
  ],
  blockExplorerUrls: [
    "https://blockscout-testnet.polkadot.io/",
    "https://polkadot.testnet.routescan.io/",
  ],
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

const AMM_POOL_ABI = [
  "function getAmountOutForQuoteIn(uint256 quoteAmountIn) view returns (uint256)",
  "function getAmountOutForTokenIn(uint256 tokenAmountIn) view returns (uint256)",
  "function swapExactQuoteForToken(uint256 quoteAmountIn, uint256 minTokenOut, address recipient) external returns (uint256)",
  "function swapExactTokenForQuote(uint256 tokenAmountIn, uint256 minQuoteOut, address recipient) external returns (uint256)",
];

function getWalletProvider() {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { ethereum?: WalletProvider }).ethereum || null;
}

async function ensureWalletOnChain(provider: ethers.BrowserProvider, chainId: number) {
  const chainHex = ethers.toQuantity(BigInt(chainId));
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  } catch (error) {
    const switchError = error as { code?: number };
    if (switchError.code !== 4902) {
      throw error;
    }
    await provider.send("wallet_addEthereumChain", [
      {
        chainId: chainHex,
        chainName: POLKADOT_HUB_TESTNET.chainName,
        nativeCurrency: POLKADOT_HUB_TESTNET.nativeCurrency,
        rpcUrls: POLKADOT_HUB_TESTNET.rpcUrls,
        blockExplorerUrls: POLKADOT_HUB_TESTNET.blockExplorerUrls,
      },
    ]);
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  }
}

function formatPrice(value?: string | null) {
  try {
    return Number(ethers.formatUnits(value || "0", 18)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  } catch {
    return "0";
  }
}

function formatQuoteAmount(value?: string | null) {
  try {
    return Number(ethers.formatUnits(value || "0", 6)).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } catch {
    return "0";
  }
}

function formatTokenAmount(value?: string | null) {
  try {
    return Number(ethers.formatUnits(value || "0", 18)).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } catch {
    return "0";
  }
}

function shortenHash(value?: string | null) {
  if (!value) {
    return "n/a";
  }
  if (value.length < 16) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) {
    return "n/a";
  }
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CandleChart({ candles }: { candles: TokenCandle[] }) {
  const points = useMemo(() => {
    if (!candles.length) {
      return [];
    }
    const highs = candles.map((item) => Number(ethers.formatUnits(item.high, 18)));
    const lows = candles.map((item) => Number(ethers.formatUnits(item.low, 18)));
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow || 1;
    const width = 760;
    const height = 300;
    const gap = width / Math.max(candles.length, 1);
    const candleWidth = Math.max(4, gap * 0.55);

    return candles.map((candle, index) => {
      const open = Number(ethers.formatUnits(candle.open, 18));
      const high = Number(ethers.formatUnits(candle.high, 18));
      const low = Number(ethers.formatUnits(candle.low, 18));
      const close = Number(ethers.formatUnits(candle.close, 18));
      const x = index * gap + gap / 2;
      const scaleY = (price: number) => height - ((price - minLow) / range) * (height - 24) - 12;
      return {
        x,
        candleWidth,
        openY: scaleY(open),
        closeY: scaleY(close),
        highY: scaleY(high),
        lowY: scaleY(low),
        positive: close >= open,
      };
    });
  }, [candles]);

  if (!candles.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-500">
        No candle data indexed yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90 p-4">
      <svg viewBox="0 0 760 300" className="h-[300px] w-full min-w-[760px]">
        <rect x="0" y="0" width="760" height="300" rx="18" fill="rgba(248,250,252,0.75)" />
        {points.map((point, index) => {
          const bodyTop = Math.min(point.openY, point.closeY);
          const bodyHeight = Math.max(3, Math.abs(point.closeY - point.openY));
          const color = point.positive ? "#0f766e" : "#c2410c";
          return (
            <g key={candles[index].bucketStart}>
              <line
                x1={point.x}
                x2={point.x}
                y1={point.highY}
                y2={point.lowY}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect
                x={point.x - point.candleWidth / 2}
                y={bodyTop}
                width={point.candleWidth}
                height={bodyHeight}
                rx="3"
                fill={color}
                opacity="0.9"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function TokenDetailPage() {
  const params = useParams<{ tokenAddress: string }>();
  const tokenAddress = params.tokenAddress;
  const [token, setToken] = useState<TokenLaunch | null>(null);
  const [events, setEvents] = useState<TokenEvent[]>([]);
  const [candles, setCandles] = useState<TokenCandle[]>([]);
  const [interval, setInterval] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeStatus, setTradeStatus] = useState("");
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);

  const loadToken = useCallback(async (selectedInterval: string) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [detailResponse, eventsResponse, candlesResponse] = await Promise.all([
        fetch(`/api/backend/tokens/${tokenAddress}`, { cache: "no-store" }),
        fetch(`/api/backend/tokens/${tokenAddress}/events?limit=100`, { cache: "no-store" }),
        fetch(`/api/backend/tokens/${tokenAddress}/candles?interval=${selectedInterval}`, {
          cache: "no-store",
        }),
      ]);

      const detailJson = (await detailResponse.json()) as TokenDetailResponse;
      const eventsJson = (await eventsResponse.json()) as TokenEventsResponse;
      const candlesJson = (await candlesResponse.json()) as TokenCandlesResponse;

      if (!detailResponse.ok) {
        setErrorMessage(detailJson.message || "Failed to fetch token details.");
        return;
      }

      setToken(detailJson.token || null);
      setEvents(eventsJson.events || []);
      setCandles(candlesJson.candles || []);
    } catch {
      setErrorMessage("Failed to fetch token details.");
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    void loadToken(interval);
  }, [interval, loadToken]);

  const connectWallet = async () => {
    const injected = getWalletProvider();
    if (!injected) {
      setTradeStatus("No wallet detected in this browser.");
      return null;
    }
    const provider = new ethers.BrowserProvider(injected);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    setWalletAddress(address);
    return { provider, signer, address };
  };

  const onTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token?.poolAddress || !token.quoteTokenAddress) {
      setTradeStatus("Pool is not available for trading yet.");
      return;
    }
    if (!tradeAmount.trim()) {
      setTradeStatus("Enter an amount before submitting a trade.");
      return;
    }

    setIsSubmittingTrade(true);
    setTradeStatus("");

    try {
      const connection = await connectWallet();
      if (!connection) {
        return;
      }
      await ensureWalletOnChain(connection.provider, token.chainId || POLKADOT_HUB_TESTNET.chainId);

      const pool = new ethers.Contract(token.poolAddress, AMM_POOL_ABI, connection.signer);
      const approvalTokenAddress = tradeSide === "buy" ? token.quoteTokenAddress : token.tokenAddress;
      const approvalDecimals = tradeSide === "buy" ? 6 : 18;
      const rawAmount = ethers.parseUnits(tradeAmount.trim(), approvalDecimals);
      const approvalToken = new ethers.Contract(approvalTokenAddress, ERC20_ABI, connection.signer);
      const currentAllowance = await approvalToken.allowance(connection.address, token.poolAddress);
      if (currentAllowance < rawAmount) {
        setTradeStatus(`Approving ${tradeSide === "buy" ? "USDT" : token.tokenSymbol}...`);
        const approvalTx = await approvalToken.approve(token.poolAddress, ethers.MaxUint256);
        await approvalTx.wait();
      }

      setTradeStatus("Submitting swap transaction...");
      const tx =
        tradeSide === "buy"
          ? await pool.swapExactQuoteForToken(rawAmount, 0, connection.address)
          : await pool.swapExactTokenForQuote(rawAmount, 0, connection.address);
      await tx.wait();
      setTradeStatus(`Trade confirmed: ${tx.hash}`);
      setTradeAmount("");
      await loadToken(interval);
    } catch (error) {
      setTradeStatus(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <section className="mb-6 rounded-3xl border border-orange-200/70 bg-white/70 p-6 backdrop-blur-sm fade-in md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800">
              Token Market
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {token ? `${token.tokenName} (${token.tokenSymbol})` : shortenHash(tokenAddress)}
            </h1>
            <p className="mt-2 break-all text-sm text-slate-600 md:text-base">
              Token address: <span className="font-mono text-xs md:text-sm">{tokenAddress}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/tokens"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back To Directory
            </Link>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {errorMessage}
        </div>
      )}

      {loading && !token ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600">
          Loading token market...
        </div>
      ) : null}

      {token && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="glass-card rounded-3xl p-5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Price</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Liquidity</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                ${formatQuoteAmount(token.stats?.liquidityQuote)}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">24h Volume</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                ${formatQuoteAmount(token.stats?.volume24hQuote)}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Trades</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {token.stats?.tradeCount ?? 0}
              </p>
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_0.5fr]">
            <section className="glass-card rounded-3xl p-5 md:p-7">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">AMM Candles</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Event-sourced candles built from indexed swaps and launch liquidity.
                  </p>
                </div>
                <div className="flex gap-2">
                  {(["1m", "5m", "1h", "1d"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval(value)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        interval === value
                          ? "bg-orange-700 text-white"
                          : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <CandleChart candles={candles} />
            </section>

            <aside className="glass-card rounded-3xl p-5 md:p-7">
              <h2 className="text-xl font-semibold text-slate-900">Trade</h2>
              <p className="mt-1 text-sm text-slate-600">
                Submit buy and sell transactions directly from your wallet against this pool.
              </p>

              <form className="mt-5 space-y-4" onSubmit={onTrade}>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTradeSide("buy")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      tradeSide === "buy"
                        ? "bg-emerald-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeSide("sell")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      tradeSide === "sell"
                        ? "bg-orange-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Sell
                  </button>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Amount in {tradeSide === "buy" ? "USDT" : token.tokenSymbol}
                  </span>
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-orange-500"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder={tradeSide === "buy" ? "100" : "2500"}
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmittingTrade}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingTrade ? "Submitting..." : `Confirm ${tradeSide}`}
                </button>
              </form>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <p>Wallet: {walletAddress || "not connected"}</p>
                <p>Pool: {shortenHash(token.poolAddress)}</p>
                <p>Quote token: {shortenHash(token.quoteTokenAddress)}</p>
              </div>

              {tradeStatus && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 text-xs text-slate-700">
                  {tradeStatus}
                </div>
              )}
            </aside>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="glass-card rounded-3xl p-5 md:p-7">
              <h2 className="text-xl font-semibold text-slate-900">Launch Metadata</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p className="break-all font-mono text-xs">Creator: {token.creatorAddress}</p>
                <p className="break-all font-mono text-xs">Pool: {token.poolAddress}</p>
                <p className="break-all font-mono text-xs">Quote token: {token.quoteTokenAddress}</p>
                <p className="break-all font-mono text-xs">EventHub: {token.eventHubAddress}</p>
                <p>Creator allocation: {formatTokenAmount(token.creatorAllocation)} {token.tokenSymbol}</p>
                <p>Pool token allocation: {formatTokenAmount(token.poolTokenAllocation)} {token.tokenSymbol}</p>
                <p>Pool USDT allocation: ${formatQuoteAmount(token.poolUsdtAllocation)}</p>
                <p>Swap fee: {token.swapFeeBps ?? 0} bps</p>
                <p>Creator fee share: {token.creatorFeeShareBps ?? 0} bps</p>
                <p>Launch tx: {shortenHash(token.launchTxHash || token.deployTxHash)}</p>
              </div>
            </section>

            <section className="glass-card rounded-3xl p-5 md:p-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Recent Activity</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Latest indexed launch, liquidity, swap, and fee events.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadToken(interval)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-500">
                    No indexed activity yet.
                  </div>
                ) : null}
                {events.map((marketEvent) => (
                  <article
                    key={marketEvent.id}
                    className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-slate-700"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {marketEvent.eventType}
                          {marketEvent.side ? ` • ${marketEvent.side.toUpperCase()}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTimestamp(marketEvent.blockTimestamp * 1000)} • tx {shortenHash(marketEvent.txHash)}
                        </p>
                      </div>
                      {marketEvent.priceQuoteE18 ? (
                        <p className="text-sm font-semibold text-slate-900">
                          ${formatPrice(marketEvent.priceQuoteE18)}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <p>Amount in: {marketEvent.amountIn ? marketEvent.amountIn : "n/a"}</p>
                      <p>Amount out: {marketEvent.amountOut ? marketEvent.amountOut : "n/a"}</p>
                      <p>Reserve token: {marketEvent.reserveTokenAfter || "n/a"}</p>
                      <p>Reserve USDT: {marketEvent.reserveUsdtAfter || "n/a"}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
