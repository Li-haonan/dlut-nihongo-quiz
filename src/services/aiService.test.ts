import { describe, expect, it } from 'vitest'
import { resolveAPIEndpoint } from './aiService'

describe('resolveAPIEndpoint', () => {
  it('builds an OpenAI-compatible endpoint from common base URL forms', () => {
    expect(resolveAPIEndpoint('https://api.deepseek.com', 'openai')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(resolveAPIEndpoint('https://example.com/v1/', 'openai')).toBe(
      'https://example.com/v1/chat/completions',
    )
    expect(resolveAPIEndpoint('https://example.com/v1/chat/completions', 'openai')).toBe(
      'https://example.com/v1/chat/completions',
    )
  })

  it('builds an Anthropic endpoint without duplicating v1', () => {
    expect(resolveAPIEndpoint('https://api.anthropic.com', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/messages',
    )
    expect(resolveAPIEndpoint('https://api.anthropic.com/v1', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/messages',
    )
  })
})
