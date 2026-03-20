"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNavbar } from "@/components/app-navbar";
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

  const canSend = useMemo(() => {
    return Boolean(draft.trim()) && Boolean(walletAddress) && Boolean(activeThreadId) && !isSending;
  }, [draft, walletAddress, activeThreadId, isSending]);

  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-6">
        <AppNavbar />
      </div>

      <section className="mt-2 grid min-h-[68vh] grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
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

        <div className="flex min-h-[68vh] flex-col rounded-3xl border border-slate-200 bg-[#faf7f2] p-4 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <div className="flex-1 space-y-6 overflow-y-auto pr-1">
            {isLoadingThread ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Loading messages...
              </p>
            ) : null}

            {!isLoadingThread && messages.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
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
                  className={`max-w-[78%] whitespace-pre-wrap ${
                    message.role === "user"
                      ? "rounded-full bg-slate-900 px-5 py-3 text-right text-sm leading-6 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] md:text-base"
                      : "rounded-3xl bg-white px-4 py-3 text-left text-sm leading-7 text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.06)] md:text-base"
                  }`}
                >
                  {message.content || "..."}
                </div>
              </div>
            ))}
          </div>

          <form className="mt-4 border-t border-slate-200 pt-4" onSubmit={sendThreadReply}>
            <textarea
              className="min-h-[96px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Ask the assistant to deploy/check/transfer..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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
