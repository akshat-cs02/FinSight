import api from './api'

export interface PlatformStats {
  markets_covered: number
  signal_accuracy: number
  risk_reward_ratio: number
  prediction_latency: number
  updated_at: string
}

export const platformService = {
  getStats: () =>
    api.get<PlatformStats>('/platform/stats').then((r) => r.data),
}
