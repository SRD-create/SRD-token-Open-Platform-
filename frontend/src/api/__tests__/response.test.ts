import { describe, it, expect } from 'vitest'
import {
  isNexusSuccessCode,
  unpackDataResponse,
  unpackListResponse,
  messageFromAxiosData,
} from '@/api/response'
import { NexusBizError } from '@/api/errors'

describe('isNexusSuccessCode', () => {
  it('should return true for 200', () => {
    expect(isNexusSuccessCode(200)).toBe(true)
  })

  it('should return true for 0', () => {
    expect(isNexusSuccessCode(0)).toBe(true)
  })

  it('should return false for other codes', () => {
    expect(isNexusSuccessCode(201)).toBe(false)
    expect(isNexusSuccessCode(400)).toBe(false)
    expect(isNexusSuccessCode(500)).toBe(false)
  })
})

describe('unpackDataResponse', () => {
  it('should extract data from successful response', () => {
    const response = {
      code: 200,
      message: 'Success',
      data: { id: 1, name: 'Test' },
    }

    const result = unpackDataResponse(response)

    expect(result).toEqual({ id: 1, name: 'Test' })
  })

  it('should handle code 0 as success', () => {
    const response = {
      code: 0,
      message: 'OK',
      data: 'string data',
    }

    const result = unpackDataResponse(response)

    expect(result).toBe('string data')
  })

  it('should throw NexusBizError for error code', () => {
    const response = {
      code: 400,
      message: 'Bad Request',
    }

    expect(() => unpackDataResponse(response)).toThrow(NexusBizError)
    expect(() => unpackDataResponse(response)).toThrow('Bad Request')
  })

  it('should throw for invalid response format', () => {
    expect(() => unpackDataResponse({})).toThrow(NexusBizError)
    expect(() => unpackDataResponse(null)).toThrow(NexusBizError)
    expect(() => unpackDataResponse('invalid')).toThrow(NexusBizError)
  })

  it('should include raw payload in error', () => {
    const response = { code: 500, message: 'Error', data: null }

    try {
      unpackDataResponse(response)
    } catch (e) {
      expect((e as NexusBizError).payload).toEqual(response)
    }
  })
})

describe('unpackListResponse', () => {
  it('should extract items and total from list response', () => {
    const response = {
      code: 200,
      data: [{ id: 1 }, { id: 2 }],
      total: 2,
    }

    const result = unpackListResponse(response)

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('should find items in nested data object', () => {
    const response = {
      code: 200,
      data: {
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
        total: 3,
      },
    }

    const result = unpackListResponse(response)

    expect(result.items).toHaveLength(3)
    expect(result.total).toBe(3)
  })

  it('should support various list key names', () => {
    const response = {
      code: 200,
      data: {
        records: [{ id: 1 }],
      },
      total: 1,
    }

    const result = unpackListResponse(response)

    expect(result.items).toHaveLength(1)
  })

  it('should use items length as total when total not provided', () => {
    const response = {
      code: 200,
      data: [{ id: 1 }, { id: 2 }],
    }

    const result = unpackListResponse(response)

    expect(result.total).toBe(2)
  })

  it('should prefer nested total/count', () => {
    const response = {
      code: 200,
      data: {
        items: [{ id: 1 }],
        count: 100,
      },
    }

    const result = unpackListResponse(response)

    expect(result.total).toBe(100)
  })

  it('should throw for invalid response', () => {
    expect(() => unpackListResponse({})).toThrow(NexusBizError)
    expect(() => unpackListResponse(null)).toThrow(NexusBizError)
  })

  it('should throw for error code', () => {
    const response = { code: 404, message: 'Not found' }

    expect(() => unpackListResponse(response)).toThrow(NexusBizError)
  })
})

describe('messageFromAxiosData', () => {
  it('should return string data directly', () => {
    expect(messageFromAxiosData('Error message')).toBe('Error message')
  })

  it('should extract message from object', () => {
    const data = { message: 'Something went wrong' }

    expect(messageFromAxiosData(data)).toBe('Something went wrong')
  })

  it('should format validation detail', () => {
    const data = {
      detail: [
        { loc: ['body', 'email'], msg: 'Invalid email' },
      ],
    }

    expect(messageFromAxiosData(data)).toBe('body.email: Invalid email')
  })

  it('should return null for unknown format', () => {
    expect(messageFromAxiosData(null)).toBe(null)
    expect(messageFromAxiosData(undefined)).toBe(null)
    expect(messageFromAxiosData(123)).toBe(null)
    expect(messageFromAxiosData([])).toBe(null)
  })
})
