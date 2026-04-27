"use client";

import * as React from "react";
import { Moon, Sun, Zap, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-xl relative group"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
          <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="lightning-glass border-white/10"
      >
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="gap-2 cursor-pointer focus:bg-white/10"
        >
          <Moon className="w-4 h-4" /> Midnight Aurora (Default)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="gap-2 cursor-pointer focus:bg-white/10"
        >
          <Sun className="w-4 h-4" /> Premium Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("creative")}
          className="gap-2 cursor-pointer focus:bg-white/10"
        >
          <Palette className="w-4 h-4" /> Creative Glow
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("high-energy")}
          className="gap-2 cursor-pointer focus:bg-white/10"
        >
          <Zap className="w-4 h-4" /> High Voltage
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
