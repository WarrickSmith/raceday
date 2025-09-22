export type PollingEndpointKey = 'race' | 'entrants' | 'pools' | 'moneyFlow'

export type PollingAlertLevel = 'info' | 'warning' | 'error'

export interface PollingAlert {
  id: string
  level: PollingAlertLevel
  message: string
  detail?: string
}

export interface PollingDebugEvent {
  timestamp: number
  type: 'request' | 'success' | 'error' | 'cycle' | 'schedule'
  message: string
  details?: Record<string, unknown>
}

export interface PollingEndpointMetrics {
  key: PollingEndpointKey
  label: string
  requestCount: number
  successCount: number
  errorCount: number
  errorRate: number
  consecutiveFailures: number
  lastRequestAt: number | null
  lastSuccessAt: number | null
  lastErrorAt: number | null
  lastLatencyMs: number | null
  averageLatencyMs: number | null
  p95LatencyMs: number | null
  lastErrorMessage: string | null
}

export interface PollingScheduleMetrics {
  targetIntervalMs: number | null
  scheduledIntervalMs: number | null
  lastActualIntervalMs: number | null
  lastCycleDurationMs: number | null
  lastRunAt: number | null
  nextRunAt: number | null
  jitterMs: number | null
  backgroundMultiplier: number
  compliance: 'on-track' | 'slow' | 'stalled'
}

export interface PollingMetricsSnapshot {
  raceId: string | null
  isActive: boolean
  debugMode: boolean
  startedAt: number | null
  uptimeMs: number
  totals: {
    requests: number
    successes: number
    errors: number
    errorRate: number
    averageLatencyMs: number | null
  }
  schedule: PollingScheduleMetrics
  endpoints: PollingEndpointMetrics[]
  alerts: PollingAlert[]
  events: PollingDebugEvent[]
}

interface EndpointState {
  key: PollingEndpointKey
  label: string
  requestCount: number
  successCount: number
  errorCount: number
  consecutiveFailures: number
  lastRequestAt: number | null
  lastSuccessAt: number | null
  lastErrorAt: number | null
  lastErrorMessage: string | null
  latencySamples: number[]
  lastLatencyMs: number | null
}

interface ScheduleState {
  targetIntervalMs: number | null
  scheduledIntervalMs: number | null
  lastActualIntervalMs: number | null
  lastCycleDurationMs: number | null
  lastRunAt: number | null
  nextRunAt: number | null
  jitterMs: number | null
  backgroundMultiplier: number
  compliance: 'on-track' | 'slow' | 'stalled'
}

interface PollingMetricsOptions {
  debugMode?: boolean
  maxRetries?: number
}

const ENDPOINT_LABELS: Record<PollingEndpointKey, string> = {
  race: 'Race',
  entrants: 'Entrants',
  pools: 'Pools',
  moneyFlow: 'Money Flow',
}

const MAX_LATENCY_SAMPLES = 50
const DEFAULT_MAX_RETRIES = 5

class PollingMetricsManager {
  private raceId: string | null = null
  private isActive = false
  private debugMode = false
  private maxRetries = DEFAULT_MAX_RETRIES
  private startedAt: number | null = null
  private totalRequests = 0
  private totalSuccesses = 0
  private totalErrors = 0
  private endpoints = new Map<PollingEndpointKey, EndpointState>()
  private schedule: ScheduleState = {
    targetIntervalMs: null,
    scheduledIntervalMs: null,
    lastActualIntervalMs: null,
    lastCycleDurationMs: null,
    lastRunAt: null,
    nextRunAt: null,
    jitterMs: null,
    backgroundMultiplier: 1,
    compliance: 'on-track',
  }
  private events: PollingDebugEvent[] = []

