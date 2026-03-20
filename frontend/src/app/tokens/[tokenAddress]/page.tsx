"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { AppNavbar } from "@/components/app-navbar";
import { WalletGate } from "@/components/wallet-gate";
import { useWallet } from "@/components/wallet-provider";
import { ensureWalletOnChain, POLKADOT_HUB_TESTNET } from "@/lib/wallet";
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

function CandleChart({
  candles,
  variant = "light",
}: {
  candles: TokenCandle[];
  variant?: "light" | "dark";
}) {
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
      <div
        className={`rounded-[28px] border p-6 text-sm ${
          variant === "dark"
            ? "border-white/10 bg-slate-950 text-slate-300"
            : "border-slate-200 bg-white/80 text-slate-500"
        }`}
      >
        No candle data indexed yet.
      </div>
    );
  }

  return (
    <div
      className={`overflow-x-auto rounded-[28px] border p-4 ${
        variant === "dark"
          ? "border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-[0_25px_60px_rgba(15,23,42,0.45)]"
          : "border-slate-200 bg-white/90"
      }`}
    >
      <svg viewBox="0 0 760 300" className="h-[300px] w-full min-w-[760px]">
        <rect
          x="0"
          y="0"
          width="760"
          height="300"
          rx="18"
          fill={variant === "dark" ? "#050816" : "rgba(248,250,252,0.75)"}
        />
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
  const { walletAddress, isReady, getBrowserProvider } = useWallet();
  const params = useParams<{ tokenAddress: string }>();
  const tokenAddress = params.tokenAddress;
  const [token, setToken] = useState<TokenLaunch | null>(null);
  const [events, setEvents] = useState<TokenEvent[]>([]);
  const [candles, setCandles] = useState<TokenCandle[]>([]);
  const [interval, setInterval] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
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
    if (!isReady) {
      return;
    }

    if (!walletAddress) {
      setToken(null);
      setEvents([]);
      setCandles([]);
      setLoading(false);
      setErrorMessage("");
      setTradeAmount("");
      setTradeStatus("");
      return;
    }

    void loadToken(interval);
  }, [interval, isReady, loadToken, walletAddress]);

  const onTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!walletAddress) {
      setTradeStatus("Connect wallet on the landing page first.");
      return;
    }
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
      const provider = getBrowserProvider();
      if (!provider) {
        setTradeStatus("No wallet detected in this browser.");
        return;
      }

      await ensureWalletOnChain(provider, token.chainId || POLKADOT_HUB_TESTNET.chainId);

      const signer = await provider.getSigner();
      const walletSignerAddress = ethers.getAddress(await signer.getAddress());
      const pool = new ethers.Contract(token.poolAddress, AMM_POOL_ABI, signer);
      const approvalTokenAddress = tradeSide === "buy" ? token.quoteTokenAddress : token.tokenAddress;
      const approvalDecimals = tradeSide === "buy" ? 6 : 18;
      const rawAmount = ethers.parseUnits(tradeAmount.trim(), approvalDecimals);
      const approvalToken = new ethers.Contract(approvalTokenAddress, ERC20_ABI, signer);
      const currentAllowance = await approvalToken.allowance(walletSignerAddress, token.poolAddress);
      if (currentAllowance < rawAmount) {
        setTradeStatus(`Approving ${tradeSide === "buy" ? "USDT" : token.tokenSymbol}...`);
        const approvalTx = await approvalToken.approve(token.poolAddress, ethers.MaxUint256);
        await approvalTx.wait();
      }

      setTradeStatus("Submitting swap transaction...");
      const tx =
        tradeSide === "buy"
          ? await pool.swapExactQuoteForToken(rawAmount, 0, walletSignerAddress)
          : await pool.swapExactTokenForQuote(rawAmount, 0, walletSignerAddress);
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

  const launcherAddress = token?.launchedByAddress || token?.creatorAddress || "";
  const feeRecipientAddress = token?.ownerAddress || "";
  const explorerBase = POLKADOT_HUB_TESTNET.blockExplorerUrls[0];
  const contractExplorer = token ? `${explorerBase}/address/${token.tokenAddress}` : "";

  if (!isReady) {
    return (
      <WalletGate
        title="Restoring your wallet session"
        description="We are reconnecting your wallet before opening the token detail page."
      />
    );
  }

  if (!walletAddress) {
    return (
      <WalletGate
        title="Connect wallet to view this token"
        description="Token detail pages are wallet-gated. Connect from the landing page to continue."
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <AppNavbar />
      </div>

      <section className="fade-in rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br from-slate-200 to-slate-100 text-2xl font-semibold text-slate-500">
              {token ? token.tokenName.slice(0, 1).toUpperCase() : "T"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                  {token ? token.tokenName : shortenHash(tokenAddress)}
                </h1>
                {token ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {token.launchStatus}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-mono text-sm text-slate-500">
                {token ? `$${token.tokenSymbol}` : tokenAddress}
              </p>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      {loading && !token ? (
        <div className="mt-6 rounded-[24px] border border-slate-200 bg-white/80 p-6 text-sm text-slate-500">
          Loading token view...
        </div>
      ) : null}

      {token ? (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_0.75fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] md:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Market view
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Price / MCAP
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Event-sourced candles built from indexed swaps and launch liquidity.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["1m", "5m", "1h", "1d"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval(value)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        interval === value
                          ? "bg-slate-950 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-950 p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {token.tokenSymbol}/USD • {interval}
                  </span>
                  <span>${formatPrice(token.stats?.latestPrice || token.initialPrice)}</span>
                </div>
                <CandleChart candles={candles} variant="dark" />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Price</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Liquidity</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    ${formatQuoteAmount(token.stats?.liquidityQuote)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Trades</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {token.stats?.tradeCount ?? 0}
                  </p>
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">Token Info</h2>
                <div className="mt-5 space-y-4 text-sm text-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Launcher
                    </span>
                    <span className="max-w-[60%] break-all text-right font-mono text-slate-900">
                      {shortenHash(launcherAddress)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Fee recipient
                    </span>
                    <span className="max-w-[60%] break-all text-right font-mono text-slate-900">
                      {shortenHash(feeRecipientAddress)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Chain
                    </span>
                    <span className="font-semibold text-slate-950">{token.networkName}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Contract
                    </span>
                    <span className="max-w-[60%] break-all text-right font-mono text-slate-900">
                      {shortenHash(token.tokenAddress)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Transaction
                    </span>
                    <span className="max-w-[60%] break-all text-right font-mono text-slate-900">
                      {shortenHash(token.launchTxHash || token.deployTxHash)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <Link
                    href={contractExplorer}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    View on Explorer
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(token.tokenAddress);
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Copy Contract Address
                  </button>
                </div>
              </section>

              <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-950">Trade</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Buy or sell directly from your wallet against this pool.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {walletAddress ? shortenHash(walletAddress) : "wallet not connected"}
                  </span>
                </div>

                <form className="mt-5 space-y-4" onSubmit={onTrade}>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTradeSide("buy")}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        tradeSide === "buy"
                          ? "bg-emerald-700 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setTradeSide("sell")}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        tradeSide === "sell"
                          ? "bg-slate-950 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder={tradeSide === "buy" ? "100" : "2500"}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmittingTrade}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingTrade ? "Submitting..." : `Confirm ${tradeSide}`}
                  </button>
                </form>

                <div className="mt-4 space-y-2 text-xs text-slate-500">
                  <p>Pool: {shortenHash(token.poolAddress)}</p>
                  <p>Quote token: {shortenHash(token.quoteTokenAddress)}</p>
                  <p>Launch tx: {shortenHash(token.launchTxHash || token.deployTxHash)}</p>
                </div>

                {tradeStatus ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
                    {tradeStatus}
                  </div>
                ) : null}
              </section>
            </aside>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Launch Metadata
              </h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p className="break-all font-mono text-xs">Creator: {token.creatorAddress}</p>
                <p className="break-all font-mono text-xs">Owner: {token.ownerAddress}</p>
                <p className="break-all font-mono text-xs">Pool: {token.poolAddress || "n/a"}</p>
                <p className="break-all font-mono text-xs">
                  Quote token: {token.quoteTokenAddress || "n/a"}
                </p>
                <p className="break-all font-mono text-xs">
                  EventHub: {token.eventHubAddress || "n/a"}
                </p>
                <p>
                  Creator allocation: {formatTokenAmount(token.creatorAllocation)} {token.tokenSymbol}
                </p>
                <p>
                  Pool token allocation: {formatTokenAmount(token.poolTokenAllocation)} {token.tokenSymbol}
                </p>
                <p>Pool USDT allocation: ${formatQuoteAmount(token.poolUsdtAllocation)}</p>
                <p>Swap fee: {token.swapFeeBps ?? 0} bps</p>
                <p>Creator fee share: {token.creatorFeeShareBps ?? 0} bps</p>
                <p>Launch tx: {shortenHash(token.launchTxHash || token.deployTxHash)}</p>
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                    Recent Activity
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Latest indexed launch, liquidity, swap, and fee events.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadToken(interval)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No indexed activity yet.
                  </div>
                ) : null}

                {events.map((marketEvent) => (
                  <article
                    key={marketEvent.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {marketEvent.eventType}
                          {marketEvent.side ? ` • ${marketEvent.side.toUpperCase()}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTimestamp(marketEvent.blockTimestamp * 1000)} • tx{" "}
                          {shortenHash(marketEvent.txHash)}
                        </p>
                      </div>
                      {marketEvent.priceQuoteE18 ? (
                        <p className="text-sm font-semibold text-slate-950">
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
      ) : null}
    </main>
  );
}
