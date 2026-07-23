import React from 'react'

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-[var(--text)] mb-6">Settings</h1>
      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--dim)]">
        Account settings, preferences, notification settings
      </div>
    </div>
  )
}
