"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { AppShell } from "@/components/app-navbar";
import { WalletGate } from "@/components/wallet-gate";
import { useWallet } from "@/components/wallet-provider";
import { ERC20_ABI } from "@/lib/erc20";
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

const MIN_SLOTS = 30;
const CHART_W = 720;
const CHART_H = 280;
const AXIS_W = 70; // right axis width
const PADDING_TOP = 16;
const PADDING_BOTTOM = 24;

function formatPriceLabel(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return value.toExponential(2);
  if (value < 0.001) return value.toFixed(7);
  if (value < 1) return value.toFixed(6);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function CandleChart({
  candles,
  variant = "light",
  tokenSymbol,
  intervalLabel,
  latestPrice,
}: {
  candles: TokenCandle[];
  variant?: "light" | "dark";
  tokenSymbol?: string;
  intervalLabel?: string;
  latestPrice?: string;
}) {
  const { points, priceLabels } = useMemo(() => {
    if (!candles.length) return { points: [], priceLabels: [] };

    const highs = candles.map((c) => Number(ethers.formatUnits(c.high, 18)));
    const lows = candles.map((c) => Number(ethers.formatUnits(c.low, 18)));
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow || maxHigh * 0.1 || 1;

    // padding so candles don't touch top/bottom
    const paddedMin = minLow - range * 0.08;
    const paddedMax = maxHigh + range * 0.08;
    const paddedRange = paddedMax - paddedMin || 1;

    const usableH = CHART_H - PADDING_TOP - PADDING_BOTTOM;
    const scaleY = (price: number) =>
      PADDING_TOP + usableH - ((price - paddedMin) / paddedRange) * usableH;

    // Always show at least MIN_SLOTS slots; candles are right-aligned
    const totalSlots = Math.max(candles.length, MIN_SLOTS);
    const gap = CHART_W / totalSlots;
    const candleWidth = Math.max(3, gap * 0.6);
    const startOffset = (totalSlots - candles.length) * gap;

    const pts = candles.map((candle, i) => {
      const open = Number(ethers.formatUnits(candle.open, 18));
      const high = Number(ethers.formatUnits(candle.high, 18));
      const low = Number(ethers.formatUnits(candle.low, 18));
      const close = Number(ethers.formatUnits(candle.close, 18));
      const x = startOffset + i * gap + gap / 2;
      return {
        x,
        candleWidth,
        openY: scaleY(open),
        closeY: scaleY(close),
        highY: scaleY(high),
        lowY: scaleY(low),
        positive: close >= open,
        key: candle.bucketStart,
      };
    });

    // Generate 5 horizontal price grid labels
    const numLabels = 5;
    const labels = Array.from({ length: numLabels }, (_, i) => {
      const price = paddedMin + (paddedRange * i) / (numLabels - 1);
      const y = scaleY(price);
      return { price, y };
    }).reverse();

    return { points: pts, priceLabels: labels };
  }, [candles]);

  const isDark = variant === "dark";
  const bg = isDark ? "#0f0e27" : "#f8fafc";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const labelColor = isDark ? "#9ca3af" : "#64748b";
  const totalWidth = CHART_W + AXIS_W;

  if (!candles.length) {
    return (
      <div
        className={`flex h-52 items-center justify-center rounded-2xl border text-sm ${
          isDark
            ? "border-white/10 bg-[#1d1c45] text-slate-400"
            : "border-slate-200 bg-slate-50 text-slate-500"
        }`}
      >
        No candle data yet — activity will appear here once trades are indexed.
      </div>
    );
  }

  return (
    <div
      className={`overflow-x-auto rounded-2xl ${
        isDark
          ? "bg-[#0f0e27]"
          : "border border-slate-200 bg-white"
      }`}
    >
      <svg
        viewBox={`0 0 ${totalWidth} ${CHART_H}`}
        className="h-[280px] w-full"
        style={{ minWidth: 320 }}
      >
        {/* background */}
        <rect x={0} y={0} width={totalWidth} height={CHART_H} fill={bg} rx={0} />

        {/* horizontal grid lines + price labels */}
        {priceLabels.map((label, i) => (
          <g key={i}>
            <line
              x1={0}
              x2={CHART_W}
              y1={label.y}
              y2={label.y}
              stroke={gridColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={CHART_W + 8}
              y={label.y + 4}
              fill={labelColor}
              fontSize={10}
              fontFamily="monospace"
            >
              {formatPriceLabel(label.price)}
            </text>
          </g>
        ))}

        {/* candles */}
        {points.map((point) => {
          const bodyTop = Math.min(point.openY, point.closeY);
          const bodyHeight = Math.max(2, Math.abs(point.closeY - point.openY));
          const color = point.positive ? "#7c6ffc" : "#f87171";
          const fillColor = point.positive ? "#7c6ffc" : "#f87171";
          return (
            <g key={point.key}>
              {/* high-low wick */}
              <line
                x1={point.x}
                x2={point.x}
                y1={point.highY}
                y2={point.lowY}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              {/* open-close body */}
              <rect
                x={point.x - point.candleWidth / 2}
                y={bodyTop}
                width={point.candleWidth}
                height={bodyHeight}
                rx={2}
                fill={fillColor}
                opacity={0.9}
              />
            </g>
          );
        })}

        {/* axis separator */}
        <line
          x1={CHART_W}
          x2={CHART_W}
          y1={0}
          y2={CHART_H}
          stroke={gridColor}
          strokeWidth={1}
        />
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
    <AppShell
      eyebrow="Token Detail"
      title={token ? `${token.tokenName} (${token.tokenSymbol})` : shortenHash(tokenAddress)}
      description="Market activity, metadata, and trading in one place."
      action={
        <button
          type="button"
          onClick={() => void loadToken(interval)}
          className="button-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition"
        >
          ↻ Refresh
        </button>
      }
    >
      {/* ── Hero banner ─────────────────────────────────────── */}
      <section className="accent-panel fade-in rounded-[28px] px-6 py-6 md:px-8 md:py-7">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/14 text-xl font-bold text-white">
              {token ? token.tokenName.slice(0, 1).toUpperCase() : "T"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {token ? token.tokenName : shortenHash(tokenAddress)}
                </h2>
                {token ? (
                  <span className="rounded-full border border-white/22 bg-white/14 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-white/90">
                    {token.launchStatus}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-sm text-white/70">
                {token ? `$${token.tokenSymbol}` : tokenAddress}
              </p>
            </div>
          </div>

          {token ? (
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {[
                { label: "Price", value: `$${formatPrice(token.stats?.latestPrice || token.initialPrice)}` },
                { label: "Liquidity", value: `$${formatQuoteAmount(token.stats?.liquidityQuote)}` },
                { label: "Trades", value: String(token.stats?.tradeCount ?? 0) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-[18px] border border-white/16 bg-white/10 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/60">{label}</p>
                  <p className="mt-1 text-base font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Alerts ──────────────────────────────────────────── */}
      {errorMessage ? (
        <div className="status-danger mt-5 rounded-2xl border p-4 text-sm">{errorMessage}</div>
      ) : null}
      {loading && !token ? (
        <div className="panel mt-5 rounded-2xl p-6 text-sm text-slate-500">
          Loading token…
        </div>
      ) : null}

      {token ? (
        <div className="mt-5 space-y-5">

          {/* ── Row 1: Chart (left 60%) + Sidebar (right 40%) ── */}
          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">

            {/* Chart panel */}
            <section className="panel rounded-[24px] p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="shell-kicker">Market View</p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                    Price Chart
                  </h3>
                  <p className="text-xs text-slate-500">
                    Event-sourced candles from indexed swaps &amp; launch liquidity
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(["1m", "5m", "1h", "1d"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval(value)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        interval === value ? "button-primary" : "button-secondary"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart header bar */}
              <div className="mb-2 flex items-center justify-between rounded-xl bg-[#0f0e27] px-4 py-2 text-xs">
                <span className="font-mono text-slate-400">
                  {token.tokenSymbol}/USD · {interval}
                </span>
                <span className="font-mono font-semibold text-white">
                  ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
                </span>
              </div>

              <CandleChart
                candles={candles}
                variant="dark"
                tokenSymbol={token.tokenSymbol}
                intervalLabel={interval}
                latestPrice={token.stats?.latestPrice || token.initialPrice || undefined}
              />

              <p className="mt-2 text-right text-[10px] text-slate-400">
                {candles.length} candle{candles.length !== 1 ? "s" : ""} · {interval} interval
              </p>
            </section>

            {/* Right sidebar */}
            <aside className="flex flex-col gap-5">

              {/* Token Info */}
              <section className="panel-soft rounded-[24px] p-5">
                <h3 className="text-base font-bold tracking-tight text-slate-900">Token Info</h3>

                <div className="mt-4 space-y-3">
                  {[
                    { label: "Launcher", value: launcherAddress, mono: true },
                    { label: "Fee Recipient", value: feeRecipientAddress, mono: true },
                    { label: "Chain", value: token.networkName || "unknown", mono: false },
                    { label: "Contract", value: token.tokenAddress, mono: true },
                    { label: "Launch Tx", value: token.launchTxHash || token.deployTxHash, mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        {label}
                      </span>
                      <span
                        className={`max-w-[55%] truncate text-right text-sm font-medium text-slate-900 ${mono ? "font-mono" : ""}`}
                        title={value || ""}
                      >
                        {value ? shortenHash(value) : "n/a"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    href={contractExplorer}
                    target="_blank"
                    rel="noreferrer"
                    className="button-secondary inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition"
                  >
                    View on Explorer ↗
                  </Link>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(token.tokenAddress)}
                    className="button-secondary inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition"
                  >
                    Copy Address
                  </button>
                </div>
              </section>

              {/* Trade panel */}
              <section className="panel-soft rounded-[24px] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold tracking-tight text-slate-900">Trade</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Buy or sell from your wallet against this pool.
                    </p>
                  </div>
                  <span className="chip shrink-0 font-mono text-xs">
                    {walletAddress ? shortenHash(walletAddress) : "—"}
                  </span>
                </div>

                <form className="space-y-3" onSubmit={onTrade}>
                  <div className="grid grid-cols-2 gap-2">
                    {(["buy", "sell"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setTradeSide(side)}
                        className={`rounded-xl py-2.5 text-sm font-semibold capitalize transition ${
                          tradeSide === side ? "button-primary" : "button-secondary"
                        }`}
                      >
                        {side}
                      </button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">
                      Amount in {tradeSide === "buy" ? "USDT" : token.tokenSymbol}
                    </span>
                    <input
                      className="app-input rounded-xl px-4 py-2.5 text-sm"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder={tradeSide === "buy" ? "100" : "2500"}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmittingTrade}
                    className="button-primary inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingTrade ? "Submitting…" : `Confirm ${tradeSide}`}
                  </button>
                </form>

                {tradeStatus ? (
                  <div className="panel-muted mt-3 rounded-xl p-3 text-xs leading-relaxed text-slate-700 break-all">
                    {tradeStatus}
                  </div>
                ) : null}

                <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                  <p>Pool: <span className="font-mono">{shortenHash(token.poolAddress)}</span></p>
                  <p>Quote: <span className="font-mono">{shortenHash(token.quoteTokenAddress)}</span></p>
                </div>
              </section>
            </aside>
          </div>

          {/* ── Row 2: Launch Metadata + Recent Activity ──────── */}
          <div className="grid gap-5 lg:grid-cols-2">

            {/* Launch Metadata */}
            <section className="panel rounded-[24px] p-5">
              <h3 className="mb-4 text-base font-bold tracking-tight text-slate-900">
                Launch Metadata
              </h3>
              <div className="space-y-2.5 text-sm">
                {[
                  { label: "Creator", value: token.creatorAddress, mono: true },
                  { label: "Owner", value: token.ownerAddress, mono: true },
                  { label: "Pool", value: token.poolAddress, mono: true },
                  { label: "Quote token", value: token.quoteTokenAddress, mono: true },
                  { label: "EventHub", value: token.eventHubAddress, mono: true },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-xs text-slate-500">{label}</span>
                    <span
                      className={`truncate text-right text-xs text-slate-800 ${mono ? "font-mono" : ""}`}
                      title={value || "n/a"}
                    >
                      {value || "n/a"}
                    </span>
                  </div>
                ))}
                <div className="my-1 border-t border-slate-100" />
                {[
                  { label: "Creator allocation", value: `${formatTokenAmount(token.creatorAllocation)} ${token.tokenSymbol}` },
                  { label: "Pool token allocation", value: `${formatTokenAmount(token.poolTokenAllocation)} ${token.tokenSymbol}` },
                  { label: "Pool USDT allocation", value: `$${formatQuoteAmount(token.poolUsdtAllocation)}` },
                  { label: "Swap fee", value: `${token.swapFeeBps ?? 0} bps` },
                  { label: "Creator fee share", value: `${token.creatorFeeShareBps ?? 0} bps` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity */}
            <section className="panel rounded-[24px] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-slate-900">
                    Recent Activity
                  </h3>
                  <p className="text-xs text-slate-500">
                    Latest indexed swaps, liquidity, and fee events
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadToken(interval)}
                  className="button-secondary shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition"
                >
                  Refresh
                </button>
              </div>

              <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <div className="panel-muted rounded-xl p-5 text-sm text-slate-500">
                    No indexed activity yet.
                  </div>
                ) : (
                  events.map((marketEvent) => {
                    const isBuy = marketEvent.side?.toLowerCase() === "buy";
                    const isSell = marketEvent.side?.toLowerCase() === "sell";
                    return (
                      <article
                        key={marketEvent.id}
                        className="rounded-xl border border-[rgba(129,140,248,0.12)] bg-white/70 p-3 text-xs text-slate-700"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                                isBuy
                                  ? "bg-violet-100 text-violet-700"
                                  : isSell
                                  ? "bg-red-100 text-red-600"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {marketEvent.side ? marketEvent.side.toUpperCase() : marketEvent.eventType}
                            </span>
                            <span className="text-slate-600">{marketEvent.eventType}</span>
                          </div>
                          {marketEvent.priceQuoteE18 ? (
                            <span className="font-mono font-semibold text-slate-900">
                              ${formatPrice(marketEvent.priceQuoteE18)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-400">
                          {formatTimestamp(marketEvent.blockTimestamp * 1000)} ·{" "}
                          <span className="font-mono">{shortenHash(marketEvent.txHash)}</span>
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-500">
                          <span>In: <span className="font-mono text-slate-700">{marketEvent.amountIn ? formatTokenAmount(marketEvent.amountIn) : "—"}</span></span>
                          <span>Out: <span className="font-mono text-slate-700">{marketEvent.amountOut ? formatTokenAmount(marketEvent.amountOut) : "—"}</span></span>
                          <span>Reserve token: <span className="font-mono text-slate-700">{marketEvent.reserveTokenAfter ? formatTokenAmount(marketEvent.reserveTokenAfter) : "—"}</span></span>
                          <span>Reserve USDT: <span className="font-mono text-slate-700">{marketEvent.reserveUsdtAfter ? formatQuoteAmount(marketEvent.reserveUsdtAfter) : "—"}</span></span>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
