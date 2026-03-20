"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

const initialForm = {
  name: "",
  symbol: "",
  creatorAddress: "",
};

type LaunchResponse = {
  tokenAddress: string;
  poolAddress: string;
  creatorAddress: string;
  quoteTokenAddress: string;
  eventHubAddress: string;
  network: { chainId: number; name: string } | null;
  totalSupply: string;
  creatorAllocation: string;
  poolTokenAllocation: string;
  poolUsdtAllocation: string;
  initialPrice: string;
  launchRecordId: string;
  launchStatus: string;
  transactions: {
    launch: string | null;
    deploy: string | null;
    tokenTransfer: string | null;
    ownershipTransfer: string | null;
  };
  backendUrl?: string;
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
  backendUrl?: string;
};

type HealthResponse = {
  status: string;
  backendUrl?: string;
  env?: {
    rpcUrlConfigured: boolean;
    rpcWriteUrlConfigured?: boolean;
    backendPrivateKeyConfigured: boolean;
    convexUrlConfigured?: boolean;
    launchpadAddressConfigured?: boolean;
    eventHubAddressConfigured?: boolean;
    quoteTokenAddressConfigured?: boolean;
  };
};

function statusChipClass(healthStatus: string) {
  if (healthStatus === "healthy") {
    return "bg-emerald-100 text-emerald-900 border-emerald-300";
  }
  if (healthStatus === "unhealthy") {
    return "bg-red-100 text-red-900 border-red-300";
  }
  return "bg-amber-100 text-amber-900 border-amber-300";
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

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<LaunchResponse | null>(null);
  const [launchError, setLaunchError] = useState<ApiErrorResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthState, setHealthState] = useState<"checking" | "healthy" | "unhealthy">("checking");

  const canSubmit = useMemo(() => {
    return Boolean(
      form.name.trim() && form.symbol.trim() && form.creatorAddress.trim() && !isLaunching
    );
  }, [form, isLaunching]);

  useEffect(() => {
    const checkHealth = async () => {
      setHealthState("checking");
      try {
        const response = await fetch("/api/backend/health", { cache: "no-store" });
        const data = (await response.json()) as HealthResponse;
        setHealth(data);
        setHealthState(response.ok ? "healthy" : "unhealthy");
      } catch {
        setHealthState("unhealthy");
      }
    };

    void checkHealth();
  }, []);

  const onLaunch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsLaunching(true);
    setLaunchResult(null);
    setLaunchError(null);

    try {
      const response = await fetch("/api/backend/tokens/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          symbol: form.symbol.trim().toUpperCase(),
          creatorAddress: form.creatorAddress.trim(),
        }),
      });

      const data = (await response.json()) as LaunchResponse | ApiErrorResponse;
      if (response.ok) {
        setLaunchResult(data as LaunchResponse);
      } else {
        setLaunchError(data as ApiErrorResponse);
      }
    } catch {
      setLaunchError({ message: "Frontend could not reach the launch service." });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <section className="mb-6 rounded-3xl border border-orange-200/70 bg-white/70 p-6 backdrop-blur-sm fade-in md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800">
              Launchpad Console
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Launch Tokens Into A USDT AMM
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              This flow deploys a fixed-supply token, seeds a backend-funded USDT pool,
              emits indexed market events, and exposes the token immediately in the launch
              directory and token detail page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Backend</span>
            <span
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusChipClass(healthState)}`}
            >
              {healthState === "checking" ? "Checking" : healthState}
            </span>
            <Link
              href="/tokens"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Browse Tokens
            </Link>
            <Link
              href="/chat"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Chat
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-card fade-in stagger-1 rounded-3xl p-5 md:p-7">
          <h2 className="text-xl font-semibold text-slate-900">Launch Token</h2>
          <p className="mt-1 text-sm text-slate-600">
            Enter token metadata and the creator wallet that should receive the creator
            allocation and fee share.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onLaunch}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">Token name</span>
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-orange-500"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Orbit Agent Token"
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">Token symbol</span>
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-orange-500"
                  value={form.symbol}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))
                  }
                  placeholder="ORBT"
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">Creator address</span>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-orange-500 md:text-sm"
                value={form.creatorAddress}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, creatorAddress: e.target.value }))
                }
                placeholder="0x..."
                required
              />
            </label>

            <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4 text-sm text-slate-700">
              Fixed v1 rules: backend-funded `MockUSDT`, fixed protocol supply split,
              protocol-owned locked liquidity, creator fee share, and event-sourced pricing.
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-orange-700 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLaunching ? "Launching..." : "Launch Token"}
            </button>
          </form>

          {launchError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {launchError.message || "Launch failed."}
            </div>
          )}

          {launchResult && (
            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 text-sm text-slate-700">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Launch completed
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {shortenHash(launchResult.tokenAddress)} paired with pool {shortenHash(launchResult.poolAddress)}
                  </h3>
                </div>
                <Link
                  href={`/tokens/${launchResult.tokenAddress}`}
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Open Token Page
                </Link>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <p className="break-all font-mono text-xs">Token: {launchResult.tokenAddress}</p>
                <p className="break-all font-mono text-xs">Pool: {launchResult.poolAddress}</p>
                <p className="break-all font-mono text-xs">Creator: {launchResult.creatorAddress}</p>
                <p className="break-all font-mono text-xs">Launch Tx: {launchResult.transactions.launch}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="glass-card fade-in stagger-2 rounded-3xl p-5 md:p-7">
          <h2 className="text-xl font-semibold text-slate-900">Environment</h2>
          <div className="mt-5 space-y-3 text-sm text-slate-700">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Runtime flags</p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                <li>RPC configured: {String(health?.env?.rpcUrlConfigured ?? false)}</li>
                <li>Writer RPC configured: {String(health?.env?.rpcWriteUrlConfigured ?? false)}</li>
                <li>Backend signer configured: {String(health?.env?.backendPrivateKeyConfigured ?? false)}</li>
                <li>Convex configured: {String(health?.env?.convexUrlConfigured ?? false)}</li>
                <li>Launchpad address preset: {String(health?.env?.launchpadAddressConfigured ?? false)}</li>
                <li>EventHub address preset: {String(health?.env?.eventHubAddressConfigured ?? false)}</li>
                <li>Quote token address preset: {String(health?.env?.quoteTokenAddressConfigured ?? false)}</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="font-semibold text-slate-900">Flow summary</p>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                Launches are indexed from on-chain events, so the directory, recent trades,
                and candlestick chart all derive from the same EventHub stream.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