  startSession(raceId: string, options?: PollingMetricsOptions): void {
    if (this.raceId !== raceId) {
      this.reset()
      this.raceId = raceId
      this.startedAt = Date.now()
    }

    if (options?.debugMode !== undefined) {
      this.debugMode = options.debugMode
    }

    if (options?.maxRetries && Number.isFinite(options.maxRetries)) {
      this.maxRetries = options.maxRetries
    }
  }

  setActive(active: boolean): void {
    this.isActive = active
  }

  recordSchedule(details: {
    raceId: string
    targetIntervalMs: number
    scheduledIntervalMs: number
    jitterMs: number
    backgroundMultiplier: number
  }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    this.schedule = {
      ...this.schedule,
      targetIntervalMs: details.targetIntervalMs,
      scheduledIntervalMs: details.scheduledIntervalMs,
      jitterMs: details.jitterMs,
      backgroundMultiplier: details.backgroundMultiplier,
      nextRunAt: Date.now() + details.scheduledIntervalMs,
    }

    this.recordEvent('schedule', `Next poll scheduled in ${details.scheduledIntervalMs}ms`, {
      targetIntervalMs: details.targetIntervalMs,
      jitterMs: details.jitterMs,
      backgroundMultiplier: details.backgroundMultiplier,
    })
  }

  recordCycleStart(details: { raceId: string }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    const now = Date.now()
    if (this.schedule.lastRunAt) {
      const actualInterval = now - this.schedule.lastRunAt
      this.schedule.lastActualIntervalMs = actualInterval

      const scheduled = this.schedule.scheduledIntervalMs ?? actualInterval
      const ratio = scheduled > 0 ? actualInterval / scheduled : 1

      if (ratio <= 1.2) {
        this.schedule.compliance = 'on-track'
      } else if (ratio <= 2) {
        this.schedule.compliance = 'slow'
      } else {
        this.schedule.compliance = 'stalled'
      }
    }

    this.schedule.lastRunAt = now
    this.recordEvent('cycle', 'Polling cycle started', {
      lastActualIntervalMs: this.schedule.lastActualIntervalMs,
      compliance: this.schedule.compliance,
    })
  }

  recordCycleComplete(details: { raceId: string; durationMs: number }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    this.schedule.lastCycleDurationMs = details.durationMs
    this.recordEvent('cycle', 'Polling cycle completed', {
      durationMs: details.durationMs,
    })
  }

  recordRequest(details: { raceId: string; endpoint: PollingEndpointKey }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    const endpoint = this.getEndpoint(details.endpoint)
    endpoint.requestCount += 1
    endpoint.lastRequestAt = Date.now()
    this.totalRequests += 1
    this.recordEvent('request', `${ENDPOINT_LABELS[details.endpoint]} request dispatched`)
  }

  recordSuccess(details: {
    raceId: string
    endpoint: PollingEndpointKey
    durationMs: number
  }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    const endpoint = this.getEndpoint(details.endpoint)
    endpoint.successCount += 1
    endpoint.consecutiveFailures = 0
    endpoint.lastSuccessAt = Date.now()
    endpoint.lastLatencyMs = details.durationMs
    endpoint.latencySamples = this.addLatencySample(endpoint.latencySamples, details.durationMs)
    this.totalSuccesses += 1
    this.recordEvent('success', `${ENDPOINT_LABELS[details.endpoint]} updated`, {
      durationMs: details.durationMs,
    })
  }

  recordError(details: {
    raceId: string
    endpoint: PollingEndpointKey
    error: Error
  }): void {
    if (!this.isForCurrentRace(details.raceId)) {
      return
    }

    const endpoint = this.getEndpoint(details.endpoint)
    endpoint.errorCount += 1
    endpoint.consecutiveFailures += 1
    endpoint.lastErrorAt = Date.now()
    endpoint.lastErrorMessage = details.error.message
    this.totalErrors += 1
    this.recordEvent('error', `${ENDPOINT_LABELS[details.endpoint]} error`, {
      message: details.error.message,
      consecutiveFailures: endpoint.consecutiveFailures,
    })
  }

