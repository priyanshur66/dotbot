"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ethers } from "ethers";

type AgentAction = {
  id: string;
  type:
    | "wallet_signature_required"
    | "backend_tx_submitted"
    | "read_result"
    | "error";
  tool: string;
  status: "pending_user_signature" | "completed" | "failed";
  txRequest?: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    from?: string;
  };
  txHash?: string | null;
  result?: Record<string, unknown>;
};

type ChatThread = {
  id: string;
  walletAddress: string;
  title: string;
  lastMessageAt: number;
  createdAt: number;
};

type ThreadMessage = {
  id: string;
  threadId: string;
  walletAddress: string;
  role: "user" | "assistant";
  content: string;
  actions: AgentAction[];
  createdAt: number;
  requestId?: string | null;
};

type ThreadListResponse = {
  threads: ChatThread[];
  backendUrl?: string;
  message?: string;
};

type ThreadCreateResponse = {
  thread: ChatThread;
  backendUrl?: string;
  message?: string;
};

type ThreadGetResponse = {
  thread: ChatThread;
  messages: ThreadMessage[];
  backendUrl?: string;
  message?: string;
};

type ThreadReplyCompletePayload = {
  thread: ChatThread;
  userMessage: ThreadMessage;
  message: ThreadMessage;
  actions: AgentAction[];
  backendWalletAddress?: string;
  network?: {
    chainId: number;
    name: string;
  };
  model?: string;
};

type ThreadReplyJson = {
  thread?: ChatThread;
  userMessage?: ThreadMessage;
  message?: ThreadMessage;
  actions?: AgentAction[];
  backendUrl?: string;
  error?: string;
  details?: string;
};

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const POLKADOT_HUB_TESTNET = {
  chainId: 420420417,
  chainName: "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "Paseo",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: [
    "https://eth-rpc-testnet.polkadot.io/",
    "https://services.polkadothub-rpc.com/testnet/",
  ],
  blockExplorerUrls: [
    "https://blockscout-testnet.polkadot.io/",
    "https://polkadot.testnet.routescan.io/",
  ],
};

function getWalletProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  const injected = (window as Window & { ethereum?: WalletProvider }).ethereum;
  return injected || null;
}

async function ensureWalletOnChain(
  provider: ethers.BrowserProvider,
  chainId: number
) {
  const chainHex = ethers.toQuantity(BigInt(chainId));

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  } catch (error) {
    const switchError = error as { code?: number };
    if (switchError.code !== 4902) {
      throw error;
    }

    await provider.send("wallet_addEthereumChain", [
      {
        chainId: chainHex,
        chainName: POLKADOT_HUB_TESTNET.chainName,
        nativeCurrency: POLKADOT_HUB_TESTNET.nativeCurrency,
        rpcUrls: POLKADOT_HUB_TESTNET.rpcUrls,
        blockExplorerUrls: POLKADOT_HUB_TESTNET.blockExplorerUrls,
      },
    ]);
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  }
}

