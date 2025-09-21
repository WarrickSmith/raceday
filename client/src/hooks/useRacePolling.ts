/**
 * Core Race Polling Hook - Task 1 Implementation
 *
 * Provides client-side polling infrastructure that follows 2x backend frequency requirements.
 * Replaces real-time subscriptions with predictable, controllable data update mechanism.
 *
 * Key Features:
 * - Dynamic intervals based on race timing and status (2x backend frequency)
 * - Coordinated fetching for all data sources
 * - Automatic termination when race status becomes 'final'
 * - Comprehensive error handling with exponential backoff
 * - Background tab optimization
 * - Integration with existing RaceContext architecture
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLogger } from '@/utils/logging'
import type { Race, Entrant } from '@/types/meetings'
import type { RacePoolData } from '@/types/racePools'

// Polling configuration interface as specified in Task 1
interface PollingConfig {
  raceId: string
  raceStartTime: string
  raceStatus: string
  initialData: RaceData
  onDataUpdate: (data: RaceData) => void
  onError: (error: Error) => void
}

// Combined race data interface for coordinated updates
interface RaceData {
  race: Race | null
  entrants: Entrant[]
  pools: RacePoolData | null
  moneyFlowUpdateTrigger: number
}

// Polling state management
interface PollingState {
  isActive: boolean
  isPaused: boolean
  isStopped: boolean
  currentInterval: number
  nextPollTime: number | null
  consecutiveErrors: number
  lastSuccessfulPoll: Date | null
  totalPolls: number
  backgroundOptimization: boolean
}

// Error handling state
interface ErrorState {
  lastError: Error | null
  retryAttempt: number
  circuitBreakerOpen: boolean
  backoffDelay: number
}

// Hook return interface
interface UseRacePollingResult {
  pollingState: PollingState
  errorState: ErrorState
  startPolling: () => void
  pausePolling: () => void
  resumePolling: () => void
  stopPolling: () => void
  forceUpdate: () => Promise<void>
}

/**
 * Core client-side polling hook implementing Task 1 requirements
 */
