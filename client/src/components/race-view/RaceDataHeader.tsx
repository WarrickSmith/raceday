'use client'

import { memo, useState, useEffect, useMemo } from 'react'
import { useRace } from '@/contexts/RaceContext'
import { formatDistance, formatRaceTime } from '@/utils/raceFormatters'
import { RaceNavigation } from './RaceNavigation'
import { getRaceTypeDisplay } from '@/constants/raceTypes'
import { showDevelopmentFeatures } from '@/utils/environment'
import type {
  Race,
  Entrant,
  Meeting,
  RaceNavigationData,
} from '@/types/meetings'
import { PollingHealth } from '@/components/polling/PollingStatus'
import type { DataFreshness } from '@/utils/pollingCache'
import type { CircuitBreakerState } from '@/utils/pollingErrorHandler'
import type {
  ConnectionHealthSnapshot,
  ConnectionState,
} from '@/hooks/useUnifiedRaceRealtime'

interface RaceDataHeaderProps {
  className?: string
  race?: Race | null
  entrants?: Entrant[]
  meeting?: Meeting | null
  navigationData?: RaceNavigationData | null
  connectionHealth?: ConnectionHealthSnapshot
  pollingInfo?: RacePollingHeaderInfo | null
  onConfigureAlerts?: () => void
  onToggleConnectionMonitor?: () => void
  showConnectionMonitor?: boolean
}

interface RacePollingHeaderInfo {
  isActive: boolean
  lastUpdate: Date | null
  dataFreshness: DataFreshness
  error: Error | null
  circuitBreakerState: CircuitBreakerState
  retryCount: number
  connectionState: ConnectionState
  totalUpdates: number
}

