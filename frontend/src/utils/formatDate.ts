/** Human-readable date for on-screen display, e.g. "14 Feb 2024". */
export function formatDateDisplay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Local date and time of an ISO timestamp, e.g. "14 Feb 2024, 09:30". */
export function formatDateTimeDisplay(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
