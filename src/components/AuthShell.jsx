/** Default `light`: lavender backdrop + charcoal-violet card (aligned with dashboard light shell). Use `dark` for the deep purple fog (970ed44). */
export function AuthShell({ narrow = false, variant = "light", children }) {
  const outer =
    variant === "dark"
      ? "flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#120818_0%,#1a0a2e_45%,#0a0512_100%)] bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(102,51,153,0.35),transparent_55%)] p-6 text-[#f4f0fa]"
      : "flex min-h-screen items-center justify-center bg-[#f3f0f7] bg-[radial-gradient(ellipse_52%_44%_at_50%_40%,rgba(206,188,238,0.55),transparent_68%)] p-6 text-[#f4f0fa]";

  const inner =
    variant === "dark"
      ? "border border-white/[0.12] bg-[rgba(16,8,28,0.75)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      : "border border-white/[0.08] bg-[#423b4e] shadow-[0_24px_55px_rgba(38,28,52,0.42)]";

  return (
    <div className={outer}>
      <div
        className={`w-full rounded-xl px-6 py-7 ${inner} ${narrow ? "max-w-lg" : "max-w-[22rem]"}`}
      >
        {children}
      </div>
    </div>
  );
}
