"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Logo from "@/components/shared/Logo";
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
import { History, Settings, LogOut, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);

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
        className={cn(
          "w-full max-w-7xl h-16 px-6 flex items-center justify-between rounded-2xl transition-all duration-500",
          isScrolled
            ? "nano-glass shadow-2xl scale-[0.98] border-white/10"
            : "bg-transparent border-transparent",
        )}
      >
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Pricing
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <LiquidThemeToggle />
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
                    Dashboard
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
                    New Project
                  </Link>
                </GlowButton>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-9 w-9 rounded-full ring-1 ring-white/10 hover:ring-primary/40 interactive p-0 overflow-hidden"
                  >
                    <Avatar className="h-full w-full">
                      <AvatarImage
                        src={session.user?.image || ""}
                        alt={session.user?.name || ""}
                      />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {session.user?.name?.[0]}
                      </AvatarFallback>
                    </Avatar>
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
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-white/5 cursor-pointer rounded-lg interactive p-2"
                    asChild
                  >
                    <Link href="/settings">
                      <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer rounded-lg interactive p-2"
                    onClick={() => signOut()}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                asChild
                className="text-sm font-bold hover:bg-white/5 rounded-xl h-10 px-5"
              >
                <Link href="/signin">Sign In</Link>
              </Button>
              <GlowButton
                asChild
                size="sm"
                className="h-10 px-6 rounded-xl"
              >
                <Link href="/signup">Get Started</Link>
              </GlowButton>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
