import api from './api'

export interface AdminUser {
  id: number
  username: string
  email: string
  is_active: boolean
  is_admin: boolean
  subscription_tier: string
  created_at: string | null
  last_login: string | null
}

export interface ModelMeta {
  symbol?: string
  period?: string
  trained_at?: string
  rows_total?: number
  rows_train?: number
  rows_test?: number
  metrics?: {
    rmse?: number
    mae?: number
    mape?: number
    r2_score?: number
    directional_accuracy?: number
  }
  feature_importance?: Record<string, number>
}

export interface ModelOverview {
  symbol: string
  lstm: { trained: boolean; meta: ModelMeta | null }
  xgb:  { trained: boolean; meta: ModelMeta | null }
}

export interface SystemStats {
  users: { total: number; active: number }
  portfolios: number
  predictions_logged: number
  ml_models: {
    symbols_supported: number
    symbols_trained: number
    details: { symbol: string; lstm: boolean; xgb: boolean }[]
  }
}

export interface AdminSignal {
  id: number
  symbol: string
  strategy: string
  signal: string
  entry: number
  sl: number
  tp: number
  confidence: number
  timeframe: string
  kill_zone: string | null
  htf_bias: string | null
  generated_at: string | null
  outcome: string
  pnl_r: number | null
  is_hidden: boolean
}

export interface DbTable {
  name: string
  rows: number
  columns: string[]
}

export interface DbTablesResponse {
  tables: DbTable[]
  total_tables: number
  total_rows: number
}

export interface DbTableRowsResponse {
  table: string
  columns: string[]
  rows: Record<string, any>[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface DbSummary {
  tables: { name: string; rows: number }[]
  total_tables: number
  total_rows: number
  activity_7d: {
    new_users: number
    signals_generated: number
    predictions_made: number
  }
}

export const adminService = {
  listUsers: () => api.get<{ count: number; users: AdminUser[] }>('/admin/users').then((r) => r.data),
  toggleActive: (id: number) => api.patch(`/admin/users/${id}/toggle-active`).then((r) => r.data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`).then((r) => r.data),
  modelsOverview: () => api.get<{ models: ModelOverview[]; model_dir: string }>('/admin/models').then((r) => r.data),
  modelMetrics: (symbol: string) => api.get(`/admin/models/${symbol}/metrics`).then((r) => r.data),
  retrain: (symbol: string, lstm_epochs = 8, skip_lstm = false, skip_xgb = false) =>
    api.post('/admin/models/retrain', { symbol, lstm_epochs, skip_lstm, skip_xgb }).then((r) => r.data),
  stats: () => api.get<SystemStats>('/admin/stats').then((r) => r.data),
  // Signal management
  listSignals: (params: { limit?: number; offset?: number; outcome?: string; symbol?: string } = {}) =>
    api.get<{ total: number; signals: AdminSignal[] }>('/admin/signals', { params }).then((r) => r.data),
  toggleHideSignal: (id: number) => api.patch(`/admin/signals/${id}/hide`).then((r) => r.data),
  deleteSignal: (id: number) => api.delete(`/admin/signals/${id}`).then((r) => r.data),
  // Database dashboard
  dbTables: () => api.get<DbTablesResponse>('/admin/database/tables').then((r) => r.data),
  dbTableRows: (table: string, params: { page?: number; per_page?: number; search?: string; sort_by?: string; sort_dir?: string } = {}) =>
    api.get<DbTableRowsResponse>(`/admin/database/table/${table}`, { params }).then((r) => r.data),
  dbSummary: () => api.get<DbSummary>('/admin/database/summary').then((r) => r.data),
  dbCreateRow: (table: string, data: Record<string, any>) =>
    api.post<{ ok: boolean; row: Record<string, any> }>(`/admin/database/table/${table}`, data).then((r) => r.data),
  dbUpdateRow: (table: string, id: number, data: Record<string, any>) =>
    api.put<{ ok: boolean; row: Record<string, any> }>(`/admin/database/table/${table}/${id}`, data).then((r) => r.data),
  dbDeleteRow: (table: string, id: number) =>
    api.delete<{ ok: boolean }>(`/admin/database/table/${table}/${id}`).then((r) => r.data),
}
