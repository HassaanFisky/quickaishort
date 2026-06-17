"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import QSLogo from "@/components/shared/QSLogo";
import { GlowButton } from "@/components/ui/GlowButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { History, Settings, LogOut, LayoutDashboard, Plus, Globe } from "lucide-react";
import Link from "next/link";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useLocale, setLocale, useTranslations } from "@/lib/i18n";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const currentLocale = useLocale();
  const t = useTranslations();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4">
      <nav
        aria-label="Primary"
        className={cn(
          "w-full max-w-6xl h-14 px-5 flex items-center justify-between rounded-2xl",
          "transition-[background-color,border-color,box-shadow,transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isScrolled
            ? "bg-[hsl(var(--bg-base))]/80 backdrop-blur-2xl border border-white/[0.07] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] scale-[0.99]"
            : "bg-transparent border border-transparent",
        )}
      >
        <div className="flex items-center gap-8">
          <Link
            href="/"
            aria-label="QuickAI Shorts – Home"
            className="flex items-center flex-shrink-0 group"
          >
            <QSLogo variant="full" size="md" animated />
          </Link>
          <div className="hidden md:flex items-center gap-0.5">
            <Link
              href="/#features"
              className={cn(
                "text-[13px] font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg",
                "transition-[color,background-color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:bg-white/[0.04]",
                "focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]",
              )}
            >
              {t("nav.features")}
            </Link>
            <Link
              href="/pricing"
              className={cn(
                "text-[13px] font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg",
                "transition-[color,background-color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:bg-white/[0.04]",
                "focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]",
              )}
            >
              {t("nav.pricing")}
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <LiquidThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] p-0"
                aria-label="Select Language"
              >
                <Globe className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="nano-glass text-foreground border-white/10 p-1" align="end">
              <DropdownMenuItem
                onClick={() => setLocale("en")}
                className={cn("focus:bg-white/5 cursor-pointer rounded-lg p-2 text-xs", currentLocale === "en" && "font-bold text-primary")}
              >
                English
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocale("es")}
                className={cn("focus:bg-white/5 cursor-pointer rounded-lg p-2 text-xs", currentLocale === "es" && "font-bold text-primary")}
              >
                Español
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocale("fr")}
                className={cn("focus:bg-white/5 cursor-pointer rounded-lg p-2 text-xs", currentLocale === "fr" && "font-bold text-primary")}
              >
                Français
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocale("hi")}
                className={cn("focus:bg-white/5 cursor-pointer rounded-lg p-2 text-xs", currentLocale === "hi" && "font-bold text-primary")}
              >
                हिन्दी
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {status === "authenticated" ? (
            <>
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground interactive h-9 px-4 rounded-xl"
                  asChild
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    {t("nav.dashboard")}
                  </Link>
                </Button>
                <GlowButton
                  variant="premium"
                  size="sm"
                  className="h-9 px-4 rounded-xl"
                  asChild
                >
                  <Link href="/editor">
                    <Plus className="w-4 h-4 mr-2" />
                    {t("nav.newProject")}
                  </Link>
                </GlowButton>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-9 w-9 rounded-full ring-1 ring-white/10 hover:ring-primary/40 interactive p-0 overflow-hidden"
                  >
                    <div
                      className="relative group"
                      aria-label={
                        session.user.isPro
                          ? `${session.user?.name ?? "Account"} (Pro subscriber)`
                          : session.user?.name ?? "Account"
                      }
                    >
                      <Avatar className={cn(
                        "h-full w-full transition-transform duration-300 group-hover:scale-105",
                        session.user.isPro && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_15px_rgba(33,150,243,0.5)]"
                      )}>
                        <AvatarImage
                          src={session.user?.image || ""}
                          alt=""
                        />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                          {session.user?.name?.[0]}
                        </AvatarFallback>
                      </Avatar>

                      {session.user.isPro && (
                        <div
                          aria-hidden="true"
                          className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-black px-1 rounded-sm shadow-lg border border-background"
                        >
                          PRO
                        </div>
                      )}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 nano-glass text-foreground p-2 border-white/10"
                  align="end"
                  forceMount
                >
                  <DropdownMenuLabel className="font-normal px-3 py-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-bold leading-none">
                        {session.user?.name}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem
                    className="focus:bg-white/5 cursor-pointer rounded-lg interactive p-2"
                    asChild
                  >
                    <Link href="/dashboard">
                      <LayoutDashboard className="w-4 h-4 mr-2 text-muted-foreground" />
                      {t("nav.dashboard")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-white/5 cursor-pointer rounded-lg interactive p-2"
                    asChild
                  >
                    <Link href="/settings">
                      <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
                      {t("nav.settings")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer rounded-lg interactive p-2"
                    onClick={() => signOut()}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("nav.logOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                asChild
                className="text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-xl h-9 px-4"
              >
                <Link href="/signin">{t("nav.signIn")}</Link>
              </Button>
              <GlowButton asChild size="sm" variant="gradient" className="h-9 px-5 rounded-xl text-[13px]">
                <Link href="/signup">{t("nav.getStarted")}</Link>
              </GlowButton>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

