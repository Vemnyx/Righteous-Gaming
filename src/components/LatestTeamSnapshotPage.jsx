import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { EventTeamSnapshot } from "./EventTeamSnapshot";
import { buildTeamSnapshot } from "../utils/eventTeamSnapshot";

/**
 * @param {{ id?: number, start_date?: string | null }} a
 * @param {{ id?: number, start_date?: string | null }} b
 */
function compareEventsNewestFirst(a, b) {
  const aStart = a.start_date ? Date.parse(a.start_date) : NaN;
  const bStart = b.start_date ? Date.parse(b.start_date) : NaN;
  if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) {
    return bStart - aStart;
  }
  if (Number.isFinite(aStart) !== Number.isFinite(bStart)) {
    return Number.isFinite(aStart) ? -1 : 1;
  }
  const aId = Number(a.id) || 0;
  const bId = Number(b.id) || 0;
  return bId - aId;
}

/** @param {{ label?: string | null, event_type_name?: string | null, id?: number }} d */
function segmentLabel(d) {
  return d.label || d.event_type_name || `Segment ${d.id}`;
}

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#f4f0fa]/20 border-t-purple-300/90"
        aria-hidden
      />
    </div>
  );
}

/**
 * Static `/team` view: team snapshot for the most recent event.
 *
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function LatestTeamSnapshotPage({ isLight, active }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [event, setEvent] = useState(/** @type {null | Record<string, unknown>} */ (null));
  const [eventData, setEventData] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [dataIdx, setDataIdx] = useState(0);
  const [teamMatches, setTeamMatches] = useState(/** @type {any[]} */ ([]));
  const [teamLoading, setTeamLoading] = useState(false);
  const [rounds, setRounds] = useState(/** @type {{ id?: number, round_number: number, round_label?: string }[]} */ ([]));
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [round, setRound] = useState(1);
  const roundsInitializedRef = useRef(false);

  const activeData = eventData[dataIdx] ?? null;
  const eventId = event?.id != null ? Number(event.id) : null;

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const listRes = await fetch("/api/events", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!listRes.ok) {
          throw new Error((await listRes.text()).trim() || listRes.statusText || `HTTP ${listRes.status}`);
        }
        const listData = await listRes.json();
        const events = Array.isArray(listData.events) ? [...listData.events] : [];
        events.sort(compareEventsNewestFirst);
        const latest = events[0];
        if (!latest?.id) {
          if (!cancelled) {
            setEvent(null);
            setEventData([]);
            setTeamMatches([]);
            setRounds([]);
          }
          return;
        }
        const eventRes = await fetch(`/api/events/${latest.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!eventRes.ok) {
          throw new Error((await eventRes.text()).trim() || eventRes.statusText || `HTTP ${eventRes.status}`);
        }
        const detail = await eventRes.json();
        if (cancelled) return;
        setEvent(detail.event ?? latest);
        setEventData(Array.isArray(detail.event_data) ? detail.event_data : []);
        setDataIdx(0);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load latest event");
          setEvent(null);
          setEventData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  useEffect(() => {
    if (!active || !user || eventId == null) return undefined;
    let cancelled = false;
    (async () => {
      setTeamLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}/team-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        if (!cancelled) setTeamMatches(Array.isArray(data.matches) ? data.matches : []);
      } catch {
        if (!cancelled) setTeamMatches([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, eventId]);

  useEffect(() => {
    roundsInitializedRef.current = false;
  }, [activeData?.id]);

  const loadRounds = useCallback(async () => {
    if (!user || !activeData?.id || eventId == null) return;
    setRoundsLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ event_data_id: String(activeData.id) });
      const res = await fetch(`/api/events/${eventId}/rounds?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      const data = await res.json();
      const list = Array.isArray(data.rounds) ? data.rounds : [];
      setRounds(list);
      if (list.length > 0) {
        const max = list.reduce(
          (m, r) => (r.round_number > m ? r.round_number : m),
          list[0].round_number ?? 1,
        );
        setRound((prev) => {
          if (!roundsInitializedRef.current) {
            roundsInitializedRef.current = true;
            return max;
          }
          if (prev > 0 && list.some((r) => r.round_number === prev)) return prev;
          return max;
        });
      } else {
        setRound(1);
      }
    } catch {
      setRounds([]);
    } finally {
      setRoundsLoading(false);
    }
  }, [user, activeData?.id, eventId]);

  useEffect(() => {
    if (!active || !activeData?.id) return;
    void loadRounds();
  }, [active, activeData?.id, loadRounds]);

  const segmentTeamMatches = useMemo(() => {
    if (!activeData?.id) return [];
    return teamMatches.filter((m) => m.event_data_id === activeData.id);
  }, [teamMatches, activeData]);

  const teamMembers = useMemo(() => {
    const seen = new Set();
    /** @type {{ user_id: number, first_name?: string, last_name?: string }[]} */
    const out = [];
    for (const m of segmentTeamMatches) {
      if (seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      out.push({ user_id: m.user_id, first_name: m.first_name, last_name: m.last_name });
    }
    return out;
  }, [segmentTeamMatches]);

  const teamSnapshot = useMemo(() => {
    if (!activeData || teamMembers.length === 0) {
      return { chartSeries: [], chartRounds: [], rankings: [], maxWins: 1 };
    }
    return buildTeamSnapshot(segmentTeamMatches, teamMembers, round);
  }, [activeData, segmentTeamMatches, teamMembers, round]);

  const rowChrome = isLight
    ? "border-white/[0.12] bg-black/25"
    : "border-white/[0.20] bg-black/20 ring-1 ring-white/[0.05]";

  if (!active) return null;

  if (loading) return <TabSpinner />;

  if (error) {
    return (
      <div className="px-2 py-4">
        <p className="text-red-200/90">{error}</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="px-2 py-4">
        <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">No events yet.</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.875rem]">
          <h2 className="m-0 text-base font-semibold tracking-tight text-[#f4f0fa] sm:text-lg">
            {String(event.title ?? "Event")}
          </h2>
          {event.date_text ? (
            <>
              <span className="text-[#f4f0fa]/35" aria-hidden>
                ·
              </span>
              <span className="text-[#f4f0fa]/70">{String(event.date_text)}</span>
            </>
          ) : null}
          <span className="text-[#f4f0fa]/35" aria-hidden>
            ·
          </span>
          <span className="text-[#f4f0fa]/55">Team snapshot</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eventData.length > 1 ? (
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-white/[0.1] bg-black/20 p-1">
              {eventData.map((d, idx) => (
                <button
                  key={String(d.id ?? idx)}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold transition ${
                    dataIdx === idx
                      ? "bg-purple-500/25 text-purple-100"
                      : "text-[#f4f0fa]/60 hover:bg-white/[0.05] hover:text-[#f4f0fa]/90"
                  }`}
                  onClick={() => setDataIdx(idx)}
                >
                  {segmentLabel(d)}
                </button>
              ))}
            </div>
          ) : null}
          {roundsLoading ? (
            <span className="shrink-0 text-[0.8rem] text-[#f4f0fa]/55">Loading rounds…</span>
          ) : rounds.length > 0 ? (
            <select
              className="rg-select shrink-0 rounded-md border border-white/15 bg-black/25 py-1.5 pl-2.5 text-[0.8125rem] text-[#f4f0fa] outline-none focus:border-purple-400/45"
              value={round}
              aria-label="Round"
              onChange={(e) => setRound(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r.id ?? r.round_number} value={r.round_number}>
                  {r.round_label || `Round ${r.round_number}`}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {roundsLoading || teamLoading ? <TabSpinner /> : null}

      {!roundsLoading && !teamLoading && eventData.length === 0 ? (
        <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No coverage segments for this event yet.</p>
      ) : null}

      {!roundsLoading && !teamLoading && activeData ? (
        <EventTeamSnapshot
          chartSeries={teamSnapshot.chartSeries}
          chartRounds={teamSnapshot.chartRounds}
          rankings={teamSnapshot.rankings}
          maxWins={teamSnapshot.maxWins}
          isLight={isLight}
          rowChrome={rowChrome}
          currentRound={round}
        />
      ) : null}
    </div>
  );
}
