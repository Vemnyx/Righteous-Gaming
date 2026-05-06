import * as Tabs from "@radix-ui/react-tabs";
import { useAuth } from "../auth/AuthContext";

const TABS = [
  { id: "announcements", label: "Announcements" },
  { id: "data", label: "Data" },
  { id: "resources", label: "Resources" },
  { id: "users", label: "Users" },
];

const tabListClass =
  "flex flex-wrap gap-1.5 rounded-xl border border-white/[0.12] bg-black/30 p-1 sm:inline-flex sm:flex-nowrap";

const tabTriggerClass =
  "inline-flex min-h-10 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent px-4 py-2 text-[0.88rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-purple-300/45 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(16,8,28,0.92)] data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(80,40,120,0.55)] data-[state=active]:to-[rgba(40,20,70,0.65)] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(90,40,140,0.25)]";

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div
      className="box-border flex min-h-screen flex-col bg-[linear-gradient(165deg,#120818_0%,#1a0a2e_50%,#0a0512_100%)] bg-[radial-gradient(ellipse_70%_50%_at_50%_25%,rgba(102,51,153,0.32),transparent_55%)] px-5 py-5 pb-7 text-[#f4f0fa] sm:px-6"
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <h1 className="mb-0.5 bg-gradient-to-r from-white via-[#e8d4ff] to-[#c9a8e8] bg-clip-text text-[clamp(1.35rem,4vw,1.75rem)] font-bold tracking-wide text-transparent">
            Team Dashboard
          </h1>
          {user?.email ? (
            <p
              className="m-0 max-w-[min(100vw-3rem,36rem)] truncate text-[0.82rem] text-[#f4f0fa]/[0.68]"
              title={user.email}
            >
              {user.email}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-4 py-2 text-[0.85rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)]"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </header>

      <Tabs.Root defaultValue={TABS[0].id} className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <Tabs.List className={tabListClass} aria-label="Dashboard sections">
          {TABS.map((tab) => (
            <Tabs.Trigger key={tab.id} className={tabTriggerClass} value={tab.id}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {TABS.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="mt-4 flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl border border-white/[0.12] bg-[rgba(16,8,28,0.65)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 sm:p-10"
          >
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.22)_0%,transparent_68%)]"
                aria-hidden
              />
              <p
                className="relative m-0 mb-2.5 bg-[length:200%_auto] bg-gradient-to-r from-white from-0% via-violet-300 via-40% via-purple-500 via-70% to-fuchsia-100 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]"
              >
                Coming Soon!
              </p>
              <p className="relative m-0 text-[0.92rem] tracking-wide text-[#f4f0fa]/55">
                {tab.label} will appear here.
              </p>
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
