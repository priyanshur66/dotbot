"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/wallet-provider";

type NavItem = {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/tokens",
    label: "Token Feed",
    matches: (pathname) => pathname === "/tokens" || pathname.startsWith("/tokens/"),
  },
  {
    href: "/chat",
    label: "Launch Token",
    matches: (pathname) => pathname === "/chat",
  },
];

export function AppNavbar() {
  const pathname = usePathname() || "";
  const {
    walletAddress,
    isReady,
    isConnecting,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const handleWalletAction = async () => {
    try {
      if (walletAddress) {
        await disconnectWallet();
        return;
      }

      await connectWallet();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <nav
      aria-label="Primary"
      className="w-full rounded-full border border-slate-200 bg-white/88 px-3 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm"
    >
      <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <div className="hidden lg:block" />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {NAV_ITEMS.map((item) => {
            const active = item.matches(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-slate-950 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600 md:inline-flex">
            .bot
          </span>
          <button
            type="button"
            onClick={() => {
              void handleWalletAction();
            }}
            disabled={!isReady || isConnecting}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isConnecting ? "Connecting..." : walletAddress ? "Disconnect Wallet" : !isReady ? "Checking..." : "Connect Wallet"}
          </button>
        </div>
      </div>
    </nav>
  );
}
