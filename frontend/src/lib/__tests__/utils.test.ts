import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('copyTextToClipboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return false for empty text', async () => {
    // Import dynamically to avoid issues
    const { copyTextToClipboard } = await import('@/lib/copyToClipboard')
    const result = await copyTextToClipboard('')
    expect(result).toBe(false)
  })

  it('should use Clipboard API when available', async () => {
    const { copyTextToClipboard } = await import('@/lib/copyToClipboard')
    
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
    })

    const result = await copyTextToClipboard('test text')
    expect(result).toBe(true)
    expect(mockWriteText).toHaveBeenCalledWith('test text')
  })
})