function shortenHash(value?: string | null) {
  if (!value) {
    return "";
  }
  if (value.length < 12) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function parseJsonSafe(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readStringField(source: unknown, field: string) {
  if (!source || typeof source !== "object") {
    return "";
  }
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : "";
}

function buildApiErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const diagnostics =
    payload.diagnostics && typeof payload.diagnostics === "object"
      ? (payload.diagnostics as Record<string, unknown>)
      : null;
  const diagnosticDetails =
    diagnostics?.details && typeof diagnostics.details === "object"
      ? (diagnostics.details as Record<string, unknown>)
      : null;

  const message = readStringField(payload, "message") || fallback;
  const recovery =
    readStringField(payload, "recovery") || readStringField(diagnosticDetails, "recovery");
  const launchStatus =
    readStringField(payload, "launchStatus") ||
    readStringField(diagnosticDetails, "launchStatus");
  const launchRecordId =
    readStringField(payload, "launchRecordId") ||
    readStringField(diagnosticDetails, "launchRecordId");
  const tokenAddress =
    readStringField(payload, "tokenAddress") ||
    readStringField(diagnosticDetails, "tokenAddress");

  const notes: string[] = [];
  if (recovery) {
    notes.push(recovery);
  }
  if (launchStatus) {
    notes.push(`Launch status: ${launchStatus}`);
  }
  if (launchRecordId) {
    notes.push(`Launch record: ${launchRecordId}`);
  }
  if (tokenAddress) {
    notes.push(`Token: ${tokenAddress}`);
  }

  if (notes.length === 0) {
    return message;
  }
  return `${message} | ${notes.join(" | ")}`;
}

function sortMessages(messages: ThreadMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = Number(left.createdAt || 0);
    const rightTime = Number(right.createdAt || 0);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function parseSseChunks(chunk: string, onEvent: (event: string, data: unknown) => void) {
  const records = chunk
    .replace(/\r/g, "")
    .split("\n\n")
    .filter((record) => record.trim());

  for (const record of records) {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of record.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const dataText = dataLines.join("\n");
    if (!dataText) {
      onEvent(eventName, null);
      continue;
    }

    try {
      onEvent(eventName, JSON.parse(dataText));
    } catch {
      onEvent(eventName, dataText);
    }
  }
}

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  const canSend = useMemo(() => {
    return Boolean(draft.trim()) && Boolean(walletAddress) && Boolean(activeThreadId) && !isSending;
  }, [draft, walletAddress, activeThreadId, isSending]);

  const loadThread = async (threadId: string, forWalletAddress: string) => {
    if (!threadId || !forWalletAddress) {
      return;
    }

    setIsLoadingThread(true);
    try {
      const response = await fetch(
        `/api/backend/agent/threads/${encodeURIComponent(
          threadId
        )}?walletAddress=${encodeURIComponent(forWalletAddress)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );
      const data = (await parseJsonSafe(response)) as ThreadGetResponse;
      if (!response.ok) {
        setErrorMessage(data.message || "Failed to load thread.");
        return;
      }

      if (data.backendUrl) {
        setBackendUrl(data.backendUrl);
      }
      setActiveThreadId(threadId);
      setMessages(sortMessages(data.messages || []));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load thread.");
    } finally {
      setIsLoadingThread(false);
    }
  };

  const createNewThread = async (forWalletAddress = walletAddress) => {
    if (!forWalletAddress) {
      setErrorMessage("Connect wallet first.");
      return null;
    }

    setIsCreatingThread(true);
    try {
      const response = await fetch("/api/backend/agent/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: forWalletAddress,
          title: "New chat",
        }),
      });

      const data = (await parseJsonSafe(response)) as ThreadCreateResponse;
      if (!response.ok || !data.thread) {
        setErrorMessage(data.message || "Failed to create chat thread.");
        return null;
      }

      if (data.backendUrl) {
        setBackendUrl(data.backendUrl);
      }

      setThreads((current) => [data.thread, ...current.filter((thread) => thread.id !== data.thread.id)]);
      setActiveThreadId(data.thread.id);
      setMessages([]);
      return data.thread;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create chat thread."
      );
      return null;
    } finally {
      setIsCreatingThread(false);
    }
  };

  const loadThreads = async (forWalletAddress: string) => {
    if (!forWalletAddress) {
      return;
    }

    setIsLoadingThreads(true);
    try {
      const response = await fetch(
        `/api/backend/agent/threads?walletAddress=${encodeURIComponent(forWalletAddress)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );
      const data = (await parseJsonSafe(response)) as ThreadListResponse;
      if (!response.ok) {
        setErrorMessage(data.message || "Failed to load chat threads.");
        return;
      }

      if (data.backendUrl) {
        setBackendUrl(data.backendUrl);
      }

      const nextThreads = data.threads || [];
      setThreads(nextThreads);

      if (nextThreads.length === 0) {
        const created = await createNewThread(forWalletAddress);
        if (created) {
          await loadThread(created.id, forWalletAddress);
        }
        return;
      }

      const selected =
        nextThreads.find((thread) => thread.id === activeThreadId) || nextThreads[0];
      await loadThread(selected.id, forWalletAddress);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load chat threads."
      );
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const connectWallet = async () => {
    setErrorMessage("");
    setIsConnecting(true);

    try {
      const injected = getWalletProvider();
      if (!injected) {
        setErrorMessage("No wallet found. Install MetaMask or another injected wallet.");
        return;
      }

      const provider = new ethers.BrowserProvider(injected as ethers.Eip1193Provider);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      const selectedAddress = ethers.getAddress(accounts[0]);
      setWalletAddress(selectedAddress);

      await ensureWalletOnChain(provider, POLKADOT_HUB_TESTNET.chainId);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));

      await loadThreads(selectedAddress);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to connect wallet."
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const sendThreadReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || !activeThreadId || !walletAddress) {
      return;
    }

    setErrorMessage("");
    setIsSending(true);

    const normalizedDraft = draft.trim();
    setDraft("");

    const now = Date.now();
    const tempUserId = `tmp_user_${crypto.randomUUID()}`;
    const tempAssistantId = `tmp_assistant_${crypto.randomUUID()}`;

    const optimisticUser: ThreadMessage = {
      id: tempUserId,
      threadId: activeThreadId,
      walletAddress,
      role: "user",
      content: normalizedDraft,
      actions: [],
      createdAt: now,
      requestId: null,
    };

    const optimisticAssistant: ThreadMessage = {
      id: tempAssistantId,
      threadId: activeThreadId,
      walletAddress,
      role: "assistant",
      content: "",
      actions: [],
      createdAt: now + 1,
      requestId: null,
    };

    setMessages((current) => sortMessages([...current, optimisticUser, optimisticAssistant]));

    try {
      const response = await fetch(
        `/api/backend/agent/threads/${encodeURIComponent(activeThreadId)}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress,
            content: normalizedDraft,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        const data = await parseJsonSafe(response);
        setErrorMessage(buildApiErrorMessage(data, "Agent reply failed."));
        await loadThread(activeThreadId, walletAddress);
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = (await parseJsonSafe(response)) as ThreadReplyJson;
        if (!data.message || !data.userMessage) {
          setErrorMessage("Unexpected response from thread reply endpoint.");
          await loadThread(activeThreadId, walletAddress);
          return;
        }

        const persistedUser = data.userMessage as ThreadMessage;
        const assistantMessage: ThreadMessage = {
          ...data.message,
          actions: data.actions || data.message.actions || [],
        };

        setMessages((current) =>
          sortMessages(
            [
              ...current.filter((message) => ![tempUserId, tempAssistantId].includes(message.id)),
              persistedUser,
              assistantMessage,
            ]
          )
        );

        const persistedThread = data.thread;
        setThreads((current) => {
          if (!persistedThread) {
            return current;
          }
          return [
            persistedThread,
            ...current.filter((thread) => thread.id !== persistedThread.id),
          ];
        });

        if (data.backendUrl) {
          setBackendUrl(data.backendUrl);
        }

        return;
      }

      if (!response.body) {
        setErrorMessage("No streaming body received from backend.");
        await loadThread(activeThreadId, walletAddress);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedPayload: ThreadReplyCompletePayload | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const records = buffer.replace(/\r/g, "").split("\n\n");
        buffer = records.pop() || "";

        parseSseChunks(records.join("\n\n"), (eventName, rawData) => {
          if (eventName === "assistant.delta") {
            const payload = (rawData || {}) as { delta?: string };
            if (!payload.delta) {
              return;
            }

            setMessages((current) =>
              current.map((message) => {
                if (message.id !== tempAssistantId) {
                  return message;
                }
                return {
                  ...message,
                  content: `${message.content}${payload.delta}`,
                };
              })
            );
            return;
          }

          if (eventName === "assistant.complete") {
            const completed = rawData as ThreadReplyCompletePayload;
            if (!completed?.message || !completed.userMessage) {
              return;
            }
            completedPayload = completed;

            const persistedAssistant = {
              ...completed.message,
              actions:
                completed.actions || completed.message.actions || [],
            };

            setMessages((current) =>
              sortMessages(
                [
                  ...current.filter(
                    (message) => ![tempUserId, tempAssistantId].includes(message.id)
                  ),
                  completed.userMessage,
                  persistedAssistant,
                ]
              )
            );

            if (completed.thread) {
              setThreads((current) => [
                completed.thread,
                ...current.filter((thread) => thread.id !== completed.thread.id),
              ]);
            }
          }
        });
      }

      if (!completedPayload) {
        await loadThread(activeThreadId, walletAddress);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send thread reply.");
      await loadThread(activeThreadId, walletAddress);
    } finally {
      setIsSending(false);
    }
  };

  const signWalletAction = async (messageId: string, actionId: string) => {
    setErrorMessage("");

    const targetMessage = messages.find((message) => message.id === messageId);
    const targetAction = targetMessage?.actions?.find((action) => action.id === actionId);
    if (!targetAction?.txRequest) {
      setErrorMessage("No signable transaction found for this action.");
      return;
    }

    try {
      const injected = getWalletProvider();
      if (!injected) {
        setErrorMessage("No wallet found. Install MetaMask or another injected wallet.");
        return;
      }

      const provider = new ethers.BrowserProvider(injected as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const signerAddress = ethers.getAddress(await signer.getAddress());
      setWalletAddress(signerAddress);
      const targetChainId = targetAction.txRequest.chainId || POLKADOT_HUB_TESTNET.chainId;
      await ensureWalletOnChain(provider, targetChainId);
      setChainId(targetChainId);

      const txHash = await provider.send("eth_sendTransaction", [
        {
          ...targetAction.txRequest,
          from: signerAddress,
          value: targetAction.txRequest.value || "0x0",
        },
      ]);

      await provider.waitForTransaction(txHash);

      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId || !message.actions) {
            return message;
          }

          return {
            ...message,
            actions: message.actions.map((action) => {
              if (action.id !== actionId) {
                return action;
              }

              return {
                ...action,
                status: "completed",
                txHash,
                result: {
                  ...(action.result || {}),
                  submittedBy: signerAddress,
                },
              };
            }),
          };
        })
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId || !message.actions) {
            return message;
          }

          return {
            ...message,
            actions: message.actions.map((action) => {
              if (action.id !== actionId) {
                return action;
              }

              return {
                ...action,
                status: "failed",
                result: {
                  ...(action.result || {}),
                  error:
                    error instanceof Error ? error.message : "Wallet signature failed",
                },
              };
            }),
          };
        })
      );

      setErrorMessage(
        error instanceof Error ? error.message : "Wallet signature failed."
      );
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <section className="mb-5 rounded-3xl border border-orange-200/70 bg-white/70 p-5 backdrop-blur-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800">
              Threaded Agent Chat
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Wallet-Scoped Assistant Threads
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              Conversations are persisted by wallet address and streamed back with action metadata.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Launch Home
            </Link>
            <Link
              href="/tokens"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Token Registry
            </Link>
            <button
              type="button"
              onClick={() => {
                void connectWallet();
              }}
              disabled={isConnecting}
              className="rounded-full bg-orange-700 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
            >
              {isConnecting
                ? "Connecting..."
                : walletAddress
                  ? "Wallet Connected"
                  : "Connect Wallet"}
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-600">
          <p>
            Wallet: <span className="font-mono">{walletAddress || "not connected"}</span>
          </p>
          <p>
            Chain ID: <span className="font-mono">{chainId || "unknown"}</span>
          </p>
          <p>
            Backend: <span className="font-mono">{backendUrl || "not connected"}</span>
          </p>
        </div>
      </section>

      <section className="grid min-h-[68vh] grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <aside className="glass-card rounded-3xl p-4 md:p-5">
          <button
            type="button"
            disabled={!walletAddress || isCreatingThread}
            onClick={() => {
              void (async () => {
                const created = await createNewThread();
                if (created) {
                  await loadThread(created.id, walletAddress);
                }
              })();
            }}
            className="w-full rounded-xl bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
          >
            {isCreatingThread ? "Creating..." : "New chat"}
          </button>

          <div className="mt-4 space-y-2">
            {isLoadingThreads ? (
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                Loading threads...
              </p>
            ) : null}

            {!isLoadingThreads && threads.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                Connect wallet to load your chats.
              </p>
            ) : null}

            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  void loadThread(thread.id, walletAddress);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  thread.id === activeThreadId
                    ? "border-orange-300 bg-orange-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="truncate text-sm font-semibold text-slate-800">{thread.title}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatTimestamp(thread.lastMessageAt)}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="glass-card flex min-h-[68vh] flex-col rounded-3xl p-4 md:p-5">
          <div className="mb-3 border-b border-slate-200 pb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thread</p>
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {activeThread?.title || "No active thread"}
            </h2>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {isLoadingThread ? (
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500">
                Loading messages...
              </p>
            ) : null}

            {!isLoadingThread && messages.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Start the conversation in this thread.
              </p>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-2xl border p-4 text-sm ${
                  message.role === "user"
                    ? "border-slate-300 bg-slate-50"
                    : "border-orange-200 bg-white"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {message.role}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatTimestamp(message.createdAt)}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{message.content || "..."}</p>

                {message.actions && message.actions.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {message.actions.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                          <span className="rounded-full border border-slate-300 px-2 py-0.5 font-semibold">
                            {action.tool}
                          </span>
                          <span className="rounded-full border border-slate-300 px-2 py-0.5">
                            {action.type}
                          </span>
                          <span className="rounded-full border border-slate-300 px-2 py-0.5">
                            {action.status}
                          </span>
                        </div>

                        {action.txHash ? (
                          <p className="mt-2 font-mono text-xs text-slate-600">
                            Tx: {shortenHash(action.txHash)}
                          </p>
                        ) : null}

                        {action.txRequest ? (
                          <details className="mt-2 text-xs text-slate-600">
                            <summary className="cursor-pointer">Transaction payload</summary>
                            <pre className="mt-2 overflow-x-auto rounded bg-white p-2">
                              {JSON.stringify(action.txRequest, null, 2)}
                            </pre>
                          </details>
                        ) : null}

                        {action.type === "wallet_signature_required" &&
                        action.status === "pending_user_signature" ? (
                          <button
                            type="button"
                            onClick={() => {
                              void signWalletAction(message.id, action.id);
                            }}
                            className="mt-3 rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
                          >
                            Sign In Wallet
                          </button>
                        ) : null}

                        {action.result ? (
                          <details className="mt-2 text-xs text-slate-600">
                            <summary className="cursor-pointer">Action result</summary>
                            <pre className="mt-2 overflow-x-auto rounded bg-white p-2">
                              {JSON.stringify(action.result, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <form className="mt-4 border-t border-slate-200 pt-4" onSubmit={sendThreadReply}>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-orange-500"
              placeholder="Ask the assistant to deploy/check/transfer..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Replies stream into the current thread and persist with actions.
              </p>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