export function useRacePolling(config: PollingConfig): UseRacePollingResult {
  const logger = useLogger('useRacePolling')

  // Polling state management
  const [pollingState, setPollingState] = useState<PollingState>({
    isActive: false,
    isPaused: false,
    isStopped: false,
    currentInterval: 900000, // Default 15 minutes
    nextPollTime: null,
    consecutiveErrors: 0,
    lastSuccessfulPoll: null,
    totalPolls: 0,
    backgroundOptimization: false,
  })

  // Error handling state
  const [errorState, setErrorState] = useState<ErrorState>({
    lastError: null,
    retryAttempt: 0,
    circuitBreakerOpen: false,
    backoffDelay: 1000, // Start with 1 second
  })

  // Refs for cleanup and state management
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const lastPollDataRef = useRef<RaceData | null>(null)

  /**
   * Calculate client polling interval based on cadence table (2x backend frequency)
   * Enhanced for Task 2 with precise race status awareness and exact backend mapping
   */
  const calculateClientPollingInterval = useCallback((timeToStart: number, raceStatus: string): number => {
    const status = raceStatus.toLowerCase()

    // Stop polling immediately if race is final or abandoned
    if (['final', 'finalized', 'abandoned', 'cancelled'].includes(status)) {
      return 0
    }

    // Race status-based polling following backend logic exactly
    if (status === 'open') {
      // PHASE 1: Early Morning Baseline Collection (>65 minutes before race)
      if (timeToStart > 65) {
        return 900000 // 15 minutes (backend: 30m)
      }
      // PHASE 2: Enhanced Proximity Polling (≤65 minutes before race)
      else if (timeToStart > 60) {
        return 75000 // 75 seconds (backend: 2.5m) - transition period
      }
      else if (timeToStart > 20) {
        return 150000 // 2.5 minutes (backend: 5m) - extended active period
      }
      else if (timeToStart > 5) {
        return 75000 // 75 seconds (backend: 2.5m) - active period
      }
      else if (timeToStart > 3) {
        return 15000 // 15 seconds (backend: 30s) - pre-critical period
      }
      else if (timeToStart > 0) {
        return 15000 // 15 seconds (backend: 30s) - critical approach period
      }
      else {
        // Race start time passed but still Open status
        return 15000 // 15 seconds (backend: 30s) - post-start monitoring
      }
    }

    // Post-open status polling (race transitioning through states)
    if (status === 'closed' || status === 'running' || status === 'interim') {
      return 15000 // 15 seconds (backend: 30s) - transition monitoring
    }

    // Fallback for unknown statuses - use time-based logic with enhanced status awareness
    if (timeToStart > 65) {
      return 900000 // 15 minutes (backend: 30m) - early morning baseline
    } else if (timeToStart > 20) {
      return 150000 // 2.5 minutes (backend: 5m) - extended active period
    } else if (timeToStart > 5) {
      return 75000 // 75 seconds (backend: 2.5m) - active period
    } else {
      return 15000 // 15 seconds (backend: 30s) - critical period
    }
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
   * Add jitter to polling intervals to prevent thundering herd effects
   * Applies ±10% randomization while maintaining minimum critical intervals
   */
  const addJitterToInterval = useCallback((baseInterval: number): number => {
    // Don't add jitter to critical intervals (≤30 seconds) to maintain responsiveness
    if (baseInterval <= 30000) {
      return baseInterval
    }

    // Add ±10% jitter to longer intervals
    const jitterPercent = 0.1
    const jitterRange = baseInterval * jitterPercent
    const jitter = (Math.random() - 0.5) * 2 * jitterRange

    // Ensure minimum interval is maintained
    const jitteredInterval = Math.max(baseInterval + jitter, baseInterval * 0.9)

    return Math.round(jitteredInterval)
  }, [])

  /**
   * Detect network conditions and adjust polling accordingly
   */
  const getNetworkAdjustmentFactor = useCallback((): number => {
    // Use Navigator.connection if available (experimental)
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as unknown as { connection?: { effectiveType?: string } }).connection
      if (connection) {
        // Slow connections: reduce polling frequency by 1.5x
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
          return 1.5
        }
        // 3G connections: slight reduction
        if (connection.effectiveType === '3g') {
          return 1.2
        }
      }
    }

    // Default: no adjustment for good connections or unknown
    return 1.0
  }, [])

  /**
   * Coordinated data fetching for all race data sources
   * Implements staggered requests to prevent API overload
   */
  const fetchRaceData = useCallback(async (): Promise<RaceData> => {
    const { raceId } = config

    if (!raceId) {
      throw new Error('Race ID is required for polling')
    }

    // Create abort controller for request cancellation
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      // Staggered API calls with 100ms delays between requests
      const [raceResponse, entrantsResponse, poolsResponse, moneyFlowResponse] = await Promise.all([
        // Race data
        fetch(`/api/race/${raceId}`, {
          signal: abortController.signal,
          cache: 'no-cache'
        }),

        // Entrants data (staggered 100ms)
        new Promise<Response>(resolve =>
          setTimeout(() =>
            resolve(fetch(`/api/race/${raceId}/entrants`, {
              signal: abortController.signal,
              cache: 'no-cache'
            })), 100
          )
        ),

        // Pools data (staggered 200ms)
        new Promise<Response>(resolve =>
          setTimeout(() =>
            resolve(fetch(`/api/race/${raceId}/pools`, {
              signal: abortController.signal,
              cache: 'no-cache'
            })), 200
          )
        ),

        // Money flow timeline (staggered 300ms)
        new Promise<Response>(resolve =>
          setTimeout(() =>
            resolve(fetch(`/api/race/${raceId}/money-flow-timeline`, {
              signal: abortController.signal,
              cache: 'no-cache'
            })), 300
          )
        ),
      ])

      // Check all responses
      if (!raceResponse.ok) {
        throw new Error(`Race data fetch failed: ${raceResponse.statusText}`)
      }
      if (!entrantsResponse.ok) {
        throw new Error(`Entrants data fetch failed: ${entrantsResponse.statusText}`)
      }
      if (!poolsResponse.ok) {
        throw new Error(`Pools data fetch failed: ${poolsResponse.statusText}`)
      }
      if (!moneyFlowResponse.ok) {
        throw new Error(`Money flow data fetch failed: ${moneyFlowResponse.statusText}`)
      }

      // Parse response data
      const [raceData, entrantsData, poolsData] = await Promise.all([
        raceResponse.json(),
        entrantsResponse.json(),
        poolsResponse.json(),
        moneyFlowResponse.json(), // Trigger money flow update
      ])

      // Increment money flow update trigger
      const currentTrigger = lastPollDataRef.current?.moneyFlowUpdateTrigger || 0

      const combinedData: RaceData = {
        race: raceData.race || null,
        entrants: entrantsData.entrants || [],
        pools: poolsData.pools || null,
        moneyFlowUpdateTrigger: currentTrigger + 1,
      }

      lastPollDataRef.current = combinedData
      return combinedData

    } catch (error) {
      // Clear abort controller on error
      abortControllerRef.current = null

      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('Polling request was cancelled')
        throw new Error('Polling request cancelled')
      }

      throw error instanceof Error ? error : new Error('Unknown fetch error')
    }
  }, [config, logger])

  /**
   * Execute single polling cycle with error handling
   */
  const executePoll = useCallback(async (): Promise<void> => {
    if (!mountedRef.current || pollingState.isStopped || pollingState.isPaused) {
      return
    }

    // Check circuit breaker
    if (errorState.circuitBreakerOpen) {
      logger.debug('Circuit breaker open, skipping poll')
      return
    }

    logger.debug('Executing polling cycle', {
      raceId: config.raceId,
      currentInterval: pollingState.currentInterval,
      totalPolls: pollingState.totalPolls,
    })

    try {
      const data = await fetchRaceData()

      // Update polling state on success
      setPollingState(prev => ({
        ...prev,
        consecutiveErrors: 0,
        lastSuccessfulPoll: new Date(),
        totalPolls: prev.totalPolls + 1,
      }))

      // Clear error state on success
      setErrorState(prev => ({
        ...prev,
        lastError: null,
        retryAttempt: 0,
        circuitBreakerOpen: false,
        backoffDelay: 1000, // Reset backoff
      }))

      // Notify parent component of data update
      config.onDataUpdate(data)

      logger.debug('Polling cycle completed successfully', {
        raceId: config.raceId,
        totalPolls: pollingState.totalPolls + 1,
      })

    } catch (error) {
      const pollingError = error instanceof Error ? error : new Error('Unknown polling error')

      logger.error('Polling cycle failed', {
        raceId: config.raceId,
        error: pollingError.message,
        consecutiveErrors: pollingState.consecutiveErrors + 1,
      })

      // Update error state
      setErrorState(prev => {
        const newConsecutiveErrors = pollingState.consecutiveErrors + 1
        const shouldOpenCircuitBreaker = newConsecutiveErrors >= 5
        const newBackoffDelay = Math.min(prev.backoffDelay * 2, 30000) // Max 30 seconds

        return {
          lastError: pollingError,
          retryAttempt: prev.retryAttempt + 1,
          circuitBreakerOpen: shouldOpenCircuitBreaker,
          backoffDelay: newBackoffDelay,
        }
      })

      // Update polling state
      setPollingState(prev => ({
        ...prev,
        consecutiveErrors: prev.consecutiveErrors + 1,
      }))

      // Notify parent component of error
      config.onError(pollingError)
    }
  }, [config, pollingState, errorState, fetchRaceData, logger])

  /**
   * Schedule next polling cycle based on current race state with enhanced optimizations
   */
  const scheduleNextPoll = useCallback(() => {
    if (!mountedRef.current || pollingState.isStopped || pollingState.isPaused) {
      return
    }

    // Calculate current polling interval with enhanced race status awareness
    const timeToStart = calculateTimeToStart(config.raceStartTime)
    const baseInterval = calculateClientPollingInterval(timeToStart, config.raceStatus)

    // Stop polling immediately if interval is 0 (race is final/abandoned)
    if (baseInterval === 0) {
      logger.info('Race is final, stopping polling immediately', {
        raceId: config.raceId,
        raceStatus: config.raceStatus,
        timeToStart: Math.round(timeToStart * 100) / 100,
      })

      setPollingState(prev => ({
        ...prev,
        isActive: false,
        isStopped: true,
      }))
      return
    }

    // Apply network condition adjustments
    const networkFactor = getNetworkAdjustmentFactor()
    const networkAdjustedInterval = Math.round(baseInterval * networkFactor)

    // Apply advanced background optimization
    let optimizedInterval = networkAdjustedInterval
    if (pollingState.backgroundOptimization) {
      // More sophisticated background optimization:
      // - Critical periods (≤30s): extend by 1.5x instead of 2x
      // - Non-critical periods: extend by 2x
      const backgroundMultiplier = baseInterval <= 30000 ? 1.5 : 2.0
      optimizedInterval = Math.round(networkAdjustedInterval * backgroundMultiplier)
    }

    // Add jitter to prevent thundering herd effects
    const jitteredInterval = addJitterToInterval(optimizedInterval)

    // Apply exponential backoff if there are errors
    const finalInterval = errorState.circuitBreakerOpen
      ? Math.max(jitteredInterval, errorState.backoffDelay)
      : jitteredInterval

    // Update polling state with enhanced tracking
    setPollingState(prev => ({
      ...prev,
      currentInterval: baseInterval, // Store base interval for reference
      nextPollTime: Date.now() + finalInterval,
    }))

    // Clear existing timeout
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }

    // Schedule next poll
    pollTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        executePoll().then(() => {
          if (mountedRef.current) {
            scheduleNextPoll()
          }
        })
      }
    }, finalInterval)

    // Enhanced debugging information
    logger.debug('Next poll scheduled with enhanced optimizations', {
      raceId: config.raceId,
      raceStatus: config.raceStatus,
      timeToStart: Math.round(timeToStart * 100) / 100,
      intervals: {
        base: baseInterval,
        networkAdjusted: networkAdjustedInterval,
        backgroundOptimized: optimizedInterval,
        jittered: jitteredInterval,
        final: finalInterval,
      },
      optimizations: {
        backgroundActive: pollingState.backgroundOptimization,
        networkFactor,
        jitterApplied: jitteredInterval !== optimizedInterval,
        circuitBreakerOpen: errorState.circuitBreakerOpen,
      },
    })
  }, [
    config,
    pollingState,
    errorState,
    calculateTimeToStart,
    calculateClientPollingInterval,
    addJitterToInterval,
    getNetworkAdjustmentFactor,
    executePoll,
    logger,
  ])

  /**
   * Start polling (only after initial data load succeeds)
   */
  const startPolling = useCallback(() => {
    if (!config.initialData?.race) {
      logger.warn('Cannot start polling without initial race data')
      return
    }

    logger.info('Starting race polling', {
      raceId: config.raceId,
      raceStatus: config.raceStatus,
    })

    setPollingState(prev => ({
      ...prev,
      isActive: true,
      isPaused: false,
      isStopped: false,
    }))

    // Start first poll immediately
    executePoll().then(() => {
      if (mountedRef.current) {
        scheduleNextPoll()
      }
    })
  }, [config, executePoll, scheduleNextPoll, logger])

  /**
   * Pause polling (preserve state)
   */
  const pausePolling = useCallback(() => {
    logger.debug('Pausing race polling', { raceId: config.raceId })

    setPollingState(prev => ({
      ...prev,
      isPaused: true,
    }))

    // Clear timeout but don't stop completely
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [config.raceId, logger])

  /**
   * Resume polling from paused state
   */
  const resumePolling = useCallback(() => {
    if (pollingState.isStopped) {
      logger.warn('Cannot resume stopped polling, use startPolling instead')
      return
    }

    logger.debug('Resuming race polling', { raceId: config.raceId })

    setPollingState(prev => ({
      ...prev,
      isPaused: false,
    }))

    scheduleNextPoll()
  }, [config.raceId, pollingState.isStopped, scheduleNextPoll, logger])

  /**
   * Stop polling completely (requires restart)
   */
  const stopPolling = useCallback(() => {
    logger.info('Stopping race polling', {
      raceId: config.raceId,
      totalPolls: pollingState.totalPolls,
    })

    setPollingState(prev => ({
      ...prev,
      isActive: false,
      isPaused: false,
      isStopped: true,
    }))

    // Clear timeout
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }

    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [config.raceId, pollingState.totalPolls, logger])

  /**
   * Force immediate update (bypass interval)
   */
  const forceUpdate = useCallback(async (): Promise<void> => {
    logger.debug('Forcing immediate poll update', { raceId: config.raceId })

    try {
      await executePoll()
    } catch (error) {
      logger.error('Force update failed', { error })
      throw error
    }
  }, [config.raceId, executePoll, logger])

  // Enhanced background tab detection and battery-conscious optimization
  useEffect(() => {
    let backgroundTimer: NodeJS.Timeout | null = null

    const handleVisibilityChange = () => {
      const isBackground = document.hidden

      // Clear any existing background timer
      if (backgroundTimer) {
        clearTimeout(backgroundTimer)
        backgroundTimer = null
      }

      setPollingState(prev => ({
        ...prev,
        backgroundOptimization: isBackground,
      }))

      if (isBackground) {
        logger.debug('Tab backgrounded, applying enhanced battery-conscious optimization')

        // Extended background optimization: pause polling completely after 5 minutes
        backgroundTimer = setTimeout(() => {
          if (document.hidden && mountedRef.current) {
            logger.debug('Extended background detected, pausing polling for battery conservation')
            pausePolling()
          }
        }, 5 * 60 * 1000) // 5 minutes
      } else {
        logger.debug('Tab foregrounded, resuming optimized polling with immediate update')

        // Resume polling if it was paused due to extended background time
        if (pollingState.isPaused && !pollingState.isStopped) {
          logger.debug('Resuming polling from background pause')
          resumePolling()
        }

        // Force immediate update when returning to foreground for data freshness
        if (pollingState.isActive && !pollingState.isPaused) {
          forceUpdate().catch(error => {
            logger.error('Failed to update on foreground', { error })
          })
        }
      }
    }

    // Check for battery API and adjust behavior on mobile devices
    const handleBatteryOptimization = () => {
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        const getBattery = (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery
        if (getBattery) {
          getBattery().then((battery) => {
            if (battery.level < 0.2 && !battery.charging) {
              logger.debug('Low battery detected, applying conservative polling')
              // Could further extend intervals in low battery situations
            }
          }).catch(() => {
            // Battery API not available or failed, continue normal operation
          })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    handleBatteryOptimization() // Check battery status on initialization

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (backgroundTimer) {
        clearTimeout(backgroundTimer)
      }
    }
  }, [pollingState.isActive, pollingState.isPaused, pollingState.isStopped, forceUpdate, pausePolling, resumePolling, logger])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false

      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Auto-start polling if initial data is available
  useEffect(() => {
    if (config.initialData?.race && !pollingState.isActive && !pollingState.isStopped) {
      startPolling()
    }
  }, [config.initialData, pollingState.isActive, pollingState.isStopped, startPolling])

  // Monitor race status changes for auto-termination
  useEffect(() => {
    const raceStatus = config.raceStatus.toLowerCase()

    if (['final', 'finalized', 'abandoned', 'cancelled'].includes(raceStatus) && pollingState.isActive) {
      logger.info('Race completed, auto-stopping polling', {
        raceId: config.raceId,
        raceStatus,
      })
      stopPolling()
    }
  }, [config.raceStatus, config.raceId, pollingState.isActive, stopPolling, logger])

  return {
    pollingState,
    errorState,
    startPolling,
    pausePolling,
    resumePolling,
    stopPolling,
    forceUpdate,
  }
}