"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-navbar";
import { WalletGate } from "@/components/wallet-gate";
import { useWallet } from "@/components/wallet-provider";

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

function readActionResultField(action: AgentAction, field: string) {
  if (!action.result || typeof action.result !== "object") {
    return "";
  }
  const value = action.result[field];
  return typeof value === "string" ? value.trim() : "";
}

function compactAddress(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
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
  const { walletAddress, isReady } = useWallet();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const walletAddressRef = useRef(walletAddress);
  const activeThreadIdRef = useRef(activeThreadId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => {
    return Boolean(draft.trim()) && Boolean(walletAddress) && Boolean(activeThreadId) && !isSending;
  }, [draft, walletAddress, activeThreadId, isSending]);

  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadThread = useCallback(async (threadId: string, forWalletAddress: string) => {
    if (!threadId || !forWalletAddress) {
      return;
    }

    setIsLoadingThread(true);
    setErrorMessage("");
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

      if (walletAddressRef.current !== forWalletAddress) {
        return;
      }

      setActiveThreadId(threadId);
      setMessages(sortMessages(data.messages || []));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load thread.");
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  const createNewThread = useCallback(async (forWalletAddress = walletAddressRef.current) => {
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

      if (walletAddressRef.current !== forWalletAddress) {
        return null;
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
  }, []);

  const loadThreads = useCallback(
    async (forWalletAddress: string) => {
      if (!forWalletAddress) {
        return;
      }

      setIsLoadingThreads(true);
      setErrorMessage("");
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

        if (walletAddressRef.current !== forWalletAddress) {
          return;
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
          nextThreads.find((thread) => thread.id === activeThreadIdRef.current) || nextThreads[0];
        await loadThread(selected.id, forWalletAddress);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load chat threads."
        );
      } finally {
        setIsLoadingThreads(false);
      }
    },
    [createNewThread, loadThread]
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!walletAddress) {
      setThreads([]);
      setActiveThreadId("");
      setMessages([]);
      setDraft("");
      setIsLoadingThreads(false);
      setIsLoadingThread(false);
      setIsCreatingThread(false);
      setIsSending(false);
      setErrorMessage("");
      return;
    }

    setThreads([]);
    setActiveThreadId("");
    setMessages([]);
    setDraft("");
    setErrorMessage("");
    void loadThreads(walletAddress);
  }, [isReady, loadThreads, walletAddress]);

  const sendThreadReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const currentWalletAddress = walletAddressRef.current;
    if (!canSend || !activeThreadId || !currentWalletAddress) {
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
      walletAddress: currentWalletAddress,
      role: "user",
      content: normalizedDraft,
      actions: [],
      createdAt: now,
      requestId: null,
    };

    const optimisticAssistant: ThreadMessage = {
      id: tempAssistantId,
      threadId: activeThreadId,
      walletAddress: currentWalletAddress,
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
            walletAddress: currentWalletAddress,
            content: normalizedDraft,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        const data = await parseJsonSafe(response);
        setErrorMessage(buildApiErrorMessage(data, "Agent reply failed."));
        await loadThread(activeThreadId, currentWalletAddress);
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = (await parseJsonSafe(response)) as ThreadReplyJson;
        if (!data.message || !data.userMessage) {
          setErrorMessage("Unexpected response from thread reply endpoint.");
          await loadThread(activeThreadId, currentWalletAddress);
          return;
        }

        if (walletAddressRef.current !== currentWalletAddress) {
          return;
        }

        const persistedUser = data.userMessage as ThreadMessage;
        const assistantMessage: ThreadMessage = {
          ...data.message,
          actions: data.actions || data.message.actions || [],
        };

        setMessages((current) =>
          sortMessages([
            ...current.filter((message) => ![tempUserId, tempAssistantId].includes(message.id)),
            persistedUser,
            assistantMessage,
          ])
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

        return;
      }

      if (!response.body) {
        setErrorMessage("No streaming body received from backend.");
        await loadThread(activeThreadId, currentWalletAddress);
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

            if (walletAddressRef.current !== currentWalletAddress) {
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
            if (walletAddressRef.current !== currentWalletAddress) {
              return;
            }
            completedPayload = completed;

            const persistedAssistant = {
              ...completed.message,
              actions: completed.actions || completed.message.actions || [],
            };

            setMessages((current) =>
              sortMessages([
                ...current.filter((message) => ![tempUserId, tempAssistantId].includes(message.id)),
                completed.userMessage,
                persistedAssistant,
              ])
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
        await loadThread(activeThreadId, currentWalletAddress);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send thread reply.");
      await loadThread(activeThreadId, currentWalletAddress);
    } finally {
      setIsSending(false);
    }
  };

  if (!isReady) {
    return (
      <WalletGate
        title="Restoring your wallet session"
        description="We are reconnecting your wallet before loading the assistant threads."
      />
    );
  }

  if (!walletAddress) {
    return (
      <WalletGate
        title="Connect wallet to open chat"
        description="Assistant conversations are scoped to a wallet. Connect from the landing page to continue."
      />
    );
  }

  return (
    <AppShell
      eyebrow="Assistant"
      title="AI Chat"
      description="Launch and manage tokens through natural language."
    >
      <section className="grid h-full grid-cols-1 gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="panel-soft flex flex-col rounded-[32px] p-4 md:p-5 overflow-hidden">
          <div className="px-1 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Threads
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900">
              Your launches
            </h2>
          </div>

          <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
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
              className="button-primary inline-flex w-full items-center justify-center rounded-[22px] px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingThread ? "Creating..." : "+ New chat"}
            </button>

            {isLoadingThreads ? (
              <p className="panel rounded-[22px] p-4 text-xs text-slate-500">
                Loading threads...
              </p>
            ) : null}

            {!isLoadingThreads && threads.length === 0 ? (
              <p className="panel rounded-[22px] p-4 text-xs text-slate-500">
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
                className={`w-full rounded-[22px] border p-4 text-left transition ${
                  thread.id === activeThreadId
                    ? "border-[rgba(109,98,246,0.18)] bg-[linear-gradient(135deg,rgba(236,233,255,0.9),rgba(255,255,255,0.85))] shadow-[0_16px_40px_rgba(109,98,246,0.12)]"
                    : "border-[rgba(129,140,248,0.12)] bg-white/75 hover:bg-white"
                }`}
              >
                <p className="truncate text-sm font-semibold text-slate-900">{thread.title}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatTimestamp(thread.lastMessageAt)}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="panel flex flex-col rounded-[32px] p-4 md:p-5 overflow-hidden">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[rgba(129,140,248,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(243,245,255,0.9))] px-4 py-3">
            <p className="text-base font-semibold tracking-tight text-slate-950">
              {threads.find((thread) => thread.id === activeThreadId)?.title || "Select a thread"}
            </p>
            <span className="chip text-xs">{messages.length} messages</span>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            {isLoadingThread ? (
              <p className="panel-muted rounded-[24px] p-4 text-sm text-slate-500">
                Loading messages...
              </p>
            ) : null}

            {!isLoadingThread && messages.length === 0 ? (
              <p className="panel-muted rounded-[24px] p-4 text-sm text-slate-500">
                Start the conversation in this thread.
              </p>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex w-full ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[82%] min-w-0 whitespace-pre-wrap break-all ${
                    message.role === "user"
                      ? "rounded-[24px] bg-[linear-gradient(135deg,#6758f5,#5343e7)] px-5 py-4 text-right text-sm leading-6 text-white shadow-[0_18px_38px_rgba(92,77,234,0.22)] md:text-base"
                      : "rounded-[26px] border border-[rgba(129,140,248,0.1)] bg-white px-5 py-4 text-left text-sm leading-7 text-slate-800 shadow-[0_12px_28px_rgba(91,98,161,0.08)] md:text-base"
                  }`}
                >
                  {message.content || (
                    message.role === "assistant" && isSending ? (
                      <span className="inline-flex items-center gap-1.5 py-0.5">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    ) : "..."
                  )}
                  {message.role === "assistant" && message.actions.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-[rgba(129,140,248,0.12)] pt-3">
                      {message.actions.map((action) => {
                        const launchStatus = readActionResultField(action, "launchStatus");
                        const tokenAddress = readActionResultField(action, "tokenAddress");
                        const poolAddress = readActionResultField(action, "poolAddress");
                        const errorMessage = readActionResultField(action, "errorMessage");
                        const statusLabel =
                          action.status === "completed"
                            ? "Success"
                            : launchStatus === "launch_pending"
                              ? "Pending"
                              : action.status === "failed"
                                ? "Failed"
                                : "In progress";
                        const statusClass =
                          action.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : launchStatus === "launch_pending"
                              ? "bg-amber-100 text-amber-700"
                              : action.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-700";

                        return (
                          <div
                            key={action.id}
                            className="rounded-[18px] bg-[rgba(241,245,249,0.85)] px-3 py-3 text-xs leading-5 text-slate-700"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {action.tool === "launch_token" ? "Token launch" : action.tool}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 font-semibold ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </div>
                            {tokenAddress ? (
                              <p className="mt-2">Token: {compactAddress(tokenAddress)}</p>
                            ) : null}
                            {poolAddress ? (
                              <p>Pool: {compactAddress(poolAddress)}</p>
                            ) : null}
                            {action.txHash ? (
                              <p>Tx: {compactAddress(action.txHash)}</p>
                            ) : null}
                            {errorMessage ? <p>Reason: {errorMessage}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="mt-4 border-t border-[rgba(129,140,248,0.12)] pt-4"
            onSubmit={sendThreadReply}
          >
            <textarea
              className="app-input min-h-[108px] w-full rounded-[24px] px-4 py-4 text-sm"
              placeholder="Ask the assistant to deploy/check/transfer..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              
              <button
                type="submit"
                disabled={!canSend}
                className="button-primary rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>

          {errorMessage ? (
            <div className="status-danger mt-4 rounded-[24px] border p-4 text-sm">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