  getSnapshot(): PollingMetricsSnapshot {
    const uptimeMs = this.startedAt ? Date.now() - this.startedAt : 0
    const totalLatencySamples = Array.from(this.endpoints.values())
      .flatMap(endpoint => endpoint.latencySamples)

    const totalsAverageLatency = totalLatencySamples.length
      ? totalLatencySamples.reduce((sum, value) => sum + value, 0) / totalLatencySamples.length
      : null

    const endpoints = Array.from(this.endpoints.values()).map(endpoint => ({
      key: endpoint.key,
      label: endpoint.label,
      requestCount: endpoint.requestCount,
      successCount: endpoint.successCount,
      errorCount: endpoint.errorCount,
      errorRate: endpoint.requestCount > 0 ? endpoint.errorCount / endpoint.requestCount : 0,
      consecutiveFailures: endpoint.consecutiveFailures,
      lastRequestAt: endpoint.lastRequestAt,
      lastSuccessAt: endpoint.lastSuccessAt,
      lastErrorAt: endpoint.lastErrorAt,
      lastLatencyMs: endpoint.lastLatencyMs,
      averageLatencyMs: endpoint.latencySamples.length
        ? endpoint.latencySamples.reduce((sum, value) => sum + value, 0) / endpoint.latencySamples.length
        : null,
      p95LatencyMs: this.calculatePercentile(endpoint.latencySamples, 95),
      lastErrorMessage: endpoint.lastErrorMessage,
    }))

    return {
      raceId: this.raceId,
      isActive: this.isActive,
      debugMode: this.debugMode,
      startedAt: this.startedAt,
      uptimeMs,
      totals: {
        requests: this.totalRequests,
        successes: this.totalSuccesses,
        errors: this.totalErrors,
        errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
        averageLatencyMs: totalsAverageLatency,
      },
      schedule: { ...this.schedule },
      endpoints,
      alerts: this.buildAlerts(endpoints),
      events: [...this.events],
    }
  }

  clear(): void {
    this.reset()
  }

  private reset(): void {
    this.isActive = false
    this.startedAt = null
    this.totalRequests = 0
    this.totalSuccesses = 0
    this.totalErrors = 0
    this.endpoints.clear()
    this.schedule = {
      targetIntervalMs: null,
      scheduledIntervalMs: null,
      lastActualIntervalMs: null,
      lastCycleDurationMs: null,
      lastRunAt: null,
      nextRunAt: null,
      jitterMs: null,
      backgroundMultiplier: 1,
      compliance: 'on-track',
    }
    this.events = []
  }

  private isForCurrentRace(raceId: string): boolean {
    if (!raceId) {
      return false
    }

    if (this.raceId && this.raceId !== raceId) {
      return false
    }

    if (!this.raceId) {
      this.startSession(raceId)
    }

    return true
  }

  private getEndpoint(key: PollingEndpointKey): EndpointState {
    const existing = this.endpoints.get(key)
    if (existing) {
      return existing
    }

    const state: EndpointState = {
      key,
      label: ENDPOINT_LABELS[key],
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      consecutiveFailures: 0,
      lastRequestAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      latencySamples: [],
      lastLatencyMs: null,
    }

    this.endpoints.set(key, state)
    return state
  }

  private addLatencySample(samples: number[], value: number): number[] {
    const next = [...samples, value]
    if (next.length > MAX_LATENCY_SAMPLES) {
      next.shift()
    }
    return next
  }

