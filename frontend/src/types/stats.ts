// Mirrors fastapi/models/user_stats.py UserStats Pydantic model exactly.
// is_pro and is_premium are kept as separate fields on the backend; both
// are written in lockstep by billing._grant_pro / _revoke_pro, so they are
// functionally redundant today but distinct in schema.
export interface UserStats {
  user_id: string;
  total_projects: number;
  total_duration_processed: number;
  export_count: number;
  ai_runs: number;
  credits_balance: number;
  is_pro: boolean;
  is_premium: boolean;
  paddle_subscription_id: string | null;
  updated_at: string;
}

export const EMPTY_STATS: UserStats = {
  user_id: "anonymous",
  total_projects: 0,
  total_duration_processed: 0,
  export_count: 0,
  ai_runs: 0,
  credits_balance: 0,
  is_pro: false,
  is_premium: false,
  paddle_subscription_id: null,
  updated_at: new Date(0).toISOString(),
};
