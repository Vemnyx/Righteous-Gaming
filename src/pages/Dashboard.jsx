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
const THEME_STORAGE_KEY = "rg-dashboard-theme";

const shellDark =
  "bg-shell-dashboard box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5";
/*
 * Light analogue of 970ed44 dashboard shell: same dual-layer idea (linear + radial),
 * inverted to a bright/fading page. Padding matches that commit: px-5 py-5 pb-7 sm:px-6.
 */
const shellLight =
  "box-border flex min-h-screen flex-col bg-[linear-gradient(165deg,#ffffff_0%,#f4f4f5_50%,#e4e4e7_100%)] bg-[radial-gradient(ellipse_70%_50%_at_50%_25%,rgb(255_255_255/0.92),transparent_55%)] px-5 py-5 pb-7 text-zinc-900 sm:px-6";

const desktopTabListDark =
  "hidden md:flex md:flex-1 md:min-w-0 md:flex-nowrap md:items-center md:gap-1 md:overflow-x-auto md:rounded-lg md:border md:border-white/[0.12] md:bg-black/30 md:p-0.5";

/* 970ed44 tabListClass: gap-1.5 rounded-xl border … p-1; desktop rail is nowrap + scroll */
const tabListLightCommit =
  "gap-1.5 rounded-xl border border-zinc-300/80 bg-zinc-200/60 p-1 inline-flex min-h-0 min-w-0 flex-1 flex-nowrap overflow-x-auto";

const desktopTabListLight = `hidden md:flex md:min-w-0 md:flex-1 md:items-center ${tabListLightCommit}`;

const desktopTriggerDark =
  "inline-flex min-h-9 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-purple-300/45 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(16,8,28,0.92)] data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(80,40,120,0.55)] data-[state=active]:to-[rgba(40,20,70,0.65)] data-[state=active]:text-white data-[state=active]:shadow-[0_3px_16px_rgba(90,40,140,0.22)]";

/* 970ed44 tabTriggerClass: min-h-10 rounded-lg px-4 py-2 text-[0.88rem] — light token swap */
const desktopTriggerLight =
  "inline-flex min-h-10 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent px-4 py-2 text-[0.88rem] font-semibold tracking-wide text-zinc-600 outline-none transition-colors hover:border-zinc-400 hover:bg-zinc-100/90 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-[#7350a8]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(90,55,140,0.85)] data-[state=active]:to-[rgba(60,35,100,0.92)] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(90,40,140,0.18)]";

/*
 * 970ed44 Coming Soon: same size, shimmer, and multi-stop gradient shape; hues shifted
 * slightly darker so the title stays legible on the light grey panel (commit used a dark card).
 */
const comingSoonTitleLight =
  "relative z-[1] m-0 mb-2.5 bg-[length:200%_auto] bg-gradient-to-r from-violet-950 from-0% via-violet-600 via-40% via-fuchsia-600 via-70% to-violet-800 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]";

const comingSoonGlowLight =
  "pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.14)_0%,transparent_68%)]";

