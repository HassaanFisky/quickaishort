"use client";

// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Label } from "@/components/ui/label";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Button } from "@/components/ui/button";

import AcquirePanel from "./AcquirePanel";
import ClipSuggestionsPanel from "./ClipSuggestionsPanel";
import TranscriptionPanel from "./TranscriptionPanel";
import ExportPanel from "./ExportPanel";

export default function Inspector({ tab }: { tab: string }) {
  return (
    <div className="p-4 h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-lg font-bold tracking-tight capitalize">
          {tab} Panel
        </h2>
      </div>

      {tab === "acquire" ? (
        <AcquirePanel />
      ) : tab === "clips" ? (
        <ClipSuggestionsPanel />
      ) : tab === "captions" ? (
        <TranscriptionPanel />
      ) : (
        <ExportPanel />
      )}
    </div>
  );
}
