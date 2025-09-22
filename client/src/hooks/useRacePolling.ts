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
  const [backgroundOptimization, setBackgroundOptimization] = useState(false)

  // Use coordinated polling for data fetching (Task 4)
  const coordinatedPolling = useCoordinatedRacePolling({
    raceId: config.raceId,
    raceStartTime: config.raceStartTime,
    raceStatus: config.raceStatus,
    enabled: true,
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

  // Convert coordinated polling state to legacy format
  const pollingState: PollingState = {
    isActive: coordinatedPolling.coordinationState.isActive,
    isPaused: coordinatedPolling.coordinationState.isPaused,
    isStopped: coordinatedPolling.coordinationState.isStopped,
    currentInterval: coordinatedPolling.coordinationState.currentInterval,
    nextPollTime: coordinatedPolling.coordinationState.lastPollTime
      ? coordinatedPolling.coordinationState.lastPollTime.getTime() + coordinatedPolling.coordinationState.currentInterval
      : null,
    consecutiveErrors: coordinatedPolling.coordinationState.failedSources.size,
    lastSuccessfulPoll: coordinatedPolling.coordinationState.lastPollTime,
    totalPolls: coordinatedPolling.coordinationState.totalPolls,
    backgroundOptimization: backgroundOptimization,
  }

  // Convert coordinator error state to legacy format
  const errorState: ErrorState = {
    lastError: Object.values(coordinatedPolling.errorState)[0]?.lastError || null,
    errorClassification: null, // Simplified for legacy compatibility
    retryAttempt: Math.max(...Object.values(coordinatedPolling.errorState).map(s => s.errorCount), 0),
    circuitBreakerOpen: coordinatedPolling.coordinationState.failedSources.size > 3,
    backoffDelay: 1000,
    canUseFallback: Object.values(coordinatedPolling.errorState).some(s => s.canUseFallback),
    dataFreshness: coordinatedPolling.dataFreshness,
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
    const handleVisibilityChange = () => {
      const isBackground = document.hidden
      setBackgroundOptimization(isBackground)

      if (isBackground) {
        logger.debug('Tab backgrounded, applying battery-conscious optimization')
        // Coordinator handles the actual polling frequency changes
      } else {
        logger.debug('Tab foregrounded, resuming normal polling')
        // Coordinator handles the actual polling frequency changes
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [logger])

  // Auto-start polling if initial data is available
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (config.initialData?.race && !pollingState.isActive && !pollingState.isStopped && !hasStartedRef.current) {
      hasStartedRef.current = true
      startPolling()
    }
  }, [config.initialData?.race, pollingState.isActive, pollingState.isStopped, startPolling])

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
    return coordinatedPolling.dataFreshness
  }, [coordinatedPolling.dataFreshness])

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