/**
 * Manually-authored Database types for now — once we have a few migrations,
 * we'll generate these from `supabase gen types typescript` and replace this file.
 *
 * Only the columns we actually read from the client are typed here. The full
 * schema is the source of truth in supabase/migrations/0001_initial_schema.sql.
 */

export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          auth_user_id: string | null;
          display_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          city: string | null;
          state: string | null;
          dupr_self_rating: number | null;
          is_admin: boolean;
          is_guest: boolean;
          claimed_at: string | null;
          matches_played: number;
          wins: number;
          losses: number;
          points_scored: number;
          points_against: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["players"]["Row"]> & {
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Row"]>;
      };
      courts: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          city: string;
          state: string;
          country: string;
          latitude: number;
          longitude: number;
          type: "public" | "private";
          status: "active" | "pending_review" | "payment_required" | "inactive";
          owner_id: string | null;
          added_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["courts"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["courts"]["Row"]>;
      };
      matches: {
        Row: {
          id: string;
          court_id: string;
          logged_by: string;
          server_team_p1: string;
          server_team_p2: string;
          receiver_team_p1: string;
          receiver_team_p2: string;
          server_score: number;
          receiver_score: number;
          status:
            | "pending"
            | "vouched"
            | "disputed"
            | "unverified_all_guest"
            | "admin_deleted";
          played_at: string;
          vouched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["matches"]["Row"],
          "id" | "created_at" | "updated_at" | "vouched_at"
        >;
        Update: Partial<Database["public"]["Tables"]["matches"]["Row"]>;
      };
    };
    Views: {
      city_court_pulse: {
        Row: {
          city: string;
          state: string;
          latitude: number;
          longitude: number;
          court_count: number;
          recent_match_count: number;
          last_match_at: string | null;
        };
      };
    };
  };
};
