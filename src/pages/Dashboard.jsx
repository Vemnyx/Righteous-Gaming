import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { UsersAdminTable } from "../components/UsersAdminTable";

/** Persisted before opening Invite User so Back restores the dashboard URL (e.g. `/users`). */
const SESSION_INVITE_RETURN_KEY = "rg-dashboard-return-url";

const RESOURCES_TAB_ID = "resources";

/** Default Resources sub-path when opening the Resources tab from the UI (not from the address bar). */
const DEFAULT_RESOURCES_SEGMENT = "cards";

const FALLBACK_TAB_ID = "announcements";

/** @typedef {{ segment: string, label: string, path: string }} ResourceSubLink */
/** @type {ResourceSubLink[]} */
const RESOURCE_SUB_LINKS = [
  { segment: "cards", label: "Cards", path: "/resources/cards" },
  { segment: "card-ranker", label: "Card Ranker", path: "/resources/card-ranker" },
];

/**
 * @param {string} tabId
 * @param {string | null} resourcesChild — segment after `/resources/`, e.g. `cards`
 */
function buildDashboardPathname(tabId, resourcesChild) {
  if (tabId === RESOURCES_TAB_ID) {
    const seg =
      resourcesChild === "cards" || resourcesChild === "card-ranker"
        ? resourcesChild
        : DEFAULT_RESOURCES_SEGMENT;
    return `/resources/${seg}`;
  }
  return `/${tabId}`;
}

