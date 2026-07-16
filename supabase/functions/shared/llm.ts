interface ChatMessage {
  role: string
  content: string
}

interface ChatCompleteOptions {
  messages: ChatMessage[]
  temperature?: number
  jsonMode?: boolean
  maxTokens?: number
}

interface ChatCompleteResult {
  content: string
  provider: string
  model: string
}

interface StreamChunkCallback {
  (chunk: string): void
}

const PROVIDER_CONFIGS = [
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    envVars: ['GROQ_API_KEY', 'GROQ_API_KEY_2'],
    timeoutMs: 30000,
  },
  {
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    envVars: ['CEREBRAS_API_KEY', 'CEREBRAS_API_KEY_2'],
    timeoutMs: 60000,
  },
  {
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    envVars: ['MISTRAL_API_KEY'],
    timeoutMs: 30000,
  },
]

function getAvailableCandidates(): Array<{ provider: string; key: string; model: string; url: string; timeoutMs: number }> {
  const candidates: Array<{ provider: string; key: string; model: string; url: string; timeoutMs: number }> = []
  for (const config of PROVIDER_CONFIGS) {
    for (const envVar of config.envVars) {
      const key = Deno.env.get(envVar)
      if (key) {
        candidates.push({
          provider: config.name,
          key,
          model: config.model,
          url: config.url,
          timeoutMs: config.timeoutMs,
        })
      }
    }
  }
  return candidates
}

let callCounter = 0

function getOrderedCandidates(): Array<{ provider: string; key: string; model: string; url: string; timeoutMs: number }> {
  const candidates = getAvailableCandidates()
  if (candidates.length === 0) return []

  const startIndex = callCounter % candidates.length
  callCounter++
  const ordered = [...candidates.slice(startIndex), ...candidates.slice(0, startIndex)]
  return ordered
}

async function tryProvider(
  candidate: { provider: string; key: string; model: string; url: string; timeoutMs: number },
  messages: ChatMessage[],
  temperature: number,
  jsonMode: boolean,
  maxTokens: number | undefined,
): Promise<ChatCompleteResult> {
  const body: Record<string, unknown> = {
    model: candidate.model,
    messages,
    temperature,
  }
  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }
  if (maxTokens !== undefined) {
    body.max_tokens = maxTokens
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), candidate.timeoutMs)

  try {
    const response = await fetch(candidate.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (response.status === 429 || response.status >= 500) {
      const body = await response.text()
      throw new Error(`${candidate.provider} error ${response.status}: ${body.slice(0, 200)}`)
    }

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`${candidate.provider} error ${response.status}: ${body.slice(0, 200)}`)
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content ?? ''
    if (!content) throw new Error(`${candidate.provider} returned empty content`)
    return { content, provider: candidate.provider, model: candidate.model }
  } finally {
    clearTimeout(timer)
  }
}

export async function chatComplete(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const { messages, temperature = 0.2, jsonMode = false, maxTokens } = options
  const candidates = getOrderedCandidates()
  if (candidates.length === 0) throw new Error('No LLM API keys configured')

  let lastError: Error | null = null
  for (const candidate of candidates) {
    try {
      const result = await tryProvider(candidate, messages, temperature, jsonMode, maxTokens)
      console.log(`chatComplete succeeded with ${candidate.provider}`)
      if (jsonMode) {
        try {
          JSON.parse(result.content)
        } catch {
          throw new Error(`${candidate.provider} returned invalid JSON: ${result.content.slice(0, 100)}`)
        }
      }
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.log(`chatComplete failed with ${candidate.provider}: ${lastError.message}`)
    }
  }
  throw lastError || new Error('All LLM providers failed')
}

export async function chatCompleteStream(
  messages: ChatMessage[],
  onChunk: StreamChunkCallback,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<void> {
  const candidates = getOrderedCandidates()
  if (candidates.length === 0) throw new Error('No LLM API keys configured')

  const { temperature = 0.2, maxTokens } = options

  let lastError: Error | null = null
  for (const candidate of candidates) {
    try {
      const body: Record<string, unknown> = {
        model: candidate.model,
        messages,
        temperature,
        stream: true,
      }
      if (maxTokens !== undefined) {
        body.max_tokens = maxTokens
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), candidate.timeoutMs)

      let response: Response
      try {
        response = await fetch(candidate.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${candidate.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const bodyText = await response.text()
        throw new Error(`${candidate.provider} error ${response.status}: ${bodyText.slice(0, 200)}`)
      }

      console.log(`chatCompleteStream succeeded with ${candidate.provider}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Stream not supported')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) onChunk(token)
          } catch {
            /* skip malformed lines */
          }
        }
      }
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.log(`chatCompleteStream failed with ${candidate.provider}: ${lastError.message}`)
    }
  }
  throw lastError || new Error('All LLM providers failed')
}
