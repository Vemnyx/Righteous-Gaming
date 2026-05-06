export function AuthShell({ narrow = false, children }) {
  return (
    <div className="bg-shell-auth flex min-h-screen items-center justify-center p-6 text-[#f4f0fa]">
      <div
        className={`w-full rounded-xl border border-white/[0.12] bg-[rgba(16,8,28,0.75)] px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${narrow ? "max-w-lg" : "max-w-[22rem]"}`}
      >
        {children}
      </div>
    </div>
  );
}
