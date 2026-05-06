/** Light styling matches Dashboard `shellLight`; dark keeps purple auth gradient. Default is light. */
export function AuthShell({ narrow = false, variant = "light", children }) {
  const outer =
    variant === "dark"
      ? "bg-shell-auth flex min-h-screen items-center justify-center p-6 text-[#f4f0fa]"
      : "flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#ffffff_0%,#f4f4f5_50%,#e4e4e7_100%)] bg-[radial-gradient(ellipse_70%_50%_at_50%_25%,rgb(255_255_255/0.92),transparent_55%)] p-6 text-zinc-900";

  const card =
    variant === "dark"
      ? `w-full rounded-xl border border-white/[0.12] bg-[rgba(16,8,28,0.75)] px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${narrow ? "max-w-lg" : "max-w-[22rem]"}`
      : `w-full rounded-xl border border-zinc-300/90 bg-[#f0f0f4] px-6 py-7 shadow-[0_24px_50px_rgb(24_24_27/0.08)] ${narrow ? "max-w-lg" : "max-w-[22rem]"}`;

  return (
    <div className={outer}>
      <div className={card}>{children}</div>
    </div>
  );
}
