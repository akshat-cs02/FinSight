import api from './api'

export interface Holding {
  id: number
  symbol: string
  quantity: number
  purchase_price: number
  current_price: number
  invested: number
  current_value: number
  gain_loss: number
  gain_loss_percent: number
  purchase_date?: string
  notes?: string
}

export interface AllocationSlice {
  symbol: string
  value: number
  percentage: number
}

export interface PortfolioSummary {
  total_invested: number
  total_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  today_profit_loss: number
  holdings_count: number
  allocation: AllocationSlice[]
  holdings: Holding[]
}

export interface AddHoldingRequest {
  symbol: string
  quantity: number
  purchase_price: number
  purchase_date?: string
  notes?: string
}

export const portfolioService = {
  getSummary: () => api.get<PortfolioSummary>('/portfolio/summary').then((r) => r.data),
  listHoldings: () => api.get<{ holdings: Holding[] }>('/portfolio/holdings').then((r) => r.data.holdings),
  addHolding: (req: AddHoldingRequest) => api.post('/portfolio/holdings', req).then((r) => r.data),
  deleteHolding: (id: number) => api.delete(`/portfolio/holdings/${id}`).then((r) => r.data),
  updateHolding: (id: number, patch: Partial<AddHoldingRequest>) =>
    api.patch(`/portfolio/holdings/${id}`, patch).then((r) => r.data),
}
