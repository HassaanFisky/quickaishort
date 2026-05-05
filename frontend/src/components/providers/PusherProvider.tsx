"use client";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import Pusher from "pusher-js";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export function PusherProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1";

    if (!pusherKey) {
      console.warn("Pusher key missing. Real-time updates disabled.");
      return;
    }

    const pusher = new Pusher(pusherKey, {
      cluster,
    });

    // 1. Listen for global stats updates
    const statsChannel = pusher.subscribe(`user-dashboard-${userId}`);
    statsChannel.bind("stats-updated", (data: any) => {
      // Subtle internal update, usually handled by hooks, but can trigger global toast if needed
    });

    // 2. Listen for background export events
    // We subscribe to a general user-level export channel for notifications
    const userChannel = pusher.subscribe(`user-events-${userId}`);
    
    userChannel.bind("export-complete", (data: any) => {
      toast.success("Video Export Ready!", {
        description: `Your video is ready for download.`,
        action: {
          label: "Download",
          onClick: () => window.open(data.download_url, "_blank"),
        },
        icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
        duration: 10000,
      });
    });

    userChannel.bind("export-failed", (data: any) => {
      toast.error("Export Failed", {
        description: data.error || "An unexpected error occurred during rendering.",
        icon: <AlertCircle className="w-4 h-4 text-red-500" />,
      });
    });

    return () => {
      pusher.unsubscribe(`user-dashboard-${userId}`);
      pusher.unsubscribe(`user-events-${userId}`);
      pusher.disconnect();
    };
  }, [userId]);

  return <>{children}</>;
}
