import { describe, expect, it } from 'vitest'
import { formatDateTimeDisplay } from './formatDate'

describe('formatDateTimeDisplay', () => {
  it('shows the local date and time of an ISO timestamp', () => {
    // No zone designator, so it is read as local time and the output is the same on every machine.
    const text = formatDateTimeDisplay('2024-02-14T09:30:00')
    expect(text).toContain('2024')
    expect(text).toContain('14')
    expect(text).toMatch(/09.30/)
  })
})
