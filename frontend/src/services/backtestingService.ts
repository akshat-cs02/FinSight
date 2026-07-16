import api from './api'

export interface BacktestMetrics {
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  profit_factor: number
  total_trades: number
  winning_trades: number
  losing_trades: number
}

export interface EquityPoint {
  date: string
  equity: number
}

export interface BacktestTrade {
  entry_date: string
  exit_date: string
  side: 'LONG' | 'SHORT'
  entry: number
  exit: number
  pnl: number
  pnl_pct: number
  exit_reason: 'SL' | 'TP' | 'Signal' | 'EOD'
}

export interface BacktestResult {
  symbol: string
  period: string
  initial_capital: number
  final_capital: number
  metrics: BacktestMetrics
  equity_curve: EquityPoint[]
  trades: BacktestTrade[]
}

export const backtestingService = {
  run: (
    symbol: string,
    period = '2y',
    initialCapital = 10000,
    slAtrMult = 1.5,
    tpAtrMult = 2.5,
    allowShort = false,
  ) =>
    api
      .get<BacktestResult>(`/backtest/${symbol}`, {
        params: {
          period,
          initial_capital: initialCapital,
          sl_atr_mult: slAtrMult,
          tp_atr_mult: tpAtrMult,
          allow_short: allowShort,
        },
      })
      .then((r) => r.data),
}
