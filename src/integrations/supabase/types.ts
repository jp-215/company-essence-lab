export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      category_prescripts: {
        Row: {
          category_id: string
          created_at: string
          id: string
          prescript_key: string
          relevance_rank: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          prescript_key: string
          relevance_rank?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          prescript_key?: string
          relevance_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_prescripts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_prescripts_prescript_key_fkey"
            columns: ["prescript_key"]
            isOneToOne: false
            referencedRelation: "prescripts"
            referencedColumns: ["prescript_key"]
          },
        ]
      }
      category_trends: {
        Row: {
          category_id: string
          created_at: string
          id: string
          relevance_rank: number
          trend_key: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          relevance_rank?: number
          trend_key: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          relevance_rank?: number
          trend_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_trends_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_trends_trend_key_fkey"
            columns: ["trend_key"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["trend_key"]
          },
        ]
      }
      companies: {
        Row: {
          bio: string
          category_id: string
          created_at: string
          id: string
          logo_url: string | null
          mission: string
          name: string
          owner_id: string
          owner_name: string
          slug: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          bio?: string
          category_id: string
          created_at?: string
          id?: string
          logo_url?: string | null
          mission?: string
          name: string
          owner_id: string
          owner_name?: string
          slug: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio?: string
          category_id?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          mission?: string
          name?: string
          owner_id?: string
          owner_name?: string
          slug?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      company_insights: {
        Row: {
          ad_themes: string[]
          brand_colors: string[]
          company_id: string
          created_at: string
          error: string | null
          id: string
          keywords: string[]
          positioning: string | null
          raw: Json | null
          sources: Json
          status: string
          summary: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          ad_themes?: string[]
          brand_colors?: string[]
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          keywords?: string[]
          positioning?: string | null
          raw?: Json | null
          sources?: Json
          status?: string
          summary?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          ad_themes?: string[]
          brand_colors?: string[]
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          keywords?: string[]
          positioning?: string | null
          raw?: Json | null
          sources?: Json
          status?: string
          summary?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_knowledge: {
        Row: {
          ad_themes: string[]
          bio: string
          category_name: string
          company_id: string
          company_name: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          keywords: string[]
          mission: string
          owner_id: string
          owner_name: string
          positioning: string
          summary: string
          tone: string
          updated_at: string
        }
        Insert: {
          ad_themes?: string[]
          bio?: string
          category_name?: string
          company_id: string
          company_name: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[]
          mission?: string
          owner_id: string
          owner_name?: string
          positioning?: string
          summary?: string
          tone?: string
          updated_at?: string
        }
        Update: {
          ad_themes?: string[]
          bio?: string
          category_name?: string
          company_id?: string
          company_name?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[]
          mission?: string
          owner_id?: string
          owner_name?: string
          positioning?: string
          summary?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_knowledge_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_remixes: {
        Row: {
          caption: string
          company_id: string
          created_at: string
          differentiator: string
          hashtags: string[]
          hook: string
          id: string
          owner_id: string
          platform: string
          prescript_key: string | null
          script: string
          source_url: string
          trend_key: string | null
          trend_title: string
          updated_at: string
        }
        Insert: {
          caption?: string
          company_id: string
          created_at?: string
          differentiator?: string
          hashtags?: string[]
          hook?: string
          id?: string
          owner_id: string
          platform?: string
          prescript_key?: string | null
          script?: string
          source_url?: string
          trend_key?: string | null
          trend_title?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          company_id?: string
          created_at?: string
          differentiator?: string
          hashtags?: string[]
          hook?: string
          id?: string
          owner_id?: string
          platform?: string
          prescript_key?: string | null
          script?: string
          source_url?: string
          trend_key?: string | null
          trend_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_remixes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      prescripts: {
        Row: {
          angle: string
          created_at: string
          cta: string
          format: string
          hook: string
          id: string
          platform: string
          prescript_key: string
          rationale: string
          script: string
          title: string
          trend_score: number
        }
        Insert: {
          angle: string
          created_at?: string
          cta?: string
          format: string
          hook: string
          id?: string
          platform: string
          prescript_key: string
          rationale?: string
          script: string
          title: string
          trend_score?: number
        }
        Update: {
          angle?: string
          created_at?: string
          cta?: string
          format?: string
          hook?: string
          id?: string
          platform?: string
          prescript_key?: string
          rationale?: string
          script?: string
          title?: string
          trend_score?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trends: {
        Row: {
          author: string
          caption: string
          comments: number
          created_at: string
          embedding: string | null
          engagement_rate: number
          format: string
          hashtags: string[]
          id: string
          likes: number
          music: string
          platform: string
          posted_at: string | null
          query: string
          raw: Json | null
          shares: number
          source_url: string
          title: string
          trend_key: string
          trend_score: number
          updated_at: string
          views: number
        }
        Insert: {
          author?: string
          caption?: string
          comments?: number
          created_at?: string
          embedding?: string | null
          engagement_rate?: number
          format?: string
          hashtags?: string[]
          id?: string
          likes?: number
          music?: string
          platform?: string
          posted_at?: string | null
          query?: string
          raw?: Json | null
          shares?: number
          source_url?: string
          title?: string
          trend_key: string
          trend_score?: number
          updated_at?: string
          views?: number
        }
        Update: {
          author?: string
          caption?: string
          comments?: number
          created_at?: string
          embedding?: string | null
          engagement_rate?: number
          format?: string
          hashtags?: string[]
          id?: string
          likes?: number
          music?: string
          platform?: string
          posted_at?: string | null
          query?: string
          raw?: Json | null
          shares?: number
          source_url?: string
          title?: string
          trend_key?: string
          trend_score?: number
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_prescripts: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          angle: string
          cta: string
          format: string
          hook: string
          platform: string
          prescript_key: string
          rationale: string
          relevance_rank: number
          script: string
          title: string
          trend_score: number
        }[]
      }
      company_trends: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          author: string
          caption: string
          engagement_rate: number
          format: string
          hashtags: string[]
          likes: number
          platform: string
          relevance_rank: number
          source_url: string
          title: string
          trend_key: string
          trend_score: number
          views: number
        }[]
      }
      match_company_knowledge: {
        Args: {
          exclude_company?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          category_name: string
          company_id: string
          company_name: string
          positioning: string
          similarity: number
          slug: string
          summary: string
        }[]
      }
      recommend_company_trends: {
        Args: {
          _company_id: string
          _limit?: number
          _query_embedding?: string
        }
        Returns: {
          author: string
          caption: string
          combined_score: number
          engagement_rate: number
          format: string
          hashtags: string[]
          likes: number
          platform: string
          similarity: number
          source_url: string
          title: string
          trend_key: string
          trend_score: number
          views: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
