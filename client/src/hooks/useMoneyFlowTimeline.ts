/**
 * Hook for fetching and managing money flow timeline data for Enhanced Race Entrants
 * Story 4.9 implementation - provides real money flow history for timeline grid
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  MoneyFlowDataPoint,
  EntrantMoneyFlowTimeline,
} from '@/types/moneyFlow'
import { useLogger } from '@/utils/logging'
import type { ComponentLogger } from '@/utils/logging'

// Server response interface for raw database data
interface ServerEntrant {
  entrantId?: string
  name?: string
  $id?: string
  id?: string
  [key: string]: unknown
}

type EntrantReference = string | ServerEntrant

type TimelinePoolType =
  | 'win'
  | 'place'
  | 'quinella'
  | 'trifecta'
  | 'exacta'
  | 'first4'

type TimelineIntervalType = '30s' | '1m' | '5m' | string

interface ServerMoneyFlowPoint {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: EntrantReference
  eventTimestamp?: string
  pollingTimestamp?: string
  timeToStart?: number
  timeInterval?: number
  intervalType?: TimelineIntervalType
  holdPercentage?: number
  betPercentage?: number
  winPoolAmount?: number
  placePoolAmount?: number
  type?: string
  poolType?: string
  incrementalWinAmount?: number
  incrementalPlaceAmount?: number
  incrementalAmount?: number
  totalPoolAmount?: number
  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixedWinOdds?: number
  fixedPlaceOdds?: number
  poolWinOdds?: number
  poolPlaceOdds?: number
}

interface MoneyFlowTimelineResponse {
  success: boolean
  documents: ServerMoneyFlowPoint[]
  total?: number
  raceId?: string
  entrantIds?: string[]
  poolType?: string
  bucketedData?: boolean
  intervalCoverage?: Record<string, unknown>
  message?: string
  queryOptimizations?: string[]
}

export interface TimelineGridData {
  [timeInterval: number]: {
    [entrantId: string]: {
      incrementalAmount: number
      poolType: TimelinePoolType
      timestamp: string
    }
  }
}

interface UseMoneyFlowTimelineResult {
  timelineData: Map<string, EntrantMoneyFlowTimeline> // entrantId -> timeline data
  gridData: TimelineGridData // interval -> entrantId -> data
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
  refetch: () => Promise<void>
  getEntrantDataForInterval: (
    entrantId: string,
    interval: number,
    poolType: 'win' | 'place'
  ) => string
  // NEW: Multi-pool support functions
  getWinPoolData: (entrantId: string, interval: number) => string
  getPlacePoolData: (entrantId: string, interval: number) => string
  getOddsData: (entrantId: string, interval: number, oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace') => string
  // NEW: Polling coordination functions
  isPollingActive: boolean
  startPolling: () => void
  stopPolling: () => void
}

export function useMoneyFlowTimeline(
  raceId: string,
  entrantIds: string[],
  poolType: TimelinePoolType = 'win',
  raceStatus?: string, // Add race status to control post-race behavior
  updateTrigger?: number, // Add update trigger to coordinate with main polling cycle
  raceStartTime?: string // Add race start time for polling cadence calculations
): UseMoneyFlowTimelineResult {
  const logger = useLogger('useMoneyFlowTimeline')
  const loggerRef = useRef(logger)
  loggerRef.current = logger
  const entrantKey = useMemo(() => entrantIds.join(','), [entrantIds])
  const [timelineData, setTimelineData] = useState<
    Map<string, EntrantMoneyFlowTimeline>
  >(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Polling coordination state
  const [isPollingActive, setIsPollingActive] = useState(false)
  const isPollingActiveRef = useRef(false)
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPollingTimeRef = useRef<number>(0)
  const errorCountRef = useRef(0)
  const maxErrors = 5 // Circuit breaker threshold

  const raceStatusRef = useRef(raceStatus ?? '')
  const hasTimelineDataRef = useRef(false)

  // Calculate polling interval based on race timing (2x backend frequency)
  const calculatePollingInterval = useCallback(
    (timeToStart: number, status?: string): number => {
      const raceStatusLower = status?.toLowerCase() ?? ''

      // Stop polling if race is final
      if (['final', 'finalized', 'abandoned', 'cancelled'].includes(raceStatusLower)) {
        return 0
      }

      // Apply exact cadence table from polling plan (2x backend frequency)
      if (raceStatusLower === 'open') {
        if (timeToStart > 65) return 900000 // 15 minutes (backend: 30m)
        if (timeToStart > 5) return 75000 // 75 seconds (backend: 2.5m)
        if (timeToStart > 3) return 30000 // 30 seconds (backend: 1m)
        return 15000 // 15 seconds (backend: 30s)
      }

      if (['closed', 'running', 'interim'].includes(raceStatusLower)) {
        return 15000 // 15 seconds during critical periods
      }

      return 30000 // Default 30 seconds for other states
    },
    []
  )

  // Calculate time to start from race start time
  const getTimeToStart = useCallback((): number => {
    if (!raceStartTime) return 0

    const now = new Date()
    const startTime = new Date(raceStartTime)
    const diffMs = startTime.getTime() - now.getTime()
    const diffMinutes = Math.round(diffMs / (1000 * 60))

    return diffMinutes
  }, [raceStartTime])

  useEffect(() => {
    raceStatusRef.current = raceStatus ?? ''
  }, [raceStatus])

  useEffect(() => {
    hasTimelineDataRef.current = false
  }, [raceId, entrantKey])

  // Fetch money flow timeline data for all entrants with enhanced error handling
  const fetchTimelineData = useCallback(async (): Promise<boolean> => {
    if (!raceId || entrantIds.length === 0) return false

    // Check race status to avoid unnecessary polling for completed races
    const normalizedStatus = raceStatus?.toLowerCase() ?? ''
    const isRaceComplete =
      normalizedStatus !== '' &&
      ['final', 'finalized', 'abandoned', 'cancelled'].includes(normalizedStatus)

    if (isRaceComplete && hasTimelineDataRef.current) {
      // Race is complete and we have timeline data, skip fetch
      return true
    }

    // Circuit breaker: if too many errors, stop polling temporarily
    if (errorCountRef.current >= maxErrors) {
      loggerRef.current.warn('Money flow polling circuit breaker triggered', {
        errorCount: errorCountRef.current,
        maxErrors
      })
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use API route to fetch money flow timeline data
      const response = await fetch(
        `/api/race/${raceId}/money-flow-timeline?entrants=${entrantKey}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch timeline data: ${response.statusText}`)
      }

      const data = (await response.json()) as MoneyFlowTimelineResponse
      const documents = data.documents ?? []

      if (data.intervalCoverage) {
        loggerRef.current.debug(
          'Money flow interval coverage received',
          data.intervalCoverage
        )
      }

      if (data.message) {
        loggerRef.current.info('Money flow timeline message', {
          message: data.message,
        })
      }

      // Handle empty data gracefully
      if (documents.length === 0) {
        setTimelineData(new Map())
        hasTimelineDataRef.current = false
        setLastUpdate(new Date())
        return true
      }

      // Use unified processing for both bucketed and legacy data
      const entrantDataMap = processTimelineData(
        documents,
        entrantIds,
        loggerRef.current
      )
      setTimelineData(entrantDataMap)
      hasTimelineDataRef.current = entrantDataMap.size > 0
      setLastUpdate(new Date())

      // Reset error count on successful fetch
      errorCountRef.current = 0
      return true
    } catch (err) {
      // Increment error count for circuit breaker
      errorCountRef.current += 1

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch timeline data'
      setError(errorMessage)
      loggerRef.current.error('Error fetching money flow timeline', {
        error: err,
        errorCount: errorCountRef.current,
        maxErrors
      })
      return false
    } finally {
      setIsLoading(false)
    }
  }, [raceId, entrantIds, entrantKey, raceStatus, maxErrors])

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {}
    const currentLogger = loggerRef.current

    for (const [entrantId, entrantData] of timelineData) {
      // Skip if no data points
      if (entrantData.dataPoints.length === 0) {
        continue
      }

      // Use the already calculated incremental amounts from dataPoints
      // The data points are already sorted chronologically and have incremental amounts calculated
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i]

        // Skip if no timeToStart data
        if (typeof dataPoint.timeToStart !== 'number') {
          continue
        }

        // Use the incremental amount that was already calculated in the first processing loop
        // This ensures we maintain the correct chronological incremental calculations
        const incrementalAmount = dataPoint.incrementalAmount ?? 0

        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData =
          (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
          (poolType === 'place' &&
            typeof dataPoint.placePoolAmount === 'number')

        if (!hasValidPoolData && !dataPoint.poolPercentage) {
          currentLogger.debug(`Skipping data point - no valid pool data for ${poolType}`, {
            winPoolAmount: dataPoint.winPoolAmount,
            placePoolAmount: dataPoint.placePoolAmount,
            poolPercentage: dataPoint.poolPercentage,
          })
          continue
        }

        // Use timeInterval if available (bucketed data), otherwise timeToStart (legacy)
        // This ensures compatibility with both data structures
        const interval =
          dataPoint.timeInterval ?? dataPoint.timeToStart

        if (interval === undefined) {
          continue
        }

        // Add grid data for this interval
        if (!grid[interval]) {
          grid[interval] = {}
        }

        grid[interval][entrantId] = {
          incrementalAmount,
          poolType,
          timestamp: dataPoint.pollingTimestamp,
        }
      }
    }

    return grid
  }, [timelineData, poolType])

  // Get formatted data for specific entrant and time interval
  const getEntrantDataForInterval = useCallback(
    (
      entrantId: string,
      interval: number,
      requestedPoolType: 'win' | 'place'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrantId)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval = point.timeInterval ?? point.timeToStart ?? -999
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // SIMPLIFIED: Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount
      // For 60m: server stored absolute total in incrementalWinAmount
      // For others: server stored true increment in incrementalWinAmount
      const displayAmount =
        requestedPoolType === 'win'
          ? dataPoint.incrementalWinAmount || dataPoint.incrementalAmount || 0
          : dataPoint.incrementalPlaceAmount || dataPoint.incrementalAmount || 0

      // Convert cents to dollars for display
      const amountInDollars = Math.round(displayAmount / 100)

      // Format for display: 60m shows baseline ($2,341), others show increment (+$344)
      if (amountInDollars <= 0) {
        return '—' // No data or zero amount
      }

      if (interval === 60) {
        // 60m column: baseline amount (server stored absolute total)
        return `$${amountInDollars.toLocaleString()}`
      } else {
        // All other columns: incremental change (server calculated increment)
        return `+$${amountInDollars.toLocaleString()}`
      }
    },
    [timelineData]
  )

  // Handle update trigger from unified polling coordination
  useEffect(() => {
    if (updateTrigger && updateTrigger > 0) {
      loggerRef.current.debug('Money flow timeline triggered by unified polling', {
        updateTrigger,
        raceId
      })
      fetchTimelineData()
    }
  }, [updateTrigger, fetchTimelineData, raceId])

  // NEW: Get Win pool data for specific entrant and time interval
  const getWinPoolData = useCallback(
    (entrantId: string, interval: number) => {
      return getEntrantDataForInterval(entrantId, interval, 'win')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get Place pool data for specific entrant and time interval
  const getPlacePoolData = useCallback(
    (entrantId: string, interval: number) => {
      return getEntrantDataForInterval(entrantId, interval, 'place')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get odds data for specific entrant and time interval
  const getOddsData = useCallback(
    (
      entrantId: string,
      interval: number,
      oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrantId)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval = point.timeInterval ?? point.timeToStart ?? -999
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // Get odds value based on type from consolidated data
      let oddsValue: number | undefined
      switch (oddsType) {
        case 'fixedWin':
          oddsValue = dataPoint.fixedWinOdds
          break
        case 'fixedPlace':
          oddsValue = dataPoint.fixedPlaceOdds
          break
        case 'poolWin':
          oddsValue = dataPoint.poolWinOdds
          break
        case 'poolPlace':
          oddsValue = dataPoint.poolPlaceOdds
          break
        default:
          return '—'
      }

      // Format odds for display
      if (!oddsValue || oddsValue <= 0) {
        return '—'
      }

      return oddsValue.toFixed(2)
    },
    [timelineData]
  )

  // Start internal polling with coordinated timing
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    isPollingActiveRef.current = false
    setIsPollingActive(false)
    loggerRef.current.debug('Money flow polling stopped')
  }, [])

  const startPolling = useCallback(() => {
    if (!raceId || entrantIds.length === 0 || !raceStartTime || !raceStatusRef.current) {
      return
    }

    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    const timeToStart = getTimeToStart()
    const interval = calculatePollingInterval(timeToStart, raceStatusRef.current)

    // If interval is 0, race is finished, don't start polling
    if (interval === 0) {
      isPollingActiveRef.current = false
      setIsPollingActive(false)
      loggerRef.current.debug('Money flow polling stopped - race is finished', {
        raceStatus: raceStatusRef.current,
        timeToStart
      })
      return
    }

    isPollingActiveRef.current = true
    setIsPollingActive(true)
    lastPollingTimeRef.current = Date.now()

    const scheduleNextPoll = () => {
      const currentTimeToStart = getTimeToStart()
      const currentInterval = calculatePollingInterval(
        currentTimeToStart,
        raceStatusRef.current
      )

      if (currentInterval === 0) {
        stopPolling()
        loggerRef.current.debug('Money flow polling auto-stopped - race finished')
        return
      }

      pollingIntervalRef.current = setTimeout(async () => {
        // Staggered delay to coordinate with main polling cycle (100-300ms)
        const staggerDelay = Math.random() * 200 + 100
        await new Promise((resolve) => setTimeout(resolve, staggerDelay))

        const success = await fetchTimelineData()

        if (success && isPollingActiveRef.current) {
          scheduleNextPoll() // Schedule next poll if successful and still active
        } else if (
          !success &&
          errorCountRef.current < maxErrors &&
          isPollingActiveRef.current
        ) {
          // Exponential backoff on error
          const backoffDelay = Math.min(
            1000 * Math.pow(2, errorCountRef.current),
            30000
          )
          pollingIntervalRef.current = setTimeout(() => {
            if (isPollingActiveRef.current) {
              scheduleNextPoll()
            }
          }, backoffDelay)
        }
      }, currentInterval)
    }

    // Initial fetch then start polling cycle
    fetchTimelineData().then((success) => {
      if (success && isPollingActiveRef.current) {
        scheduleNextPoll()
      }
    })

    loggerRef.current.debug('Money flow polling started', {
      interval,
      timeToStart,
      raceStatus: raceStatusRef.current
    })
  }, [
    raceId,
    entrantIds,
    raceStartTime,
    getTimeToStart,
    calculatePollingInterval,
    fetchTimelineData,
    maxErrors,
    stopPolling
  ])

  // Set up polling lifecycle management
  useEffect(() => {
    if (!raceId || entrantIds.length === 0) return

    // Check if race is complete to avoid unnecessary polling
    const normalizedStatus = raceStatus?.toLowerCase() ?? ''
    const isRaceComplete =
      normalizedStatus !== '' &&
      ['final', 'finalized', 'abandoned', 'cancelled'].includes(normalizedStatus)

    if (isRaceComplete) {
      // Race is complete, stop any polling and do final fetch if needed
      stopPolling()
      if (timelineData.size === 0) {
        fetchTimelineData() // One final fetch for completed race data
      }
      return
    }

    // Start polling if we have the required data
    if (raceStartTime && raceStatus) {
      startPolling()
    } else {
      // Initial fetch without polling if we don't have start time/status yet
      fetchTimelineData()
    }

    loggerRef.current.debug('Money flow timeline polling lifecycle initialized', {
      raceId,
      entrantIds: entrantIds.length,
      hasStartTime: Boolean(raceStartTime),
      raceStatus,
      isRaceComplete
    })

    return () => {
      stopPolling()
    }
  }, [raceId, entrantIds, entrantKey, raceStatus, raceStartTime, startPolling, stopPolling, fetchTimelineData, timelineData.size])

  const refetch = useCallback(async () => {
    await fetchTimelineData()
  }, [fetchTimelineData])

  return {
    timelineData,
    gridData,
    isLoading,
    error,
    lastUpdate,
    refetch,
    getEntrantDataForInterval,
    getWinPoolData,
    getPlacePoolData,
    getOddsData,
    // NEW: Polling coordination state
    isPollingActive,
    startPolling,
    stopPolling,
  }
}

/**
 * Unified processing function for all timeline data (bucketed or legacy)
 * Standardizes incremental calculation logic to eliminate inconsistencies
 */
