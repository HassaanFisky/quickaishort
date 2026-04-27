"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal, Trash2, Copy, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  type: "info" | "warn" | "error" | "success";
  message: string;
  timestamp: number;
}

export default function Console() {
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      id: "1",
      type: "info",
      message: "System initialized. Ready for processing.",
      timestamp: Date.now(),
    },
  ]);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(
            l.timestamp,
          ).toLocaleTimeString()}] ${l.type.toUpperCase()}: ${l.message}`,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-black text-zinc-400 font-mono text-xs transition-all duration-300",
        isExpanded ? "h-64" : "h-full",
      )}
    >
      <div className="flex items-center justify-between px-4 py-1 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3 text-zinc-500" />
          <span className="uppercase tracking-widest text-[10px] font-bold text-zinc-500">
            Console Output
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white"
            onClick={copyLogs}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white"
            onClick={clearLogs}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2 group">
              <span className="text-zinc-600 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={cn(
                  "break-all",
                  log.type === "error" && "text-red-400",
                  log.type === "warn" && "text-yellow-400",
                  log.type === "success" && "text-green-400",
                )}
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
