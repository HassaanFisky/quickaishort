"use client";

import { useState, useEffect } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem("qs-cookie-consent");
      if (!consent) {
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      // Ignore if localStorage is blocked
    }
  }, []);

  const acceptAll = () => {
    try {
      localStorage.setItem("qs-cookie-consent", "all");
    } catch (e) {}
    setIsVisible(false);
  };

  const acceptNecessary = () => {
    try {
      localStorage.setItem("qs-cookie-consent", "necessary");
    } catch (e) {}
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 sm:bottom-6 left-0 sm:left-6 right-0 sm:right-auto z-[100] w-full sm:w-[420px] p-4 sm:p-0">
      <div className="bg-background/90 backdrop-blur-2xl border border-foreground/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-[2rem] p-6 relative overflow-hidden flex flex-col gap-4 animate-in slide-in-from-bottom-10 fade-in duration-700">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 text-primary">
            <div className="bg-primary/10 p-2.5 rounded-2xl border border-primary/20 shadow-inner">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black tracking-widest uppercase text-[11px] text-foreground">Data Privacy</h3>
              <p className="text-[9px] font-bold text-primary tracking-widest uppercase">Platform Consent</p>
            </div>
          </div>
          <button 
            onClick={acceptNecessary}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full p-2 transition-colors interactive"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed font-medium">
          QuickAI relies on cookies and local storage to keep your sessions secure, remember your preferences, and maintain high performance during AI video extraction.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button 
            variant="outline" 
            className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 border-foreground/10 hover:bg-foreground/5 hover:text-foreground interactive"
            onClick={acceptNecessary}
          >
            Essentials Only
          </Button>
          <Button 
            className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 shadow-[0_0_20px_hsl(var(--primary)/0.25)] hover:scale-[1.02] active:scale-[0.98] transition-transform interactive"
            onClick={acceptAll}
          >
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
