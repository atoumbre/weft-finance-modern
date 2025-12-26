export async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    return await response.json()
  }
  finally {
    clearTimeout(timeout)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required env var: ${name}`)
  return value
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value : undefined
}
