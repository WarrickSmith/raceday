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
  onDataUpdate?: (data: RaceDataSources & { updateTrigger: number }) => void
  onError?: (error: Error, source?: string) => void
}

// Polling coordination state
interface CoordinationState {
  isActive: boolean
  isPaused: boolean
  isStopped: boolean
  currentInterval: number
  lastPollTime: Date | null
  successfulSources: Set<string>
  failedSources: Set<string>
  requestsInFlight: Set<string>
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

  // Coordination state management
  const [coordinationState, setCoordinationState] = useState<CoordinationState>({
    isActive: false,
    isPaused: false,
    isStopped: false,
    currentInterval: 900000, // Default 15 minutes
    lastPollTime: null,
    successfulSources: new Set(),
    failedSources: new Set(),
    requestsInFlight: new Set(),
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
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const mountedRef = useRef(true)
  const lastPollDataRef = useRef<RaceDataSources | null>(null)

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

  /**
   * Get cached headers for conditional requests
   */
  const getCachedHeaders = useCallback((): Record<string, string> => {
    // TODO: Implement ETag support in cache system
    return {}
  }, [])

  /**
   * Get cached data for a source
   */
  const getCachedData = useCallback((source: string, raceId: string): unknown => {
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
        return { moneyFlow: [] } // Money flow needs special handling
      default:
        return null
    }
  }, [])

  /**
   * Cache response data with optional ETag
   */
  const cacheResponseData = useCallback((
    source: string,
    raceId: string,
    data: unknown
  ): void => {
    // Update race data cache based on source
    const currentCached = raceDataCache.getRaceData(raceId)

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
    }

    // TODO: Store ETag when cache system supports it
  }, [])