function replaceDashboardUrl(tabId, resourcesChild) {
  try {
    const u = new URL(window.location.href);
    u.pathname = buildDashboardPathname(tabId, resourcesChild);
    u.search = "";
    const next = `${u.pathname}${u.search}${u.hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} pathname
 * @returns {{ kind: "empty" } | { kind: "invalid" } | { kind: "ok", tabId: string, resourcesChild: string | null }}
 */
function parseDashboardPathname(pathname) {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "empty" };

  const [a, b, ...rest] = parts;
  if (rest.length > 0) return { kind: "invalid" };

  if (a === "resources") {
    if (b === "cards" || b === "card-ranker") {
      return { kind: "ok", tabId: RESOURCES_TAB_ID, resourcesChild: b };
    }
    return { kind: "invalid" };
  }

  if (b !== undefined) return { kind: "invalid" };

  return { kind: "ok", tabId: a, resourcesChild: null };
}

/**
 * @param {string} pathname
 * @param {string} search
 * @param {{ id: string }[]} tabsAllowed
 * @returns {{ tabId: string, resourcesChild: string | null }}
 */
function resolveDashboardLocation(pathname, search, tabsAllowed) {
  const parsed = parseDashboardPathname(pathname);

  if (parsed.kind === "invalid") {
    return { tabId: FALLBACK_TAB_ID, resourcesChild: null };
  }

  if (parsed.kind === "empty") {
    try {
      const raw = new URLSearchParams(search).get("tab");
      if (raw === RESOURCES_TAB_ID) {
        return { tabId: FALLBACK_TAB_ID, resourcesChild: null };
      }
      if (raw && tabsAllowed.some((t) => t.id === raw)) {
        return { tabId: raw, resourcesChild: null };
      }
    } catch {
      /* ignore */
    }
    return { tabId: FALLBACK_TAB_ID, resourcesChild: null };
  }

  let { tabId, resourcesChild } = parsed;

  if (!tabsAllowed.some((t) => t.id === tabId)) {
    return { tabId: FALLBACK_TAB_ID, resourcesChild: null };
  }

  return { tabId, resourcesChild };
}

/** Matches backend/domain: RoleAdmin = 0, RoleMember = 1 */
const ROLE_ADMIN = 0;

/**
 * Users tab requires admin (`role === 0`). Omit `requiresAdmin` for member-visible tabs.
 * @typedef {{ id: string, label: string, requiresAdmin?: boolean }} DashboardTabSpec
 */
const ALL_TABS = [
  { id: "announcements", label: "Announcements" },
  { id: "data", label: "Data" },
  { id: "resources", label: "Resources" },
  { id: "users", label: "Users", requiresAdmin: true },
];

const MD_UP = "(min-width: 768px)";
const THEME_STORAGE_KEY = "rg-dashboard-theme";

const DASHBOARD_LOGO_URL = "https://storage.googleapis.com/righteous-assets/righteous-logo-horizontal.png";

const shellDark =
  "bg-shell-dashboard box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5";

/* Light: pale lavender page + radial glow; UI chrome matches dark styling (screenshot reference). */
const shellLight =
  "bg-shell-light-fog box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5";

const tabsRootSharedWidth =
  "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 lg:max-w-6xl xl:max-w-7xl";

const tabsRootDark = tabsRootSharedWidth;

/** Wide layout only; no extra surface (matches pre–purple-card light look). */
const tabsRootLight = tabsRootSharedWidth;

/** Tab row only (border/background live on `navRail*` wrapper with logo). `overflow-visible` so Resources dropdown is not clipped. */
const desktopTabListShared =
  "hidden min-w-0 md:flex md:flex-1 md:flex-nowrap md:items-stretch md:gap-1 md:overflow-visible";

/** One bar: logo + tabs (desktop); logo only surface on mobile while list is hidden. */
const navRailDark =
  "box-border flex min-h-[2.875rem] min-w-0 flex-1 items-center gap-1 overflow-visible rounded-lg border border-white/[0.12] bg-black/30 p-1 sm:min-h-12 md:min-h-0 md:items-stretch";

const navRailLight =
  "box-border flex min-h-[2.875rem] min-w-0 flex-1 items-center gap-1 overflow-visible rounded-lg border border-white/[0.12] bg-[rgba(42,37,54,0.9)] p-1 backdrop-blur-sm sm:min-h-12 md:min-h-0 md:items-stretch";

/** Every top-level tab occupies one equal flex column; triggers fill width (`w-full`) so short labels don’t shrink the cell. */
const desktopTabSlot =
  "relative z-20 flex min-h-12 min-w-0 flex-1 basis-0 flex-col items-stretch justify-center self-stretch";

/* ~30% taller bar vs min-h-9; ~50% wider hit area vs px-3. Equal-width tabs on desktop: flex-1 + basis-0 + w-full */
const desktopTriggerDark =
  "flex min-h-12 w-full min-w-0 basis-0 cursor-pointer select-none items-center justify-center rounded-md border border-transparent px-[1.125rem] py-2.5 text-[0.875rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-purple-300/45 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(16,8,28,0.92)] data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(80,40,120,0.55)] data-[state=active]:to-[rgba(40,20,70,0.65)] data-[state=active]:text-white data-[state=active]:shadow-[0_3px_16px_rgba(90,40,140,0.22)] md:flex-1 md:whitespace-normal md:text-center md:leading-snug md:break-words";

/* Active/hover purples track Login gradient: from-[#7b4cb8] to-[#5a2f8f] */
const desktopTriggerLight =
  "flex min-h-12 w-full min-w-0 basis-0 cursor-pointer select-none items-center justify-center rounded-md border border-transparent px-[1.125rem] py-2.5 text-[0.875rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-[#b998e8]/55 hover:text-white focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(42,37,54,0.92)] data-[state=active]:border-[rgba(152,117,207,0.9)] data-[state=active]:bg-gradient-to-b data-[state=active]:from-[#7b4cb8] data-[state=active]:to-[#5a2f8f] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_18px_rgb(103_61_154/0.42)] md:flex-1 md:whitespace-normal md:text-center md:leading-snug md:break-words";

/** Single-option tabs use the same rail row height as expandable tabs. */
const mobileNavRowMin =
  "flex min-h-[3.25rem] w-full items-center rounded-lg px-[1.125rem] py-3.5 text-left text-[0.95rem] font-semibold outline-none transition-colors";

/** @param {boolean} selected */
function mobileNavItemSurface(selected, isLight) {
  if (selected) {
    return isLight
      ? "border border-[rgba(152,117,207,0.9)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_4px_18px_rgb(103_61_154/0.42)] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70"
      : "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_3px_16px_rgba(90,40,140,0.22)] focus-visible:ring-2 focus-visible:ring-purple-500/65";
  }
  return isLight
    ? "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:border-[#b998e8]/35 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60"
    : "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-purple-500/65";
}

/** Logo sits inside `navRail*`. Mobile: no right divider (tabs hidden); logo centered in rail. */
const logoInRail =
  "box-border flex min-w-0 flex-1 items-center justify-center px-2 py-0.5 md:flex-none md:shrink-0 md:justify-start md:border-r md:border-white/[0.1] md:px-2 md:py-0 md:pl-2 md:pr-3";

const comingSoonTitle =
  "relative z-[1] m-0 mb-2.5 bg-[length:200%_auto] bg-gradient-to-r from-white from-0% via-violet-300 via-40% via-purple-500 via-70% to-fuchsia-100 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]";

const comingSoonGlow =
  "pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.22)_0%,transparent_68%)]";

/**
 * Flush under the tab trigger (`-translate-y-px`, no margin gap). `before:` extends an invisible
 * hit area upward so the cursor can reach items without leaving hover. `rounded-t-none` + trigger
 * `rounded-b-none` read as one expanded surface.
 */
const resourcesMenuDark =
  "absolute left-0 right-0 top-full z-30 flex min-w-0 -translate-y-px flex-col gap-0.5 rounded-b-md rounded-t-none border border-t-0 border-white/[0.12] bg-[rgba(16,8,28,0.97)] p-1 pt-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm before:pointer-events-auto before:absolute before:inset-x-0 before:bottom-full before:z-[1] before:h-5 before:content-['']";

const resourcesMenuLight =
  "absolute left-0 right-0 top-full z-30 flex min-w-0 -translate-y-px flex-col gap-0.5 rounded-b-md rounded-t-none border border-t-0 border-white/[0.12] bg-[rgba(42,37,54,0.98)] p-1 pt-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm before:pointer-events-auto before:absolute before:inset-x-0 before:bottom-full before:z-[1] before:h-5 before:content-['']";

const resourcesMenuItemDark =
  "w-full rounded-md px-3 py-2.5 text-left text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/90 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65";

const resourcesMenuItemLight =
  "w-full rounded-md px-3 py-2.5 text-left text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/90 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60";

const resourcesMenuItemActiveDark =
  "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_2px_12px_rgba(90,40,140,0.22)]";

const resourcesMenuItemActiveLight =
  "border border-[rgba(152,117,207,0.85)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_2px_14px_rgb(103_61_154/0.35)]";

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

function ThemeToggle({ theme, onChange, className = "" }) {
  const lightMode = theme === "light";
  return (
    <div
      className={`flex min-h-11 min-w-0 items-stretch gap-0 overflow-hidden rounded-lg border p-0.5 text-[0.74rem] font-semibold leading-none sm:min-h-12 sm:text-[0.8rem] ${
        lightMode
          ? "border-white/15 bg-[rgba(42,37,54,0.82)] backdrop-blur-sm"
          : "border-white/20 bg-black/40"
      } ${className}`}
      role="group"
      aria-label="Color mode"
    >
      <button
        type="button"
        aria-pressed={lightMode}
        onClick={() => onChange("light")}
        className={`flex flex-1 items-center justify-center rounded-md px-3 py-2.5 sm:px-3.5 ${
          lightMode
            ? "bg-white/18 text-white shadow-inner"
            : "text-[#f4f0fa]/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={!lightMode}
        onClick={() => onChange("dark")}
        className={`flex flex-1 items-center justify-center rounded-md px-3 py-2.5 sm:px-3.5 ${
          !lightMode
            ? "bg-white/15 text-white shadow-inner"
            : "text-[#f4f0fa]/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        Dark
      </button>
    </div>
  );
}

/**
 * @param {{ onNavigate?: (path: string) => void }} props
 */
export default function Dashboard({ onNavigate }) {
  const { signOut, sessionProfile } = useAuth();
  const [activeTab, setActiveTab] = useState(ALL_TABS[0].id);
  /** When `activeTab === resources`, which sub-route is shown (`/resources/...`). */
  const [resourcesChild, setResourcesChild] = useState(/** @type {string | null} */ (null));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
  const [resourcesHovered, setResourcesHovered] = useState(false);

  const tabs = useMemo(() => {
    const isAdmin = Number(sessionProfile?.role) === ROLE_ADMIN;
    return ALL_TABS.filter((t) => !t.requiresAdmin || isAdmin);
  }, [sessionProfile]);

  const resourcesTabLabel = useMemo(() => {
    if (activeTab !== RESOURCES_TAB_ID) {
      return ALL_TABS.find((t) => t.id === RESOURCES_TAB_ID)?.label ?? "Resources";
    }
    const hit = RESOURCE_SUB_LINKS.find((l) => l.segment === resourcesChild);
    return hit?.label ?? "Resources";
  }, [activeTab, resourcesChild]);

  const handleTabNavigate = useCallback((tabId) => {
    setActiveTab(tabId);
    if (tabId === RESOURCES_TAB_ID) {
      setResourcesChild(DEFAULT_RESOURCES_SEGMENT);
      replaceDashboardUrl(RESOURCES_TAB_ID, DEFAULT_RESOURCES_SEGMENT);
    } else {
      setResourcesChild(null);
      replaceDashboardUrl(tabId, null);
      setMobileResourcesOpen(false);
    }
  }, []);

  const goResourcesSub = useCallback((segment) => {
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild(segment);
    replaceDashboardUrl(RESOURCES_TAB_ID, segment);
  }, []);

  useEffect(() => {
    function syncFromBrowser() {
      const resolved = resolveDashboardLocation(
        window.location.pathname,
        window.location.search,
        tabs,
      );
      const nextTab = resolved.tabId;
      const nextChild = nextTab === RESOURCES_TAB_ID ? resolved.resourcesChild : null;
      setActiveTab(nextTab);
      setResourcesChild(nextChild);
      replaceDashboardUrl(nextTab, nextTab === RESOURCES_TAB_ID ? nextChild : null);
      setMobileResourcesOpen(false);
    }

    syncFromBrowser();
    window.addEventListener("popstate", syncFromBrowser);
    return () => window.removeEventListener("popstate", syncFromBrowser);
  }, [tabs]);

  const [theme, setTheme] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      return v === "dark" ? "dark" : "light";
    } catch {
      return "light";
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

  /** Fresh Resources submenu each time the drawer opens; on /resources/* routes keep children collapsed. */
  useEffect(() => {
    if (mobileNavOpen) {
      setMobileResourcesOpen(false);
    }
  }, [mobileNavOpen]);

  const isLight = theme === "light";

  return (
    <div className={isLight ? shellLight : shellDark}>
      <Tabs.Root
        value={activeTab}
        onValueChange={handleTabNavigate}
        className={isLight ? tabsRootLight : tabsRootDark}
      >
        {/* Below header chrome; keeps mobile drawer above main panels */}
        <div
          className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ease-out md:hidden ${
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!mobileNavOpen}
          onClick={() => setMobileNavOpen(false)}
        />

        <div className="relative z-50 md:z-auto">
          <header
            className={`relative z-10 flex min-h-[4.25rem] items-center gap-2 border-b-0 py-2 sm:gap-3 md:min-h-[4.5rem] md:border-b ${
              isLight ? "md:border-[rgba(80,65,110,0.22)]" : "md:border-white/10"
            }`}
          >
          <button
            type="button"
            className={
              isLight
                ? "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-[rgba(42,37,54,0.88)] text-[#f4f0fa] hover:border-[rgba(232,197,71,0.35)] hover:bg-[rgba(42,37,54,0.95)] md:hidden"
                : "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-black/35 text-white hover:border-[rgba(232,197,71,0.35)] md:hidden"
            }
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-nav"
            id="dashboard-menu-button"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <HamburgerIcon className="text-[#f4f0fa]" />
          </button>

          <div className={isLight ? navRailLight : navRailDark}>
            <div className={logoInRail}>
              <img
                src={DASHBOARD_LOGO_URL}
                alt="Righteous Gaming"
                className="h-9 w-auto max-w-[min(200px,46vw)] object-contain object-center md:h-10 md:max-w-[240px] md:object-left"
              />
            </div>
            <Tabs.List className={desktopTabListShared} aria-label="Dashboard sections">
              {tabs.map((tab) => {
                const subLinks = tab.id === RESOURCES_TAB_ID ? RESOURCE_SUB_LINKS : [];
                const showDesktopSubmenu = subLinks.length > 1;
                const triggerLabel =
                  tab.id === RESOURCES_TAB_ID ? resourcesTabLabel : tab.label;

                return (
                  <div
                    key={tab.id}
                    className={desktopTabSlot}
                    onMouseEnter={
                      showDesktopSubmenu ? () => setResourcesHovered(true) : undefined
                    }
                    onMouseLeave={
                      showDesktopSubmenu ? () => setResourcesHovered(false) : undefined
                    }
                  >
                    <Tabs.Trigger
                      className={`${isLight ? desktopTriggerLight : desktopTriggerDark}${
                        showDesktopSubmenu && resourcesHovered
                          ? " relative z-[32] rounded-b-none md:rounded-b-none"
                          : ""
                      }`}
                      value={tab.id}
                    >
                      {triggerLabel}
                    </Tabs.Trigger>
                    {showDesktopSubmenu && resourcesHovered ? (
                      <div
                        className={isLight ? resourcesMenuLight : resourcesMenuDark}
                        role="menu"
                        aria-label="Resources pages"
                      >
                        {RESOURCE_SUB_LINKS.map((link) => {
                          const subActive =
                            activeTab === RESOURCES_TAB_ID &&
                            resourcesChild === link.segment;
                          return (
                            <button
                              key={link.segment}
                              type="button"
                              role="menuitem"
                              className={`${isLight ? resourcesMenuItemLight : resourcesMenuItemDark} ${
                                subActive
                                  ? isLight
                                    ? resourcesMenuItemActiveLight
                                    : resourcesMenuItemActiveDark
                                  : "border border-transparent"
                              }`}
                              data-state={subActive ? "active" : "inactive"}
                              onClick={() => goResourcesSub(link.segment)}
                            >
                              {link.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Tabs.List>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden shrink-0 md:block">
              <ThemeToggle theme={theme} onChange={setTheme} />
            </div>
            <button
              type="button"
              className={
                isLight
                  ? "min-h-11 cursor-pointer rounded-lg border border-white/15 bg-[#5f5b6c] px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:brightness-110 sm:min-h-12"
                  : "min-h-11 cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)] sm:min-h-12"
              }
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
          </header>

          <div
          id="dashboard-mobile-nav"
          className={`absolute left-0 right-0 top-full z-20 max-h-[min(75dvh,calc(100dvh-4.5rem))] overflow-y-auto overscroll-contain rounded-b-2xl border border-t-0 px-2 py-2 shadow-[0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[opacity,transform] duration-200 ease-out md:hidden ${
            isLight
              ? "border-[rgba(80,65,110,0.28)] bg-[rgba(42,37,54,0.98)]"
              : "border-white/[0.12] bg-[rgba(16,8,28,0.97)]"
          } ${
            mobileNavOpen
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-2 opacity-0"
          }`}
          aria-hidden={!mobileNavOpen}
        >
            <nav
              className="flex flex-col gap-1 py-1"
              aria-labelledby="dashboard-menu-button"
            >
              {tabs.map((tab) => {
                const subLinks = tab.id === RESOURCES_TAB_ID ? RESOURCE_SUB_LINKS : [];
                const showMobileSubmenu = subLinks.length > 1;
                const selected = activeTab === tab.id;
                const rowLabel =
                  tab.id === RESOURCES_TAB_ID ? resourcesTabLabel : tab.label;
                const rowClass = `${mobileNavRowMin} ${mobileNavItemSurface(selected, isLight)}`;

                if (showMobileSubmenu) {
                  let subIdleClass =
                    "ml-3 flex min-h-11 w-full items-center rounded-lg border border-transparent px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ";
                  subIdleClass += isLight
                    ? "bg-black/20 text-[#f4f0fa]/90 hover:border-[#b998e8]/35 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60"
                    : "bg-black/20 text-[#f4f0fa]/88 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-purple-500/65";
                  const subActiveClass = isLight
                    ? "border border-[rgba(152,117,207,0.75)] bg-gradient-to-b from-[#7b4cb8]/90 to-[#5a2f8f]/90 text-white shadow-[0_2px_12px_rgb(103_61_154/0.35)] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70"
                    : "border border-[rgba(142,90,200,0.55)] bg-gradient-to-br from-[rgba(80,40,120,0.45)] to-[rgba(40,20,70,0.55)] text-white focus-visible:ring-2 focus-visible:ring-purple-500/65";

                  return (
                    <div key={tab.id} className="flex flex-col gap-1">
                      <button
                        type="button"
                        className={rowClass}
                        aria-current={selected ? "page" : undefined}
                        aria-expanded={mobileResourcesOpen}
                        onClick={() => {
                          setMobileResourcesOpen((o) => !o);
                        }}
                      >
                        {rowLabel}
                      </button>
                      {mobileResourcesOpen ? (
                        <div
                          className={`flex flex-col gap-1 border-l pl-2 ${
                            isLight ? "border-[rgba(80,65,110,0.35)]" : "border-white/[0.12]"
                          }`}
                          role="group"
                          aria-label="Resources pages"
                        >
                          {RESOURCE_SUB_LINKS.map((link) => {
                            const subSel = resourcesChild === link.segment;
                            return (
                              <button
                                key={link.segment}
                                type="button"
                                className={
                                  subSel
                                    ? `ml-3 flex min-h-11 w-full items-center rounded-lg px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ${subActiveClass}`
                                    : subIdleClass
                                }
                                aria-current={subSel ? "page" : undefined}
                                onClick={() => {
                                  goResourcesSub(link.segment);
                                  setMobileNavOpen(false);
                                }}
                              >
                                {link.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={rowClass}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      handleTabNavigate(tab.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
              <div
                className={`mt-3 border-t px-[1.125rem] pb-1 pt-4 ${
                  isLight ? "border-[rgba(80,65,110,0.25)]" : "border-white/[0.08]"
                }`}
              >
                <ThemeToggle
                  theme={theme}
                  onChange={setTheme}
                  className="w-full"
                />
              </div>
            </nav>
        </div>
        </div>

        {tabs.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className={`relative z-0 flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl border border-white/[0.12] p-8 outline-none sm:p-10 focus-visible:ring-2 focus-visible:ring-purple-500/50 ${
              isLight
                ? "bg-gradient-to-b from-[#434054] via-[#353145] to-[#292433] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                : "bg-[rgba(16,8,28,0.65)] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
            }`}
          >
            {tab.id === "users" ? (
              <UsersAdminTable
                isLight={isLight}
                active={activeTab === tab.id}
                onInviteUser={
                  onNavigate
                    ? () => {
                        try {
                          sessionStorage.setItem(
                            SESSION_INVITE_RETURN_KEY,
                            window.location.pathname + window.location.search + window.location.hash,
                          );
                        } catch {
                          /* ignore */
                        }
                        onNavigate("/admin/invite-user");
                      }
                    : undefined
                }
              />
            ) : tab.id === RESOURCES_TAB_ID ? (
              <div
                className="flex min-h-[min(40vh,18rem)] flex-1 flex-col"
                aria-label="Resources"
              />
            ) : (
              <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                <span className={comingSoonGlow} aria-hidden />
                <p className={comingSoonTitle}>Coming Soon!</p>
              </div>
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
