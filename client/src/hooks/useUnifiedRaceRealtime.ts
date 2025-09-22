'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLogger } from '@/utils/logging'
import {
  getPollingMetricsSnapshot,
  type PollingAlert,
  type PollingScheduleMetrics,
} from '@/utils/pollingMetrics'
import type {
  Race,
  Entrant,
  Meeting,
  RaceNavigationData,
} from '@/types/meetings'
import type {
  RacePoolData,
  RaceResultsData,
  RaceResult,
  PoolDividend,
  FixedOddsRunner,
} from '@/types/racePools'
import type { DataFreshness } from '@/utils/pollingCache'
import { useRacePolling } from './useRacePolling'

interface UseUnifiedRaceRealtimeProps {
  raceId: string
  initialRace?: Race | null
  initialEntrants?: Entrant[]
  initialMeeting?: Meeting | null
  initialNavigationData?: RaceNavigationData | null
  cleanupSignal?: number
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'

export interface ConnectionHealthSnapshot {
  isHealthy: boolean
  avgLatency: number | null
  uptime: number
  totalUpdates: number
  totalRequests: number
  totalErrors: number
  errorRate: number
  schedule: PollingScheduleMetrics
  alerts: PollingAlert[]
}

interface UnifiedRaceRealtimeState {
  race: Race | null
  raceDocumentId: string | null
  raceResultsDocumentId: string | null
  entrants: Entrant[]
  meeting: Meeting | null
  navigationData: RaceNavigationData | null
  poolData: RacePoolData | null
  resultsData: RaceResultsData | null
  connectionState: ConnectionState
  isConnected: boolean
  connectionAttempts: number
  lastUpdate: Date | null
  updateLatency: number
  totalUpdates: number
  isInitialFetchComplete: boolean
  lastRaceUpdate: Date | null
  lastPoolUpdate: Date | null
  lastResultsUpdate: Date | null
  lastEntrantsUpdate: Date | null
  moneyFlowUpdateTrigger: number
}

interface UnifiedRaceRealtimeActions {
  reconnect: () => void
  clearHistory: () => void
  refetch: () => Promise<void>
  getConnectionHealth: () => ConnectionHealthSnapshot
}

type CoordinatedUpdatePayload = {
  race: Race | null
  entrants: Entrant[]
  pools: RacePoolData | null
  moneyFlowUpdateTrigger: number
}

const MAX_LATENCY_SAMPLES = 20

const isResultsStatus = (status?: string | null): status is 'interim' | 'final' | 'protest' =>
  status === 'interim' || status === 'final' || status === 'protest'

const parseJsonValue = <T,>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) {
    return fallback
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  return value as T
}

const createResultsData = (race: Race | null): RaceResultsData | null => {
  if (!race || !race.resultsAvailable || !race.resultsData) {
    return null
  }

  const results = parseJsonValue<RaceResult[]>(race.resultsData, [])
  const dividends = parseJsonValue<PoolDividend[]>(race.dividendsData, [])
  const rawFixedOdds = parseJsonValue<Record<string, FixedOddsRunner | undefined>>(
    race.fixedOddsData,
    {}
  )
  const fixedOdds: Record<string, FixedOddsRunner> = Object.entries(rawFixedOdds).reduce(
    (accumulator, [key, value]) => {
      if (value) {
        accumulator[key] = value
      }
      return accumulator
    },
    {} as Record<string, FixedOddsRunner>
  )

  const status = isResultsStatus(race.resultStatus) ? race.resultStatus : 'interim'

  return {
    raceId: race.raceId,
    status,
    results,
    dividends,
    fixedOddsData: fixedOdds,
    photoFinish: Boolean(race.photoFinish),
    stewardsInquiry: Boolean(race.stewardsInquiry),
    protestLodged: Boolean(race.protestLodged),
    resultTime: race.resultTime ?? new Date().toISOString(),
  }
}

const getLatestEntrantUpdate = (entrants: Entrant[]): Date | null => {
  if (entrants.length === 0) {
    return null
  }

  const mostRecent = entrants.reduce<Date | null>((latest, entrant) => {
    const timestamp = entrant.$updatedAt ? new Date(entrant.$updatedAt) : null
    if (!latest) {
      return timestamp
    }
    if (timestamp && timestamp > latest) {
      return timestamp
    }
    return latest
  }, null)

  return mostRecent
}

