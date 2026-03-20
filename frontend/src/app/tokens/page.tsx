"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import type { TokenLaunch } from "@/lib/tokens";

type LaunchResponse = {
  count: number;
  tokens: TokenLaunch[];
  backendUrl?: string;
  message?: string;
};

type FeedTab = "all" | "pending" | "deployed";

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
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getCardAccent(token: TokenLaunch) {
  const stage = getStage(token);
  if (stage === "pending") {
    return "border-amber-200 shadow-[0_10px_40px_rgba(251,191,36,0.08)]";
  }
  return "border-emerald-200 shadow-[0_10px_40px_rgba(16,185,129,0.08)]";
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
  const [tokens, setTokens] = useState<TokenLaunch[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FeedTab>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [backendUrl, setBackendUrl] = useState("");

  const loadTokens = async () => {
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
      setBackendUrl(data.backendUrl || "");
    } catch {
      setErrorMessage("Failed to fetch launched tokens.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTokens();
  }, []);

  const filteredTokens = useMemo(() => {
    return tokens.filter((token) => {
      const stage = getStage(token);
      const matchesTab = activeTab === "all" || stage === activeTab;
      return matchesTab && matchesQuery(token, search.trim());
    });
  }, [activeTab, search, tokens]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <section className="fade-in rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
              Token Feed
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Browse token launches and market snapshots
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Search by symbol, address, or creator and jump into the detailed token view for
              charts, swaps, and launch metadata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Chat
            </Link>
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600">
              Backend {backendUrl ? "connected" : "offline"}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search tokens</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tokens, usernames, addresses..."
              className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
          </label>

          <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white p-1">
            {(["all", "pending", "deployed"] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 text-sm font-semibold transition ${
                    active ? "rounded-full bg-slate-950 text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab === "all" ? "All" : tab === "pending" ? "Pending" : "Deployed"}
                </button>
              );
            })}
          </div>

          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Launch Token
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Total launches {tokens.length}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Visible {filteredTokens.length}
          </span>
          {search.trim() ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              Query &quot;{search.trim()}&quot;
            </span>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        {isLoading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 text-sm text-slate-500">
            Loading token feed...
          </div>
        ) : null}

        {!isLoading && filteredTokens.length === 0 && !errorMessage ? (
          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 text-sm text-slate-600">
            No tokens matched your search yet.
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredTokens.map((token, index) => (
            <Link
              key={token.id}
              href={`/tokens/${token.tokenAddress}`}
              className={`fade-in block rounded-[28px] border bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] ${getCardAccent(token)}`}
              style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-lg font-semibold text-slate-500">
                    {token.tokenName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                      {token.tokenName}
                    </h2>
                    <p className="mt-1 font-mono text-sm text-slate-500">
                      ${token.tokenSymbol}
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses(token)}`}
                >
                  {getStage(token)}
                </span>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-3 text-sm">
                  <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Launcher
                  </span>
                  <span className="break-all font-mono text-slate-800">
                    {shortenAddress(token.launchedByAddress || token.creatorAddress)}
                  </span>

                  <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Fee To
                  </span>
                  <span className="break-all font-mono text-slate-800">
                    {shortenAddress(token.ownerAddress)}
                  </span>

                  <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">
                    CA
                  </span>
                  <span className="break-all font-mono text-slate-800">
                    {shortenAddress(token.tokenAddress)}
                  </span>

                  <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Launched
                  </span>
                  <span className="font-mono text-slate-800">
                    {formatRelativeTime(token.createdAt)}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-600">
                <div>
                  <p className="uppercase tracking-[0.18em] text-slate-500">Price</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.18em] text-slate-500">Liquidity</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    ${formatQuoteAmount(token.stats?.liquidityQuote)}
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.18em] text-slate-500">Trades</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {token.stats?.tradeCount ?? 0}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
