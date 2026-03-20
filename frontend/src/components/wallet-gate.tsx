"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet-provider";

type WalletGateProps = {
  title: string;
  description: string;
  loadingOnly?: boolean;
};

export function WalletGate({ title, description, loadingOnly = false }: WalletGateProps) {
  const { isReady } = useWallet();
  const loadingState = loadingOnly || !isReady;

  if (loadingState) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10 md:px-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 md:px-8">
      <section className="relative w-full overflow-hidden rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.96))]" />
        <div className="relative max-w-2xl">
          <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
            Wallet required
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            {description}
          </p>

          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to landing page
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
