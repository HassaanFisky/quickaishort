"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Plus,
  Film,
  Settings,
  LogOut,
  Search,
  MoreVertical,
  ExternalLink,
  Loader2,
  TrendingUp,
  Cpu,
  Clock,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ProjectData {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  status: string;
  updatedAt: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ytUrl, setYtUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      await fetchProjects();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProjects = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const createProject = async () => {
    if (!ytUrl) return;
    setIsCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/video/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ youtubeUrl: ytUrl }),
      });

      if (!res.ok) throw new Error("Failed to create project");

      const { project } = await res.json();
      router.push(`/dashboard/editor/${project.id}`);
    } catch (err) {
      console.error("Creation failed", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          Loading Studio...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white font-sans selection:bg-[#2997ff]/30">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-[80px] flex flex-col items-center py-6 gap-8 bg-[#000000] border-r border-white/[0.08] z-50">
        <div className="relative w-8 h-8 overflow-hidden mb-4">
          <div
            className="absolute inset-0 bg-[#2997ff]"
            style={{
              WebkitMaskImage: "url('/logo.png')",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskImage: "url('/logo.png')",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />
        </div>
        <div className="flex flex-col gap-6 flex-1">
          <SidebarIcon icon={<TrendingUp size={20} />} active />
          <SidebarIcon icon={<Youtube size={20} />} />
          <SidebarIcon icon={<Cpu size={20} />} />
        </div>
        <div className="flex flex-col gap-6">
          <SidebarIcon icon={<Settings size={20} />} />
          <SidebarIcon icon={<LogOut size={20} />} onClick={handleSignOut} />
        </div>
      </div>

      <main className="ml-20 p-12 max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex justify-between items-end">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {user?.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full border-2 border-neutral-800 shadow-xl"
                />
              )}
              <div>
                <h2 className="text-3xl font-black tracking-tighter">
                  Studio Dashboard
                </h2>
                <p className="text-neutral-500 text-sm font-medium">
                  Welcome back,{" "}
                  {user?.user_metadata?.full_name?.split(" ")[0] || "Creator"}
                </p>
              </div>
            </div>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="h-12 bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-xl shadow-xl shadow-blue-900/20 font-bold tracking-tight gap-2 transition-all hover:scale-105 active:scale-95">
                <Plus size={20} strokeWidth={3} />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-900 border-neutral-800 text-white p-6 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  Import Content
                </DialogTitle>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    YouTube URL
                  </label>
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    className="bg-neutral-950 border-neutral-800 h-12"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-neutral-500">
                  FastAPI Engine will parse metadata and prepare the timeline.
                </p>
              </div>
              <DialogFooter>
                <Button
                  className="w-full h-12 bg-blue-600 hover:bg-blue-500 font-bold"
                  onClick={createProject}
                  disabled={isCreating || !ytUrl}
                >
                  {isCreating ? (
                    <Loader2 className="animate-spin mr-2" size={18} />
                  ) : null}
                  {isCreating ? "Creating..." : "Create & Open Editor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Projects"
            value={projects.length.toString()}
            icon={<Film className="text-pink-500" size={20} />}
          />
          <StatCard
            title="AI Credits"
            value="Free"
            subtitle="Upgrade to Pro for AI"
            icon={<Cpu className="text-blue-500" size={20} />}
          />
          <StatCard
            title="Time Saved"
            value="∞"
            subtitle="Client-side rendering"
            icon={<Clock className="text-emerald-500" size={20} />}
          />
        </div>

        {/* Projects Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 tracking-tight">
              Recent Work
              <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full">
                {projects.length}
              </span>
            </h3>
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-600 group-focus-within:text-blue-500 transition-colors">
                <Search size={16} />
              </div>
              <Input
                placeholder="Search projects..."
                className="w-64 pl-10 h-10 bg-neutral-900/50 border-neutral-800 placeholder:text-neutral-700 focus:w-80 transition-all rounded-xl"
              />
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="h-64 rounded-3xl border-2 border-dashed border-neutral-900 flex flex-col items-center justify-center gap-3 text-neutral-700 bg-neutral-950/50">
              <Plus className="w-12 h-12 stroke-[1]" />
              <p className="text-sm font-medium">
                Start your first project today.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-2xl overflow-hidden transition-all duration-300 shadow-xl hover:shadow-2xl hover:translate-y-[-4px] cursor-pointer"
                  onClick={() => router.push(`/dashboard/editor/${project.id}`)}
                >
                  <div className="aspect-video bg-neutral-950 relative overflow-hidden">
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 to-black">
                        <Film className="w-10 h-10 text-neutral-800" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <Button className="opacity-0 group-hover:opacity-100 bg-white text-black hover:bg-neutral-200 rounded-full h-10 px-6 gap-2 font-bold shadow-2xl transition-all scale-90 group-hover:scale-100">
                        Open Studio <ExternalLink size={14} />
                      </Button>
                    </div>
                    {project.status === "completed" && (
                      <div className="absolute top-3 right-3 bg-green-500 text-[10px] font-black uppercase text-white px-2 py-0.5 rounded shadow-lg">
                        Exported
                      </div>
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-sm tracking-tight truncate flex-1">
                        {project.title}
                      </h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-neutral-500 hover:text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                      <span>
                        {project.duration
                          ? `${Math.floor(project.duration / 60)}m ${project.duration % 60}s`
                          : "0s"}
                      </span>
                      <span>
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-4 hover:border-neutral-700 transition-colors shadow-xl group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          {title}
        </span>
        <div className="p-2 bg-black rounded-xl border border-neutral-800 group-hover:bg-blue-600 group-hover:border-blue-500 transition-all duration-300">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-4xl font-black tracking-tighter">{value}</h3>
        {subtitle && (
          <p className="text-[10px] text-neutral-600 mt-1 uppercase font-bold tracking-widest">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function SidebarIcon({
  icon,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "w-12 h-12 flex items-center justify-center rounded-xl cursor-pointer transition-all duration-300",
        active
          ? "bg-[#2997ff]/10 text-[#2997ff]"
          : "text-[#86868b] hover:bg-white/[0.05] hover:text-[#f5f5f7]",
      )}
      onClick={onClick}
    >
      {React.cloneElement(icon as React.ReactElement, { strokeWidth: 1.5 })}
    </div>
  );
}
