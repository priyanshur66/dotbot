"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type TokenLaunch = {
  id: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  ownerAddress: string;
  launchedByAddress: string;
  chainId: number;
  networkName: string;
  totalSupply: string;
  decimals: number;
  launchStatus: string;
  deployTxHash: string | null;
  tokenTransferTxHash: string | null;
  ownershipTransferTxHash: string | null;
  createdAt: number;
};

type LaunchResponse = {
  count: number;
  tokens: TokenLaunch[];
  backendUrl?: string;
  message?: string;
};

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenLaunch[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [backendUrl, setBackendUrl] = useState("");

  const title = useMemo(() => {
    if (!activeFilter) {
      return "All Launched Tokens";
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
              Launch Registry
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Stored in Convex with deployer, owner, network, and transaction metadata.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back To Deployer
          </Link>
        </div>
      </section>

      <section className="glass-card fade-in stagger-1 rounded-3xl p-5 md:p-7">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={onFilter}>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-orange-500 md:text-sm"
            placeholder="Filter by owner address (0x...)"
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
          Active backend:{" "}
          <span className="font-mono">{backendUrl || "not connected"}</span>
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white/75 p-4 text-sm text-slate-700">
          {isLoading ? "Loading tokens..." : `Total records: ${tokens.length}`}
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        {!isLoading && tokens.length === 0 && !errorMessage && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600">
            No token launches found yet.
          </div>
        )}

        {tokens.map((token) => (
          <article
            key={token.id}
            className="glass-card fade-in stagger-2 rounded-2xl p-5 text-sm text-slate-700"
          >
            <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {token.tokenName} ({token.tokenSymbol})
              </h2>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {token.launchStatus}
              </span>
            </div>

            <p className="break-all font-mono text-xs">
              Token: {token.tokenAddress}
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              Owner: {token.ownerAddress}
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              Launched by: {token.launchedByAddress}
            </p>
            <p className="mt-2">
              Network: {token.networkName} ({token.chainId}) | Supply: {token.totalSupply}
            </p>

            <div className="mt-3 space-y-1 font-mono text-xs">
              <p className="break-all">Deploy Tx: {token.deployTxHash || "n/a"}</p>
              <p className="break-all">
                Token Transfer Tx: {token.tokenTransferTxHash || "n/a"}
              </p>
              <p className="break-all">
                Ownership Transfer Tx: {token.ownershipTransferTxHash || "n/a"}
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
