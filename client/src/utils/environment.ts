/**
 * Environment utilities for development/production feature toggling
 */

/**
 * Check if connection monitoring should be enabled
 * Returns true only if explicitly enabled via environment variable
 */
export function isConnectionMonitorEnabled(): boolean {
  // Only enable if explicitly set to 'true' in environment
  return process.env.NEXT_PUBLIC_ENABLE_CONNECTION_MONITOR === 'true';
}

const DEFAULT_POLLING_TIMEOUT_MS = 10_000
const DEFAULT_POLLING_MAX_RETRIES = 5
const DEFAULT_BACKGROUND_MULTIPLIER = 2

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  if (value.toLowerCase() === 'true') {
    return true
  }

  if (value.toLowerCase() === 'false') {
    return false
  }

  return fallback
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface PollingEnvironmentConfig {
  enabled: boolean
  debugMode: boolean
  requestTimeoutMs: number
  maxRetries: number
  backgroundMultiplier: number
}

export function getPollingEnvironmentConfig(): PollingEnvironmentConfig {
  const enabled = parseBoolean(process.env.NEXT_PUBLIC_POLLING_ENABLED, true)
  const debugMode = parseBoolean(process.env.NEXT_PUBLIC_POLLING_DEBUG_MODE, false)

  const requestTimeoutMs = Math.max(
    1_000,
    parseNumber(process.env.NEXT_PUBLIC_POLLING_TIMEOUT, DEFAULT_POLLING_TIMEOUT_MS),
  )

  const maxRetries = Math.max(
    1,
    Math.round(parseNumber(process.env.NEXT_PUBLIC_POLLING_MAX_RETRIES, DEFAULT_POLLING_MAX_RETRIES)),
  )

  const backgroundMultiplier = Math.max(
    1,
    parseNumber(
      process.env.NEXT_PUBLIC_BACKGROUND_POLLING_MULTIPLIER,
      DEFAULT_BACKGROUND_MULTIPLIER,
    ),
  )

  return {
    enabled,
    debugMode,
    requestTimeoutMs,
    maxRetries,
    backgroundMultiplier,
  }
}

/**
 * Check if we're in development mode
 * Considers both NODE_ENV and explicit development features
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || isConnectionMonitorEnabled();
}

/**
 * Check if development features should be shown
 * This is the primary function to use for conditional development UI
 */
export function showDevelopmentFeatures(): boolean {
  return isConnectionMonitorEnabled();
}