"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { AppShell } from "@/components/app-navbar";
import { WalletGate } from "@/components/wallet-gate";
import { useWallet } from "@/components/wallet-provider";
import { ERC20_ABI } from "@/lib/erc20";
import type { TokenLaunch } from "@/lib/tokens";

function shortenHash(value?: string | null) {
  if (!value) {
    return "";
  }

  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function shortenAddress(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTokenBalance(value: bigint, decimals: number) {
  try {
    return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  } catch {
    return "0";
  }
}

type LaunchesResponse = {
  count: number;
  tokens: TokenLaunch[];
  message?: string;
};

type TokenHolding = {
  token: TokenLaunch;
  balance: bigint;
};

type TwitterBotEvent = {
  id: string;
  tweetId: string;
  tweetUrl: string | null;
  tweetText: string;
  classifierStatus: string;
  classifierConfidence: number | null;
  extractedTokenName: string | null;
  extractedTokenSymbol: string | null;
  launchStatus: string;
  errorMessage: string | null;
  createdAt: number;
};

type TwitterBotConfig = {
  id: string;
  walletAddress: string;
  twitterHandle: string;
  enabled: boolean;
  lastSeenTweetId: string | null;
  lastSeenTweetAt: number | null;
  lastPolledAt: number | null;
};

type TwitterBotResponse = {
  walletAddress: string;
  targetHandle: string;
  pollMs?: number | null;
  config: TwitterBotConfig | null;
  events: TwitterBotEvent[];
  message?: string;
};

function formatDateTime(value?: number | null) {
  if (!value) {
    return "Not yet";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Not yet";
  }
}

export default function Home() {
  const { walletAddress, isReady, getBrowserProvider } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [twitterBotEnabled, setTwitterBotEnabled] = useState(false);
  const [twitterBotTargetHandle, setTwitterBotTargetHandle] = useState("");
  const [twitterBotEvents, setTwitterBotEvents] = useState<TwitterBotEvent[]>([]);
  const [twitterBotConfig, setTwitterBotConfig] = useState<TwitterBotConfig | null>(null);
  const [twitterBotError, setTwitterBotError] = useState("");
  const [twitterBotPollMs, setTwitterBotPollMs] = useState<number | null>(null);
  const [isTwitterBotLoading, setIsTwitterBotLoading] = useState(false);
  const [isTwitterBotSaving, setIsTwitterBotSaving] = useState(false);

  const loadHoldings = useCallback(async () => {
    if (!walletAddress) {
      setHoldings([]);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    const provider = getBrowserProvider();
    if (!provider) {
      setErrorMessage("No wallet provider was detected.");
      setHoldings([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/backend/tokens/launched", {
        cache: "no-store",
      });
      const data = (await response.json()) as LaunchesResponse;

      if (!response.ok) {
        setErrorMessage(data.message || "Failed to fetch launched tokens.");
        setHoldings([]);
        return;
      }

      const launchedTokens = data.tokens || [];

      const balances = await Promise.allSettled(
        launchedTokens.map(async (token) => {
          const contract = new ethers.Contract(token.tokenAddress, ERC20_ABI, provider);
          const balance = (await contract.balanceOf(walletAddress)) as bigint;
          return {
            token,
            balance,
          } satisfies TokenHolding;
        })
      );

      const visibleHoldings = balances
        .filter((result): result is PromiseFulfilledResult<TokenHolding> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((holding) => holding.balance > BigInt(0))
        .sort((left, right) =>
          left.token.tokenSymbol.localeCompare(right.token.tokenSymbol) ||
          left.token.tokenName.localeCompare(right.token.tokenName)
        );

      setHoldings(visibleHoldings);
    } catch {
      setErrorMessage("Failed to load wallet holdings.");
      setHoldings([]);
    } finally {
      setIsLoading(false);
    }
  }, [getBrowserProvider, walletAddress]);

  const loadTwitterBot = useCallback(async () => {
    if (!walletAddress) {
      setTwitterBotConfig(null);
      setTwitterBotEvents([]);
      setTwitterBotTargetHandle("");
      setTwitterHandle("");
      setTwitterBotEnabled(false);
      setTwitterBotError("");
      return;
    }

    setIsTwitterBotLoading(true);
    setTwitterBotError("");

    try {
      const response = await fetch(
        `/api/backend/twitter-bot/me?walletAddress=${encodeURIComponent(walletAddress)}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as TwitterBotResponse;

      if (!response.ok) {
        setTwitterBotError(data.message || "Failed to load twitter bot settings.");
        return;
      }

      setTwitterBotConfig(data.config || null);
      setTwitterBotEvents(data.events || []);
      setTwitterBotTargetHandle(data.targetHandle || "");
      setTwitterBotPollMs(typeof data.pollMs === "number" ? data.pollMs : null);
      setTwitterHandle(data.config?.twitterHandle || "");
      setTwitterBotEnabled(Boolean(data.config?.enabled));
    } catch {
      setTwitterBotError("Failed to load twitter bot settings.");
    } finally {
      setIsTwitterBotLoading(false);
    }
  }, [walletAddress]);

  const saveTwitterBot = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    setIsTwitterBotSaving(true);
    setTwitterBotError("");

    try {
      const response = await fetch("/api/backend/twitter-bot/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          twitterHandle,
          enabled: twitterBotEnabled,
        }),
      });
      const data = (await response.json()) as TwitterBotResponse;

      if (!response.ok) {
        setTwitterBotError(data.message || "Failed to save twitter bot settings.");
        return;
      }

      setTwitterBotConfig(data.config || null);
      setTwitterBotEvents(data.events || []);
      setTwitterBotTargetHandle(data.targetHandle || "");
      setTwitterBotPollMs(typeof data.pollMs === "number" ? data.pollMs : null);
      setTwitterHandle(data.config?.twitterHandle || twitterHandle);
      setTwitterBotEnabled(Boolean(data.config?.enabled));
    } catch {
      setTwitterBotError("Failed to save twitter bot settings.");
    } finally {
      setIsTwitterBotSaving(false);
    }
  }, [twitterBotEnabled, twitterHandle, walletAddress]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!walletAddress) {
      setHoldings([]);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    void loadHoldings();
    void loadTwitterBot();
  }, [isReady, loadHoldings, loadTwitterBot, walletAddress]);

  if (!isReady) {
    return (
      <WalletGate
        title="Restoring your wallet session"
        description="We are checking the injected wallet before opening your holdings dashboard."
      />
    );
  }

  if (!walletAddress) {
    return (
      <WalletGate
        title="Connect wallet to view your holdings"
        description="The dashboard is wallet-gated. Connect from the sidebar to see the tokens held by your account."
      />
    );
  }

  return (
    <AppShell
      eyebrow="Dashboard"
      title="Holdings"
      description=""
      
    >
      {errorMessage ? (
        <div className="status-danger mt-6 rounded-[24px] border p-4 text-sm">{errorMessage}</div>
      ) : null}

      <section className="panel rounded-[32px] p-5 md:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="shell-kicker">Portfolio</p>
            <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950">
              Wallet holdings
            </h3>
            <p className="mt-1 font-mono text-xs text-slate-400">
              {walletAddress ? shortenHash(walletAddress) : "No wallet connected"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadHoldings()}
              className="button-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
            >
              Refresh holdings
            </button>
            <Link
              href="/tokens"
              className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
            >
              Browse launches
            </Link>
          </div>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 text-sm text-slate-500">
              Loading holdings...
            </div>
          ) : null}

          {!isLoading && holdings.length === 0 && !errorMessage ? (
            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 md:p-8">
              <p className="shell-kicker">No positions found</p>
              <h4 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                This wallet does not currently hold any launched tokens.
              </h4>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
                Once you hold a token from the registry, it will appear here with its balance and
                a shortcut into the token detail page.
              </p>
              <Link
                href="/tokens"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900"
              >
                Explore the token feed
              </Link>
            </div>
          ) : null}

          {holdings.length > 0 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {holdings.map(({ token, balance }) => (
                <article
                  key={token.tokenAddress}
                  className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,246,255,0.9))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                        {token.tokenSymbol.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold tracking-tight text-slate-950">
                          {token.tokenName}
                        </h4>
                        <p className="text-sm text-slate-500">${token.tokenSymbol}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Balance
                      </p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatTokenBalance(balance, token.decimals)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="rounded-[22px] border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Contract
                      </p>
                      <p className="mt-2 font-mono text-sm text-slate-900">
                        {shortenAddress(token.tokenAddress)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="chip text-xs">{token.networkName}</span>
                    <Link
                      href={`/tokens/${token.tokenAddress}`}
                      className="inline-flex items-center text-sm font-semibold text-[var(--accent-strong)]"
                    >
                      View token →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel mt-6 rounded-[32px] p-5 md:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="shell-kicker">Twitter Bot</p>
            <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950">
              Enable tweet-triggered launches
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
              Save one Twitter handle for this wallet. When a new tweet from that handle mentions{" "}
              {twitterBotTargetHandle || "the configured target"} and looks like a launch request,
              the backend can launch a token using this wallet as creator.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadTwitterBot()}
              className="button-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
            >
              Refresh bot status
            </button>
          </div>
        </div>

        {twitterBotError ? (
          <div className="status-danger mt-5 rounded-[24px] border p-4 text-sm">
            {twitterBotError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Connected wallet
            </p>
            <p className="mt-2 font-mono text-sm text-slate-900">{walletAddress}</p>

            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Twitter handle
              </span>
              <input
                type="text"
                value={twitterHandle}
                onChange={(event) => setTwitterHandle(event.target.value)}
                placeholder="@yourhandle"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="mt-5 flex items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Enable Twitter bot</p>
                <p className="mt-1 text-xs text-slate-500">
                  Auto-monitor this handle for new launch tweets.
                </p>
              </div>
              <input
                type="checkbox"
                checked={twitterBotEnabled}
                onChange={(event) => setTwitterBotEnabled(event.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-slate-950"
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void saveTwitterBot()}
                disabled={isTwitterBotSaving || !twitterHandle.trim()}
                className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTwitterBotSaving ? "Saving..." : "Save Twitter bot"}
              </button>
              <span className="text-xs text-slate-500">
                Watching mentions for {twitterBotTargetHandle || "configured env target"}
                {twitterBotPollMs ? ` every ${Math.max(1, Math.round(twitterBotPollMs / 1000))}s` : ""}
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,246,255,0.92))] p-5">
            <p className="shell-kicker">Current status</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="metric-card rounded-[22px] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Saved handle
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {twitterBotConfig?.twitterHandle || "Not configured"}
                </p>
              </div>
              <div className="metric-card rounded-[22px] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Bot status
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {twitterBotConfig?.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="metric-card rounded-[22px] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Last poll
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {formatDateTime(twitterBotConfig?.lastPolledAt)}
                </p>
              </div>
              <div className="metric-card rounded-[22px] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Last tweet seen
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {formatDateTime(twitterBotConfig?.lastSeenTweetAt)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-slate-200 bg-white/80 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="shell-kicker">Recent activity</p>
              <h4 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                Detection and launch history
              </h4>
            </div>
            {isTwitterBotLoading ? (
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Loading...
              </span>
            ) : null}
          </div>

          {twitterBotEvents.length === 0 ? (
            <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
              No tweet activity has been recorded for this wallet yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {twitterBotEvents.map((event) => (
                <article
                  key={event.id}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {event.extractedTokenName || "No token extracted"}
                        {event.extractedTokenSymbol ? ` ($${event.extractedTokenSymbol})` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(event.createdAt)} · {event.classifierStatus} ·{" "}
                        {event.launchStatus}
                      </p>
                    </div>
                    {event.tweetUrl ? (
                      <a
                        href={event.tweetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[var(--accent-strong)]"
                      >
                        View tweet
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{event.tweetText}</p>
                  {event.errorMessage ? (
                    <p className="mt-3 text-xs text-slate-500">{event.errorMessage}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
