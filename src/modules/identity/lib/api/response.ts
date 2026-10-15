import { NextResponse } from 'next/server'

export const ok = <T>(data: T, status = 200) =>
  NextResponse.json({ success: true, data }, { status })

const INTERNAL_ERROR_PATTERNS = [
  /^relation .* does not exist/i,
  /^column .* does not exist/i,
  /violates? .* constraint/i,
  /duplicate key/i,
  /permission denied/i,
  /PGRST\d+/i,
  /function .* does not exist/i,
  /syntax error/i,
]

function safeMessage(message: string) {
  return INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    ? "The request could not be completed."
    : message
}

export const fail = (message: string, status = 400, code?: string, details?: Record<string, unknown>) =>
  NextResponse.json(
    { success: false, error: { message: safeMessage(message), code, ...details } },
    { status }
  )
