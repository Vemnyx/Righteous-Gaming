import { useEffect, useId, useRef, useState } from "react";
import { youtubeStartSecondsFromInput } from "../utils/youtube";

/** @returns {Promise<void>} */
function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  if (!loadYouTubeIframeApi._promise) {
    loadYouTubeIframeApi._promise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return loadYouTubeIframeApi._promise;
}
loadYouTubeIframeApi._promise = /** @type {Promise<void> | null} */ (null);

/** @param {number} totalSeconds */
export function formatVideoTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * @param {{
 *   videoId: string,
 *   embedUrl?: string,
 *   playerRef: { current: { getCurrentTime: () => number } | null },
 *   disabled?: boolean,
 * }} props
 */
export function YouTubeTimestampPreview({ videoId, embedUrl = "", playerRef, disabled = false }) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `yt-preview-${reactId}`;
  const playerInstanceRef = useRef(/** @type {YT.Player | null} */ (null));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(/** @type {string | null} */ (null));
  const [currentSeconds, setCurrentSeconds] = useState(0);

  useEffect(() => {
    playerRef.current = null;
    setReady(false);
    setLoadError(null);
    setCurrentSeconds(0);

    if (disabled || !videoId || typeof window === "undefined") return undefined;

    let cancelled = false;

    (async () => {
      try {
        await loadYouTubeIframeApi();
        if (cancelled || !window.YT?.Player) return;

        const startSeconds = youtubeStartSecondsFromInput(embedUrl);

        playerInstanceRef.current?.destroy();
        playerInstanceRef.current = new window.YT.Player(containerId, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            start: startSeconds > 0 ? startSeconds : undefined,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const player = event.target;
              playerInstanceRef.current = player;
              playerRef.current = {
                getCurrentTime: () => player.getCurrentTime(),
              };
              setReady(true);
              setCurrentSeconds(Math.floor(player.getCurrentTime()));
            },
            onError: () => {
              if (cancelled) return;
              setLoadError("Could not load this YouTube video.");
              playerRef.current = null;
              setReady(false);
            },
          },
        });
      } catch {
        if (!cancelled) {
          setLoadError("Could not load YouTube preview.");
          playerRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current = null;
      playerInstanceRef.current?.destroy();
      playerInstanceRef.current = null;
    };
  }, [videoId, embedUrl, disabled, containerId, playerRef]);

  useEffect(() => {
    if (!ready) return undefined;
    const id = window.setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.() ?? 0;
      setCurrentSeconds(Math.floor(t));
    }, 400);
    return () => window.clearInterval(id);
  }, [ready, playerRef]);

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-video overflow-hidden rounded-lg border border-white/[0.14] bg-black">
        <div id={containerId} className="h-full w-full" />
      </div>
      {loadError ? (
        <p className="m-0 text-[0.78rem] text-red-200/90" role="alert">
          {loadError}
        </p>
      ) : ready ? (
        <p className="m-0 text-[0.78rem] text-[#f4f0fa]/60">
          Start timestamp on save:{" "}
          <span className="font-semibold tabular-nums text-[#f4f0fa]/85">
            {formatVideoTimestamp(currentSeconds)}
          </span>
          . Scrub the preview to the moment the recording should begin, then save.
        </p>
      ) : (
        <p className="m-0 text-[0.78rem] text-[#f4f0fa]/55">Loading preview…</p>
      )}
    </div>
  );
}
