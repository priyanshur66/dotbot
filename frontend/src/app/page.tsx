"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DeployResponse = {
  tokenAddress: string;
  ownerAddress: string;
  network: { chainId: number; name: string } | null;
  decimals: number;
  totalSupply: string;
  transactions: {
    deploy: string | null;
    tokenTransfer: string | null;
    ownershipTransfer: string | null;
  };
  backendUrl?: string;
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
  tokenAddress?: string | null;
  ownerAddress?: string;
  network?: { chainId: number; name: string } | null;
  decimals?: number;
  totalSupply?: string;
  transactions?: {
    deploy: string | null;
    tokenTransfer: string | null;
    ownershipTransfer: string | null;
  };
  partialFailure?: boolean;
  recovery?: string;
  backendUrl?: string;
  backendCandidates?: string[];
};

type HealthResponse = {
  status: string;
  message?: string;
  backendUrl?: string;
  backendCandidates?: string[];
  env?: {
    rpcUrlConfigured: boolean;
    rpcWriteUrlConfigured?: boolean;
    backendPrivateKeyConfigured: boolean;
    convexUrlConfigured?: boolean;
  };
};

const initialForm = {
  name: "",
  symbol: "",
  ownerAddress: "",
  adminAddress: "",
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

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResponse | null>(null);
  const [deployError, setDeployError] = useState<ApiErrorResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthState, setHealthState] = useState<"checking" | "healthy" | "unhealthy">("checking");

  const canSubmit = useMemo(() => {
    return Boolean(
      form.name.trim() &&
        form.symbol.trim() &&
        (form.ownerAddress.trim() || form.adminAddress.trim()) &&
        !isDeploying
    );
  }, [form, isDeploying]);

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

  const onDeploy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsDeploying(true);
    setDeployResult(null);
    setDeployError(null);

    const payload: Record<string, string> = {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
    };

    if (form.ownerAddress.trim()) {
      payload.ownerAddress = form.ownerAddress.trim();
    }
    if (form.adminAddress.trim()) {
      payload.adminAddress = form.adminAddress.trim();
    }

    try {
      const response = await fetch("/api/backend/tokens/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as DeployResponse | ApiErrorResponse;

      if (response.ok) {
        setDeployResult(data as DeployResponse);
      } else {
        setDeployError(data as ApiErrorResponse);
      }
    } catch {
      setDeployError({
        message: "Frontend could not reach the deployment service.",
      });
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <section className="mb-6 rounded-3xl border border-orange-200/70 bg-white/70 p-6 backdrop-blur-sm fade-in md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800">
              Fixed Supply ERC20 Console
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Deploy And Hand Off Tokens
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              This UI deploys a fixed-supply token (`1,000,000,000`, `18` decimals), then transfers full supply and ownership to your provided admin address.
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
              View Launches
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

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="glass-card fade-in stagger-1 rounded-3xl p-5 md:p-7">
          <h2 className="text-xl font-semibold text-slate-900">Deploy Token</h2>
          <p className="mt-1 text-sm text-slate-600">
            Provide token details and one final owner/admin Ethereum address.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onDeploy}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">Token name</span>
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-4"
                  style={{ boxShadow: "0 0 0 0 var(--ring)" }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 0 4px var(--ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 0 0 var(--ring)";
                  }}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Acme Utility Token"
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">Token symbol</span>
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-orange-500 focus:ring-4"
                  style={{ boxShadow: "0 0 0 0 var(--ring)" }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 0 4px var(--ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 0 0 var(--ring)";
                  }}
                  value={form.symbol}
                  onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                  placeholder="ACME"
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">Owner address</span>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-orange-500 focus:ring-4 md:text-sm"
                style={{ boxShadow: "0 0 0 0 var(--ring)" }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 4px var(--ring)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 0 var(--ring)";
                }}
                value={form.ownerAddress}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerAddress: e.target.value }))}
                placeholder="0x..."
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">
                Admin address (optional alias for owner)
              </span>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-orange-500 focus:ring-4 md:text-sm"
                style={{ boxShadow: "0 0 0 0 var(--ring)" }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 4px var(--ring)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 0 var(--ring)";
                }}
                value={form.adminAddress}
                onChange={(e) => setForm((prev) => ({ ...prev, adminAddress: e.target.value }))}
                placeholder="0x..."
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-orange-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isDeploying ? "Deploying..." : "Deploy Token"}
            </button>
          </form>
        </section>

        <aside className="glass-card fade-in stagger-2 rounded-3xl p-5 md:p-7">
          <h2 className="text-xl font-semibold text-slate-900">Service State</h2>
          <p className="mt-1 text-sm text-slate-600">
            Live status from backend `/health`.
          </p>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white/75 p-4">
            <p className="mb-2 text-xs text-slate-500">
              Active backend:{" "}
              <span className="font-mono text-[11px] text-slate-700">
                {health?.backendUrl || "not connected"}
              </span>
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Environment Readiness
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex justify-between gap-4">
                <span>RPC URL</span>
                <span className="font-semibold text-slate-800">
                  {!health?.env
                    ? "Unknown"
                    : health.env.rpcUrlConfigured
                      ? "Configured"
                      : "Missing"}
                </span>
              </p>
              <p className="flex justify-between gap-4">
                <span>RPC Write URL</span>
                <span className="font-semibold text-slate-800">
                  {!health?.env
                    ? "Unknown"
                    : health.env.rpcWriteUrlConfigured
                      ? "Configured"
                      : "Using RPC URL"}
                </span>
              </p>
              <p className="flex justify-between gap-4">
                <span>Backend Key</span>
                <span className="font-semibold text-slate-800">
                  {!health?.env
                    ? "Unknown"
                    : health.env.backendPrivateKeyConfigured
                      ? "Configured"
                      : "Missing"}
                </span>
              </p>
              <p className="flex justify-between gap-4">
                <span>Convex URL</span>
                <span className="font-semibold text-slate-800">
                  {!health?.env
                    ? "Unknown"
                    : health.env.convexUrlConfigured
                      ? "Configured"
                      : "Missing"}
                </span>
              </p>
            </div>
          </div>

          {healthState === "unhealthy" && health?.message && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
              <p className="font-semibold">Connectivity detail</p>
              <p className="mt-1 break-words">{health.message}</p>
              {health.backendCandidates && health.backendCandidates.length > 0 && (
                <p className="mt-1 break-words">
                  Candidates: {health.backendCandidates.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Fixed token parameters</p>
            <p className="mt-2">Supply: `1,000,000,000`</p>
            <p>Decimals: `18`</p>
          </div>
        </aside>
      </div>

      {deployResult && (
        <section className="glass-card fade-in stagger-2 mt-6 rounded-3xl p-5 md:p-7">
          <h3 className="text-xl font-semibold text-emerald-900">Deployment Complete</h3>
          <p className="mt-1 text-sm text-slate-600">
            Token deployed and fully handed over to the provided address.
          </p>

          <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm md:grid-cols-2">
            {deployResult.backendUrl && (
              <p className="md:col-span-2">
                <span className="font-semibold">Backend:</span>{" "}
                <span className="font-mono break-all">{deployResult.backendUrl}</span>
              </p>
            )}
            <p>
              <span className="font-semibold">Token:</span>{" "}
              <span className="font-mono break-all">{deployResult.tokenAddress}</span>
            </p>
            <p>
              <span className="font-semibold">Owner:</span>{" "}
              <span className="font-mono break-all">{deployResult.ownerAddress}</span>
            </p>
            <p>
              <span className="font-semibold">Network:</span>{" "}
              {deployResult.network?.name} ({deployResult.network?.chainId})
            </p>
            <p>
              <span className="font-semibold">Supply:</span> {deployResult.totalSupply}
            </p>
            <p>
              <span className="font-semibold">Deploy Tx:</span>{" "}
              <span className="font-mono break-all">{deployResult.transactions.deploy}</span>
            </p>
            <p>
              <span className="font-semibold">Token Transfer Tx:</span>{" "}
              <span className="font-mono break-all">{deployResult.transactions.tokenTransfer}</span>
            </p>
            <p className="md:col-span-2">
              <span className="font-semibold">Ownership Transfer Tx:</span>{" "}
              <span className="font-mono break-all">
                {deployResult.transactions.ownershipTransfer}
              </span>
            </p>
          </div>
        </section>
      )}

      {deployError && (
        <section className="fade-in stagger-3 mt-6 rounded-3xl border border-red-300 bg-red-50 p-5 md:p-7">
          <h3 className="text-xl font-semibold text-red-900">Deployment Failed</h3>
          <p className="mt-1 text-sm text-red-800">
            {deployError.message || "The backend returned an error."}
          </p>
          {deployError.backendCandidates && deployError.backendCandidates.length > 0 && (
            <p className="mt-2 break-words text-xs text-red-900">
              Candidates: {deployError.backendCandidates.join(", ")}
            </p>
          )}

          {deployError.partialFailure && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-white/80 p-4 text-sm text-red-900">
              <p className="font-semibold">Partial Failure Notice</p>
              <p className="mt-1">
                Contract deployment succeeded, but post-deploy handoff did not fully complete.
              </p>
              {deployError.tokenAddress && (
                <p className="mt-2">
                  <span className="font-semibold">Token:</span>{" "}
                  <span className="font-mono break-all">{deployError.tokenAddress}</span>
                </p>
              )}
              {deployError.recovery && <p className="mt-2">{deployError.recovery}</p>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
