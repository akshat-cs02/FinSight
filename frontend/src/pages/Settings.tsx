import React from 'react'

export default function SettingsPage() {
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Settings</h1>
      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-4 sm:p-8 text-center text-[var(--dim)]">
        Account settings, preferences, notification settings
      </div>
    </div>
  )
}
