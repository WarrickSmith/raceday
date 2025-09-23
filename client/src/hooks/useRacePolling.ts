/**
 * Core Race Polling Hook - Task 1, 3 & 4 Implementation
 *
 * Provides client-side polling infrastructure that follows 2x backend frequency requirements.
 * Replaces real-time subscriptions with predictable, controllable data update mechanism.
 * Now uses the coordinated polling system from Task 4 for improved data consistency.
 *
 * Key Features:
 * - Dynamic intervals based on race timing and status (2x backend frequency)
 * - Coordinated fetching for all data sources via useCoordinatedRacePolling (Task 4)
 * - Automatic termination when race status becomes 'final'
 * - Comprehensive error handling with exponential backoff (Task 3)
 * - Circuit breaker pattern for resilience (Task 3)
 * - Fallback to cached data during failures (Task 3)
 * - Background tab optimization
 * - Integration with existing RaceContext architecture
 */

'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useLogger } from '@/utils/logging'
import { raceDataCache, type DataFreshness, type CachedRaceData } from '@/utils/pollingCache'
import { useCoordinatedRacePolling } from './useCoordinatedRacePolling'
import type { Race, Entrant } from '@/types/meetings'
import type { RacePoolData } from '@/types/racePools'
import { getPollingEnvironmentConfig } from '@/utils/environment'

const POLLING_ENVIRONMENT = getPollingEnvironmentConfig()
const INACTIVE_PAUSE_THRESHOLD_MS = 5 * 60 * 1000

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

// Enhanced error handling state with Task 3 features
interface ErrorState {
  lastError: Error | null
  errorClassification: string | null
  retryAttempt: number
  circuitBreakerOpen: boolean
  backoffDelay: number
  canUseFallback: boolean
  dataFreshness: DataFreshness
}

// Hook return interface with Task 3 enhancements
interface UseRacePollingResult {
  pollingState: PollingState
  errorState: ErrorState
  startPolling: () => void
  pausePolling: () => void
  resumePolling: () => void
  stopPolling: () => void
  forceUpdate: () => Promise<void>
  getFallbackData: () => CachedRaceData | null
  getDataFreshness: () => DataFreshness
}

/**
 * Core client-side polling hook implementing Task 1, 3 & 4 requirements
 * Now delegates coordination to useCoordinatedRacePolling for better data consistency
 */
