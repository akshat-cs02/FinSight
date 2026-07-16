import React from 'react'

interface Props { confidence: number; label?: string }

export default function ConfidenceMeter({ confidence, label = 'Confidence' }: Props) {
  const pct = Math.max(0, Math.min(100, confidence))
  const color =
    pct >= 75 ? '#10b981' :
    pct >= 50 ? '#f59e0b' :
    '#ef4444'

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-bold text-white">{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
