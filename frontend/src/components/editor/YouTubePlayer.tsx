'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  videoId: string;
  onReady?: (player: unknown) => void;
  onStateChange?: (state: number) => void;
  className?: string;
};

export function YouTubePlayer({ videoId, onReady, onStateChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<unknown>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;

    function initPlayer() {
      if (cancelled || !containerRef.current || !win.YT?.Player) return;
      try {
        playerRef.current = new win.YT.Player(containerRef.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin:
              typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onReady: (e: any) => {
              if (!cancelled) {
                setReady(true);
                onReady?.(e.target);
              }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onStateChange: (e: any) => onStateChange?.(e.data),
          },
        });
      } catch {
        // Player init failure is non-fatal
      }
    }

    if (win.YT?.loaded) {
      initPlayer();
    } else {
      const prev = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        document.body.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (playerRef.current as any)?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${
        className ?? ''
      }`}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 [&>iframe]:!h-full [&>iframe]:!w-full"
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="text-sm text-white/40 animate-pulse">
            Loading preview…
          </span>
        </div>
      )}
    </div>
  );
}
