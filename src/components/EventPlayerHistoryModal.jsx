import { useEffect } from "react";
import { createPortal } from "react-dom";

/** @typedef {{
 *   round: number,
 *   round_label?: string | null,
 *   table?: number | null,
 *   opponent: string,
 *   hero: string,
 *   opponent_hero: string,
 *   result: string,
 * }} PlayerHistoryRow */

/** @typedef {{
 *   player: string,
 *   wins: number,
 *   losses: number,
 *   rows: PlayerHistoryRow[],
 * }} PlayerHistory */

/**
 * @param {{
 *   open: boolean,
 *   player: string | null,
 *   history: PlayerHistory | null,
 *   loading: boolean,
 *   error: string | null,
 *   isLight: boolean,
 *   onClose: () => void,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
export function EventPlayerHistoryModal({
  open,
  player,
  history,
  loading,
  error,
  isLight,
  onClose,
  onPlayerClick,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const panel = isLight
    ? "border border-white/[0.14] bg-[#1a1520]/95 shadow-xl"
    : "border border-white/[0.12] bg-[#120a1c]/95 shadow-xl ring-1 ring-white/[0.06]";
  const border = isLight ? "border-white/[0.12] bg-black/25" : "border-white/[0.12] bg-black/20";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className={`relative flex max-h-[min(90vh,640px)] w-full max-w-3xl flex-col rounded-xl p-5 sm:p-6 ${panel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-player-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="event-player-history-title" className="m-0 truncate text-lg font-semibold text-[#f4f0fa]">
              {player || "Player history"}
            </h3>
            {history && !loading ? (
              <p className="m-0 mt-1 text-[0.82rem] text-[#f4f0fa]/65">
                Event record: {history.wins}-{history.losses}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-white/15 bg-black/25 px-2.5 py-1 text-[0.8125rem] text-[#f4f0fa]/80 transition hover:bg-white/[0.08] hover:text-[#f4f0fa]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12" aria-busy="true">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-purple-300/90" />
          </div>
        ) : null}

        {!loading && error ? (
          <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/35 px-3 py-2 text-[0.85rem] text-red-100">
            {error}
          </p>
        ) : null}

        {!loading && !error && history ? (
          history.rows.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No rounds found for this player in this segment.</p>
          ) : (
            <div className={`overflow-auto rounded-xl border ${border}`}>
              <table className="w-full min-w-[36rem] border-collapse text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">
                    <th className="px-3 py-2.5 font-semibold">Round</th>
                    <th className="px-3 py-2.5 font-semibold">Opponent</th>
                    <th className="px-3 py-2.5 font-semibold">Hero</th>
                    <th className="px-3 py-2.5 font-semibold">Opp. hero</th>
                    <th className="px-3 py-2.5 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr
                      key={`${row.round}-${row.opponent}-${row.hero}`}
                      className="border-b border-white/[0.06] last:border-b-0"
                    >
                      <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/85">
                        R{row.round}
                        {row.round_label ? (
                          <span className="ml-1 text-[0.72rem] text-[#f4f0fa]/45">({row.round_label})</span>
                        ) : null}
                        {row.table != null && row.table > 0 ? (
                          <span className="mt-0.5 block text-[0.68rem] text-[#f4f0fa]/40">Table {row.table}</span>
                        ) : null}
                      </td>
                      <td className="max-w-[10rem] px-3 py-2.5">
                        <OpponentName name={row.opponent} onPlayerClick={onPlayerClick} />
                      </td>
                      <td className="max-w-[9rem] truncate px-3 py-2.5 text-[#f4f0fa]/72">{row.hero || "—"}</td>
                      <td className="max-w-[9rem] truncate px-3 py-2.5 text-[#f4f0fa]/72">
                        {row.opponent_hero || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <ResultBadge result={row.result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** @param {{ name: string, onPlayerClick?: (name: string) => void }} props */
function OpponentName({ name, onPlayerClick }) {
  if (!onPlayerClick) {
    return <span className="font-semibold text-[#f4f0fa]">{name}</span>;
  }
  return (
    <button
      type="button"
      className="m-0 max-w-full truncate border-0 bg-transparent p-0 text-left font-semibold text-[#f4f0fa] underline-offset-2 hover:text-purple-200 hover:underline"
      onClick={() => onPlayerClick(name)}
    >
      {name}
    </button>
  );
}

/** @param {{ result: string }} props */
function ResultBadge({ result }) {
  if (result === "win") {
    return <span className="font-semibold text-emerald-300">Win</span>;
  }
  if (result === "loss") {
    return <span className="font-semibold text-red-300/90">Loss</span>;
  }
  return <span className="text-[#f4f0fa]/50">Pending</span>;
}

/** @param {unknown} raw @returns {PlayerHistory | null} */
export function parsePlayerHistory(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  /** @type {PlayerHistoryRow[]} */
  const rows = [];
  if (Array.isArray(o.rows)) {
    for (const item of o.rows) {
      if (item == null || typeof item !== "object") continue;
      const r = /** @type {Record<string, unknown>} */ (item);
      rows.push({
        round: Number(r.round) || 0,
        round_label: r.round_label != null ? String(r.round_label) : null,
        table: r.table != null ? Number(r.table) : null,
        opponent: String(r.opponent ?? ""),
        hero: String(r.hero ?? ""),
        opponent_hero: String(r.opponent_hero ?? ""),
        result: String(r.result ?? ""),
      });
    }
  }
  return {
    player: String(o.player ?? ""),
    wins: Number(o.wins) || 0,
    losses: Number(o.losses) || 0,
    rows,
  };
}
