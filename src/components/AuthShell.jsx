/** Matches commit 970ed44: purple fog (linear + radial) and glassy dark card. */
export function AuthShell({ narrow = false, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#120818_0%,#1a0a2e_45%,#0a0512_100%)] bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(102,51,153,0.35),transparent_55%)] p-6 text-[#f4f0fa]">
      <div
        className={`w-full rounded-xl border border-white/[0.12] bg-[rgba(16,8,28,0.75)] px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${narrow ? "max-w-lg" : "max-w-[22rem]"}`}
      >
        {children}
      </div>
    </div>
  );
}
