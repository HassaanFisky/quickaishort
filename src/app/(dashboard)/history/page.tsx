"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Calendar, Download, Trash2 } from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import axios from "axios";
import { format } from "date-fns";

import { ExportRecord } from "@/types/models";

export default function HistoryPage() {
  const { data: exports, isLoading } = useQuery<ExportRecord[]>({
    queryKey: ["exports"],
    queryFn: async () => {
      const res = await axios.get("/api/exports");
      return res.data;
    },
  });
  if (isLoading)
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );

  return (
    <div className="container mx-auto px-4 py-12 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">Export History</h1>
        <p className="text-muted-foreground">
          {exports?.length || 0} total exports
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {exports && exports.length > 0 ? (
          exports.map((exp) => (
            <Card
              key={exp._id}
              className="group overflow-hidden border-2 hover:border-primary/20 transition-all"
            >
              <CardContent className="p-0">
                <div className="aspect-video bg-muted relative flex items-center justify-center">
                  <Video className="w-12 h-12 text-muted-foreground/20" />
                  <div className="absolute top-2 right-2">
                    <div className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md">
                      {exp.settings?.aspectRatio}
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h3
                      className="font-bold truncate"
                      title={exp.output?.filename}
                    >
                      {exp.output?.filename || "Untitled Export"}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(exp.createdAt), "PPP p")}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <Download className="w-4 h-4" /> Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <History className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold">No history available</h3>
            <p className="text-muted-foreground">
              Your exported clips will appear here once you process your first
              video.
            </p>
            <Button asChild>
              <Link href="/editor">Go to Editor</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
