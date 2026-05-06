/** Light: pale lavender shell + radial glow; dark charcoal-violet card (reference UI). Dark: full purple auth gradient. */
const shellLightOuter =
  "flex min-h-screen items-center justify-center bg-[#f3f0f7] bg-[radial-gradient(ellipse_52%_44%_at_50%_40%,rgba(206,188,238,0.55),transparent_68%)] p-6 text-[#f4f0fa]";

const cardLight =
  "w-full rounded-xl border border-white/[0.08] bg-[#423b4e] px-6 py-7 shadow-[0_24px_55px_rgba(38,28,52,0.42)]";

export function AuthShell({ narrow = false, variant = "light", children }) {
  const outer =
    variant === "dark"
      ? "bg-shell-auth flex min-h-screen items-center justify-center p-6 text-[#f4f0fa]"
      : shellLightOuter;

  const card =
    variant === "dark"
      ? `w-full rounded-xl border border-white/[0.12] bg-[rgba(16,8,28,0.75)] px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${narrow ? "max-w-lg" : "max-w-[22rem]"}`
      : `${cardLight} ${narrow ? "max-w-lg" : "max-w-[22rem]"}`;

  return (
    <div className={outer}>
      <div className={card}>{children}</div>
    </div>
  );
}
