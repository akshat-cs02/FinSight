/**
 * Timezone utilities for FinSight.
 *
 * All timestamps from the backend are stored as UTC.
 * These functions convert to the user's LOCAL browser timezone automatically —
 * so a user in London sees BST/GMT, a user in Mumbai sees IST, US sees ET/PT, etc.
 *
 * The browser's Intl API handles DST, offset, and locale automatically.
 * No manual timezone detection needed — `undefined` as timeZone means "user's local".
 */

/** Detect the user's IANA timezone string (e.g. "Europe/London", "Asia/Kolkata") */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Detect the user's timezone abbreviation (e.g. "BST", "IST", "EDT") */
export function getUserTzAbbr(): string {
  const date = new Date()
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'Local'
}

/**
 * Parse an ISO string that may or may not have a Z/offset suffix.
 * Backend stores UTC without Z — this ensures JS treats it as UTC not local.
 */
function parseUtc(isoString: string): Date {
  if (!isoString) return new Date(NaN)
  // If already has Z or +/- offset, parse as-is
  if (isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString)) {
    return new Date(isoString)
  }
  // No suffix → assume UTC, append Z
  return new Date(isoString + 'Z')
}

/**
 * Format a UTC ISO timestamp as a local time string.
 * Example: "6:24 PM" (user's local time)
 */
export function formatLocalTime(isoString: string): string {
  const d = parseUtc(isoString)
  if (isNaN(d.getTime())) return isoString
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format a UTC ISO timestamp as a full local datetime string.
 * Example: "Jun 23, 2026, 6:24 PM BST"
 */
export function formatLocalDateTime(isoString: string): string {
  const d = parseUtc(isoString)
  if (isNaN(d.getTime())) return isoString
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/**
 * Format a UTC ISO timestamp as a short local date.
 * Example: "Jun 23"
 */
export function formatLocalDate(isoString: string): string {
  const d = parseUtc(isoString)
  if (isNaN(d.getTime())) return isoString
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Format a UTC ISO timestamp as "Today · 6:24 PM", "Yesterday · ...", "Jun 18 · ..."
 */
export function formatRelativeDateTime(isoString: string): string {
  const d = parseUtc(isoString)
  if (isNaN(d.getTime())) return isoString

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)

  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  if (d >= startOfToday) return `Today · ${timeStr}`
  if (d >= startOfYesterday) return `Yesterday · ${timeStr}`

  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${dateStr} · ${timeStr}`
}

/**
 * Format a YYYY-MM-DD string (no time) as a local date label.
 * Used for chart X-axis tick labels and trade log dates.
 * Example: "Jun 23" or full "Jun 23, 2026"
 */
export function formatTradeDate(dateStr: string, includeYear = false): string {
  if (!dateStr) return dateStr
  // Parse as local noon to avoid off-by-one from UTC midnight
  const d = new Date(`${dateStr}T12:00:00Z`)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

/**
 * Format a Unix timestamp (seconds) as local datetime.
 * Used for yfinance chart data which returns seconds-since-epoch.
 */
export function formatUnixLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format a UTC date for chart X-axis tooltip.
 * Short: "Jun 23 · 14:30 BST"
 */
export function formatChartTooltipDate(isoOrUnix: string | number): string {
  const d = typeof isoOrUnix === 'number'
    ? new Date(isoOrUnix * 1000)
    : parseUtc(String(isoOrUnix))

  if (isNaN(d.getTime())) return String(isoOrUnix)

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
