'use client'

import { useEffect, useMemo, useState } from 'react'
import { showDevelopmentFeatures } from '@/utils/environment'
import {
  getPollingMetricsSnapshot,
  type PollingAlert,
  type PollingEndpointMetrics,
  type PollingMetricsSnapshot,
  type PollingScheduleMetrics,
} from '@/utils/pollingMetrics'

interface ConnectionMonitorProps {
  isOpen: boolean
  onToggle: () => void
  className?: string
}

const complianceStyles: Record<
  PollingScheduleMetrics['compliance'],
  { label: string; className: string }
> = {
  'on-track': { label: 'On Track', className: 'bg-green-100 text-green-700' },
  slow: { label: 'Running Slow', className: 'bg-yellow-100 text-yellow-700' },
  stalled: { label: 'Stalled', className: 'bg-red-100 text-red-700' },
}

function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || Number.isNaN(durationMs)) {
    return '—'
  }

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined || Number.isNaN(latencyMs)) {
    return '—'
  }

  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(2)}s`
  }

  return `${latencyMs.toFixed(0)}ms`
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return '—'
  }

  return new Date(timestamp).toLocaleTimeString('en-NZ', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function getAlertSummary(alerts: PollingAlert[]): { severity: PollingAlert['level']; count: number } | null {
  if (alerts.length === 0) {
    return null
  }

  const hasError = alerts.some(alert => alert.level === 'error')
  const hasWarning = alerts.some(alert => alert.level === 'warning')

  if (hasError) {
    return { severity: 'error', count: alerts.length }
  }

  if (hasWarning) {
    return { severity: 'warning', count: alerts.length }
  }

  return { severity: 'info', count: alerts.length }
}

function getAlertClass(level: PollingAlert['level']): string {
  switch (level) {
    case 'error':
      return 'bg-red-100 text-red-700'
    case 'warning':
      return 'bg-yellow-100 text-yellow-700'
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function getEventAccent(type: PollingMetricsSnapshot['events'][number]['type']): string {
  switch (type) {
    case 'error':
      return 'text-red-600'
    case 'success':
      return 'text-green-600'
    case 'cycle':
      return 'text-blue-600'
    case 'schedule':
      return 'text-purple-600'
    default:
      return 'text-gray-600'
  }
}

export function ConnectionMonitor({ isOpen, onToggle, className = '' }: ConnectionMonitorProps) {
  const devEnabled = showDevelopmentFeatures()
  const [metrics, setMetrics] = useState<PollingMetricsSnapshot | null>(null)
  const [refreshInterval, setRefreshInterval] = useState(1000)

  useEffect(() => {
    if (!devEnabled) {
      return
    }

    const updateMetrics = () => {
      setMetrics(getPollingMetricsSnapshot())
    }

    updateMetrics()
    const intervalId = setInterval(updateMetrics, refreshInterval)

    return () => {
      clearInterval(intervalId)
    }
  }, [devEnabled, refreshInterval])

  const alertSummary = useMemo(() => {
    if (!devEnabled || !metrics) {
      return null
    }

    return getAlertSummary(metrics.alerts)
  }, [devEnabled, metrics])

  const errorRate = metrics?.totals.errorRate ?? 0
  const errorRateClass = errorRate > 0.1 ? 'text-red-600' : errorRate > 0.05 ? 'text-yellow-600' : 'text-green-600'

  const successRate = metrics && metrics.totals.requests > 0
    ? metrics.totals.successes / metrics.totals.requests
    : metrics?.totals.requests === 0
    ? 1
    : 0

  const sortedEndpoints = useMemo<PollingEndpointMetrics[]>(() => {
    if (!devEnabled || !metrics) {
      return []
    }

    return [...metrics.endpoints].sort((a, b) => b.requestCount - a.requestCount)
  }, [devEnabled, metrics])

  const compliance = metrics?.schedule.compliance ?? 'on-track'
  const complianceStyle = complianceStyles[compliance]

  if (!devEnabled) {
    return null
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200 rounded-t-lg">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <span className="text-xs">🔧</span>
          <span>Polling Monitor</span>
          {metrics && (
            <span className="flex items-center gap-3 text-xs font-mono text-gray-500">
              <span className={errorRateClass}>{formatPercentage(errorRate)} err</span>
              <span className="text-blue-600">
                Δ {formatLatency(metrics.schedule.lastActualIntervalMs)}
              </span>
            </span>
          )}
          <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>

        <div className="flex items-center gap-3 text-xs text-gray-600">
          <label className="flex items-center gap-2">
            Refresh
            <select
              value={refreshInterval}
              onChange={event => setRefreshInterval(Number(event.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
            >
              <option value={500}>0.5s</option>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
          {metrics?.debugMode && (
            <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold">Debug</span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {metrics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-white rounded border">
                  <div className="text-xs uppercase text-gray-500">Total Requests</div>
                  <div className="text-2xl font-bold text-gray-900">{metrics.totals.requests}</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="text-xs uppercase text-gray-500">Success Rate</div>
                  <div className="text-2xl font-bold text-green-600">{formatPercentage(successRate)}</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="text-xs uppercase text-gray-500">Error Rate</div>
                  <div className={`text-2xl font-bold ${errorRateClass}`}>{formatPercentage(errorRate)}</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="text-xs uppercase text-gray-500">Avg Latency</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatLatency(metrics.totals.averageLatencyMs)}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded border p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500">Cadence</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${complianceStyle.className}`}>
                      {complianceStyle.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Uptime <span className="font-semibold text-gray-800">{formatDuration(metrics.uptimeMs)}</span>
                  </div>
                  {alertSummary && (
                    <div className={`px-2 py-1 rounded text-xs font-semibold ${getAlertClass(alertSummary.severity)}`}>
                      {alertSummary.count} active alert{alertSummary.count === 1 ? '' : 's'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                  <div>
                    Target Interval
                    <div className="font-semibold text-gray-800">
                      {formatLatency(metrics.schedule.targetIntervalMs)}
                    </div>
                  </div>
                  <div>
                    Scheduled Interval
                    <div className="font-semibold text-gray-800">
                      {formatLatency(metrics.schedule.scheduledIntervalMs)}
                    </div>
                  </div>
                  <div>
                    Last Interval
                    <div className="font-semibold text-gray-800">
                      {formatLatency(metrics.schedule.lastActualIntervalMs)}
                    </div>
                  </div>
                  <div>
                    Background Multiplier
                    <div className="font-semibold text-gray-800">
                      ×{metrics.schedule.backgroundMultiplier.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    Last Cycle Duration
                    <div className="font-semibold text-gray-800">
                      {formatLatency(metrics.schedule.lastCycleDurationMs)}
                    </div>
                  </div>
                  <div>
                    Next Run
                    <div className="font-semibold text-gray-800">
                      {formatTimestamp(metrics.schedule.nextRunAt)}
                    </div>
                  </div>
                </div>
              </div>

              {metrics.alerts.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
                    Active Alerts
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {metrics.alerts.map(alert => (
                      <li key={alert.id} className="px-3 py-2 text-sm flex items-start gap-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getAlertClass(alert.level)}`}>
                          {alert.level.toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-800">{alert.message}</div>
                          {alert.detail && (
                            <div className="text-xs text-gray-500">{alert.detail}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-white rounded border">
                <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
                  Endpoint Performance
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-gray-100 text-gray-600 uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Endpoint</th>
                        <th className="px-3 py-2 font-semibold">Requests</th>
                        <th className="px-3 py-2 font-semibold">Errors</th>
                        <th className="px-3 py-2 font-semibold">Avg Latency</th>
                        <th className="px-3 py-2 font-semibold">p95 Latency</th>
                        <th className="px-3 py-2 font-semibold">Last Success</th>
                        <th className="px-3 py-2 font-semibold">Last Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedEndpoints.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-gray-500" colSpan={7}>
                            No polling activity recorded yet.
                          </td>
                        </tr>
                      )}
                      {sortedEndpoints.map(endpoint => {
                        const errorClass = endpoint.errorRate > 0.1
                          ? 'text-red-600'
                          : endpoint.errorRate > 0.05
                          ? 'text-yellow-600'
                          : 'text-green-600'

                        return (
                          <tr key={endpoint.key} className="text-gray-700">
                            <td className="px-3 py-2 font-semibold text-gray-800">{endpoint.label}</td>
                            <td className="px-3 py-2">{endpoint.requestCount}</td>
                            <td className={`px-3 py-2 font-mono ${errorClass}`}>
                              {formatPercentage(endpoint.errorRate)}
                            </td>
                            <td className="px-3 py-2">{formatLatency(endpoint.averageLatencyMs)}</td>
                            <td className="px-3 py-2">{formatLatency(endpoint.p95LatencyMs)}</td>
                            <td className="px-3 py-2">{formatTimestamp(endpoint.lastSuccessAt)}</td>
                            <td className="px-3 py-2">{formatTimestamp(endpoint.lastErrorAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {metrics.events.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700 flex items-center justify-between">
                    <span>Recent Activity</span>
                    <span className="text-xs text-gray-500">
                      Showing last {metrics.events.length} event{metrics.events.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {metrics.events.map((event, index) => (
                      <div
                        key={`${event.timestamp}-${index}`}
                        className="px-3 py-2 text-xs flex flex-col md:flex-row md:items-center md:gap-3"
                      >
                        <span className="font-mono text-gray-400 w-24">{formatTimestamp(event.timestamp)}</span>
                        <span className={`uppercase tracking-wide font-semibold ${getEventAccent(event.type)}`}>
                          {event.type}
                        </span>
                        <span className="text-gray-700 md:flex-1">{event.message}</span>
                        {event.details && (
                          <span className="text-[11px] text-gray-500">
                            {Object.entries(event.details)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-gray-500">
              <div className="text-sm font-semibold">Polling metrics unavailable</div>
              <div className="text-xs mt-1">
                Metrics will appear after the first polling cycle completes.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
