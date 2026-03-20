"use client";

import { AppNavbar } from "@/components/app-navbar";
import { useWallet } from "@/components/wallet-provider";

function shortenHash(value?: string | null) {
  if (!value) {
    return "";
  }

  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export default function Home() {
  const { walletAddress, chainId, isReady } = useWallet();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <AppNavbar />

      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/86 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.96))]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Wallet First
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Connect your wallet to unlock chat, token browsing, and trading.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              The application now starts with a single wallet session that carries through
              the landing page, chat threads, token feed, and token detail pages without
              resetting when you navigate.
            </p>

            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Status {isReady ? (walletAddress ? "connected" : "waiting for wallet") : "checking"}
              </span>
              {walletAddress ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono">
                  Wallet {shortenHash(walletAddress)}
                </span>
              ) : null}
              {chainId ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  Chain {chainId}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Connection Gate
              </p>
              <p className="mt-3 text-xl font-semibold text-slate-950">
                {walletAddress ? "Wallet connected. You can continue into the app." : "Connect once, then keep moving across routes."}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The shared wallet session rehydrates from the injected provider on refresh
                and listens for account or chain changes, so you do not lose context when
                returning to chat or the token pages.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chat</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Threaded</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tokens</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Wallet-gated</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Flow</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Persistent</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
