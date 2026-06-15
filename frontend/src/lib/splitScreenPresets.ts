export interface SplitPreset {
  id: string;
  label: string;
  description: string;
  /** CSS grid-template columns for a 2-column layout */
  gridTemplate: string;
}

export const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: "50-50",
    label: "50 / 50",
    description: "Equal side-by-side",
    gridTemplate: "1fr 1fr",
  },
  {
    id: "70-30",
    label: "70 / 30",
    description: "Main + reaction",
    gridTemplate: "7fr 3fr",
  },
  {
    id: "30-70",
    label: "30 / 70",
    description: "Reaction + main",
    gridTemplate: "3fr 7fr",
  },
  {
    id: "stacked",
    label: "Stacked",
    description: "Top / bottom halves",
    gridTemplate: "1fr",
  },
];
