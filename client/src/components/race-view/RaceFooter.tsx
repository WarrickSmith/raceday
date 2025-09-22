'use client'

import { memo, useEffect, useMemo } from 'react'
import type {
  RacePoolData,
  RaceResultsData,
  RaceStatus,
} from '@/types/racePools'
import type { Race } from '@/types/meetings'
import { screenReader } from '@/utils/accessibility'
import { STATUS_CONFIG, getStatusConfig } from '@/utils/raceStatusConfig'
import { RaceTimingSection } from '@/components/race-view/RaceTimingSection'
import { RacePoolsSection } from '@/components/race-view/RacePoolsSection'
import { RaceResultsSection } from '@/components/race-view/RaceResultsSection'
import type { DataFreshness } from '@/utils/pollingCache'
import type { ConnectionState } from '@/hooks/useUnifiedRaceRealtime'

// Utility function to convert cents to dollars for display (rounded to nearest dollar)
const formatPoolAmount = (cents: number): string => {
  const dollars = Math.round(cents / 100) // Round to nearest dollar
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface RaceFooterProps {
  raceStartTime: string
  raceStatus: RaceStatus
  poolData?: RacePoolData
  resultsData?: RaceResultsData
  className?: string
  showCountdown?: boolean
  showResults?: boolean
  lastPoolUpdate?: Date | null
  lastResultsUpdate?: Date | null
  connectionHealth?: {
    isHealthy: boolean
    avgLatency: number | null
    uptime: number
  }
  // Real-time race data from unified subscription
  race?: Race | null
  pollingInfo?: RacePollingFooterInfo | null
}

interface RacePollingFooterInfo {
  lastUpdate: Date | null
  dataFreshness: DataFreshness
  connectionState: ConnectionState
  totalUpdates: number
  retryCount: number
  isActive: boolean
}

export const RaceFooter = memo(function RaceFooter({
  raceStartTime,
  raceStatus,
  poolData,
  resultsData,
  className = '',
  showCountdown = true,
  showResults = true,
  lastPoolUpdate,
  lastResultsUpdate,
  connectionHealth,
  race = null,
  pollingInfo = null,
}: RaceFooterProps) {
  // Use real-time data from props (from unified subscription) with context fallbacks
  const currentRaceStartTime = race?.startTime || raceStartTime
  const currentRaceStatus =
    (race?.status?.toLowerCase() as RaceStatus) || raceStatus
  const currentPoolData = poolData
  const currentResultsData = resultsData
  const avgLatency = connectionHealth?.avgLatency ?? null

  const pollingSummary = useMemo(() => {
    if (!pollingInfo) {
      return null
    }

    const lastUpdateLabel = pollingInfo.lastUpdate
      ? pollingInfo.lastUpdate.toLocaleTimeString('en-NZ', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'Awaiting data'

    let freshnessLabel = 'Fresh'
    let freshnessClass = 'text-green-600'

    switch (pollingInfo.dataFreshness) {
      case 'fresh':
        freshnessLabel = 'Fresh'
        freshnessClass = 'text-green-600'
        break
      case 'acceptable':
        freshnessLabel = 'Recent'
        freshnessClass = 'text-yellow-600'
        break
      case 'stale':
        freshnessLabel = 'Stale'
        freshnessClass = 'text-orange-600'
        break
      case 'critical':
        freshnessLabel = 'Critical'
        freshnessClass = 'text-red-600'
        break
      default:
        freshnessLabel = pollingInfo.dataFreshness
        freshnessClass = 'text-gray-600'
    }

    let connectionLabel = 'Disconnected'
    let connectionClass = 'text-red-600'

    switch (pollingInfo.connectionState) {
      case 'connected':
        connectionLabel = 'Connected'
        connectionClass = 'text-green-600'
        break
      case 'connecting':
        connectionLabel = 'Connecting'
        connectionClass = 'text-yellow-600'
        break
      case 'disconnecting':
        connectionLabel = 'Pausing'
        connectionClass = 'text-yellow-600'
        break
      case 'disconnected':
      default:
        connectionLabel = pollingInfo.retryCount > 0 ? 'Retrying' : 'Disconnected'
        connectionClass = pollingInfo.retryCount > 0 ? 'text-yellow-600' : 'text-red-600'
    }

    const statusLabel = pollingInfo.isActive
      ? 'Active'
      : pollingInfo.retryCount > 0
      ? 'Recovering'
      : 'Paused'
    const statusClass = pollingInfo.isActive
      ? 'text-green-600'
      : pollingInfo.retryCount > 0
      ? 'text-yellow-600'
      : 'text-gray-600'

    return {
      lastUpdateLabel,
      freshnessLabel,
      freshnessClass,
      connectionLabel,
      connectionClass,
      totalUpdates: pollingInfo.totalUpdates,
      statusLabel,
      statusClass,
    }
  }, [pollingInfo])

  const latencySummary = useMemo(() => {
    if (avgLatency === null) {
      return { label: '—', className: 'text-gray-600' }
    }
    if (avgLatency > 200) {
      return { label: `${avgLatency.toFixed(0)}ms`, className: 'text-red-600' }
    }
    if (avgLatency > 120) {
      return { label: `${avgLatency.toFixed(0)}ms`, className: 'text-yellow-600' }
    }
    return { label: `${avgLatency.toFixed(0)}ms`, className: 'text-green-600' }
  }, [avgLatency])

  // Announce results availability when they become available
  useEffect(() => {
    if (
      currentResultsData &&
      currentResultsData.results.length > 0 &&
      showResults
    ) {
      // Announce results availability
      screenReader?.announce(
        `Race results are now available with ${currentResultsData.results.length} positions`,
        'assertive'
      )
    }
  }, [currentResultsData, showResults])

  // Announce race status changes
  useEffect(() => {
    const statusConfig = getStatusConfig(currentRaceStatus)
    if (statusConfig) {
      screenReader?.announceRaceStatusChange(statusConfig.description)
    }
  }, [currentRaceStatus])

  return (
    <div
      className={`race-footer bg-white border-2 border-gray-300 shadow-lg rounded-lg h-40 ${className}`}
    >
      {/* Enhanced Three-Column Footer Layout: Pools | Results | Timing/Status */}
      <div className="flex h-full p-4">
        {/* Column 1: Pools Section */}
        <div className="w-96 flex-shrink-0 pr-4">
          <RacePoolsSection
            poolData={currentPoolData}
            lastUpdate={lastPoolUpdate}
          />
        </div>

        {/* Column 2: Results Section */}
        <div className="w-[470px] flex-shrink-0 pr-4">
          <RaceResultsSection
            resultsData={currentResultsData}
            lastUpdate={lastResultsUpdate}
          />
        </div>

        {/* Column 3: Timing/Status Section (Right) */}
        <div className="flex-grow flex items-center justify-end">
          <RaceTimingSection
            raceStartTime={currentRaceStartTime}
            raceStatus={currentRaceStatus}
            showCountdown={showCountdown}
            race={race}
          />
        </div>
      </div>

      {pollingSummary && (
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Last update:{' '}
            <span className="font-semibold text-gray-700">
              {pollingSummary.lastUpdateLabel}
            </span>
          </span>
          <span>
            Status:{' '}
            <span className={`font-semibold ${pollingSummary.statusClass}`}>
              {pollingSummary.statusLabel}
            </span>
          </span>
          <span>
            Connection:{' '}
            <span className={`font-semibold ${pollingSummary.connectionClass}`}>
              {pollingSummary.connectionLabel}
            </span>
          </span>
          <span>
            Freshness:{' '}
            <span className={`font-semibold ${pollingSummary.freshnessClass}`}>
              {pollingSummary.freshnessLabel}
            </span>
          </span>
          <span>
            Cycles:{' '}
            <span className="font-semibold text-gray-700">
              {pollingSummary.totalUpdates}
            </span>
          </span>
          <span>
            Latency:{' '}
            <span className={`font-semibold ${latencySummary.className}`}>
              {latencySummary.label}
            </span>
          </span>
        </div>
      )}

      {/* Accessibility announcements */}
      <div className="sr-only" aria-live="polite">
        Race status: {STATUS_CONFIG[currentRaceStatus]?.description}.
        {currentPoolData &&
          ` Total pool: ${currentPoolData.currency}${formatPoolAmount(
            currentPoolData.totalRacePool
          )}.`}
        {currentResultsData &&
          currentResultsData.results.length > 0 &&
          ` Results available with ${currentResultsData.results.length} positions.`}
        {pollingSummary &&
          ` Data refreshed ${pollingSummary.lastUpdateLabel}. Connection state ${pollingSummary.connectionLabel}.`}
      </div>
    </div>
  )
})

export default RaceFooter
