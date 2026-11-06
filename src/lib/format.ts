const NBSP = ' '

/** 3.4 becomes "3,4". */
export function formatNumber(value: number): string {
  return String(value).replace('.', ',')
}

/** 148352 becomes "148 352". */
export function formatKm(km: number): string {
  return String(km).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

// The nl locale writes "okt." and "mrt."; the design has no full stops.
function plain(text: string): string {
  return text.replace(/\./g, '')
}

/** "29 okt" */
export function formatDay(iso: string): string {
  return plain(new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }))
}

/** "10:42" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/** "Vandaag", "Gisteren" or "do 29 okt". */
export function formatDayName(iso: string): string {
  const date = new Date(iso)
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000),
  )
  if (days === 0) return 'Vandaag'
  if (days === 1) return 'Gisteren'
  return plain(date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }))
}

/** "do 29 okt · 10:42" */
export function formatDayTime(iso: string): string {
  const date = new Date(iso)
  const day = plain(date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }))
  const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}
