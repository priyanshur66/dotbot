"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { AppShell } from "@/components/app-navbar";
import { WalletGate } from "@/components/wallet-gate";
import { useWallet } from "@/components/wallet-provider";
import type { TokenLaunch } from "@/lib/tokens";

type LaunchResponse = {
  count: number;
  tokens: TokenLaunch[];
  backendUrl?: string;
  message?: string;
};

type FeedTab = "pending" | "deployed";

function formatQuoteAmount(value?: string | null) {
  try {
    return Number(ethers.formatUnits(value || "0", 6)).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } catch {
    return "0";
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

function shortenAddress(value: string) {
  if (!value) {
    return "n/a";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRelativeTime(timestamp?: number | null) {
  if (!timestamp) {
    return "just now";
  }

  const delta = Date.now() - timestamp;
  if (delta < 60_000) {
    return "just now";
  }
  if (delta < 3_600_000) {
    return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  }
  if (delta < 86_400_000) {
    return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  }
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getStage(token: TokenLaunch): FeedTab {
  const status = token.launchStatus.toLowerCase();
  if (status.includes("pend")) {
    return "pending";
  }
  return "deployed";
}

function getBadgeClasses(token: TokenLaunch) {
  const stage = getStage(token);
  if (stage === "pending") {
    return "status-warning";
  }
  return "status-positive";
}

function getCardAccent(token: TokenLaunch) {
  const stage = getStage(token);
  if (stage === "pending") {
    return "shadow-[0_18px_50px_rgba(214,141,31,0.08)]";
  }
  return "shadow-[0_18px_50px_rgba(90,74,241,0.12)]";
}

function matchesQuery(token: TokenLaunch, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    token.tokenName,
    token.tokenSymbol,
    token.tokenAddress,
    token.creatorAddress,
    token.ownerAddress,
    token.launchedByAddress,
    token.poolAddress || "",
    token.networkName,
    token.launchStatus,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default function TokensPage() {
  const { walletAddress, isReady } = useWallet();
  const [tokens, setTokens] = useState<TokenLaunch[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/backend/tokens/launched", {
        cache: "no-store",
      });
      const data = (await response.json()) as LaunchResponse;
      if (!response.ok) {
        setErrorMessage(data.message || "Failed to fetch launched tokens.");
        return;
      }

      setTokens(data.tokens || []);
    } catch {
      setErrorMessage("Failed to fetch launched tokens.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!walletAddress) {
      setTokens([]);
      return;
    }

    void loadTokens();
  }, [isReady, loadTokens, walletAddress]);

  const filteredTokens = useMemo(() => {
    return tokens.filter((token) => matchesQuery(token, search.trim()));
  }, [search, tokens]);

  if (!isReady) {
    return (
      <WalletGate
        title="Restoring your wallet session"
        description="We are checking the injected wallet before opening the token feed."
      />
    );
  }

  if (!walletAddress) {
    return (
      <WalletGate
        title="Connect wallet to open the token feed"
        description="The token feed is wallet-gated. Connect from the landing page to continue."
      />
    );
  }

  return (
    <AppShell
      eyebrow=""
      title=""
      description=""
      action={
        <button
          type="button"
          onClick={() => void loadTokens()}
          className="button-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
        >
          Refresh feed
        </button>
      }
    >
      <section className="accent-panel rounded-[34px] px-6 py-7 md:px-8 md:py-8">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Search by symbol, address, or creator 
            </h2>
            
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/14 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Total</p>
              <p className="mt-2 text-3xl font-semibold text-white">{tokens.length}</p>
            </div>
            
            
          </div>
        </div>
      </section>

      <section className="panel mt-6 rounded-[32px] p-5 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Search tokens</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tokens, usernames, addresses..."
              className="app-input w-full rounded-full px-5 py-4 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <span className="chip">Launches {tokens.length}</span>
            <span className="chip">Visible {filteredTokens.length}</span>
          </div>
        </div>

        {errorMessage ? (
          <div className="status-danger mt-5 rounded-[24px] border p-4 text-sm">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        {isLoading ? (
          <div className="panel rounded-[28px] p-6 text-sm text-slate-500">
            Loading token feed...
          </div>
        ) : null}

        {!isLoading && filteredTokens.length === 0 && !errorMessage ? (
          <div className="panel rounded-[28px] p-6 text-sm text-slate-500">
            No tokens matched your search yet.
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredTokens.map((token, index) => (
            <Link
              key={token.id}
              href={`/tokens/${token.tokenAddress}`}
              className={`fade-in panel-soft block rounded-[30px] p-5 transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(91,98,161,0.12)] ${getCardAccent(token)}`}
              style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#f0edff,#e0e6ff)] text-lg font-semibold text-[var(--accent-strong)]">
                    {token.tokenName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                      {token.tokenName}
                    </h2>
                    <p className="mt-1 font-mono text-sm text-slate-500">${token.tokenSymbol}</p>
                  </div>
                </div>

                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses(token)}`}>
                  {getStage(token)}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="metric-card rounded-[22px] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Price</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
                  </p>
                </div>
                <div className="metric-card rounded-[22px] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Liquidity</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    ${formatQuoteAmount(token.stats?.liquidityQuote)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-[rgba(129,140,248,0.12)] bg-white/70 p-4">
                <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-3 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Launcher
                  </span>
                  <span className="break-all font-mono text-slate-700">
                    {shortenAddress(token.launchedByAddress || token.creatorAddress)}
                  </span>

                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Contract
                  </span>
                  <span className="break-all font-mono text-slate-700">
                    {shortenAddress(token.tokenAddress)}
                  </span>

                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Launched
                  </span>
                  <span className="font-mono text-slate-700">
                    {formatRelativeTime(token.createdAt)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Trades {token.stats?.tradeCount ?? 0}</span>
                <span className="font-semibold text-[var(--accent-strong)]">Open detail</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
