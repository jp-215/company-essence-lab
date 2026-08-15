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
      ad_videos: {
        Row: {
          concept_title: string
          created_at: string
          display_order: number
          generation_spec: Json
          hook_text: string
          id: string
          parent_video_id: string | null
          playback_id: string | null
          playback_url: string | null
          remix_id: string | null
          session_id: string
          thumbnail_url: string | null
          version: number
        }
        Insert: {
          concept_title?: string
          created_at?: string
          display_order?: number
          generation_spec?: Json
          hook_text?: string
          id?: string
          parent_video_id?: string | null
          playback_id?: string | null
          playback_url?: string | null
          remix_id?: string | null
          session_id: string
          thumbnail_url?: string | null
          version?: number
        }
        Update: {
          concept_title?: string
          created_at?: string
          display_order?: number
          generation_spec?: Json
          hook_text?: string
          id?: string
          parent_video_id?: string | null
          playback_id?: string | null
          playback_url?: string | null
          remix_id?: string | null
          session_id?: string
          thumbnail_url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_videos_parent_video_id_fkey"
            columns: ["parent_video_id"]
            isOneToOne: false
            referencedRelation: "ad_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_videos_remix_id_fkey"
            columns: ["remix_id"]
            isOneToOne: false
            referencedRelation: "company_remixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_videos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
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
      category_image_assets: {
        Row: {
          category_id: string
          created_at: string
          id: string
          image_key: string
          relevance_rank: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          image_key: string
          relevance_rank?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          image_key?: string
          relevance_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_image_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_image_assets_image_key_fkey"
            columns: ["image_key"]
            isOneToOne: false
            referencedRelation: "image_assets"
            referencedColumns: ["image_key"]
          },
        ]
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
      category_word_of_mouth: {
        Row: {
          category_id: string
          created_at: string
          id: string
          relevance_rank: number
          wom_key: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          relevance_rank?: number
          wom_key: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          relevance_rank?: number
          wom_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_word_of_mouth_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_word_of_mouth_wom_key_fkey"
            columns: ["wom_key"]
            isOneToOne: false
            referencedRelation: "word_of_mouth"
            referencedColumns: ["wom_key"]
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
      feedback_syntheses: {
        Row: {
          consensus_themes: string[]
          created_at: string
          id: string
          revision_directives: Json
          session_id: string
          summary: string
          video_verdicts: Json
        }
        Insert: {
          consensus_themes?: string[]
          created_at?: string
          id?: string
          revision_directives?: Json
          session_id: string
          summary?: string
          video_verdicts?: Json
        }
        Update: {
          consensus_themes?: string[]
          created_at?: string
          id?: string
          revision_directives?: Json
          session_id?: string
          summary?: string
          video_verdicts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "feedback_syntheses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      image_assets: {
        Row: {
          author: string
          author_handle: string
          buzz_score: number
          caption: string
          comments: number
          created_at: string
          engagement_rate: number
          format: string
          hashtags: string[]
          id: string
          image_key: string
          image_url: string
          likes: number
          platform: string
          posted_at: string | null
          query: string
          raw: Json | null
          source_url: string
          thumbnail_url: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          author_handle?: string
          buzz_score?: number
          caption?: string
          comments?: number
          created_at?: string
          engagement_rate?: number
          format?: string
          hashtags?: string[]
          id?: string
          image_key: string
          image_url?: string
          likes?: number
          platform?: string
          posted_at?: string | null
          query?: string
          raw?: Json | null
          source_url?: string
          thumbnail_url?: string
          title?: string
          updated_at?: string
        }
        Update: {
          author?: string
          author_handle?: string
          buzz_score?: number
          caption?: string
          comments?: number
          created_at?: string
          engagement_rate?: number
          format?: string
          hashtags?: string[]
          id?: string
          image_key?: string
          image_url?: string
          likes?: number
          platform?: string
          posted_at?: string | null
          query?: string
          raw?: Json | null
          source_url?: string
          thumbnail_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      judges: {
        Row: {
          active: boolean
          created_at: string
          email: string
          expertise_tags: string[]
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          expertise_tags?: string[]
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          expertise_tags?: string[]
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
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
      remix_chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          owner_id: string
          remix_id: string | null
          role: string
          trend_suggestions: Json | null
        }
        Insert: {
          chat_id: string
          content?: string
          created_at?: string
          id?: string
          owner_id: string
          remix_id?: string | null
          role: string
          trend_suggestions?: Json | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          owner_id?: string
          remix_id?: string | null
          role?: string
          trend_suggestions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "remix_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "remix_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remix_chat_messages_remix_id_fkey"
            columns: ["remix_id"]
            isOneToOne: false
            referencedRelation: "company_remixes"
            referencedColumns: ["id"]
          },
        ]
      }
      remix_chats: {
        Row: {
          company_id: string
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remix_chats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          deadline_at: string
          id: string
          public_token: string
          quorum: number
          reminded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          deadline_at?: string
          id?: string
          public_token: string
          quorum?: number
          reminded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          deadline_at?: string
          id?: string
          public_token?: string
          quorum?: number
          reminded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_judges: {
        Row: {
          created_at: string
          id: string
          invite_token: string
          judge_id: string
          opened_at: string | null
          overall_note: string
          session_id: string
          status: string
          submitted_at: string | null
          video_order: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          invite_token: string
          judge_id: string
          opened_at?: string | null
          overall_note?: string
          session_id: string
          status?: string
          submitted_at?: string | null
          video_order?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          invite_token?: string
          judge_id?: string
          opened_at?: string | null
          overall_note?: string
          session_id?: string
          status?: string
          submitted_at?: string | null
          video_order?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "session_judges_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_judges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          email: string | null
          id: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_interactions: {
        Row: {
          action: string
          company_id: string
          created_at: string
          id: string
          owner_id: string
          surface: string
          trend_key: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          id?: string
          owner_id: string
          surface?: string
          trend_key: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          surface?: string
          trend_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          author: string
          caption: string
          comments: number
          created_at: string
          duplicate_of: string | null
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
          duplicate_of?: string | null
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
          duplicate_of?: string | null
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
        Relationships: [
          {
            foreignKeyName: "trends_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["trend_key"]
          },
        ]
      }
      video_comments: {
        Row: {
          body: string
          created_at: string
          dimension_scores: Json
          id: string
          session_judge_id: string
          video_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dimension_scores?: Json
          id?: string
          session_judge_id: string
          video_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dimension_scores?: Json
          id?: string
          session_judge_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comments_session_judge_id_fkey"
            columns: ["session_judge_id"]
            isOneToOne: false
            referencedRelation: "session_judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "ad_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_votes: {
        Row: {
          created_at: string
          id: string
          is_pick: boolean
          rank: number | null
          session_judge_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_pick?: boolean
          rank?: number | null
          session_judge_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_pick?: boolean
          rank?: number | null
          session_judge_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_votes_session_judge_id_fkey"
            columns: ["session_judge_id"]
            isOneToOne: false
            referencedRelation: "session_judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_votes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "ad_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      word_of_mouth: {
        Row: {
          author: string
          author_followers: number
          author_handle: string
          buzz_score: number
          content: string
          created_at: string
          duplicate_of: string | null
          embedding: string | null
          engagement_rate: number
          hashtags: string[]
          id: string
          likes: number
          mentions: string[]
          platform: string
          posted_at: string | null
          query: string
          quotes: number
          raw: Json | null
          replies: number
          reposts: number
          sentiment: string
          source_url: string
          theme: string
          title: string
          topic: string
          updated_at: string
          views: number
          wom_key: string
        }
        Insert: {
          author?: string
          author_followers?: number
          author_handle?: string
          buzz_score?: number
          content?: string
          created_at?: string
          duplicate_of?: string | null
          embedding?: string | null
          engagement_rate?: number
          hashtags?: string[]
          id?: string
          likes?: number
          mentions?: string[]
          platform?: string
          posted_at?: string | null
          query?: string
          quotes?: number
          raw?: Json | null
          replies?: number
          reposts?: number
          sentiment?: string
          source_url?: string
          theme?: string
          title?: string
          topic?: string
          updated_at?: string
          views?: number
          wom_key: string
        }
        Update: {
          author?: string
          author_followers?: number
          author_handle?: string
          buzz_score?: number
          content?: string
          created_at?: string
          duplicate_of?: string | null
          embedding?: string | null
          engagement_rate?: number
          hashtags?: string[]
          id?: string
          likes?: number
          mentions?: string[]
          platform?: string
          posted_at?: string | null
          query?: string
          quotes?: number
          raw?: Json | null
          replies?: number
          reposts?: number
          sentiment?: string
          source_url?: string
          theme?: string
          title?: string
          topic?: string
          updated_at?: string
          views?: number
          wom_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "word_of_mouth_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "word_of_mouth"
            referencedColumns: ["wom_key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_image_assets: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          author: string
          author_handle: string
          buzz_score: number
          caption: string
          comments: number
          engagement_rate: number
          hashtags: string[]
          image_key: string
          image_url: string
          likes: number
          platform: string
          posted_at: string
          relevance_rank: number
          source_url: string
          thumbnail_url: string
          title: string
        }[]
      }
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
      company_word_of_mouth: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          author: string
          author_handle: string
          buzz_score: number
          content: string
          engagement_rate: number
          hashtags: string[]
          likes: number
          platform: string
          posted_at: string
          relevance_rank: number
          replies: number
          reposts: number
          sentiment: string
          source_url: string
          theme: string
          title: string
          topic: string
          views: number
          wom_key: string
        }[]
      }
      company_word_of_mouth_v2: {
        Args: {
          _company_id: string
          _exclude_keys?: string[]
          _limit?: number
          _pool?: number
          _query_embedding?: string
          _seed?: number
        }
        Returns: {
          author: string
          author_handle: string
          buzz_score: number
          combined_score: number
          content: string
          engagement_rate: number
          hashtags: string[]
          likes: number
          platform: string
          posted_at: string
          replies: number
          reposts: number
          sentiment: string
          similarity: number
          source_url: string
          theme: string
          title: string
          topic: string
          views: number
          wom_key: string
        }[]
      }
      mark_trend_duplicates: { Args: { _threshold?: number }; Returns: number }
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
      recommend_community_trends: {
        Args: { _company_id: string; _days?: number; _limit?: number }
        Returns: {
          community_score: number
          remixer_count: number
          trend_key: string
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
      recommend_company_trends_v2: {
        Args: {
          _company_id: string
          _exclude_keys?: string[]
          _limit?: number
          _pool?: number
          _query_embedding?: string
          _seed?: number
        }
        Returns: {
          author: string
          caption: string
          combined_score: number
          comments: number
          engagement_rate: number
          format: string
          hashtags: string[]
          likes: number
          music: string
          platform: string
          posted_at: string
          shares: number
          similarity: number
          source_url: string
          title: string
          trend_key: string
          trend_score: number
          views: number
        }[]
      }
      trend_social_proof: {
        Args: { _trend_keys: string[] }
        Returns: {
          remix_count: number
          tap_count: number
          trend_key: string
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
