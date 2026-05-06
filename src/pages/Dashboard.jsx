import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const TABS = [
  { id: "announcements", label: "Announcements" },
  { id: "data", label: "Data" },
  { id: "resources", label: "Resources" },
  { id: "users", label: "Users" },
];

const MD_UP = "(min-width: 768px)";

const desktopTabListClass =
  "hidden md:flex md:flex-1 md:min-w-0 md:flex-nowrap md:items-center md:gap-1 md:overflow-x-auto md:rounded-lg md:border md:border-white/[0.12] md:bg-black/30 md:p-0.5";

const desktopTriggerClass =
  "inline-flex min-h-9 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-purple-300/45 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(16,8,28,0.92)] data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(80,40,120,0.55)] data-[state=active]:to-[rgba(40,20,70,0.65)] data-[state=active]:text-white data-[state=active]:shadow-[0_3px_16px_rgba(90,40,140,0.22)]";

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[#f4f0fa]"
      aria-hidden
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

export default function Dashboard() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MD_UP);
    const closeMobileIfDesktop = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", closeMobileIfDesktop);
    return () => mq.removeEventListener("change", closeMobileIfDesktop);
  }, []);

  return (
    <div className="bg-shell-dashboard box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5">
      <Tabs.Root
        value={activeTab}
        onValueChange={setActiveTab}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 lg:max-w-6xl xl:max-w-7xl"
      >
        <header className="flex items-center gap-2 border-b border-white/10 pb-2 pt-1">
          <Tabs.List className={desktopTabListClass} aria-label="Dashboard sections">
            {TABS.map((tab) => (
              <Tabs.Trigger key={tab.id} className={desktopTriggerClass} value={tab.id}>
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <button
            type="button"
            className="-ml-0.5 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-black/35 p-2 text-white hover:border-[rgba(232,197,71,0.35)] md:hidden"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-nav"
            id="dashboard-menu-button"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <HamburgerIcon />
          </button>

          <button
            type="button"
            className="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-3 py-1.5 text-[0.8rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)]"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </header>

        <div
          id="dashboard-mobile-nav"
          className={`grid border-b border-white/[0.08] transition-[grid-template-rows] duration-200 ease-out md:hidden ${
            mobileNavOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
          aria-hidden={!mobileNavOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <nav
              className="flex flex-col gap-1 py-2"
              aria-labelledby="dashboard-menu-button"
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded-lg px-3 py-2.5 text-left text-[0.88rem] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-purple-500/65 ${
                      selected
                        ? "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_3px_16px_rgba(90,40,140,0.22)]"
                        : "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:bg-white/[0.06]"
                    }`}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {TABS.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl border border-white/[0.12] bg-[rgba(16,8,28,0.65)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 sm:p-10"
          >
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.22)_0%,transparent_68%)]"
                aria-hidden
              />
              <p
                className="relative m-0 bg-[length:200%_auto] bg-gradient-to-r from-white from-0% via-violet-300 via-40% via-purple-500 via-70% to-fuchsia-100 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]"
              >
                Coming Soon!
              </p>
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
