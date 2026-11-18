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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: string
          id: string
          target: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          detail?: string
          id?: string
          target?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: string
          id?: string
          target?: string
        }
        Relationships: []
      }
      legacy_users: {
        Row: {
          balance: number
          claimed_at: string | null
          country: string
          email: string
          legacy_id: string
          name: string
          role: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          claimed_at?: string | null
          country?: string
          email: string
          legacy_id: string
          name?: string
          role?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          claimed_at?: string | null
          country?: string
          email?: string
          legacy_id?: string
          name?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          cancel: boolean
          charge: number
          created_at: string
          fields: Json
          id: string
          idempotency_key: string
          link: string
          provider_cost: number
          provider_order_id: string | null
          provider_service_id: string | null
          quantity: number
          refill: boolean
          refund_amount: number
          remains: number | null
          service_id: string | null
          service_name: string
          start_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel?: boolean
          charge?: number
          created_at?: string
          fields?: Json
          id?: string
          idempotency_key: string
          link?: string
          provider_cost?: number
          provider_order_id?: string | null
          provider_service_id?: string | null
          quantity?: number
          refill?: boolean
          refund_amount?: number
          remains?: number | null
          service_id?: string | null
          service_name?: string
          start_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel?: boolean
          charge?: number
          created_at?: string
          fields?: Json
          id?: string
          idempotency_key?: string
          link?: string
          provider_cost?: number
          provider_order_id?: string | null
          provider_service_id?: string | null
          quantity?: number
          refill?: boolean
          refund_amount?: number
          remains?: number | null
          service_id?: string | null
          service_name?: string
          start_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          authorization_url: string | null
          checkout_request_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          gateway: string
          id: string
          pay_amount: number
          pay_currency: string
          phone: string | null
          reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          authorization_url?: string | null
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          gateway: string
          id?: string
          pay_amount: number
          pay_currency: string
          phone?: string | null
          reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          authorization_url?: string | null
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          gateway?: string
          id?: string
          pay_amount?: number
          pay_currency?: string
          phone?: string | null
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number
          country: string
          country_locked: boolean
          created_at: string
          disabled: boolean
          email: string
          id: string
          name: string
        }
        Insert: {
          balance?: number
          country?: string
          country_locked?: boolean
          created_at?: string
          disabled?: boolean
          email?: string
          id: string
          name?: string
        }
        Update: {
          balance?: number
          country?: string
          country_locked?: boolean
          created_at?: string
          disabled?: boolean
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          available: boolean
          cancel: boolean
          category: string
          description: string
          enabled: boolean
          id: string
          max: number
          min: number
          name: string
          pricing_unit: string
          provider_currency: string
          provider_id: string
          provider_rate: number
          refill: boolean
          requirements: string[]
          selling_rate: number | null
          supported: boolean
          type: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          cancel?: boolean
          category?: string
          description?: string
          enabled?: boolean
          id?: string
          max?: number
          min?: number
          name?: string
          pricing_unit?: string
          provider_currency?: string
          provider_id: string
          provider_rate?: number
          refill?: boolean
          requirements?: string[]
          selling_rate?: number | null
          supported?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          cancel?: boolean
          category?: string
          description?: string
          enabled?: boolean
          id?: string
          max?: number
          min?: number
          name?: string
          pricing_unit?: string
          provider_currency?: string
          provider_id?: string
          provider_rate?: number
          refill?: boolean
          requirements?: string[]
          selling_rate?: number | null
          supported?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          announcement: string
          default_markup_percent: number
          first_user_registered: boolean
          id: string
          last_sync_at: string | null
          maintenance: boolean
          min_deposit: number
          paystack_currency: string
          paystack_to_wallet_rate: number
          provider_currency: string
          provider_to_wallet_rate: number
          registration_open: boolean
          site_name: string
          support_email: string
          tagline: string
          wallet_currency: string
        }
        Insert: {
          announcement?: string
          default_markup_percent?: number
          first_user_registered?: boolean
          id?: string
          last_sync_at?: string | null
          maintenance?: boolean
          min_deposit?: number
          paystack_currency?: string
          paystack_to_wallet_rate?: number
          provider_currency?: string
          provider_to_wallet_rate?: number
          registration_open?: boolean
          site_name?: string
          support_email?: string
          tagline?: string
          wallet_currency?: string
        }
        Update: {
          announcement?: string
          default_markup_percent?: number
          first_user_registered?: boolean
          id?: string
          last_sync_at?: string | null
          maintenance?: boolean
          min_deposit?: number
          paystack_currency?: string
          paystack_to_wallet_rate?: number
          provider_currency?: string
          provider_to_wallet_rate?: number
          registration_open?: boolean
          site_name?: string
          support_email?: string
          tagline?: string
          wallet_currency?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          reference: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string
          id?: string
          reference: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          reference?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      wallet_apply: {
        Args: {
          _amount: number
          _description: string
          _reference: string
          _type: string
          _user: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "user" | "admin" | "super_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "super_admin"],
    },
  },
} as const
