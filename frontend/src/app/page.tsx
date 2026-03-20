import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 md:px-8">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0.96))]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Launchpad Console
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Launch the chat workspace, then move into token trading and management.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              The token launch form now lives in the chat flow. This home page is kept
              intentionally light so the experience starts with the assistant-first launch
              path and the token feed stays focused on discovery.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open Chat
              </Link>
              <Link
                href="/tokens"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Browse Tokens
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Launch Path
              </p>
              <p className="mt-3 text-xl font-semibold text-slate-950">
                Wallet-scoped chats, streamed actions, and on-chain follow-through.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use the chat route to kick off deployments, approvals, and backend
                orchestration without exposing a separate launch form here.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chat</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Threaded</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tokens</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Indexed</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Flow</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Wallet-first</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
