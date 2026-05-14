/** Keys required for RTC, STT, and summary flows (validated on demand, never at module load). */
export const SERVER_ENV_KEYS = [
  'AGORA_APP_ID',
  'AGORA_APP_CERTIFICATE',
  'AGORA_CUSTOMER_KEY',
  'AGORA_CUSTOMER_SECRET',
  'AGORA_STT_REGION',
  'OPENAI_API_KEY',
] as const

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number]

export type ServerEnv = Record<ServerEnvKey, string>

/**
 * Read and validate server env vars when invoked (e.g. from `route.ts` handlers).
 * Does not validate when this module is imported.
 */
export function requireServerEnv(): ServerEnv {
  const missing: string[] = []
  const env = {} as ServerEnv

  for (const key of SERVER_ENV_KEYS) {
    const value = process.env[key]
    if (value === undefined || value.trim() === '') {
      missing.push(key)
      continue
    }
    env[key] = value.trim()
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }

  return env
}