export const RaceDataHeader = memo(function RaceDataHeader({
  className = '',
  race: propRace,
  entrants: propEntrants,
  meeting: propMeeting,
  navigationData: propNavigationData,
  connectionHealth,
  pollingInfo,
  onConfigureAlerts,
  onToggleConnectionMonitor,
  showConnectionMonitor = false,
}: RaceDataHeaderProps) {
  const { raceData } = useRace()
  const [currentTime, setCurrentTime] = useState(new Date())

  // Use props data if provided (from unified subscription), otherwise fall back to context
  const race = propRace || raceData?.race
  const entrants = useMemo(
    () => propEntrants || raceData?.entrants || [],
    [propEntrants, raceData?.entrants]
  )
  const meeting = propMeeting || raceData?.meeting

  // Use navigation data from props or context (no real-time hook)
  const navigationData = propNavigationData || raceData?.navigationData

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const alertSummary = useMemo(() => {
    if (!connectionHealth?.alerts || connectionHealth.alerts.length === 0) {
      return null
    }

    const hasError = connectionHealth.alerts.some(alert => alert.level === 'error')
    const hasWarning = connectionHealth.alerts.some(alert => alert.level === 'warning')

    return {
      severity: hasError ? 'error' : hasWarning ? 'warning' : 'info',
      count: connectionHealth.alerts.length,
    }
  }, [connectionHealth?.alerts])

  const healthStatus = useMemo(() => {
    if (!connectionHealth) return { status: 'Unknown', color: 'gray' }

    if (alertSummary?.severity === 'error') {
      return { status: 'Issue', color: 'red' }
    }

    if (alertSummary?.severity === 'warning') {
      return { status: 'Attention', color: 'yellow' }
    }

    if (connectionHealth.isHealthy) {
      return { status: 'Live', color: 'green' }
    }

    if (connectionHealth.avgLatency && connectionHealth.avgLatency > 150) {
      return { status: 'Slow', color: 'yellow' }
    }

    return { status: 'Monitoring', color: 'gray' }
  }, [alertSummary, connectionHealth])

  // Memoized calculations to reduce re-renders (move before early return to avoid hook call errors)
  const formattedTime = useMemo(
    () => (race?.startTime ? formatRaceTime(race.startTime) : ''),
    [race?.startTime]
  )
  const formattedDistance = useMemo(
    () => (race?.distance ? formatDistance(race.distance) : null),
    [race?.distance]
  )
  const runnersCount = useMemo(
    () => entrants.length || race?.runnerCount || 0,
    [entrants.length, race?.runnerCount]
  )
  const scratchedCount = useMemo(
    () => entrants.filter((e) => e.isScratched).length || 0,
    [entrants]
  )
  const avgLatency = useMemo(
    () => connectionHealth?.avgLatency || null,
    [connectionHealth]
  )
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

    return {
      lastUpdateLabel,
      freshnessLabel,
      freshnessClass,
      connectionLabel,
      connectionClass,
      totalUpdates: pollingInfo.totalUpdates,
    }
  }, [pollingInfo])
  const formattedRaceType = useMemo(() => {
    if (!meeting) return ''

    // Priority 1: Use category code for abbreviated display
    if (meeting.category) {
      const abbreviated = getRaceTypeDisplay(meeting.category)
      if (abbreviated && abbreviated !== meeting.category) {
        return abbreviated
      }
    }

    // Priority 2: Fallback to full race type (will be truncated by CSS)
    return meeting.raceType || ''
  }, [meeting])

  if (!race || !meeting) {
    return (
      <div
        className={`bg-white rounded-lg border border-gray-200 ${className}`}
        role="banner"
      >
        <div className="animate-pulse p-6">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-md ${className}`}
      role="banner"
      style={{ border: '1px solid rgba(209, 213, 219, 0.6)' }}
    >
      {/* 3x4 grid matching target image layout */}
      <div
        className="grid grid-cols-4 gap-2 p-3 min-h-[120px]"
        style={{ gridTemplateColumns: '2fr 200px 200px 200px' }}
      >
        {/* Row 1, Col 1: Navigation */}
        <div className="flex items-start justify-start">
          <div className="flex flex-wrap items-center gap-2">
            {navigationData && (
              <RaceNavigation
                navigationData={navigationData}
                currentRaceId={race.raceId}
              />
            )}
          </div>
        </div>

        {/* Row 1, Col 2: Date */}
        <div className="flex items-center justify-start">
          <div className="text-sm text-gray-600">
            {currentTime.toLocaleDateString('en-NZ', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>

        {/* Row 1, Col 3: Time */}
        <div className="flex items-center justify-start">
          <div className="text-lg font-bold text-gray-900 font-mono">
            {currentTime.toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
        </div>

        {/* Row 1, Col 4: Polling status and logo */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-end gap-2 text-right">
            {pollingInfo && pollingSummary && (
              <>
                <PollingHealth
                  isActive={pollingInfo.isActive}
                  lastUpdate={pollingInfo.lastUpdate}
                  error={pollingInfo.error ?? undefined}
                  circuitBreakerState={pollingInfo.circuitBreakerState}
                  dataFreshness={pollingInfo.dataFreshness}
                  retryCount={pollingInfo.retryCount}
                  showNotifications={false}
                  className="flex items-center justify-end gap-2"
                />
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Last update:{' '}
                  <span className="font-semibold text-gray-700">
                    {pollingSummary.lastUpdateLabel}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] uppercase tracking-wide text-gray-500">
                  <span>
                    Freshness:{' '}
                    <span
                      className={`font-semibold ${pollingSummary.freshnessClass}`}
                    >
                      {pollingSummary.freshnessLabel}
                    </span>
                  </span>
                  <span className="text-gray-400">•</span>
                  <span>
                    Cycles:{' '}
                    <span className="font-semibold text-gray-700">
                      {pollingSummary.totalUpdates}
                    </span>
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Connection:{' '}
                  <span
                    className={`font-semibold ${pollingSummary.connectionClass}`}
                  >
                    {pollingSummary.connectionLabel}
                  </span>
                </div>
              </>
            )}
            {!pollingInfo && (
              <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg px-2 py-1 text-center text-gray-500 font-bold text-xs">
                LOGO Image
                <br />
                Placeholder
              </div>
            )}
          </div>
        </div>

        {/* Row 2, Col 1: Race Title */}
        <div className="flex flex-col justify-start overflow-hidden">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 leading-tight truncate whitespace-nowrap">
            Race {race.raceNumber}: {race.name}
          </h1>
        </div>

        {/* Row 2, Col 2: Weather */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            WEATHER
          </div>
          <div className="text-sm font-semibold text-gray-800">
            {race.weather || 'overcast'}
          </div>
        </div>

        {/* Row 2, Col 3: Track Condition */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            TRACK COND
          </div>
          <div className="text-sm font-semibold text-green-800">
            {race.trackCondition || 'Synthetic'}
          </div>
        </div>

        {/* Row 2, Col 4: Status with Real-time Health and Alerts Config */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 font-bold uppercase">
              STATUS
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full bg-${healthStatus.color}-500`}
              ></div>
              <span
                className={`text-sm font-semibold text-${healthStatus.color}-800`}
              >
                {healthStatus.status}
              </span>
              {alertSummary && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    alertSummary.severity === 'error'
                      ? 'bg-red-100 text-red-700'
                      : alertSummary.severity === 'warning'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {alertSummary.count} alert
                  {alertSummary.count > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Connection Monitor Toggle (Development Only) */}
            {showDevelopmentFeatures() && onToggleConnectionMonitor && (
              <button
                onClick={onToggleConnectionMonitor}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  showConnectionMonitor
                    ? 'bg-blue-200 text-blue-700 hover:bg-blue-300'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-700'
                }`}
                title="Toggle connection monitor"
                aria-label="Toggle connection monitoring panel"
              >
                🔧
              </button>
            )}

            {/* Alerts Configuration Button */}
            {onConfigureAlerts && (
              <button
                onClick={onConfigureAlerts}
                className="text-xs px-2 py-1 rounded transition-colors bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-700"
                title="Configure indicators"
                aria-label="Open indicators configuration"
              >
                ⚙️
              </button>
            )}
          </div>
        </div>

        {/* Row 3, Col 1: Meeting info */}
        <div className="flex items-center gap-1 text-sm text-gray-700 overflow-hidden">
          <span className="font-medium">{meeting.meetingName}</span>
          <span>•</span>
          <span>{meeting.country}</span>
          <span>•</span>
          <time dateTime={race.startTime} className="font-mono">
            {formattedTime}
          </time>
          <span>•</span>
          <span className="text-purple-800 font-medium max-w-24 whitespace-nowrap">
            {formattedRaceType}
          </span>
        </div>

        {/* Row 3, Col 2: Race Distance */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            RACE DISTANCE
          </div>
          <div className="text-sm font-semibold text-blue-800">
            {formattedDistance || '2.1km'}
          </div>
        </div>

        {/* Row 3, Col 3: Runners (SCR) */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            RUNNERS (SCR)
          </div>
          <div className="text-sm font-semibold">
            <span className="text-blue-800">
              {runnersCount > 0
                ? scratchedCount > 0
                  ? `${runnersCount - scratchedCount}`
                  : runnersCount
                : '8'}
            </span>
            <span className="text-blue-800">
              {scratchedCount > 0 ? ` (${scratchedCount})` : ' (2)'}
            </span>
          </div>
        </div>

        {/* Row 3, Col 4: Real-time Connection Latency */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            LATENCY
          </div>
          <div
            className={`text-sm font-semibold ${
              avgLatency === null
                ? 'text-gray-600'
                : avgLatency > 200
                ? 'text-red-800'
                : avgLatency > 100
                ? 'text-yellow-800'
                : 'text-green-800'
            }`}
          >
            {avgLatency === null ? '—' : `${avgLatency.toFixed(2)}ms`}
          </div>
        </div>
      </div>
    </div>
  )
})
