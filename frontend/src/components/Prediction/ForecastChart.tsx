import React from 'react'
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import type { ForecastPoint } from '@/services/predictionService'
import { formatTradeDate } from '@/utils/timezone'
import { formatPrice, guessCurrency } from '@/utils/currency'

interface Props {
  symbol?: string
  currentPrice: number
  predictedPrice: number
  forecast: ForecastPoint[]
  height?: number
}

export default function ForecastChart({ symbol, currentPrice, predictedPrice, forecast, height = 280 }: Props) {
  const cur = symbol ? guessCurrency(symbol) : 'USD'
  // Series starts at "Today" with current price, then walks through the forecast days.
  const data = [
    { label: 'Today', price: currentPrice, ensemble: currentPrice },
    ...forecast.map((f) => ({
      label: formatTradeDate(f.date),  // e.g. "Jun 25" in user's locale
      price: f.price,
      ensemble: f.price,
    })),
  ]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={['auto', 'auto']}
               tickFormatter={(v) => formatPrice(v, cur, 0)} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#d1d5db' }}
          formatter={(v: number) => [formatPrice(v, cur, 2), 'Price']}
        />
        <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
        <ReferenceLine y={currentPrice} stroke="#6b7280" strokeDasharray="3 3"
                       label={{ value: 'Current', fill: '#9ca3af', fontSize: 10, position: 'insideTopLeft' }} />
        <Line
          type="monotone" dataKey="price" name="Forecast"
          stroke="#3b82f6" strokeWidth={3}
          dot={{ r: 4, fill: '#3b82f6' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
