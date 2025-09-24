/**
 * Coordinated Race Polling Hook - Task 4 Implementation
 *
 * Provides centralized polling coordination for multiple race data sources.
 * This hook coordinates polling of race data, entrants, pools, and money flow
 * with staggered request timing and consistent error handling.
 *
 * Key Features:
 * - Single polling cycle for all data sources
 * - Coordinated API calls with staggered timing (100-200ms delays)
 * - Consistent error handling across sources
 * - Respect 2x backend frequency requirement
 * - Data consistency management
 * - Request deduplication for concurrent calls
 * - Intelligent caching to reduce bandwidth
 * - API usage optimization with rate limiting
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLogger } from '@/utils/logging'
import { raceDataCache, type DataFreshness } from '@/utils/pollingCache'
import type { Race, Entrant } from '@/types/meetings'
import type { RacePoolData } from '@/types/racePools'
import {
  initializePollingMetrics,
  markPollingActive,
  recordPollingCycleComplete,
  recordPollingCycleStart,
  recordPollingError,
  recordPollingRequest,
  recordPollingSchedule,
  recordPollingSuccess,
  type PollingEndpointKey,
} from '@/utils/pollingMetrics'

const REQUEST_RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 24
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const CIRCUIT_BREAKER_RESET_MS = 60_000
const SLOW_RESPONSE_THRESHOLD_MS = 2_500
const MAX_LATENCY_SAMPLES = 5
const MAX_DEGRADE_MULTIPLIER = 2
const MINIMUM_INTERVAL_MS = 5_000
const JITTER_PERCENTAGE = 0.12

// Core interface for race data sources as specified in Task 4
export interface RaceDataSources {
  race: Race | null
  entrants: Entrant[]
  pools: RacePoolData | null
  moneyFlow: MoneyFlowData[]
}

// Money flow data interface for timeline
interface MoneyFlowData {
  timestamp: string
  winPool: number
  placePool: number
  [key: string]: unknown
}

// Configuration interface for the coordinator
export interface CoordinatedPollingConfig {
  raceId: string
  raceStartTime: string
  raceStatus: string
  enabled: boolean
  backgroundMultiplier?: number
  isDocumentHidden?: boolean
  inactiveSince?: number | null
  inactivePauseDurationMs?: number
  onDataUpdate?: (data: RaceDataSources & { updateTrigger: number }) => void
  onError?: (error: Error, source?: string) => void
  debugMode?: boolean
  requestTimeoutMs?: number
  maxRetries?: number
}

// Polling coordination state
interface CoordinationState {
  isActive: boolean
  isPaused: boolean
  isStopped: boolean
  currentInterval: number
  lastPollTime: Date | null
  successfulSources: Set<PollingEndpointKey>
  failedSources: Set<PollingEndpointKey>
  requestsInFlight: Set<PollingEndpointKey>
  totalPolls: number
  updateTrigger: number
}

// Error state per data source
interface SourceErrorState {
  [source: string]: {
    lastError: Error | null
    errorCount: number
    lastSuccessTime: Date | null
    canUseFallback: boolean
  }
}

// Result interface for the hook
export interface UseCoordinatedRacePollingResult {
  data: RaceDataSources
  coordinationState: CoordinationState
  errorState: SourceErrorState
  dataFreshness: DataFreshness
  lastUpdateTrigger: number
  startPolling: () => void
  pausePolling: () => void
  resumePolling: () => void
  stopPolling: () => void
  forceUpdate: () => Promise<void>
  refreshSource: (source: keyof RaceDataSources) => Promise<void>
}

/**
 * Central polling coordinator that manages multiple data sources
 */
