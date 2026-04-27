export interface UserStats {
  user_id: string;
  total_projects: number;
  total_duration_processed: number;
  export_count: number;
  ai_runs: number;
  updated_at: string;
}

export const EMPTY_STATS: UserStats = {
  user_id: "anonymous",
  total_projects: 0,
  total_duration_processed: 0,
  export_count: 0,
  ai_runs: 0,
  updated_at: new Date(0).toISOString(),
};