function processTimelineData(
  documents: ServerMoneyFlowPoint[],
  entrantIds: string[],
  logger?: ComponentLogger
): Map<string, EntrantMoneyFlowTimeline> {
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>()

  for (const entrantId of entrantIds) {
    // Extract entrant ID consistently across all data formats
    const entrantDocs = documents.filter((doc) => {
      const docEntrantId = extractEntrantId(doc.entrant)
      return docEntrantId === entrantId
    })

    if (entrantDocs.length === 0) {
      logger?.debug(`No documents found for entrant ${entrantId}`)
      // Create empty entry to maintain consistency
      entrantDataMap.set(entrantId, {
        entrantId,
        dataPoints: [],
        latestPercentage: 0,
        trend: 'neutral',
        significantChange: false,
      })
      continue
    }

    logger?.debug(`Processing entrant ${entrantId}`, { documentCount: entrantDocs.length })

    // Group documents by time interval to handle duplicates
    const intervalMap = new Map<number, ServerMoneyFlowPoint[]>()

    entrantDocs.forEach((doc) => {
      // Use timeInterval if available (bucketed), otherwise timeToStart (legacy)
      const interval = doc.timeInterval ?? doc.timeToStart ?? -999
      if (interval === -999) {
        logger?.warn(`Document missing time information for entrant ${entrantId}`)
        return
      }

      if (!intervalMap.has(interval)) {
        intervalMap.set(interval, [])
      }
      intervalMap.get(interval)!.push(doc)
    })

    // Use server pre-calculated timeline points directly (no client consolidation)
    // Per Implementation Guide: Server provides clean bucket data with pre-calculated increments
    const timelinePoints: MoneyFlowDataPoint[] = []

    for (const [interval, intervalDocs] of intervalMap) {
      // Use the latest document for this interval (server should provide one clean bucket per interval)
      const doc = intervalDocs[intervalDocs.length - 1] // Get most recent if multiple

      // Trust server pre-calculated data - no client processing needed
      const timelinePoint: MoneyFlowDataPoint = {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant: entrantId,
        pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
        timeToStart: doc.timeToStart || 0,
        timeInterval: doc.timeInterval ?? interval,
        intervalType: doc.intervalType || '5m',
        winPoolAmount: doc.winPoolAmount ?? 0,
        placePoolAmount: doc.placePoolAmount ?? 0,
        totalPoolAmount: (doc.winPoolAmount ?? 0) + (doc.placePoolAmount ?? 0),
        poolPercentage: doc.holdPercentage ?? doc.betPercentage ?? 0,
        // Use server pre-calculated incremental amounts directly
        incrementalAmount:
          doc.incrementalWinAmount ??
          doc.incrementalAmount ??
          0,
        incrementalWinAmount: doc.incrementalWinAmount ?? 0,
        incrementalPlaceAmount: doc.incrementalPlaceAmount ?? 0,
        pollingInterval: getPollingIntervalFromType(doc.intervalType),
        // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
        fixedWinOdds: doc.fixedWinOdds,
        fixedPlaceOdds: doc.fixedPlaceOdds,
        poolWinOdds: doc.poolWinOdds,
        poolPlaceOdds: doc.poolPlaceOdds,
      }

      timelinePoints.push(timelinePoint)
    }

    // Sort by time interval descending (60, 55, 50... 0, -0.5, -1)
    timelinePoints.sort((a, b) => {
      const aInterval = a.timeInterval ?? a.timeToStart ?? -Infinity
      const bInterval = b.timeInterval ?? b.timeToStart ?? -Infinity
      return bInterval - aInterval
    })

    // Server pre-calculated incremental amounts - no client calculation needed
    // Per Implementation Guide: "Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount"

    // Calculate trend and metadata
    const latestPoint = timelinePoints[timelinePoints.length - 1]
    const secondLatestPoint =
      timelinePoints.length > 1
        ? timelinePoints[timelinePoints.length - 2]
        : null

    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    let significantChange = false

    if (latestPoint && secondLatestPoint) {
      const percentageChange =
        latestPoint.poolPercentage - secondLatestPoint.poolPercentage
      trend =
        percentageChange > 0.5
          ? 'up'
          : percentageChange < -0.5
          ? 'down'
          : 'neutral'
      significantChange = Math.abs(percentageChange) >= 1.0 // Reduced threshold for more sensitivity
    }

    // Calculate latest odds from timeline data (NEW in Story 4.9)
    let latestWinOdds: number | undefined
    let latestPlaceOdds: number | undefined
    
    // Find the most recent odds values - timelinePoints is sorted by time interval descending (60, 55, 50... 0, -0.5, -1)
    // The LOWEST intervals (closest to 0 or negative) are the NEWEST, so iterate BACKWARDS from the end
    for (let i = timelinePoints.length - 1; i >= 0; i--) {
      const point = timelinePoints[i]
      if (!latestWinOdds && point.fixedWinOdds !== undefined && point.fixedWinOdds > 0) {
        latestWinOdds = point.fixedWinOdds
      }
      if (!latestPlaceOdds && point.fixedPlaceOdds !== undefined && point.fixedPlaceOdds > 0) {
        latestPlaceOdds = point.fixedPlaceOdds
      }
      // Break if we found both odds values
      if (latestWinOdds && latestPlaceOdds) break
    }

    entrantDataMap.set(entrantId, {
      entrantId,
      dataPoints: timelinePoints,
      latestPercentage: latestPoint?.poolPercentage || 0,
      trend,
      significantChange,
      // Add latest odds from timeline data
      latestWinOdds,
      latestPlaceOdds,
    })

    logger?.debug(`Processed entrant ${entrantId} timeline points`, {
      timelinePointsCount: timelinePoints.length,
      usingServerCalculatedData: true
    })
  }

  logger?.debug('Timeline processing complete', {
    entrantsProcessed: entrantDataMap.size,
    totalDataPoints: Array.from(entrantDataMap.values()).reduce(
      (sum, data) => sum + data.dataPoints.length,
      0
    ),
  })

  return entrantDataMap
}

/**
 * Extract entrant ID consistently from various data formats
 */
function extractEntrantId(entrant: EntrantReference): string {
  if (typeof entrant === 'string') {
    return entrant
  }

  if (entrant && typeof entrant === 'object') {
    if (typeof entrant.entrantId === 'string') {
      return entrant.entrantId
    }
    if (typeof entrant.$id === 'string') {
      return entrant.$id
    }
    if (typeof entrant.id === 'string') {
      return entrant.id
    }
  }

  return 'unknown'
}

/**
 * Get polling interval from interval type string
 */
function getPollingIntervalFromType(intervalType?: TimelineIntervalType): number {
  switch (intervalType) {
    case '30s':
      return 0.5
    case '1m':
      return 1
    case '5m':
      return 5
    default:
      return 5
  }
}

// End of file