export function useRacePolling(config: PollingConfig): UseRacePollingResult {
  const logger = useLogger('useRacePolling')

  // Background optimization state (UI-specific)
  const [backgroundOptimization, setBackgroundOptimization] = useState(
    () => (typeof document !== 'undefined' ? document.hidden : false)
  )
  const [backgroundSince, setBackgroundSince] = useState<number | null>(() =>
    typeof document !== 'undefined' && document.hidden ? Date.now() : null
  )
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const backgroundPauseRef = useRef(false)

  // Use coordinated polling for data fetching (Task 4)
  const coordinatedPolling = useCoordinatedRacePolling({
    raceId: config.raceId,
    raceStartTime: config.raceStartTime,
    raceStatus: config.raceStatus,
    enabled: POLLING_ENVIRONMENT.enabled,
    backgroundMultiplier: backgroundOptimization
      ? POLLING_ENVIRONMENT.backgroundMultiplier
      : 1,
    debugMode: POLLING_ENVIRONMENT.debugMode,
    requestTimeoutMs: POLLING_ENVIRONMENT.requestTimeoutMs,
    maxRetries: POLLING_ENVIRONMENT.maxRetries,
    isDocumentHidden: backgroundOptimization,
    inactiveSince: backgroundSince,
    inactivePauseDurationMs: INACTIVE_PAUSE_THRESHOLD_MS,
    onDataUpdate: (data) => {
      // Convert coordinated data to legacy format
      const legacyData: RaceData = {
        race: data.race,
        entrants: data.entrants,
        pools: data.pools,
        moneyFlowUpdateTrigger: data.updateTrigger
      }
      config.onDataUpdate(legacyData)
    },
    onError: config.onError
  })

  const {
    coordinationState: coordinatorState,
    errorState: coordinatorErrorState,
    dataFreshness,
    pausePolling: pauseCoordinatedPolling,
    resumePolling: resumeCoordinatedPolling
  } = coordinatedPolling

  // Convert coordinated polling state to legacy format
  const pollingState: PollingState = {
    isActive: coordinatorState.isActive,
    isPaused: coordinatorState.isPaused,
    isStopped: coordinatorState.isStopped,
    currentInterval: coordinatorState.currentInterval,
    nextPollTime: coordinatorState.lastPollTime
      ? coordinatorState.lastPollTime.getTime() + coordinatorState.currentInterval
      : null,
    consecutiveErrors: coordinatorState.failedSources.size,
    lastSuccessfulPoll: coordinatorState.lastPollTime,
    totalPolls: coordinatorState.totalPolls,
    backgroundOptimization: backgroundOptimization,
  }

  // Convert coordinator error state to legacy format
  const errorState: ErrorState = {
    lastError: Object.values(coordinatorErrorState)[0]?.lastError || null,
    errorClassification: null, // Simplified for legacy compatibility
    retryAttempt: Math.max(...Object.values(coordinatorErrorState).map(s => s.errorCount), 0),
    circuitBreakerOpen: coordinatorState.failedSources.size > 3,
    backoffDelay: 1000,
    canUseFallback: Object.values(coordinatorErrorState).some(s => s.canUseFallback),
    dataFreshness,
  }

  // Delegate polling control to coordinator

  // Data fetching is now handled by useCoordinatedRacePolling

  // Polling execution is now handled by useCoordinatedRacePolling

  // Delegate all polling control to coordinator
  const startPolling = useCallback(() => {
    if (!config.initialData?.race) {
      logger.warn('Cannot start polling without initial race data')
      return
    }
    coordinatedPolling.startPolling()
  }, [config.initialData, coordinatedPolling, logger])

  const pausePolling = useCallback(() => {
    coordinatedPolling.pausePolling()
  }, [coordinatedPolling])

  const resumePolling = useCallback(() => {
    coordinatedPolling.resumePolling()
  }, [coordinatedPolling])

  const stopPolling = useCallback(() => {
    coordinatedPolling.stopPolling()
  }, [coordinatedPolling])

  const forceUpdate = useCallback(async (): Promise<void> => {
    try {
      return await coordinatedPolling.forceUpdate()
    } catch (error) {
      config.onError(error as Error)
      throw error
    }
  }, [coordinatedPolling, config])

  // Background tab detection for battery optimization
  useEffect(() => {
    const pauseForInactivity = () => {
      if (!backgroundPauseRef.current) {
        backgroundPauseRef.current = true
        logger.info('Pausing polling after prolonged background inactivity')
        if (coordinatorState.isActive) {
          pauseCoordinatedPolling()
        }
      }
    }

    const handleVisibilityChange = () => {
      const isBackground = document.hidden
      setBackgroundOptimization(isBackground)

      if (isBackground) {
        setBackgroundSince(previous => (previous ?? Date.now()))
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current)
        }
        inactivityTimeoutRef.current = setTimeout(pauseForInactivity, INACTIVE_PAUSE_THRESHOLD_MS)
        logger.debug('Tab backgrounded, applying battery-conscious optimization')
      } else {
        setBackgroundSince(null)
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current)
          inactivityTimeoutRef.current = null
        }

        if (backgroundPauseRef.current) {
          backgroundPauseRef.current = false
          if (coordinatorState.isActive && coordinatorState.isPaused) {
            resumeCoordinatedPolling()
          }
        }

        logger.debug('Tab foregrounded, resuming normal polling')
      }
    }

    handleVisibilityChange()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
        inactivityTimeoutRef.current = null
      }
    }
  }, [
    coordinatorState.isActive,
    coordinatorState.isPaused,
    pauseCoordinatedPolling,
    resumeCoordinatedPolling,
    logger
  ])

  // Auto-start polling if initial data is available
  const hasStartedRef = useRef(false)
  useEffect(() => {
    logger.debug('Auto-start polling effect triggered', {
      raceId: config.raceId,
      hasRace: !!config.initialData?.race,
      isActive: coordinatorState.isActive,
      isStopped: coordinatorState.isStopped,
      hasStarted: hasStartedRef.current,
      willStart: !!(config.initialData?.race && !coordinatorState.isActive && !coordinatorState.isStopped && !hasStartedRef.current)
    })

    if (config.initialData?.race && !coordinatorState.isActive && !coordinatorState.isStopped && !hasStartedRef.current) {
      hasStartedRef.current = true
      logger.info('Auto-starting coordinated polling with initial data', {
        raceId: config.raceId,
        hasRace: !!config.initialData?.race,
        raceStatus: config.raceStatus
      })
      startPolling()
    }
  }, [config.initialData?.race, coordinatorState.isActive, coordinatorState.isStopped, startPolling, config.raceId, config.raceStatus, logger])

  /**
   * Get fallback data from cache (Task 3)
   */
  const getFallbackData = useCallback((): CachedRaceData | null => {
    return raceDataCache.getRaceData(config.raceId)
  }, [config.raceId])

  /**
   * Get current data freshness level (Task 3) - delegated to coordinator
   */
  const getDataFreshness = useCallback((): DataFreshness => {
    return dataFreshness
  }, [dataFreshness])

  return {
    pollingState,
    errorState,
    startPolling,
    pausePolling,
    resumePolling,
    stopPolling,
    forceUpdate,
    getFallbackData,
    getDataFreshness,
  }
}