import { describe, it, expect } from 'vitest'
import { NexusBizError, formatValidationDetail } from '@/api/errors'

describe('NexusBizError', () => {
  it('should create error with correct properties', () => {
    const error = new NexusBizError('Test error', 400, { field: 'value' })

    expect(error.name).toBe('NexusBizError')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe(400)
    expect(error.payload).toEqual({ field: 'value' })
  })

  it('should create error without payload', () => {
    const error = new NexusBizError('Simple error', 500)

    expect(error.payload).toBeUndefined()
  })

  it('should be instanceof Error', () => {
    const error = new NexusBizError('Test', 400)

    expect(error).toBeInstanceOf(Error)
    expect(error instanceof NexusBizError).toBe(true)
  })
})

describe('formatValidationDetail', () => {
  it('should return null for null input', () => {
    expect(formatValidationDetail(null)).toBe(null)
  })

  it('should return null for undefined input', () => {
    expect(formatValidationDetail(undefined)).toBe(null)
  })

  it('should trim and return string input', () => {
    expect(formatValidationDetail('  Not Found  ')).toBe('Not Found')
  })

  it('should return null for empty string', () => {
    expect(formatValidationDetail('')).toBe(null)
  })

  it('should return null for empty array', () => {
    expect(formatValidationDetail([])).toBe(null)
  })

  it('should format validation error array', () => {
    const detail = [
      { loc: ['body', 'email'], msg: 'Invalid email format' },
      { loc: ['body', 'password'], msg: 'Password too short' },
    ]

    const result = formatValidationDetail(detail)

    expect(result).toBe('body.email: Invalid email format; body.password: Password too short')
  })

  it('should handle missing loc', () => {
    const detail = [{ msg: 'Generic error' }]

    expect(formatValidationDetail(detail)).toBe('Generic error')
  })

  it('should handle nested loc', () => {
    const detail = [{ loc: ['body', 'user', 'profile', 'age'], msg: 'Must be positive' }]

    expect(formatValidationDetail(detail)).toBe('body.user.profile.age: Must be positive')
  })

  it('should filter out empty results', () => {
    const detail = [
      { loc: [], msg: '' },
      { loc: ['body', 'name'], msg: 'Required' },
    ]

    expect(formatValidationDetail(detail)).toBe('body.name: Required')
  })

  it('should handle array with non-object elements', () => {
    const detail = ['string error', { loc: ['body', 'field'], msg: 'Invalid' }] as any

    // Non-object elements return empty string and get filtered out
    expect(formatValidationDetail(detail)).toContain('body.field: Invalid')
  })
})
