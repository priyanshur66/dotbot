"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import type { TokenLaunch } from "@/lib/tokens";

type LaunchResponse = {
  count: number;
  tokens: TokenLaunch[];
  backendUrl?: string;
  message?: string;
};

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
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenLaunch[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [backendUrl, setBackendUrl] = useState("");

  const title = useMemo(() => {
    if (!activeFilter) {
      return "Launched Tokens";
    }
    return `Tokens Owned By ${activeFilter}`;
  }, [activeFilter]);

  const loadAllTokens = async () => {
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
      setActiveFilter("");
    } catch {
      setErrorMessage("Failed to fetch launched tokens.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadByOwner = async (ownerAddress: string) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/backend/tokens/by-owner?ownerAddress=${encodeURIComponent(ownerAddress)}`,
        {
          cache: "no-store",
        }
      );
      const data = (await response.json()) as LaunchResponse;
      if (!response.ok) {
        setErrorMessage(data.message || "Failed to fetch tokens by owner.");
        return;
      }
      setTokens(data.tokens || []);
      setBackendUrl(data.backendUrl || "");
      setActiveFilter(ownerAddress);
    } catch {
      setErrorMessage("Failed to fetch tokens by owner.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAllTokens();
  }, []);

  const onFilter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = ownerFilter.trim();
    if (!trimmed) {
      await loadAllTokens();
      return;
    }
    await loadByOwner(trimmed);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <section className="mb-6 rounded-3xl border border-orange-200/70 bg-white/70 p-6 backdrop-blur-sm fade-in md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800">
              Launch Directory
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Indexed from EventHub with latest price, liquidity, and volume snapshots.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back To Launchpad
            </Link>
          </div>
        </div>
      </section>

      <section className="glass-card fade-in stagger-1 rounded-3xl p-5 md:p-7">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={onFilter}>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-orange-500 md:text-sm"
            placeholder="Filter by creator/owner address (0x...)"
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
          >
            Apply Filter
          </button>
          <button
            type="button"
            onClick={() => {
              setOwnerFilter("");
              void loadAllTokens();
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Show All
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-600">
          Active backend: <span className="font-mono">{backendUrl || "not connected"}</span>
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white/75 p-4 text-sm text-slate-700">
          {isLoading ? "Loading tokens..." : `Tracked launches: ${tokens.length}`}
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        {!isLoading && tokens.length === 0 && !errorMessage && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600">
            No token launches found yet.
          </div>
        )}

        {tokens.map((token) => (
          <Link
            key={token.id}
            href={`/tokens/${token.tokenAddress}`}
            className="glass-card fade-in stagger-2 rounded-2xl p-5 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:border-orange-300"
          >
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {token.tokenName} ({token.tokenSymbol})
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Creator {shortenAddress(token.creatorAddress)} on {token.networkName}
                </p>
              </div>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {token.launchStatus}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Price</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  ${formatPrice(token.stats?.latestPrice || token.initialPrice)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Liquidity</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  ${formatQuoteAmount(token.stats?.liquidityQuote)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">24h Volume</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  ${formatQuoteAmount(token.stats?.volume24hQuote)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Trades</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {token.stats?.tradeCount ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
              <p className="break-all font-mono">Token: {token.tokenAddress}</p>
              <p className="break-all font-mono">Pool: {token.poolAddress || "n/a"}</p>
              <p className="break-all font-mono">Quote: {token.quoteTokenAddress || "n/a"}</p>
              <p className="break-all font-mono">Launch Tx: {token.launchTxHash || token.deployTxHash || "n/a"}</p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