function HamburgerIcon({ className }) {
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
      className={className}
      aria-hidden
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function ThemeToggle({ theme, onChange }) {
  const isLight = theme === "light";
  return (
    <div
      className={`flex shrink-0 overflow-hidden rounded-lg border p-0.5 text-[0.7rem] font-semibold leading-none sm:text-[0.72rem] ${
        isLight
          ? "border-zinc-300/90 bg-white/85 shadow-sm backdrop-blur-sm"
          : "border-white/20 bg-black/40"
      }`}
      role="group"
      aria-label="Color mode"
    >
      <button
        type="button"
        aria-pressed={isLight}
        onClick={() => onChange("light")}
        className={`rounded-md px-2 py-2 sm:px-2.5 ${
          isLight
            ? "bg-zinc-200/95 text-zinc-900 shadow-inner"
            : "text-[#f4f0fa]/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={!isLight}
        onClick={() => onChange("dark")}
        className={`rounded-md px-2 py-2 sm:px-2.5 ${
          !isLight
            ? "bg-white/15 text-white shadow-inner"
            : "text-zinc-500 hover:bg-zinc-100/90 hover:text-zinc-800"
        }`}
      >
        Dark
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      return v === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia(MD_UP);
    const closeMobileIfDesktop = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", closeMobileIfDesktop);
    return () => mq.removeEventListener("change", closeMobileIfDesktop);
  }, []);

  const isLight = theme === "light";

  return (
    <div className={isLight ? shellLight : shellDark}>
      <Tabs.Root
        value={activeTab}
        onValueChange={setActiveTab}
        className={
          isLight
            ? "mx-auto flex w-full max-w-4xl flex-1 flex-col"
            : "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 lg:max-w-6xl xl:max-w-7xl"
        }
      >
        <header
          className={`flex items-center gap-2 pt-1 ${
            isLight
              ? "border-b border-zinc-300/80 pb-4"
              : "border-b border-white/10 pb-2"
          }`}
        >
          <Tabs.List
            className={isLight ? desktopTabListLight : desktopTabListDark}
            aria-label="Dashboard sections"
          >
            {TABS.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                className={isLight ? desktopTriggerLight : desktopTriggerDark}
                value={tab.id}
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <button
            type="button"
            className={
              isLight
                ? "-ml-0.5 inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-300/90 bg-zinc-200/60 p-2 text-zinc-800 shadow-sm hover:border-zinc-400 hover:bg-zinc-200/90 md:hidden"
                : "-ml-0.5 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-black/35 p-2 text-white hover:border-[rgba(232,197,71,0.35)] md:hidden"
            }
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-nav"
            id="dashboard-menu-button"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <HamburgerIcon className={isLight ? "text-zinc-800" : "text-[#f4f0fa]"} />
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle theme={theme} onChange={setTheme} />
            <button
              type="button"
              className={
                isLight
                  ? "cursor-pointer rounded-lg border border-zinc-500/80 bg-[#6d4ba8] px-4 py-2 text-[0.85rem] font-semibold text-white shadow-[0_4px_16px_rgb(24_24_27/0.15)] hover:border-zinc-600 hover:bg-[#5e4090]"
                  : "cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-3 py-1.5 text-[0.8rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)]"
              }
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </header>

        <div
          id="dashboard-mobile-nav"
            className={`grid transition-[grid-template-rows] duration-200 ease-out md:hidden ${
            mobileNavOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          } ${isLight ? "border-b border-zinc-300/80" : "border-b border-white/[0.08]"}`}
          aria-hidden={!mobileNavOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <nav
              className="flex flex-col gap-1 py-2"
              aria-labelledby="dashboard-menu-button"
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                let itemClass =
                  "rounded-lg px-3 py-2.5 text-left text-[0.88rem] font-semibold outline-none transition-colors ";
                if (isLight) {
                  itemClass += selected
                    ? "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(90,55,140,0.88)] to-[rgba(60,35,100,0.95)] text-white shadow-[0_4px_20px_rgba(90,40,140,0.18)] focus-visible:ring-2 focus-visible:ring-[#7350a8] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100"
                    : "border border-zinc-300/70 bg-zinc-200/55 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/85 focus-visible:ring-2 focus-visible:ring-[#7350a8]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100";
                } else {
                  itemClass += selected
                    ? "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_3px_16px_rgba(90,40,140,0.22)] focus-visible:ring-2 focus-visible:ring-purple-500/65"
                    : "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-purple-500/65";
                }
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={itemClass}
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
            className={`flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl p-8 outline-none sm:p-10 ${
              isLight
                ? "mt-4 border border-zinc-300/90 bg-[#e8e8ec] text-zinc-900 shadow-[0_20px_50px_rgb(24_24_27/0.12)] focus-visible:ring-2 focus-visible:ring-[#7350a8]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                : "border border-white/[0.12] bg-[rgba(16,8,28,0.65)] shadow-[0_20px_50px_rgba(0,0,0,0.35)] focus-visible:ring-2 focus-visible:ring-purple-500/50"
            }`}
          >
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <span className={isLight ? comingSoonGlowLight : "pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.22)_0%,transparent_68%)]"} aria-hidden />
              <p className={isLight ? comingSoonTitleLight : "relative z-[1] m-0 bg-[length:200%_auto] bg-gradient-to-r from-white from-0% via-violet-300 via-40% via-purple-500 via-70% to-fuchsia-100 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]"}>
                Coming Soon!
              </p>
              {isLight ? (
                <p className="relative z-[1] m-0 text-[0.92rem] tracking-wide text-zinc-500">
                  {tab.label} will appear here.
                </p>
              ) : null}
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
