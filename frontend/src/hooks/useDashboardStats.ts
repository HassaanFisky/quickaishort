"use client";

import { useCallback, useEffect, useRef, useState, MutableRefObject } from "react";
import Pusher, { type Channel } from "pusher-js";

import { API_URL, getStats } from "@/lib/api";
import { EMPTY_STATS, type UserStats } from "@/types/stats";

interface UseDashboardStatsArgs {
  userId: string | null | undefined;
}

interface UseDashboardStatsResult {
  stats: UserStats;
  isReady: boolean;
  transport: "pusher" | "websocket" | "rest" | "idle";
  error: string | null;
}

export function useDashboardStats({
  userId,
}: UseDashboardStatsArgs): UseDashboardStatsResult {
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [isReady, setIsReady] = useState(false);
  const [transport, setTransport] = useState<UseDashboardStatsResult["transport"]>(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const apply = useCallback((incoming: Partial<UserStats>) => {
    setStats((prev) => ({ ...prev, ...incoming, user_id: prev.user_id }));
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsReady(false);
      setTransport("idle");
      return;
    }

    let cancelled = false;
    setError(null);
    setIsReady(false);

    getStats(userId)
      .then((initial) => {
        if (cancelled) return;
        setStats({ ...EMPTY_STATS, ...initial, user_id: userId });
        setIsReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Stats fetch failed:", err);
        setStats({ ...EMPTY_STATS, user_id: userId });
        setIsReady(true);
        setError("Could not reach the stats service.");
      });

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (key && cluster) {
      try {
        const pusher = new Pusher(key, { cluster });
        pusherRef.current = pusher;
        const channel = pusher.subscribe(`user-dashboard-${userId}`);
        channelRef.current = channel;
        channel.bind("stats-updated", (data: Partial<UserStats>) => {
          if (!cancelled) apply(data);
        });
        setTransport("pusher");
      } catch (err) {
        console.warn("Pusher subscribe failed; falling back to WebSocket", err);
        openWebSocket(userId, apply, wsRef, setTransport, () => !cancelled);
      }
    } else {
      openWebSocket(userId, apply, wsRef, setTransport, () => !cancelled);
    }

    return () => {
      cancelled = true;
      if (channelRef.current) {
        channelRef.current.unbind_all();
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setTransport("idle");
    };
  }, [apply, userId]);

  return { stats, isReady, transport, error };
}

function openWebSocket(
  userId: string,
  apply: (incoming: Partial<UserStats>) => void,
  wsRef: MutableRefObject<WebSocket | null>,
  setTransport: (t: UseDashboardStatsResult["transport"]) => void,
  alive: () => boolean,
): void {
  if (!API_URL) {
    if (alive()) setTransport("rest");
    return;
  }
  const wsBase = API_URL.replace(/^http/, "ws");
  try {
    const socket = new WebSocket(`${wsBase}/ws/stats/${encodeURIComponent(userId)}`);
    wsRef.current = socket;
    socket.onopen = () => {
      if (alive()) setTransport("websocket");
    };
    socket.onmessage = (event) => {
      if (!alive()) return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.event === "stats-updated" && parsed.payload) {
          apply(parsed.payload as Partial<UserStats>);
        }
      } catch (err) {
        console.warn("WS message parse failed", err);
      }
    };
    socket.onerror = () => {
      if (alive()) setTransport("rest");
    };
  } catch (err) {
    console.warn("WebSocket open failed", err);
    if (alive()) setTransport("rest");
  }
}