  /**
   * Fetch data from a specific source with error handling
   */
  const fetchDataSource = useCallback(async (
    source: string,
    endpoint: string,
    delay: number = 0
  ): Promise<unknown> => {
    const { raceId } = config

    // Check if request is already in flight
    if (coordinationState.requestsInFlight.has(source)) {
      logger.debug(`Request for ${source} already in flight, skipping`)
      return null
    }

    // Mark request as in flight
    setCoordinationState(prev => ({
      ...prev,
      requestsInFlight: new Set([...prev.requestsInFlight, source])
    }))

    try {
      // Apply staggered delay
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Create abort controller for this request
      const abortController = new AbortController()
      abortControllersRef.current.set(source, abortController)

      // Build URL with required parameters for money-flow endpoint
      let requestUrl = `/api/race/${raceId}${endpoint}`

      // Money flow endpoint requires entrants parameter
      if (source === 'money-flow' && endpoint.includes('money-flow-timeline')) {
        // Get current entrants from data or cache
        const currentEntrants = data.entrants?.length > 0
          ? data.entrants
          : raceDataCache.getRaceData(raceId)?.entrants || []

        if (currentEntrants.length > 0) {
          const entrantIds = currentEntrants.map(e => e.entrantId || e.$id).filter(Boolean)
          if (entrantIds.length > 0) {
            const entrantsParam = entrantIds.join(',')
            requestUrl += `?entrants=${encodeURIComponent(entrantsParam)}`
            logger.debug(`${source} request with ${entrantIds.length} entrants`)
          } else {
            logger.warn(`${source} request skipped - no valid entrant IDs found`)
            return null
          }
        } else {
          logger.warn(`${source} request skipped - no entrants available`)
          return null
        }
      }

      // Fetch with caching headers for optimization
      const response = await fetch(requestUrl, {
        signal: abortController.signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          // Add conditional request headers if we have cached data
          ...getCachedHeaders()
        }
      })

      if (!response.ok) {
        throw new Error(`${source} fetch failed: ${response.statusText}`)
      }

      // Check if response is 304 Not Modified
      if (response.status === 304) {
        logger.debug(`${source} data not modified, using cached version`)
        return getCachedData(source, raceId)
      }

      const responseData = await response.json()

      // Cache successful response
      cacheResponseData(source, raceId, responseData)

      // Update success tracking
      setCoordinationState(prev => ({
        ...prev,
        successfulSources: new Set([...prev.successfulSources, source]),
        failedSources: new Set([...prev.failedSources].filter(s => s !== source))
      }))

      // Clear error state for this source
      setErrorState(prev => ({
        ...prev,
        [source]: {
          lastError: null,
          errorCount: 0,
          lastSuccessTime: new Date(),
          canUseFallback: true
        }
      }))

      return responseData

    } catch (error) {
      const fetchError = error instanceof Error ? error : new Error(`Unknown error in ${source}`)

      // Classify error types to handle abort signals appropriately
      const isAbortError = fetchError.name === 'AbortError' || fetchError.message.includes('aborted')
      const isIntentionalAbort = abortControllersRef.current.has(source) && isAbortError

      // Don't log or track intentional aborts as errors
      if (isIntentionalAbort) {
        logger.debug(`${source} request intentionally aborted during cleanup`)
        return null
      }

      // Update error tracking for genuine errors
      setCoordinationState(prev => ({
        ...prev,
        failedSources: new Set([...prev.failedSources, source]),
        successfulSources: new Set([...prev.successfulSources].filter(s => s !== source))
      }))

      // Update error state with enhanced classification
      setErrorState(prev => ({
        ...prev,
        [source]: {
          lastError: fetchError,
          errorCount: (prev[source]?.errorCount || 0) + 1,
          lastSuccessTime: prev[source]?.lastSuccessTime || null,
          canUseFallback: raceDataCache.canUseFallback(`${source}:${raceId}`)
        }
      }))

      // Enhanced error logging with context
      if (isAbortError) {
        logger.warn(`${source} fetch aborted unexpectedly`, {
          error: fetchError.message,
          hasAbortController: abortControllersRef.current.has(source)
        })
      } else {
        logger.error(`${source} fetch failed`, { error: fetchError.message })
      }

      // Try to use fallback data for non-abort errors
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
      // Clear request tracking
      setCoordinationState(prev => ({
        ...prev,
        requestsInFlight: new Set([...prev.requestsInFlight].filter(s => s !== source))
      }))

      // Clean up abort controller
      abortControllersRef.current.delete(source)
    }
  }, [config, coordinationState.requestsInFlight, data.entrants, getCachedData, cacheResponseData, getCachedHeaders, logger])

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

    try {
      // Phase 1: Fetch core race and entrants data first (they're dependencies for money-flow)
      const [raceResult, entrantsResult] = await Promise.allSettled([
        fetchDataSource('race', '', 0),           // Immediate
        fetchDataSource('entrants', '/entrants', 100),     // 100ms delay
      ])

      // Phase 2: Fetch pools and money-flow after core data is available
      const [poolsResult, moneyFlowResult] = await Promise.allSettled([
        fetchDataSource('pools', '/pools', 200),           // 200ms delay
        fetchDataSource('money-flow', '/money-flow-timeline', 300) // 300ms delay - requires entrants
      ])

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

        // Increment update trigger
        const newTrigger = coordinationState.updateTrigger + 1
        setCoordinationState(prev => ({
          ...prev,
          lastPollTime: new Date(),
          totalPolls: prev.totalPolls + 1,
          updateTrigger: newTrigger
        }))

        // Notify parent component
        if (config.onDataUpdate) {
          config.onDataUpdate({ ...newData, updateTrigger: newTrigger })
        }
      }

      // Handle errors from any source with enhanced classification
      const allResults = [raceResult, entrantsResult, poolsResult, moneyFlowResult]
      const errors = allResults
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason)

      // Classify errors by type for better reporting
      const criticalErrors = []
      const nonCriticalErrors = []

      if (raceResult.status === 'rejected') criticalErrors.push('race data')
      if (entrantsResult.status === 'rejected') criticalErrors.push('entrants data')
      if (poolsResult.status === 'rejected') nonCriticalErrors.push('pools data')
      if (moneyFlowResult.status === 'rejected') nonCriticalErrors.push('money-flow data')

      // Only report errors that aren't intentional aborts
      const reportableErrors = errors.filter(e =>
        !(e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted')))
      )

      if (reportableErrors.length > 0) {
        const errorDetails = {
          critical: criticalErrors,
          nonCritical: nonCriticalErrors,
          total: reportableErrors.length
        }

        const combinedError = new Error(
          `Polling failed for ${reportableErrors.length} sources: ${reportableErrors.map(e => e.message).join(', ')}`
        )

        if (config.onError) {
          config.onError(combinedError)
        }

        // Only throw if critical data sources (race, entrants) failed
        if (criticalErrors.length > 0) {
          logger.error('Critical polling sources failed', errorDetails)
          throw combinedError
        } else {
          logger.warn('Non-critical polling sources failed', errorDetails)
        }
      }

    } catch (error) {
      const pollingError = error instanceof Error ? error : new Error('Unknown polling error')
      logger.error('Coordinated polling cycle failed', { error: pollingError.message })

      if (config.onError) {
        config.onError(pollingError)
      }
    }
  }, [
    config,
    coordinationState,
    data,
    fetchDataSource,
    logger
  ])

  /**
   * Schedule next polling cycle
   */
  const scheduleNextPoll = useCallback(() => {
    if (!mountedRef.current || coordinationState.isPaused || !config.enabled) {
      return
    }

    // Calculate current polling interval
    const timeToStart = calculateTimeToStart(config.raceStartTime)
    const interval = calculatePollingInterval(timeToStart, config.raceStatus)

    // Stop polling if interval is 0 (race is final)
    if (interval === 0) {
      logger.info('Race is final, stopping coordinated polling', {
        raceId: config.raceId,
        raceStatus: config.raceStatus
      })

      setCoordinationState(prev => ({
        ...prev,
        isActive: false
      }))
      return
    }

    // Update state with new interval
    setCoordinationState(prev => ({
      ...prev,
      currentInterval: interval
    }))

    // Clear existing timeout
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }

    // Schedule next poll
    pollTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        executeCoordinatedPoll().then(() => {
          if (mountedRef.current) {
            scheduleNextPoll()
          }
        })
      }
    }, interval)

    logger.debug('Next coordinated poll scheduled', {
      raceId: config.raceId,
      interval,
      timeToStart: Math.round(timeToStart * 100) / 100
    })
  }, [
    config,
    coordinationState,
    calculateTimeToStart,
    calculatePollingInterval,
    executeCoordinatedPoll,
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

    setCoordinationState(prev => ({
      ...prev,
      isActive: true,
      isPaused: false,
      isStopped: false
    }))

    // Start first poll immediately
    executeCoordinatedPoll().then(() => {
      if (mountedRef.current) {
        scheduleNextPoll()
      }
    })
  }, [config, executeCoordinatedPoll, scheduleNextPoll, logger])

  /**
   * Pause coordinated polling
   */
  const pausePolling = useCallback(() => {
    logger.debug('Pausing coordinated polling', { raceId: config.raceId })

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

    // Cancel all ongoing requests
    abortControllersRef.current.forEach(controller => controller.abort())
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

      // Use captured reference to avoid stale closure
      abortControllersRefCurrent.current.forEach(controller => controller.abort())
      abortControllersRefCurrent.current.clear()
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