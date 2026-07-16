import api from './api'

export interface EconomicEvent {
  title: string
  country: string
  date: string
  impact: 'High' | 'Medium' | 'Low'
  forecast: string
  previous: string
  actual: string
}

export interface ForexPair {
  pair: string
  rate: number
  change: number
  change_percent: number
}

export const forexService = {
  getCalendar: (impact?: string, country?: string, limit = 30) =>
    api
      .get<{ count: number; source: string; events: EconomicEvent[] }>('/forex/calendar', {
        params: { impact, country, limit },
      })
      .then((r) => r.data),

  getRates: () =>
    api.get<{ pairs: ForexPair[]; timestamp: string }>('/forex/rates').then((r) => r.data),
}