export function useCoordinatedRacePolling(
  config: CoordinatedPollingConfig
): UseCoordinatedRacePollingResult {
  const logger = useLogger('useCoordinatedRacePolling')

  useEffect(() => {
    if (!config.raceId) {
      return
    }

    initializePollingMetrics(config.raceId, {
      debugMode: config.debugMode,
      maxRetries: config.maxRetries ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
    })
  }, [config.debugMode, config.maxRetries, config.raceId])

  // Coordination state management
  const [coordinationState, setCoordinationState] = useState<CoordinationState>({
    isActive: false,
    isPaused: false,
    isStopped: false,
    currentInterval: 900000, // Default 15 minutes
    lastPollTime: null,
    successfulSources: new Set<PollingEndpointKey>(),
    failedSources: new Set<PollingEndpointKey>(),
    requestsInFlight: new Set<PollingEndpointKey>(),
    totalPolls: 0,
    updateTrigger: 0,
  })

  // Data state for all sources
  const [data, setData] = useState<RaceDataSources>({
    race: null,
    entrants: [],
    pools: null,
    moneyFlow: [],
  })

  // Error state per source
  const [errorState, setErrorState] = useState<SourceErrorState>({})

  // Data freshness indicator
  const [dataFreshness, setDataFreshness] = useState<DataFreshness>('fresh')

  // Refs for cleanup and request management
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllersRef = useRef<Map<PollingEndpointKey, AbortController>>(new Map())
  const mountedRef = useRef(true)
  const lastPollDataRef = useRef<RaceDataSources | null>(null)
  const requestMetadataRef = useRef<Map<string, { etag?: string; lastModified?: string }>>(new Map())
  const requestTimestampsRef = useRef<Map<string, number[]>>(new Map())
  const circuitBreakerRef = useRef<Map<string, { open: boolean; openedAt: number | null }>>(new Map())
  const inFlightRequestsRef = useRef<Map<string, Promise<unknown>>>(new Map())
  const performanceMetricsRef = useRef<Map<string, { samples: number[]; average: number }>>(new Map())
  const backgroundPauseRef = useRef(false)

  /**
   * Calculate polling interval based on race timing (2x backend frequency)
   */
  const calculatePollingInterval = useCallback((timeToStart: number, raceStatus: string): number => {
    const status = raceStatus.toLowerCase()

    // Stop polling if race is final
    if (['final', 'finalized', 'abandoned', 'cancelled'].includes(status)) {
      return 0
    }

    // Apply exact cadence table from Task 1
    if (status === 'open') {
      if (timeToStart > 65) return 900000    // 15 minutes (backend: 30m)
      if (timeToStart > 20) return 150000    // 2.5 minutes (backend: 5m)
      if (timeToStart > 5) return 75000      // 75 seconds (backend: 2.5m)
      if (timeToStart > 3) return 30000      // 30 seconds (backend: 1m)
      return 15000                           // 15 seconds (backend: 30s)
    }

    if (['closed', 'running', 'interim'].includes(status)) {
      return 15000 // 15 seconds (backend: 30s) - transition monitoring
    }

    // Fallback
    return timeToStart > 20 ? 150000 : 15000
  }, [])

  /**
   * Calculate time to race start in minutes
   */
  const calculateTimeToStart = useCallback((raceStartTime: string): number => {
    const startTime = new Date(raceStartTime)
    const now = new Date()
    return (startTime.getTime() - now.getTime()) / (1000 * 60)
  }, [])

  const getRequestKey = useCallback(
    (source: PollingEndpointKey): string => `${source}:${config.raceId}`,
    [config.raceId],
  )

  /**
   * Get cached headers for conditional requests
   */
  const getCachedHeaders = useCallback(
    (source: PollingEndpointKey): Record<string, string> => {
      const metadata = requestMetadataRef.current.get(getRequestKey(source))
      const headers: Record<string, string> = {}

      if (metadata?.etag) {
        headers['If-None-Match'] = metadata.etag
      }

      if (metadata?.lastModified) {
        headers['If-Modified-Since'] = metadata.lastModified
      }

      return headers
    },
    [getRequestKey]
  )

  /**
   * Get cached data for a source
   */
  const getCachedData = useCallback((source: PollingEndpointKey, raceId: string): unknown => {
    const cached = raceDataCache.getRaceData(raceId)
    if (!cached) return null

    switch (source) {
      case 'race':
        return { race: cached.race }
      case 'entrants':
        return { entrants: cached.entrants }
      case 'pools':
        return { pools: cached.pools }
      case 'moneyFlow':
        if (lastPollDataRef.current?.moneyFlow) {
          return { moneyFlow: lastPollDataRef.current.moneyFlow }
        }
        return null
      default:
        return null
    }
  }, [])

  /**
   * Cache response data with optional ETag
   */
  const cacheResponseData = useCallback((
    source: PollingEndpointKey,
    raceId: string,
    data: unknown,
    metadata?: { etag?: string | null; lastModified?: string | null },
    options?: { isNotModified?: boolean }
  ): void => {
    // Update race data cache based on source
    const currentCached = raceDataCache.getRaceData(raceId)
    const isNotModified = options?.isNotModified ?? false

    switch (source) {
      case 'race':
        raceDataCache.setRaceData(
          raceId,
          (data as { race: Race }).race,
          currentCached?.entrants || [],
          currentCached?.pools || null,
          currentCached?.moneyFlowUpdateTrigger || 0
        )
        break
      case 'entrants':
        raceDataCache.setRaceData(
          raceId,
          currentCached?.race || null,
          (data as { entrants: Entrant[] }).entrants,
          currentCached?.pools || null,
          currentCached?.moneyFlowUpdateTrigger || 0
        )
        break
      case 'pools':
        raceDataCache.setRaceData(
          raceId,
          currentCached?.race || null,
          currentCached?.entrants || [],
          data as RacePoolData,
          currentCached?.moneyFlowUpdateTrigger || 0
        )
        break
      case 'moneyFlow':
        // Increment money flow update trigger when money flow data is successfully fetched
        const moneyFlowBase = currentCached?.moneyFlowUpdateTrigger || 0
        const newMoneyFlowTrigger = isNotModified ? moneyFlowBase : moneyFlowBase + 1
        raceDataCache.setRaceData(
          raceId,
          currentCached?.race || null,
          currentCached?.entrants || [],
          currentCached?.pools || null,
          newMoneyFlowTrigger
        )
        break
    }

    if (metadata?.etag || metadata?.lastModified) {
      requestMetadataRef.current.set(getRequestKey(source), {
        etag: metadata?.etag ?? undefined,
        lastModified: metadata?.lastModified ?? undefined
      })
    }
  }, [getRequestKey])

  const recordRequestTimestamp = useCallback((source: PollingEndpointKey, timestamp: number): void => {
    const key = getRequestKey(source)
    const timestamps = requestTimestampsRef.current.get(key) ?? []
    const recent = timestamps.filter(value => timestamp - value < REQUEST_RATE_LIMIT_WINDOW_MS)
    recent.push(timestamp)
    requestTimestampsRef.current.set(key, recent)
  }, [getRequestKey])

  const isRateLimited = useCallback((source: PollingEndpointKey, timestamp: number): boolean => {
    const key = getRequestKey(source)
    const timestamps = requestTimestampsRef.current.get(key) ?? []
    const recent = timestamps.filter(value => timestamp - value < REQUEST_RATE_LIMIT_WINDOW_MS)
    requestTimestampsRef.current.set(key, recent)
    return recent.length >= MAX_REQUESTS_PER_WINDOW
  }, [getRequestKey])

  const updatePerformanceMetrics = useCallback((source: PollingEndpointKey, durationMs: number): void => {
    const key = getRequestKey(source)
    const metrics = performanceMetricsRef.current.get(key) ?? { samples: [], average: durationMs }
    const samples = [...metrics.samples, durationMs].slice(-MAX_LATENCY_SAMPLES)
    const average = samples.reduce((total, value) => total + value, 0) / samples.length
    performanceMetricsRef.current.set(key, { samples, average })
  }, [getRequestKey])

  const getSlowestAverage = useCallback((): number => {
    let slowest = 0
    performanceMetricsRef.current.forEach(value => {
      if (value.average > slowest) {
        slowest = value.average
      }
    })
    return slowest
  }, [])

  /**
   * Validate that all expected endpoints are being polled
   */
  const validatePollingCoverage = useCallback((endpointResults: Record<string, 'fulfilled' | 'rejected'>) => {
    const expectedEndpoints = ['race', 'entrants', 'pools', 'moneyFlow']
    const missingEndpoints = expectedEndpoints.filter(endpoint => !endpointResults[endpoint])

    if (missingEndpoints.length > 0) {
      logger.warn('Polling validation failed - missing endpoints', {
        raceId: config.raceId,
        missing: missingEndpoints,
        attempted: Object.keys(endpointResults)
      })

      // Record as polling issue for monitoring
      recordPollingError({
        raceId: config.raceId,
        endpoint: 'race',
        error: new Error(`Missing endpoints in polling cycle: ${missingEndpoints.join(', ')}`)
      })
    }

    // Track endpoint consistency
    const attemptedCount = Object.keys(endpointResults).length
    if (attemptedCount !== expectedEndpoints.length) {
      logger.warn('Polling validation - inconsistent endpoint count', {
        raceId: config.raceId,
        expected: expectedEndpoints.length,
        attempted: attemptedCount,
        endpoints: endpointResults
      })
    }

    return missingEndpoints.length === 0
  }, [config.raceId, logger])

  /**
   * Fetch data from a specific source with error handling
   */
  const fetchDataSource = useCallback(async (
    source: PollingEndpointKey,
    endpoint: string,
    delay: number = 0
  ): Promise<unknown> => {
    const { raceId } = config

    const requestKey = getRequestKey(source)
    const existingRequest = inFlightRequestsRef.current.get(requestKey)
    if (existingRequest) {
      logger.debug(`Joining in-flight request for ${source}`)
      return existingRequest
    }

    const now = Date.now()
    const circuitState = circuitBreakerRef.current.get(requestKey)

    if (circuitState?.open) {
      if (circuitState.openedAt && now - circuitState.openedAt > CIRCUIT_BREAKER_RESET_MS) {
        circuitBreakerRef.current.set(requestKey, { open: false, openedAt: null })
      } else {
        logger.warn(`${source} circuit breaker open, serving cached data`, { raceId })
        setDataFreshness('acceptable')
        return getCachedData(source, raceId)
      }
    }

    if (isRateLimited(source, now)) {
      logger.warn(`${source} request throttled by client limiter`, {
        raceId,
        windowMs: REQUEST_RATE_LIMIT_WINDOW_MS,
        maxRequests: MAX_REQUESTS_PER_WINDOW
      })
      setDataFreshness('acceptable')
      return getCachedData(source, raceId)
    }

    const performRequest = async (): Promise<unknown> => {
      setCoordinationState(prev => ({
        ...prev,
        requestsInFlight: new Set([...prev.requestsInFlight, source])
      }))

      let timeoutId: ReturnType<typeof setTimeout> | undefined
      let intentionalAbort = false

      try {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        let requestUrl = `/api/race/${raceId}${endpoint}`

        if (source === 'moneyFlow' && endpoint.includes('money-flow-timeline')) {
          const currentEntrants = data.entrants?.length > 0
            ? data.entrants
            : raceDataCache.getRaceData(raceId)?.entrants || []

          if (currentEntrants.length === 0) {
            logger.warn(`${source} request skipped - no entrants available`)
            recordPollingSuccess({ raceId, endpoint: source, durationMs: 0 })

            setCoordinationState(prev => ({
              ...prev,
              successfulSources: new Set([...prev.successfulSources, source]),
              failedSources: new Set([...prev.failedSources].filter(s => s !== source))
            }))

            setErrorState(prev => ({
              ...prev,
              [source]: {
                lastError: null,
                errorCount: 0,
                lastSuccessTime: new Date(),
                canUseFallback: true
              }
            }))

            return null
          }

          const entrantIds = currentEntrants.map(entrant => entrant.entrantId || entrant.$id).filter(Boolean)
          if (entrantIds.length === 0) {
            logger.warn(`${source} request skipped - no valid entrant IDs found`)
            recordPollingSuccess({ raceId, endpoint: source, durationMs: 0 })

            setCoordinationState(prev => ({
              ...prev,
              successfulSources: new Set([...prev.successfulSources, source]),
              failedSources: new Set([...prev.failedSources].filter(s => s !== source))
            }))

            setErrorState(prev => ({
              ...prev,
              [source]: {
                lastError: null,
                errorCount: 0,
                lastSuccessTime: new Date(),
                canUseFallback: true
              }
            }))

            return null
          }

          const entrantsParam = entrantIds.join(',')
          requestUrl += `?entrants=${encodeURIComponent(entrantsParam)}`
          logger.debug(`${source} request with ${entrantIds.length} entrants`)
        }

        const abortController = new AbortController()
        abortControllersRef.current.set(source, abortController)

        const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
        timeoutId = setTimeout(() => {
          intentionalAbort = true
          abortController.abort()
        }, timeoutMs)

        const headers = {
          'Cache-Control': 'no-cache',
          ...getCachedHeaders(source)
        }

        recordPollingRequest({ raceId, endpoint: source })
        recordRequestTimestamp(source, Date.now())

        const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const response = await fetch(requestUrl, {
          signal: abortController.signal,
          cache: 'no-cache',
          headers
        })
        const end = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const durationMs = end - start
        updatePerformanceMetrics(source, durationMs)

        const etag = response.headers.get('ETag')
        const lastModified = response.headers.get('Last-Modified')

        if (response.status === 304) {
          logger.debug(`${source} data not modified, using cached version`)
          const cached = getCachedData(source, raceId)

          if (cached) {
            cacheResponseData(
              source,
              raceId,
              cached,
              { etag, lastModified },
              { isNotModified: true }
            )
          }

          recordPollingSuccess({ raceId, endpoint: source, durationMs })

          setCoordinationState(prev => ({
            ...prev,
            successfulSources: new Set([...prev.successfulSources, source]),
            failedSources: new Set([...prev.failedSources].filter(s => s !== source))
          }))

          setErrorState(prev => ({
            ...prev,
            [source]: {
              lastError: null,
              errorCount: 0,
              lastSuccessTime: new Date(),
              canUseFallback: true
            }
          }))

          circuitBreakerRef.current.set(requestKey, { open: false, openedAt: null })
          setDataFreshness('fresh')
          return cached
        }

        if (!response.ok) {
          throw new Error(`${source} fetch failed: ${response.statusText}`)
        }

        const responseData = await response.json()

        cacheResponseData(source, raceId, responseData, { etag, lastModified })

        recordPollingSuccess({ raceId, endpoint: source, durationMs })

        setCoordinationState(prev => ({
          ...prev,
          successfulSources: new Set([...prev.successfulSources, source]),
          failedSources: new Set([...prev.failedSources].filter(s => s !== source))
        }))

        setErrorState(prev => ({
          ...prev,
          [source]: {
            lastError: null,
            errorCount: 0,
            lastSuccessTime: new Date(),
            canUseFallback: true
          }
        }))

        circuitBreakerRef.current.set(requestKey, { open: false, openedAt: null })
        return responseData
      } catch (error) {
        const fetchError = error instanceof Error ? error : new Error(`Unknown error in ${source}`)
        const isAbortError = fetchError.name === 'AbortError' || fetchError.message.includes('aborted')

        if (isAbortError && intentionalAbort) {
          logger.debug(`${source} request intentionally aborted (timeout or cleanup)`)
          return null
        }

        if (isAbortError && !mountedRef.current) {
          logger.debug(`${source} request aborted during component cleanup`)
          return null
        }

        recordPollingError({ raceId, endpoint: source, error: fetchError })

        setCoordinationState(prev => ({
          ...prev,
          failedSources: new Set([...prev.failedSources, source]),
          successfulSources: new Set([...prev.successfulSources].filter(s => s !== source))
        }))

        setErrorState(prev => {
          const previous = prev[source]
          const nextErrorCount = (previous?.errorCount ?? 0) + 1

          if (nextErrorCount >= (config.maxRetries ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD)) {
            circuitBreakerRef.current.set(requestKey, { open: true, openedAt: Date.now() })
            logger.warn(`${source} circuit breaker opened`, { raceId, errorCount: nextErrorCount })
          }

          return {
            ...prev,
            [source]: {
              lastError: fetchError,
              errorCount: nextErrorCount,
              lastSuccessTime: previous?.lastSuccessTime ?? null,
              canUseFallback: raceDataCache.canUseFallback(`race:${raceId}`)
            }
          }
        })

        if (isAbortError) {
          logger.warn(`${source} fetch aborted unexpectedly`, {
            error: fetchError.message,
            intentionalAbort,
            isMounted: mountedRef.current,
            hasAbortController: abortControllersRef.current.has(source)
          })
        } else {
          logger.error(`${source} fetch failed`, { error: fetchError.message })
        }

        if (!isAbortError) {
          const fallbackData = getCachedData(source, raceId)
          if (fallbackData) {
            logger.debug(`Using fallback data for ${source}`)
            setDataFreshness('stale')
            return fallbackData
          }
        }

        throw fetchError
      } finally {
        setCoordinationState(prev => ({
          ...prev,
          requestsInFlight: new Set([...prev.requestsInFlight].filter(s => s !== source))
        }))

        abortControllersRef.current.delete(source)
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
      }
    }

    const requestPromise = performRequest()
    inFlightRequestsRef.current.set(requestKey, requestPromise)

    try {
      return await requestPromise
    } finally {
      inFlightRequestsRef.current.delete(requestKey)
    }
  }, [
    cacheResponseData,
    config,
    data.entrants,
    getCachedData,
    getCachedHeaders,
    getRequestKey,
    isRateLimited,
    logger,
    recordRequestTimestamp,
    updatePerformanceMetrics
  ])

  /**
   * Execute coordinated polling cycle for all data sources
   */
  const executeCoordinatedPoll = useCallback(async (): Promise<void> => {
    if (!mountedRef.current || coordinationState.isPaused || !config.enabled) {
      return
    }

    logger.debug('Executing coordinated polling cycle', {
      raceId: config.raceId,
      totalPolls: coordinationState.totalPolls
    })

    const cycleStart = Date.now()
    recordPollingCycleStart({ raceId: config.raceId })

    try {
      // Single coordinated cycle: All endpoints are attempted with staggered timing
      // This ensures all data sources are polled in every cycle regardless of individual failures
      const allRequests = [
        fetchDataSource('race', '', 0),                                     // Immediate
        fetchDataSource('entrants', '/entrants', 100),                     // 100ms delay
        fetchDataSource('pools', '/pools', 200),                           // 200ms delay
        fetchDataSource('moneyFlow', '/money-flow-timeline', 300)          // 300ms delay - requires entrants
      ]

      // Wait for all requests to complete (fulfilled or rejected)
      const [raceResult, entrantsResult, poolsResult, moneyFlowResult] = await Promise.allSettled(allRequests)

      // Process results and maintain data consistency
      const newData: RaceDataSources = { ...data }
      let hasUpdates = false

      // Process race data
      if (raceResult.status === 'fulfilled' && raceResult.value) {
        const raceData = raceResult.value as { race: Race }
        if (raceData.race) {
          newData.race = raceData.race
          hasUpdates = true
        }
      }

      // Process entrants data
      if (entrantsResult.status === 'fulfilled' && entrantsResult.value) {
        const entrantsData = entrantsResult.value as { entrants: Entrant[] }
        if (entrantsData.entrants) {
          newData.entrants = entrantsData.entrants
          hasUpdates = true
        }
      }

      // Process pools data - API returns RacePoolData directly, not wrapped
      if (poolsResult.status === 'fulfilled' && poolsResult.value) {
        const poolsData = poolsResult.value as RacePoolData
        if (poolsData) {
          newData.pools = poolsData
          hasUpdates = true
        }
      }

      // Process money flow data
      if (moneyFlowResult.status === 'fulfilled' && moneyFlowResult.value) {
        const moneyFlowData = moneyFlowResult.value as { moneyFlow: MoneyFlowData[] }
        if (moneyFlowData.moneyFlow) {
          newData.moneyFlow = moneyFlowData.moneyFlow
          hasUpdates = true
        }
      }

      // Update data if there are changes
      if (hasUpdates) {
        setData(newData)
        lastPollDataRef.current = newData
        setDataFreshness('fresh')

        // Get current money flow trigger from cache (updated during caching if money flow was fetched)
        const currentCached = raceDataCache.getRaceData(config.raceId)
        const moneyFlowTrigger = currentCached?.moneyFlowUpdateTrigger || 0

        // Increment update trigger
        const newTrigger = coordinationState.updateTrigger + 1
        setCoordinationState(prev => ({
          ...prev,
          lastPollTime: new Date(),
          totalPolls: prev.totalPolls + 1,
          updateTrigger: newTrigger
        }))

        // Notify parent component with both general and money flow specific triggers
        if (config.onDataUpdate) {
          config.onDataUpdate({ ...newData, updateTrigger: moneyFlowTrigger })
        }
      }

      // Handle errors from any source with enhanced classification
      const allResults = [raceResult, entrantsResult, poolsResult, moneyFlowResult]
      const errors = allResults
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason)

      // Determine if we're in an active racing period that requires all data
      const timeToStart = calculateTimeToStart(config.raceStartTime)
      const raceStatus = config.raceStatus.toLowerCase()
      const isActiveRacePeriod = timeToStart <= 20 || ['closed', 'running', 'interim'].includes(raceStatus)

      // Classify errors by type - pools become critical during active race periods
      const criticalErrors = []
      const nonCriticalErrors = []

      if (raceResult.status === 'rejected') criticalErrors.push('race data')
      if (entrantsResult.status === 'rejected') criticalErrors.push('entrants data')

      // Pools are critical during active race periods for status updates
      if (poolsResult.status === 'rejected') {
        if (isActiveRacePeriod) {
          criticalErrors.push('pools data')
        } else {
          nonCriticalErrors.push('pools data')
        }
      }

      if (moneyFlowResult.status === 'rejected') nonCriticalErrors.push('money flow data')

      // Only report errors that aren't intentional aborts
      const reportableErrors = errors.filter(e =>
        !(e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted')))
      )

      if (reportableErrors.length > 0) {
        const errorDetails = {
          critical: criticalErrors,
          nonCritical: nonCriticalErrors,
          total: reportableErrors.length,
          isActiveRacePeriod,
          timeToStart: Math.round(timeToStart * 100) / 100
        }

        const combinedError = new Error(
          `Polling failed for ${reportableErrors.length} sources: ${reportableErrors.map(e => e.message).join(', ')}`
        )

        if (config.onError) {
          config.onError(combinedError)
        }

        // Only throw if critical data sources failed
        if (criticalErrors.length > 0) {
          logger.error('Critical polling sources failed', errorDetails)
          throw combinedError
        } else {
          logger.warn('Non-critical polling sources failed', errorDetails)
        }
      }

      // Validate polling coverage
      const endpointStatus = {
        race: raceResult.status,
        entrants: entrantsResult.status,
        pools: poolsResult.status,
        moneyFlow: moneyFlowResult.status
      }

      validatePollingCoverage(endpointStatus)

      // Log successful polling cycle with endpoint status
      logger.debug('Coordinated polling cycle completed', {
        raceId: config.raceId,
        hasUpdates,
        endpointStatus,
        isActiveRacePeriod,
        timeToStart: Math.round(timeToStart * 100) / 100
      })

    } catch (error) {
      const pollingError = error instanceof Error ? error : new Error('Unknown polling error')
      logger.error('Coordinated polling cycle failed', { error: pollingError.message })

      if (config.onError) {
        config.onError(pollingError)
      }
    } finally {
      recordPollingCycleComplete({ raceId: config.raceId, durationMs: Date.now() - cycleStart })
    }
  }, [
    config,
    coordinationState,
    data,
    fetchDataSource,
    logger,
    calculateTimeToStart,
    validatePollingCoverage
  ])

  /**
   * Schedule next polling cycle
   */
  const scheduleNextPoll = useCallback(() => {
    if (!mountedRef.current || !config.enabled) {
      return
    }

    if (coordinationState.isPaused && !backgroundPauseRef.current) {
      return
    }

    const timeToStart = calculateTimeToStart(config.raceStartTime)
    const baseInterval = calculatePollingInterval(timeToStart, config.raceStatus)

    if (baseInterval === 0) {
      logger.info('Race is final, stopping coordinated polling', {
        raceId: config.raceId,
        raceStatus: config.raceStatus
      })

      setCoordinationState(prev => ({
        ...prev,
        isActive: false
      }))
      markPollingActive(false)
      return
    }

    if (config.isDocumentHidden && config.inactiveSince && config.inactivePauseDurationMs) {
      const inactiveDuration = Date.now() - config.inactiveSince
      if (inactiveDuration >= config.inactivePauseDurationMs) {
        if (!backgroundPauseRef.current) {
          backgroundPauseRef.current = true
          logger.info('Background inactivity threshold reached, pausing coordinated polling', {
            raceId: config.raceId,
            inactiveDuration
          })
          setCoordinationState(prev => ({
            ...prev,
            isPaused: true
          }))
          markPollingActive(false)
        }
        return
      }
    } else if (backgroundPauseRef.current) {
      backgroundPauseRef.current = false
      if (coordinationState.isPaused) {
        setCoordinationState(prev => ({
          ...prev,
          isPaused: false
        }))
      }
      markPollingActive(true)
    }

    const backgroundMultiplier = config.backgroundMultiplier && config.backgroundMultiplier > 1
      ? config.backgroundMultiplier
      : 1

    const slowestAverage = getSlowestAverage()
    let adjustedInterval = baseInterval * backgroundMultiplier
    adjustedInterval = Math.min(adjustedInterval, baseInterval * MAX_DEGRADE_MULTIPLIER)

    if (slowestAverage > SLOW_RESPONSE_THRESHOLD_MS) {
      const slowMultiplier = Math.min(
        MAX_DEGRADE_MULTIPLIER,
        1 + (slowestAverage - SLOW_RESPONSE_THRESHOLD_MS) / SLOW_RESPONSE_THRESHOLD_MS
      )
      adjustedInterval = Math.min(adjustedInterval * slowMultiplier, baseInterval * MAX_DEGRADE_MULTIPLIER)
    }

    adjustedInterval = Math.max(adjustedInterval, MINIMUM_INTERVAL_MS)

    const jitterRange = adjustedInterval * JITTER_PERCENTAGE
    const jitterOffset = jitterRange > 0 ? (Math.random() * jitterRange * 2) - jitterRange : 0
    const intervalWithJitter = Math.max(MINIMUM_INTERVAL_MS, Math.round(adjustedInterval + jitterOffset))

    recordPollingSchedule({
      raceId: config.raceId,
      targetIntervalMs: baseInterval,
      scheduledIntervalMs: intervalWithJitter,
      jitterMs: Math.round(jitterOffset),
      backgroundMultiplier,
    })

    setCoordinationState(prev => ({
      ...prev,
      currentInterval: intervalWithJitter
    }))

    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }

    pollTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) {
        pollTimeoutRef.current = null
        return
      }

      if (backgroundPauseRef.current) {
        logger.debug('Skipping coordinated poll while background paused', {
          raceId: config.raceId
        })
        pollTimeoutRef.current = null
        return
      }

      const pollPromise = executeCoordinatedPoll()

      pollPromise
        .catch(error => {
          logger.error('Scheduled coordinated poll execution failed', { error })
        })
        .finally(() => {
          if (mountedRef.current) {
            scheduleNextPoll()
          }
        })
    }, intervalWithJitter)

    logger.debug('Next coordinated poll scheduled', {
      raceId: config.raceId,
      interval: intervalWithJitter,
      baseInterval,
      backgroundMultiplier,
      jitter: Math.round(jitterOffset),
      slowestAverage,
      timeToStart: Math.round(timeToStart * 100) / 100
    })
  }, [
    calculatePollingInterval,
    calculateTimeToStart,
    config,
    coordinationState.isPaused,
    executeCoordinatedPoll,
    getSlowestAverage,
    logger
  ])

  /**
   * Start coordinated polling
   */
  const startPolling = useCallback(() => {
    if (!config.enabled) {
      logger.warn('Cannot start polling - coordinator disabled')
      return
    }

    logger.info('Starting coordinated race polling', {
      raceId: config.raceId,
      raceStatus: config.raceStatus
    })

    markPollingActive(true)

    setCoordinationState(prev => ({
      ...prev,
      isActive: true,
      isPaused: false,
      isStopped: false
    }))

    scheduleNextPoll()

    // Start first poll immediately
    void executeCoordinatedPoll().catch(error => {
      logger.error('Initial coordinated poll execution failed', { error })
    })
  }, [config, executeCoordinatedPoll, scheduleNextPoll, logger])

  /**
   * Pause coordinated polling
   */
  const pausePolling = useCallback(() => {
    logger.debug('Pausing coordinated polling', { raceId: config.raceId })

    markPollingActive(false)

    setCoordinationState(prev => ({
      ...prev,
      isPaused: true
    }))

    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [config.raceId, logger])

  /**
   * Resume coordinated polling
   */
  const resumePolling = useCallback(() => {
    if (coordinationState.isStopped) {
      logger.warn('Cannot resume stopped polling, use startPolling instead')
      return
    }

    if (!coordinationState.isActive) {
      logger.warn('Cannot resume - use startPolling instead')
      return
    }

    logger.debug('Resuming coordinated polling', { raceId: config.raceId })

    markPollingActive(true)

    setCoordinationState(prev => ({
      ...prev,
      isPaused: false
    }))

    scheduleNextPoll()
  }, [config.raceId, coordinationState.isActive, coordinationState.isStopped, scheduleNextPoll, logger])

  /**
   * Stop coordinated polling
   */
  const stopPolling = useCallback(() => {
    logger.info('Stopping coordinated polling', {
      raceId: config.raceId,
      totalPolls: coordinationState.totalPolls
    })

    markPollingActive(false)

    setCoordinationState(prev => ({
      ...prev,
      isActive: false,
      isPaused: false,
      isStopped: true
    }))

    // Clear timeout
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }

    // Cancel all ongoing requests (these are intentional cleanup aborts)
    abortControllersRef.current.forEach(controller => {
      try {
        controller.abort()
      } catch {
        // Ignore abort errors during cleanup
      }
    })
    abortControllersRef.current.clear()
  }, [config.raceId, coordinationState.totalPolls, logger])

  /**
   * Force immediate update
   */
  const forceUpdate = useCallback(async (): Promise<void> => {
    logger.debug('Forcing immediate coordinated update', { raceId: config.raceId })

    try {
      await executeCoordinatedPoll()
    } catch (error) {
      // Re-throw error so calling code can handle it
      throw error
    }
  }, [config.raceId, executeCoordinatedPoll, logger])

  /**
   * Refresh specific data source
   */
  const refreshSource = useCallback(async (source: keyof RaceDataSources): Promise<void> => {
    logger.debug(`Refreshing ${source} data source`, { raceId: config.raceId })

    const endpoints = {
      race: '',
      entrants: '/entrants',
      pools: '/pools',
      moneyFlow: '/money-flow-timeline'
    }

    try {
      const result = await fetchDataSource(source, endpoints[source])
      if (result) {
        setData(prev => ({ ...prev, [source]: result }))
      }
    } catch (error) {
      logger.error(`Failed to refresh ${source}`, { error })
      throw error
    }
  }, [config.raceId, fetchDataSource, logger])

  // Cleanup on unmount
  useEffect(() => {
    const mountedRefCurrent = mountedRef
    const pollTimeoutRefCurrent = pollTimeoutRef
    const abortControllersRefCurrent = abortControllersRef

    return () => {
      mountedRefCurrent.current = false

      if (pollTimeoutRefCurrent.current) {
        clearTimeout(pollTimeoutRefCurrent.current)
      }

      // Use captured reference to avoid stale closure (intentional cleanup aborts)
      abortControllersRefCurrent.current.forEach(controller => {
        try {
          controller.abort()
        } catch {
          // Ignore abort errors during cleanup
        }
      })
      abortControllersRefCurrent.current.clear()

      markPollingActive(false)
    }
  }, [])

  // Auto-start polling is disabled to prevent infinite loops
  // Parent hook (useRacePolling) should call startPolling() when ready

  // Monitor race status for auto-termination
  useEffect(() => {
    const raceStatus = config.raceStatus.toLowerCase()

    if (['final', 'finalized', 'abandoned', 'cancelled'].includes(raceStatus) && coordinationState.isActive) {
      logger.info('Race completed, auto-stopping coordinated polling', {
        raceId: config.raceId,
        raceStatus
      })
      stopPolling()
    }
  }, [config.raceStatus, config.raceId, coordinationState.isActive, stopPolling, logger])

  return {
    data,
    coordinationState,
    errorState,
    dataFreshness,
    lastUpdateTrigger: coordinationState.updateTrigger,
    startPolling,
    pausePolling,
    resumePolling,
    stopPolling,
    forceUpdate,
    refreshSource,
  }
}