  private calculatePercentile(samples: number[], percentile: number): number | null {
    if (samples.length === 0) {
      return null
    }

    const sorted = [...samples].sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.floor((percentile / 100) * sorted.length))
    return sorted[index]
  }

  private buildAlerts(endpoints: PollingEndpointMetrics[]): PollingAlert[] {
    const alerts: PollingAlert[] = []

    if (this.schedule.compliance === 'slow') {
      alerts.push({
        id: 'schedule-slow',
        level: 'warning',
        message: 'Polling cadence slower than expected',
        detail: `Last interval ${this.schedule.lastActualIntervalMs ?? 0}ms vs scheduled ${
          this.schedule.scheduledIntervalMs ?? 0
        }ms`,
      })
    }

    if (this.schedule.compliance === 'stalled') {
      alerts.push({
        id: 'schedule-stalled',
        level: 'error',
        message: 'Polling cadence stalled',
        detail: `Last interval ${this.schedule.lastActualIntervalMs ?? 0}ms greatly exceeded scheduled ${
          this.schedule.scheduledIntervalMs ?? 0
        }ms`,
      })
    }

    const totalErrorRate = this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0
    if (totalErrorRate > 0.1) {
      alerts.push({
        id: 'error-rate-high',
        level: 'error',
        message: 'High polling error rate detected',
        detail: `${(totalErrorRate * 100).toFixed(1)}% of requests failing`,
      })
    } else if (totalErrorRate > 0.05) {
      alerts.push({
        id: 'error-rate-warning',
        level: 'warning',
        message: 'Polling errors increasing',
        detail: `${(totalErrorRate * 100).toFixed(1)}% of requests failing`,
      })
    }

    endpoints.forEach(endpoint => {
      if (endpoint.consecutiveFailures >= this.maxRetries) {
        alerts.push({
          id: `endpoint-${endpoint.key}-failures`,
          level: 'error',
          message: `${endpoint.label} retries exhausted`,
          detail: `${endpoint.consecutiveFailures} consecutive failures`,
        })
      } else if (endpoint.errorRate > 0.1) {
        alerts.push({
          id: `endpoint-${endpoint.key}-errors`,
          level: 'warning',
          message: `${endpoint.label} experiencing errors`,
          detail: `${(endpoint.errorRate * 100).toFixed(1)}% failure rate`,
        })
      }
    })

    return alerts
  }

  private recordEvent(
    type: PollingDebugEvent['type'],
    message: string,
    details?: Record<string, unknown>,
  ): void {
    if (!this.debugMode && type === 'request') {
      return
    }

    const event: PollingDebugEvent = {
      timestamp: Date.now(),
      type,
      message,
      details,
    }

    this.events = [...this.events, event]

    const maxEvents = this.debugMode ? 100 : 25
    if (this.events.length > maxEvents) {
      this.events = this.events.slice(-maxEvents)
    }
  }
}

const metricsManager = new PollingMetricsManager()

export function initializePollingMetrics(
  raceId: string,
  options?: PollingMetricsOptions,
): void {
  metricsManager.startSession(raceId, options)
}

export function markPollingActive(active: boolean): void {
  metricsManager.setActive(active)
}

export function recordPollingSchedule(details: {
  raceId: string
  targetIntervalMs: number
  scheduledIntervalMs: number
  jitterMs: number
  backgroundMultiplier: number
}): void {
  metricsManager.recordSchedule(details)
}

export function recordPollingCycleStart(details: { raceId: string }): void {
  metricsManager.recordCycleStart(details)
}

export function recordPollingCycleComplete(details: {
  raceId: string
  durationMs: number
}): void {
  metricsManager.recordCycleComplete(details)
}

export function recordPollingRequest(details: {
  raceId: string
  endpoint: PollingEndpointKey
}): void {
  metricsManager.recordRequest(details)
}

export function recordPollingSuccess(details: {
  raceId: string
  endpoint: PollingEndpointKey
  durationMs: number
}): void {
  metricsManager.recordSuccess(details)
}

export function recordPollingError(details: {
  raceId: string
  endpoint: PollingEndpointKey
  error: Error
}): void {
  metricsManager.recordError(details)
}

export function getPollingMetricsSnapshot(): PollingMetricsSnapshot {
  return metricsManager.getSnapshot()
}

export function clearPollingMetrics(): void {
  metricsManager.clear()
}
