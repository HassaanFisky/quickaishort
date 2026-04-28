"use client";

import Link from "next/link";
import { History, Video, Calendar, Download, Trash2, ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import axios from "axios";
import { format } from "date-fns";
import { motion, Variants } from "framer-motion";
import { Badge } from "@/components/ui/badge";

import { ExportRecord } from "@/types/models";

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item: Variants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};


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
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
          <LoadingSpinner size={48} className="relative z-10" />
        </div>
      </div>
    );

  return (
    <div className="container mx-auto px-6 py-12 space-y-12 max-w-7xl">
      {/* Header Section */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <History className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter premium-gradient-text">
              Export History
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium opacity-80 max-w-xl leading-relaxed">
            Manage and download your previously generated viral clips. High-performance archival for your elite studio.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-4 py-1.5 border-foreground/10 bg-foreground/5 text-xs font-black tracking-widest uppercase rounded-full">
            {exports?.length || 0} Total Sessions
          </Badge>
        </div>
      </motion.div>

      {/* Grid Section */}
      {exports && exports.length > 0 ? (
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"
        >
          {exports.map((exp) => (
            <motion.div key={exp._id} variants={item}>
              <Card className="group depth-card glass-surface overflow-hidden border-foreground/5 hover:border-primary/30 transition-all duration-500 rounded-[2.5rem]">
                <CardContent className="p-0">
                  {/* Preview Placeholder */}
                  <div className="aspect-video bg-foreground/[0.03] relative flex items-center justify-center group-hover:bg-foreground/[0.05] transition-colors duration-500">
                    <Video className="w-14 h-14 text-foreground/10 group-hover:text-primary/20 transition-colors" />
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full backdrop-blur-md border border-primary/20 uppercase tracking-widest">
                        {exp.settings?.aspectRatio || "9:16"}
                      </Badge>
                    </div>
                    <div className="absolute inset-0 bg-linear-to-t from-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="space-y-2">
                      <h3
                        className="text-xl font-bold truncate tracking-tight text-foreground/90"
                        title={exp.output?.filename}
                      >
                        {exp.output?.filename || "Elite Studio Session"}
                      </h3>
                      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground tracking-wide">
                        <Calendar className="w-3.5 h-3.5" />
                        {format(new Date(exp.createdAt), "MMM d, yyyy · p")}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-11 gap-2 border-foreground/10 bg-foreground/5 hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 font-bold rounded-xl"
                      >
                        <Download className="w-4 h-4" /> Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all duration-300 font-bold rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-32 text-center max-w-lg mx-auto space-y-8 depth-card glass-surface rounded-[3rem] border-dashed border-2 border-foreground/10 bg-transparent"
        >
          <div className="bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-primary/20">
            <History className="w-10 h-10 text-primary animate-pulse" />
          </div>
          <div className="space-y-3">
            <h3 className="text-3xl font-black tracking-tight">Empty Archives</h3>
            <p className="text-muted-foreground font-medium text-lg px-8 opacity-80">
              Your generated clips will appear here. Start your first elite studio session to begin.
            </p>
          </div>
          <Button asChild size="lg" className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20">
            <Link href="/editor">
              <Sparkles className="w-5 h-5 mr-2" />
              Go to Studio
            </Link>
          </Button>
        </motion.div>
      )}
    </div>
  );
}
