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
import type {
  ConnectionHealthSnapshot,
  ConnectionState,
} from '@/hooks/useUnifiedRaceRealtime'

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
  connectionHealth?: ConnectionHealthSnapshot
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
        {connectionHealth &&
          ` Polling cadence ${connectionHealth.schedule.compliance.replace('-', ' ')} with ${
            connectionHealth.alerts.length
          } active alert${connectionHealth.alerts.length === 1 ? '' : 's'}. Average latency ${
            connectionHealth.avgLatency !== null
              ? `${connectionHealth.avgLatency.toFixed(0)} milliseconds`
              : 'unavailable'
          }.`}
      </div>
    </div>
  )
})

export default RaceFooter