export function useUnifiedRaceRealtime({
  raceId,
  initialRace = null,
  initialEntrants = [],
  initialMeeting = null,
  initialNavigationData = null,
  cleanupSignal = 0,
}: UseUnifiedRaceRealtimeProps): UnifiedRaceRealtimeState &
  UnifiedRaceRealtimeActions & { isLoading: boolean; error: Error | null; dataFreshness: DataFreshness } {
  const logger = useLogger('useUnifiedRaceRealtime')

  const initialResults = useMemo(() => createResultsData(initialRace), [initialRace])

  const [state, setState] = useState<UnifiedRaceRealtimeState>(() => {
    const initialEntrantsUpdate = getLatestEntrantUpdate(initialEntrants)
    const initialRaceUpdate = initialRace?.$updatedAt ? new Date(initialRace.$updatedAt) : null
    const initialResultsUpdate = initialResults?.resultTime
      ? new Date(initialResults.resultTime)
      : null

    return {
      race: initialRace,
      raceDocumentId: initialRace?.$id ?? null,
      raceResultsDocumentId: null,
      entrants: initialEntrants,
      meeting: initialMeeting,
      navigationData: initialNavigationData,
      poolData: null,
      resultsData: initialResults,
      connectionState: initialRace ? 'connected' : 'connecting',
      isConnected: Boolean(initialRace),
      connectionAttempts: 0,
      lastUpdate: initialRaceUpdate,
      updateLatency: 0,
      totalUpdates: 0,
      isInitialFetchComplete: Boolean(initialRace),
      lastRaceUpdate: initialRaceUpdate,
      lastPoolUpdate: null,
      lastResultsUpdate: initialResultsUpdate,
      lastEntrantsUpdate: initialEntrantsUpdate,
      moneyFlowUpdateTrigger: 0,
    }
  })

  const [isLoading, setIsLoading] = useState(!initialRace)
  const [error, setError] = useState<Error | null>(null)
  const [dataFreshness, setDataFreshness] = useState<DataFreshness>('fresh')

  const latencySamples = useRef<number[]>([])
  const lastUpdateRef = useRef<number | null>(state.lastUpdate?.getTime() ?? null)
  const totalErrorsRef = useRef(0)
  const pollingStartTime = useRef(Date.now())

  const initialPollingData = useMemo(
    () => ({
      race: initialRace,
      entrants: initialEntrants,
      pools: null,
      moneyFlowUpdateTrigger: 0,
    }),
    [initialEntrants, initialRace]
  )

  const handleDataUpdate = useCallback(
    (payload: CoordinatedUpdatePayload) => {
      if (!raceId) {
        return
      }

      const nowMs = Date.now()
      const now = new Date(nowMs)
      const previousUpdate = lastUpdateRef.current
      const latency = previousUpdate ? nowMs - previousUpdate : 0

      if (latency > 0) {
        const updatedSamples = latencySamples.current.slice(-(MAX_LATENCY_SAMPLES - 1))
        updatedSamples.push(latency)
        latencySamples.current = updatedSamples
      }

      lastUpdateRef.current = nowMs

      setState((prev) => {
        const updatedRace = payload.race ?? prev.race
        const computedResults = createResultsData(updatedRace)

        let resultsData = prev.resultsData
        let hasResultsUpdate = false

        if (computedResults) {
          const prevResults = prev.resultsData
          const resultsChanged =
            !prevResults ||
            prevResults.status !== computedResults.status ||
            prevResults.resultTime !== computedResults.resultTime ||
            prevResults.results.length !== computedResults.results.length ||
            prevResults.dividends.length !== computedResults.dividends.length

          if (resultsChanged) {
            resultsData = computedResults
            hasResultsUpdate = true
          }
        } else if (prev.resultsData) {
          resultsData = null
          hasResultsUpdate = true
        }

        const entrantsUpdated = payload.entrants.length > 0
        const poolsUpdated = payload.pools !== null
        const raceUpdated = payload.race !== null

        return {
          ...prev,
          race: updatedRace,
          raceDocumentId: updatedRace?.$id ?? prev.raceDocumentId,
          entrants: entrantsUpdated ? payload.entrants : prev.entrants,
          poolData: poolsUpdated ? payload.pools : prev.poolData,
          resultsData,
          connectionState: 'connected',
          isConnected: true,
          connectionAttempts: 0,
          lastUpdate: now,
          updateLatency: latency,
          totalUpdates: prev.totalUpdates + 1,
          isInitialFetchComplete: true,
          lastRaceUpdate: raceUpdated ? now : prev.lastRaceUpdate,
          lastEntrantsUpdate: entrantsUpdated ? now : prev.lastEntrantsUpdate,
          lastPoolUpdate: poolsUpdated ? now : prev.lastPoolUpdate,
          lastResultsUpdate: hasResultsUpdate ? now : prev.lastResultsUpdate,
          moneyFlowUpdateTrigger: payload.moneyFlowUpdateTrigger,
        }
      })

      setIsLoading(false)
      setError(null)

      logger.debug('Unified polling update received', {
        raceId,
        hasRace: Boolean(payload.race),
        entrants: payload.entrants.length,
        hasPools: Boolean(payload.pools),
      })
    },
    [logger, raceId]
  )

  const handleError = useCallback(
    (receivedError: Error) => {
      totalErrorsRef.current += 1
      setError(receivedError)
      setIsLoading(false)

      setState((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        isConnected: false,
        connectionAttempts: prev.connectionAttempts + 1,
      }))

      logger.error('Unified polling error', receivedError)
    },
    [logger]
  )

  const raceStartTime = state.race?.startTime ?? initialRace?.startTime ?? new Date().toISOString()
  const raceStatus = state.race?.status ?? initialRace?.status ?? 'open'

  const polling = useRacePolling({
    raceId,
    raceStartTime,
    raceStatus,
    initialData: initialPollingData,
    onDataUpdate: handleDataUpdate,
    onError: handleError,
  })

  const {
    pollingState,
    errorState,
    startPolling,
    stopPolling,
    forceUpdate,
    getDataFreshness,
  } = polling

  const refetch = useCallback(async () => {
    if (!isMountedRef.current) {
      return
    }

    setIsLoading(true)
    try {
      await forceUpdate()
    } catch (refetchError) {
      // Only update state if we're still mounted
      if (!isMountedRef.current) {
        return
      }

      const normalized =
        refetchError instanceof Error
          ? refetchError
          : new Error('Failed to refetch race data')

      totalErrorsRef.current += 1
      setError(normalized)
      setState((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        isConnected: false,
        connectionAttempts: prev.connectionAttempts + 1,
      }))

      throw normalized
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [forceUpdate])

  const reconnect = useCallback(() => {
    if (!isMountedRef.current) {
      return
    }

    stopPolling()

    if (isMountedRef.current) {
      setState((prev) => ({
        ...prev,
        connectionState: 'connecting',
        isConnected: false,
      }))

      startPolling()
      pollingStartTime.current = Date.now()
      lastUpdateRef.current = null
      latencySamples.current = []
    }
  }, [startPolling, stopPolling])

  const clearHistory = useCallback(() => {
    latencySamples.current = []
    totalErrorsRef.current = 0
    pollingStartTime.current = Date.now()
    lastUpdateRef.current = null

    if (isMountedRef.current) {
      setState((prev) => ({
        ...prev,
        totalUpdates: 0,
        lastUpdate: null,
        updateLatency: 0,
      }))
    }
  }, [])

  useEffect(() => {
    if (errorState.lastError && isMountedRef.current) {
      totalErrorsRef.current = errorState.retryAttempt
      setError(errorState.lastError)
      setState((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        isConnected: false,
        connectionAttempts: errorState.retryAttempt,
      }))
    }
  }, [errorState.lastError, errorState.retryAttempt])

  useEffect(() => {
    setState((prev) => {
      let connectionState: ConnectionState = prev.connectionState
      let isConnected = prev.isConnected

      if (pollingState.isActive) {
        connectionState = 'connected'
        isConnected = true
      } else if (pollingState.isPaused) {
        connectionState = 'disconnecting'
        isConnected = false
      } else if (pollingState.isStopped) {
        connectionState = 'disconnected'
        isConnected = false
      }

      if (connectionState === prev.connectionState && isConnected === prev.isConnected) {
        return prev
      }

      return {
        ...prev,
        connectionState,
        isConnected,
      }
    })
  }, [pollingState.isActive, pollingState.isPaused, pollingState.isStopped])

  useEffect(() => {
    setDataFreshness(getDataFreshness())
  }, [getDataFreshness])

  useEffect(() => {
    const resetResults = createResultsData(initialRace)
    const initialEntrantsUpdate = getLatestEntrantUpdate(initialEntrants)
    const initialRaceUpdate = initialRace?.$updatedAt ? new Date(initialRace.$updatedAt) : null
    const initialResultsUpdate = resetResults?.resultTime
      ? new Date(resetResults.resultTime)
      : null

    setState({
      race: initialRace,
      raceDocumentId: initialRace?.$id ?? null,
      raceResultsDocumentId: null,
      entrants: initialEntrants,
      meeting: initialMeeting,
      navigationData: initialNavigationData,
      poolData: null,
      resultsData: resetResults,
      connectionState: initialRace ? 'connected' : 'connecting',
      isConnected: Boolean(initialRace),
      connectionAttempts: 0,
      lastUpdate: initialRaceUpdate,
      updateLatency: 0,
      totalUpdates: 0,
      isInitialFetchComplete: Boolean(initialRace),
      lastRaceUpdate: initialRaceUpdate,
      lastPoolUpdate: null,
      lastResultsUpdate: initialResultsUpdate,
      lastEntrantsUpdate: initialEntrantsUpdate,
      moneyFlowUpdateTrigger: 0,
    })

    setIsLoading(!initialRace)
    setError(null)
    setDataFreshness('fresh')
    latencySamples.current = []
    totalErrorsRef.current = 0
    pollingStartTime.current = Date.now()
    lastUpdateRef.current = initialRaceUpdate?.getTime() ?? null
  }, [initialEntrants, initialMeeting, initialNavigationData, initialRace, raceId])

  // Ref to track mounting state to prevent updates after unmount
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!cleanupSignal || !isMountedRef.current) {
      return
    }

    // Clear history without triggering refetch to prevent infinite loops
    clearHistory()

    // Only refetch if we're still mounted and not in the middle of navigation
    const safeRefetch = async () => {
      if (isMountedRef.current) {
        try {
          await forceUpdate()
        } catch (error) {
          // Ignore errors during cleanup phase
          if (isMountedRef.current) {
            console.warn('Cleanup refetch failed:', error)
          }
        }
      }
    }

    // Use a small delay to allow navigation to settle
    const timeoutId = setTimeout(safeRefetch, 100)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [cleanupSignal, clearHistory, forceUpdate])

  const getConnectionHealth = useCallback((): ConnectionHealthSnapshot => {
    const samples = latencySamples.current
    const avgLatency = samples.length
      ? samples.reduce((total, sample) => total + sample, 0) / samples.length
      : null

    const uptime = Date.now() - pollingStartTime.current
    const pollingMetrics = getPollingMetricsSnapshot()
    const hasSevereAlert = pollingMetrics.alerts.some(alert => alert.level === 'error')

    return {
      isHealthy: state.isConnected && !error && !hasSevereAlert,
      avgLatency,
      uptime,
      totalUpdates: state.totalUpdates,
      totalRequests: pollingMetrics.totals.requests,
      totalErrors: pollingMetrics.totals.errors,
      errorRate: pollingMetrics.totals.errorRate,
      schedule: pollingMetrics.schedule,
      alerts: pollingMetrics.alerts,
    }
  }, [error, state.isConnected, state.totalUpdates])

  return {
    ...state,
    isLoading,
    error,
    dataFreshness,
    reconnect,
    clearHistory,
    refetch,
    getConnectionHealth,
  }
}
