import React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { AllocationSlice } from '@/services/portfolioService'

interface Props {
  data: AllocationSlice[]
  height?: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

export default function PortfolioChart({ data, height = 280 }: Props) {
  if (!data.length) return <div className="text-gray-500 text-sm text-center py-8">No holdings yet</div>

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="symbol"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(value: number, _name, item: any) => [
            `$${value.toFixed(2)} (${item.payload.percentage.toFixed(1)}%)`,
            item.payload.symbol,
          ]}
        />
        <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
