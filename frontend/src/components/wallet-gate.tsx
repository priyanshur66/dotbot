"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet-provider";

type WalletGateProps = {
  title: string;
  description: string;
  loadingOnly?: boolean;
};

export function WalletGate({ title, description, loadingOnly = false }: WalletGateProps) {
  const { isReady, isConnecting, connectWallet } = useWallet();
  const loadingState = loadingOnly || !isReady;

  if (loadingState) {
    return (
      <main className="app-shell-bg mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10 md:px-8">
        <div className="panel-soft flex h-24 w-24 items-center justify-center rounded-[32px]">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[rgba(109,98,246,0.18)] border-t-[var(--accent-strong)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-bg mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 md:px-8">
      <section className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="accent-panel rounded-[34px] px-6 py-8 md:px-8 md:py-10">
          <div className="relative z-10 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/74">
              Wallet required
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/80 md:text-lg">
              {description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900"
              >
                Go to landing page
              </Link>
              <button
                type="button"
                onClick={() => { void connectWallet(); }}
                disabled={isConnecting || !isReady}
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white/88 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          </div>
        </div>

        <div className="panel-soft rounded-[34px] p-6 md:p-8">
          <p className="shell-kicker">Session flow</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            One wallet, all routes
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            The dashboard keeps wallet context shared between the assistant, token feed, and
            detail pages. Once the wallet is connected, the same session is restored as you move
            around the app.
          </p>

          <div className="mt-6 grid gap-4">
            <div className="metric-card rounded-[24px] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Access
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Wallet-gated routes</p>
            </div>
            <div className="metric-card rounded-[24px] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Experience
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Persistent route state</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
