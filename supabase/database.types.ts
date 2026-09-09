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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balance_snapshots: {
        Row: {
          account_id: string
          balance: number
          balance_date: string
          created_at: string
          id: string
          is_confirmed: boolean
          metadata: Json
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          balance: number
          balance_date: string
          created_at?: string
          id?: string
          is_confirmed?: boolean
          metadata?: Json
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          balance?: number
          balance_date?: string
          created_at?: string
          id?: string
          is_confirmed?: boolean
          metadata?: Json
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string
          active: boolean
          color: string | null
          created_at: string
          currency: string
          icon: string | null
          id: string
          include_in_net_worth: boolean
          institution: string
          metadata: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          active?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          include_in_net_worth?: boolean
          institution: string
          metadata?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          active?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          include_in_net_worth?: boolean
          institution?: string
          metadata?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          group_name: string
          icon: string | null
          id: string
          kind: string
          name: string
          user_id: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          group_name: string
          icon?: string | null
          id?: string
          kind: string
          name: string
          user_id: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          group_name?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categorization_rules: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          flow_type: string | null
          id: string
          institution: string | null
          match_field: string
          pattern: string
          priority: number
          set_internal_transfer: boolean | null
          user_id: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          flow_type?: string | null
          id?: string
          institution?: string | null
          match_field?: string
          pattern: string
          priority?: number
          set_internal_transfer?: boolean | null
          user_id: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          flow_type?: string | null
          id?: string
          institution?: string | null
          match_field?: string
          pattern?: string
          priority?: number
          set_internal_transfer?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_annotations: {
        Row: {
          account_hint: string | null
          account_id: string | null
          amount: number
          category_hint: string | null
          category_id: string | null
          counterparty: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          match_confidence: number | null
          matched_transaction_id: string | null
          merchant: string | null
          metadata: Json
          notes: string | null
          occurred_at: string
          payment_method: string | null
          reconciliation_status: string
          source_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_hint?: string | null
          account_id?: string | null
          amount: number
          category_hint?: string | null
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          match_confidence?: number | null
          matched_transaction_id?: string | null
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          payment_method?: string | null
          reconciliation_status?: string
          source_message_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_hint?: string | null
          account_id?: string | null
          amount?: number
          category_hint?: string | null
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          match_confidence?: number | null
          matched_transaction_id?: string | null
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          payment_method?: string | null
          reconciliation_status?: string
          source_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_annotations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_annotations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_annotations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_annotations_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_annotations_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "jarvis_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_documents: {
        Row: {
          account_id: string | null
          created_at: string
          document_type: string
          extracted_data: Json
          extracted_text: string | null
          file_name: string
          id: string
          mime_type: string | null
          notes: string | null
          parse_status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          document_type?: string
          extracted_data?: Json
          extracted_text?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          parse_status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          document_type?: string
          extracted_data?: Json
          extracted_text?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          parse_status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account_id: string | null
          confirmed_at: string | null
          created_at: string
          duplicate_count: number
          file_hash: string
          file_name: string
          id: string
          institution: string | null
          metadata: Json
          review_count: number
          row_count: number
          source_format: string
          status: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          duplicate_count?: number
          file_hash: string
          file_name: string
          id?: string
          institution?: string | null
          metadata?: Json
          review_count?: number
          row_count?: number
          source_format: string
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          duplicate_count?: number
          file_hash?: string
          file_name?: string
          id?: string
          institution?: string | null
          metadata?: Json
          review_count?: number
          row_count?: number
          source_format?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          amount: number
          batch_id: string
          category_id: string | null
          created_at: string
          description: string
          duplicate_transaction_id: string | null
          fingerprint: string
          flow_type: string
          id: string
          include_in_budget: boolean
          is_internal_transfer: boolean
          merchant: string | null
          raw_data: Json
          review_reason: string | null
          row_number: number
          source_record_id: string | null
          status: string
          transaction_date: string
          user_id: string
        }
        Insert: {
          amount: number
          batch_id: string
          category_id?: string | null
          created_at?: string
          description: string
          duplicate_transaction_id?: string | null
          fingerprint: string
          flow_type: string
          id?: string
          include_in_budget?: boolean
          is_internal_transfer?: boolean
          merchant?: string | null
          raw_data?: Json
          review_reason?: string | null
          row_number: number
          source_record_id?: string | null
          status?: string
          transaction_date: string
          user_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          category_id?: string | null
          created_at?: string
          description?: string
          duplicate_transaction_id?: string | null
          fingerprint?: string
          flow_type?: string
          id?: string
          include_in_budget?: boolean
          is_internal_transfer?: boolean
          merchant?: string | null
          raw_data?: Json
          review_reason?: string | null
          row_number?: number
          source_record_id?: string | null
          status?: string
          transaction_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_duplicate_transaction_id_fkey"
            columns: ["duplicate_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_goals: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          priority: number
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          priority?: number
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          priority?: number
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_movements: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          id: string
          metadata: Json
          movement_date: string
          movement_type: string
          notes: string | null
          position_id: string | null
          quantity: number | null
          transaction_id: string | null
          unit_price: number | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          movement_date: string
          movement_type: string
          notes?: string | null
          position_id?: string | null
          quantity?: number | null
          transaction_id?: string | null
          unit_price?: number | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          movement_date?: string
          movement_type?: string
          notes?: string | null
          position_id?: string | null
          quantity?: number | null
          transaction_id?: string | null
          unit_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "investment_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_movements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investment_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_positions: {
        Row: {
          account_id: string
          active: boolean
          asset_type: string
          average_unit_cost: number | null
          benchmark: string | null
          created_at: string
          current_value: number
          goal_id: string | null
          id: string
          invested_amount: number
          liquidity_label: string | null
          maturity_date: string | null
          metadata: Json
          name: string
          quantity: number | null
          ticker: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          asset_type?: string
          average_unit_cost?: number | null
          benchmark?: string | null
          created_at?: string
          current_value?: number
          goal_id?: string | null
          id?: string
          invested_amount?: number
          liquidity_label?: string | null
          maturity_date?: string | null
          metadata?: Json
          name: string
          quantity?: number | null
          ticker?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          asset_type?: string
          average_unit_cost?: number | null
          benchmark?: string | null
          created_at?: string
          current_value?: number
          goal_id?: string | null
          id?: string
          invested_amount?: number
          liquidity_label?: string | null
          maturity_date?: string | null
          metadata?: Json
          name?: string
          quantity?: number | null
          ticker?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "investment_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_positions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "investment_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_snapshots: {
        Row: {
          created_at: string
          id: string
          invested_principal: number
          market_value: number
          position_id: string
          snapshot_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invested_principal?: number
          market_value?: number
          position_id: string
          snapshot_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invested_principal?: number
          market_value?: number
          position_id?: string
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investment_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_actions: {
        Row: {
          action_type: string
          confirmation_required: boolean
          confirmed_at: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          payload: Json
          source_message_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          confirmation_required?: boolean
          confirmed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json
          source_message_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          confirmation_required?: boolean
          confirmed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json
          source_message_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_actions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "jarvis_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_connection_secrets: {
        Row: {
          access_token: string | null
          connection_id: string
          created_at: string
          expires_at: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connection_id: string
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          connection_id?: string
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "jarvis_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          display_name: string | null
          external_account_id: string | null
          id: string
          metadata: Json
          provider: string
          scopes: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          metadata?: Json
          provider: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          metadata?: Json
          provider?: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_deliverable_requests: {
        Row: {
          created_at: string
          deliverable_type: string
          error_code: string | null
          id: string
          idempotency_key: string
          jarvis_file_id: string | null
          lease_expires_at: string | null
          processing_token: string | null
          project_id: string | null
          provider_file_id: string | null
          sources: Json
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
          web_view_link: string | null
        }
        Insert: {
          created_at?: string
          deliverable_type: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          jarvis_file_id?: string | null
          lease_expires_at?: string | null
          processing_token?: string | null
          project_id?: string | null
          provider_file_id?: string | null
          sources?: Json
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
          web_view_link?: string | null
        }
        Update: {
          created_at?: string
          deliverable_type?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          jarvis_file_id?: string | null
          lease_expires_at?: string | null
          processing_token?: string | null
          project_id?: string | null
          provider_file_id?: string | null
          sources?: Json
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          web_view_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_deliverable_requests_file_owner_fkey"
            columns: ["user_id", "jarvis_file_id"]
            isOneToOne: false
            referencedRelation: "jarvis_files"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "jarvis_deliverable_requests_project_owner_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "jarvis_projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_document_processing: {
        Row: {
          confidence: number | null
          created_at: string
          document_type: string
          error_code: string | null
          error_message: string | null
          extracted_data: Json | null
          extracted_text: string | null
          id: string
          jarvis_file_id: string
          processed_at: string | null
          processing_metadata: Json
          processing_status: string
          processor: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          document_type?: string
          error_code?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          id?: string
          jarvis_file_id: string
          processed_at?: string | null
          processing_metadata?: Json
          processing_status?: string
          processor?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          document_type?: string
          error_code?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          id?: string
          jarvis_file_id?: string
          processed_at?: string | null
          processing_metadata?: Json
          processing_status?: string
          processor?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_document_processing_file_owner_fkey"
            columns: ["user_id", "jarvis_file_id"]
            isOneToOne: true
            referencedRelation: "jarvis_files"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_files: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          mime_type: string
          modified_at_provider: string | null
          name: string
          project_id: string | null
          provider: string
          provider_file_id: string
          size_bytes: number | null
          source: Database["public"]["Enums"]["record_source"]
          updated_at: string
          user_id: string
          web_view_link: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          mime_type: string
          modified_at_provider?: string | null
          name: string
          project_id?: string | null
          provider?: string
          provider_file_id: string
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          user_id: string
          web_view_link?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          mime_type?: string
          modified_at_provider?: string | null
          name?: string
          project_id?: string | null
          provider?: string
          provider_file_id?: string
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          user_id?: string
          web_view_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_files_project_owner_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "jarvis_projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_health_checks: {
        Row: {
          action_required: boolean
          checked_at: string
          code: string
          component: string
          created_at: string
          details: Json
          id: string
          message: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_required?: boolean
          checked_at?: string
          code: string
          component: string
          created_at?: string
          details?: Json
          id?: string
          message: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_required?: boolean
          checked_at?: string
          code?: string
          component?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_identities: {
        Row: {
          active: boolean
          channel: string
          channel_user_id: string
          created_at: string
          display_name: string | null
          id: string
          metadata: Json
          phone_number: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          channel: string
          channel_user_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          metadata?: Json
          phone_number?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          channel?: string
          channel_user_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          metadata?: Json
          phone_number?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      jarvis_memories: {
        Row: {
          active: boolean
          content: string
          created_at: string
          expires_at: string | null
          id: string
          importance: number
          memory_key: string | null
          memory_type: string
          metadata: Json
          source_message_id: string | null
          superseded_by: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number
          memory_key?: string | null
          memory_type?: string
          metadata?: Json
          source_message_id?: string | null
          superseded_by?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number
          memory_key?: string | null
          memory_type?: string
          metadata?: Json
          source_message_id?: string | null
          superseded_by?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_memories_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "jarvis_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jarvis_memories_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "jarvis_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_memory_revisions: {
        Row: {
          created_at: string
          id: string
          memory_id: string
          previous_content: string
          previous_importance: number
          previous_memory_type: string
          previous_title: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory_id: string
          previous_content: string
          previous_importance: number
          previous_memory_type: string
          previous_title?: string | null
          reason?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory_id?: string
          previous_content?: string
          previous_importance?: number
          previous_memory_type?: string
          previous_title?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_memory_revisions_owner_fkey"
            columns: ["user_id", "memory_id"]
            isOneToOne: false
            referencedRelation: "jarvis_memories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_messages: {
        Row: {
          body: string | null
          channel: string
          confidence: number | null
          created_at: string
          direction: string
          external_message_id: string | null
          id: string
          identity_id: string | null
          intent: string | null
          message_type: string
          processed_at: string | null
          raw_data: Json
          reply_to_id: string | null
          status: string
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          confidence?: number | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          identity_id?: string | null
          intent?: string | null
          message_type?: string
          processed_at?: string | null
          raw_data?: Json
          reply_to_id?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          confidence?: number | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          identity_id?: string | null
          intent?: string | null
          message_type?: string
          processed_at?: string | null
          raw_data?: Json
          reply_to_id?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_messages_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "jarvis_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jarvis_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "jarvis_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          idempotency_key: string | null
          note_type: Database["public"]["Enums"]["note_type"]
          project_id: string | null
          source: Database["public"]["Enums"]["record_source"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note_type?: Database["public"]["Enums"]["note_type"]
          project_id?: string | null
          source: Database["public"]["Enums"]["record_source"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note_type?: Database["public"]["Enums"]["note_type"]
          project_id?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_notes_project_owner_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "jarvis_projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          state: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          provider: string
          state: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          state?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      jarvis_operation_receipts: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          operation: string
          resource_id: string | null
          resource_type: string | null
          response: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          operation: string
          resource_id?: string | null
          resource_type?: string | null
          response?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          operation?: string
          resource_id?: string | null
          resource_type?: string | null
          response?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_projects: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          idempotency_key: string | null
          name: string
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          name: string
          source: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          name?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          idempotency_key: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          recurrence_rule: string | null
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence_rule?: string | null
          source: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence_rule?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_tasks_project_owner_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "jarvis_projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      jarvis_whatsapp_pairing_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      jarvis_whatsapp_webhook_events: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          event_key_hash: string
          event_kind: string
          expires_at: string
          last_error_code: string | null
          lease_expires_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event_key_hash: string
          event_kind: string
          expires_at?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event_key_hash?: string
          event_kind?: string
          expires_at?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          preferences: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      purchase_allocations: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          purchase_id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          id?: string
          purchase_id: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          purchase_id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_allocations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_allocations_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_allocations_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_analysis"
            referencedColumns: ["purchase_id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          category_id: string | null
          confidence: number | null
          created_at: string
          description: string
          id: string
          item_order: number | null
          normalized_name: string | null
          purchase_id: string
          quantity: number
          raw_data: Json
          receipt_id: string | null
          total_amount: number
          unit: string | null
          unit_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          description: string
          id?: string
          item_order?: number | null
          normalized_name?: string | null
          purchase_id: string
          quantity?: number
          raw_data?: Json
          receipt_id?: string | null
          total_amount: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          description?: string
          id?: string
          item_order?: number | null
          normalized_name?: string | null
          purchase_id?: string
          quantity?: number
          raw_data?: Json
          receipt_id?: string | null
          total_amount?: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_analysis"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_match_suggestions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          status: string
          suggested_total: number
          transaction_a_id: string
          transaction_b_id: string
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          status?: string
          suggested_total: number
          transaction_a_id: string
          transaction_b_id: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          status?: string
          suggested_total?: number
          transaction_a_id?: string
          transaction_b_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_match_suggestions_transaction_a_id_fkey"
            columns: ["transaction_a_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_match_suggestions_transaction_b_id_fkey"
            columns: ["transaction_b_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          access_key: string | null
          created_at: string
          document_number: string | null
          file_name: string
          id: string
          issued_at: string | null
          merchant: string | null
          mime_type: string | null
          parse_status: string
          purchase_id: string
          raw_data: Json
          receipt_total: number | null
          source_type: string
          storage_path: string
          user_id: string
        }
        Insert: {
          access_key?: string | null
          created_at?: string
          document_number?: string | null
          file_name: string
          id?: string
          issued_at?: string | null
          merchant?: string | null
          mime_type?: string | null
          parse_status?: string
          purchase_id: string
          raw_data?: Json
          receipt_total?: number | null
          source_type?: string
          storage_path: string
          user_id: string
        }
        Update: {
          access_key?: string | null
          created_at?: string
          document_number?: string | null
          file_name?: string
          id?: string
          issued_at?: string | null
          merchant?: string | null
          mime_type?: string | null
          parse_status?: string
          purchase_id?: string
          raw_data?: Json
          receipt_total?: number | null
          source_type?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_analysis"
            referencedColumns: ["purchase_id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          description: string | null
          detail_mode: string
          id: string
          merchant: string | null
          metadata: Json
          notes: string | null
          primary_category_id: string | null
          purchase_date: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          detail_mode?: string
          id?: string
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          primary_category_id?: string | null
          purchase_date: string
          status?: string
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          detail_mode?: string
          id?: string
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          primary_category_id?: string | null
          purchase_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_primary_category_id_fkey"
            columns: ["primary_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_items: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number | null
          frequency: string
          funding_mode: string
          id: string
          kind: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          frequency?: string
          funding_mode?: string
          id?: string
          kind: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          frequency?: string
          funding_mode?: string
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "recurring_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          storage_path: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          storage_path: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          counterparty: string | null
          created_at: string
          description: string
          display_description: string | null
          flow_type: string
          id: string
          import_batch_id: string | null
          include_in_budget: boolean
          is_internal_transfer: boolean
          merchant: string | null
          metadata: Json
          notes: string | null
          posted_at: string | null
          purchase_id: string | null
          review_status: string
          source_fingerprint: string | null
          source_record_id: string | null
          tags: string[]
          transaction_date: string
          transaction_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          description: string
          display_description?: string | null
          flow_type: string
          id?: string
          import_batch_id?: string | null
          include_in_budget?: boolean
          is_internal_transfer?: boolean
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          posted_at?: string | null
          purchase_id?: string | null
          review_status?: string
          source_fingerprint?: string | null
          source_record_id?: string | null
          tags?: string[]
          transaction_date: string
          transaction_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string
          display_description?: string | null
          flow_type?: string
          id?: string
          import_batch_id?: string | null
          include_in_budget?: boolean
          is_internal_transfer?: boolean
          merchant?: string | null
          metadata?: Json
          notes?: string | null
          posted_at?: string | null
          purchase_id?: string | null
          review_status?: string
          source_fingerprint?: string | null
          source_record_id?: string | null
          tags?: string[]
          transaction_date?: string
          transaction_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_current_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_analysis"
            referencedColumns: ["purchase_id"]
          },
        ]
      }
    }
    Views: {
      account_current_balances: {
        Row: {
          account_id: string | null
          account_type: string | null
          balance_date: string | null
          confirmed_balance: number | null
          current_balance: number | null
          last_movement_after_balance: string | null
          name: string | null
          source: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_category_spend: {
        Row: {
          amount: number | null
          category: string | null
          group_name: string | null
          month: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_investment_monthly_flow: {
        Row: {
          contributions: number | null
          fees: number | null
          income: number | null
          month: string | null
          user_id: string | null
          withdrawals: number | null
        }
        Relationships: []
      }
      v_investment_overview: {
        Row: {
          accumulated_result: number | null
          accumulated_return_pct: number | null
          current_value: number | null
          invested_principal: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_monthly_resources: {
        Row: {
          benefits_received: number | null
          cash_income: number | null
          expenses: number | null
          investments: number | null
          month: string | null
          user_id: string | null
          yields: number | null
        }
        Relationships: []
      }
      v_monthly_summary: {
        Row: {
          expenses: number | null
          income: number | null
          investments: number | null
          month: string | null
          net_financial_flow: number | null
          user_id: string | null
          yields: number | null
        }
        Relationships: []
      }
      v_purchase_analysis: {
        Row: {
          allocated_amount: number | null
          detail_mode: string | null
          item_count: number | null
          merchant: string | null
          payment_count: number | null
          purchase_date: string | null
          purchase_id: string | null
          total_amount: number | null
          unallocated_amount: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_jarvis_whatsapp_event: {
        Args: {
          p_event_key_hash: string
          p_event_kind: string
          p_expires_at: string
          p_lease_expires_at: string
        }
        Returns: boolean
      }
      create_category_rule_and_reclassify: {
        Args: {
          p_category_name: string
          p_flow_type?: string
          p_group_name: string
          p_institution: string
          p_kind: string
          p_match_field: string
          p_pattern: string
          p_set_internal_transfer?: boolean
        }
        Returns: Json
      }
      group_transactions_into_purchase: {
        Args: {
          p_description?: string
          p_primary_category_id?: string
          p_transaction_ids: string[]
        }
        Returns: string
      }
      jarvis_finance_summary: {
        Args: { p_end_exclusive: string; p_search?: string; p_start: string }
        Returns: Json
      }
      recalculate_auto_cash_reserve_position: {
        Args: { p_position_id: string }
        Returns: undefined
      }
      record_investment_contribution: {
        Args: {
          p_amount: number
          p_date: string
          p_investment_account_id: string
          p_notes?: string
          p_position_id?: string
          p_source_account_id: string
        }
        Returns: string
      }
      record_investment_income: {
        Args: {
          p_account_id: string
          p_amount: number
          p_date: string
          p_notes?: string
          p_position_id?: string
        }
        Returns: string
      }
      record_investment_withdrawal: {
        Args: {
          p_amount: number
          p_date: string
          p_destination_account_id: string
          p_investment_account_id: string
          p_notes?: string
          p_position_id?: string
        }
        Returns: string
      }
      record_third_party_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_date: string
          p_description: string
          p_notes?: string
        }
        Returns: string
      }
      reserve_jarvis_deliverable: {
        Args: {
          p_deliverable_type: string
          p_idempotency_key: string
          p_project_id: string
          p_sources: Json
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      save_purchase_allocations: {
        Args: { p_allocations: Json; p_purchase_id: string }
        Returns: undefined
      }
    }
    Enums: {
      note_type: "note" | "idea" | "reference"
      project_status: "active" | "paused" | "completed" | "archived"
      record_source:
        | "manual_web"
        | "jarvis_web"
        | "whatsapp"
        | "imported"
        | "system"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "open" | "completed" | "cancelled"
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
      note_type: ["note", "idea", "reference"],
      project_status: ["active", "paused", "completed", "archived"],
      record_source: [
        "manual_web",
        "jarvis_web",
        "whatsapp",
        "imported",
        "system",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["open", "completed", "cancelled"],
    },
  },
} as const

