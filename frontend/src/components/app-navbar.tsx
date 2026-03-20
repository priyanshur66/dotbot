"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode, type SVGProps } from "react";
import { useWallet } from "@/components/wallet-provider";

type NavItem = {
  href: string;
  label: string;
  description: string;
  matches: (pathname: string) => boolean;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
};

type AppShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    description: "Wallet overview",
    matches: (pathname) => pathname === "/",
    icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5A1.5 1.5 0 0 1 12 5.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 10.5z" />
        <path d="M12 13.5A1.5 1.5 0 0 1 13.5 12h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5z" />
        <path d="M12 5.5A1.5 1.5 0 0 1 13.5 4h5A1.5 1.5 0 0 1 20 5.5v2A1.5 1.5 0 0 1 18.5 9h-5A1.5 1.5 0 0 1 12 7.5z" />
        <path d="M4 16.5A1.5 1.5 0 0 1 5.5 15h2A1.5 1.5 0 0 1 9 16.5v2A1.5 1.5 0 0 1 7.5 20h-2A1.5 1.5 0 0 1 4 18.5z" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Launch Token",
    description: "Assistant workspace",
    matches: (pathname) => pathname === "/chat",
    icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <path d="M6 15.5c-1.7 0-3-1.3-3-3v-5c0-1.7 1.3-3 3-3h8c1.7 0 3 1.3 3 3v5c0 1.7-1.3 3-3 3H9l-4 4v-4z" />
        <path d="M14.5 8.5h5c.83 0 1.5.67 1.5 1.5v7l-3-2.5h-1.5" />
      </svg>
    ),
  },
  {
    href: "/tokens",
    label: "Token Feed",
    description: "Browse launches",
    matches: (pathname) => pathname === "/tokens" || pathname.startsWith("/tokens/"),
    icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <path d="M12 3v18" />
        <path d="M17 6.5A5 5 0 0 0 12 4a5 5 0 0 0 0 10 5 5 0 1 1 0 10 5 5 0 0 1-5-2.5" />
      </svg>
    ),
  },
];

function SparkLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="none" {...props}>
      <circle cx="12" cy="12" r="10" fill="url(#sparkGradient)" />
      <path
        d="M12 5.2c.5 2.75 1.9 4.05 4.65 4.45-2.75.5-4.05 1.9-4.45 4.65-.5-2.75-1.9-4.05-4.65-4.45 2.75-.5 4.05-1.9 4.45-4.65Z"
        fill="white"
      />
      <defs>
        <linearGradient id="sparkGradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8D81FF" />
          <stop offset="1" stopColor="#5A4AF1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5z" />
      <path d="M15 12h5" />
      <circle cx="15.5" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <path d="M4 9h13" />
    </svg>
  );
}

function shortenHash(value?: string | null) {
  if (!value) {
    return "No wallet";
  }

  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {NAV_ITEMS.map((item) => {
        const active = item.matches(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`nav-pill flex items-center gap-3 rounded-[20px] px-3 py-3 ${
              active ? "nav-pill-active" : "text-slate-600"
            }`}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                active ? "bg-white text-[var(--accent-strong)] shadow-sm" : "bg-white/70 text-slate-500"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.label}</span>
              <span className="block truncate text-xs text-slate-400">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({
  children,
  eyebrow,
  title,
  description,
  action,
}: AppShellProps) {
  const pathname = usePathname() || "";
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const {
    walletAddress,
    isReady,
    isConnecting,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const activeItem = useMemo(() => {
    return NAV_ITEMS.find((item) => item.matches(pathname)) || NAV_ITEMS[0];
  }, [pathname]);

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
    <div className="app-shell-bg h-screen overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[1600px] gap-4 p-3 md:p-5">
        <aside className="sidebar-surface hidden w-[300px] shrink-0 flex-col rounded-[34px] px-5 py-6 lg:flex overflow-y-auto">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
              <SparkLogo className="h-8 w-8" />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">
                Dot Agent
              </p>
            </div>
          </div>

          <div className="mt-10 px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Workspace
            </p>
            <div className="mt-3">
              <NavLinks pathname={pathname} />
            </div>
          </div>

          <div className="panel-muted mt-auto rounded-[28px] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--accent)] shadow-sm">
                <WalletIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Wallet</p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {walletAddress ? shortenHash(walletAddress) : "Not connected"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleWalletAction();
              }}
              disabled={!isReady || isConnecting}
              className="button-primary mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? "Connecting..." : walletAddress ? "Disconnect Wallet" : !isReady ? "Checking..." : "Connect Wallet"}
            </button>
          </div>

         
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <header className="shell-topbar rounded-[28px] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(true)}
                  className="button-secondary inline-flex h-11 w-11 items-center justify-center rounded-2xl lg:hidden"
                >
                  <MenuIcon className="h-5 w-5" />
                </button>
                <div>
                  {eyebrow ? (
                    <p className="shell-kicker">{eyebrow}</p>
                  ) : null}
                  {title ? (
                    <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      {title}
                    </h1>
                  ) : null}
                  {description ? (
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>

              {action ? (
                <div className="flex flex-wrap items-center gap-3">
                  {action}
                </div>
              ) : null}
            </div>
          </header>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="sidebar-surface relative h-full w-[88vw] max-w-[340px] rounded-r-[32px] px-5 py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <SparkLogo className="h-8 w-8" />
                </span>
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-900">
                    Dot Agent
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="button-secondary inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Workspace
              </p>
              <div className="mt-3">
                <NavLinks pathname={pathname} onNavigate={() => setIsMobileOpen(false)} />
              </div>
            </div>

            <div className="panel-muted mt-8 rounded-[28px] p-4">
              <p className="text-sm font-semibold text-slate-900">
                {walletAddress ? shortenHash(walletAddress) : "Connect your wallet"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Wallet access stays shared across chat, token browsing, and the detail view.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleWalletAction();
                }}
                disabled={!isReady || isConnecting}
                className="button-primary mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnecting ? "Connecting..." : walletAddress ? "Disconnect Wallet" : !isReady ? "Checking..." : "Connect Wallet"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
