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

  // Always show milliseconds for consistency with race header
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

function getLatencyColor(latencyMs: number | null): string {
  if (!latencyMs) return 'text-gray-600'
  if (latencyMs <= 100) return 'text-green-600'
  if (latencyMs <= 300) return 'text-yellow-600'
  return 'text-red-600'
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 0.95) return 'text-green-600'
  if (rate >= 0.8) return 'text-yellow-600'
  return 'text-red-600'
}

function getErrorRateColor(rate: number): string {
  if (rate <= 0.05) return 'text-green-600'
  if (rate <= 0.15) return 'text-yellow-600'
  return 'text-red-600'
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
          <span className="text-lg bg-gray-800 text-white px-1.5 py-0.5 rounded" style={{ fontSize: '16px' }}>🔧</span>
          <span>Polling Monitor</span>
          {metrics && (
            <span className="flex items-center gap-3 text-xs font-mono text-gray-500">
              <span className={errorRateClass}>{formatPercentage(errorRate)} err</span>
              <span className={`${getLatencyColor(metrics.totals.averageLatencyMs)}`}>
                {formatLatency(metrics.totals.averageLatencyMs)} avg
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
        <div className="p-2 space-y-1">
          {metrics ? (
            <>
              {/* Core Metrics - Horizontal Layout */}
              <div className="bg-white rounded border p-2">
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Requests:</span>
                    <span className="font-semibold text-gray-900">{metrics.totals.requests}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Success:</span>
                    <span className={`font-semibold ${getSuccessRateColor(successRate)}`}>
                      {formatPercentage(successRate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Errors:</span>
                    <span className={`font-semibold ${getErrorRateColor(errorRate)}`}>
                      {formatPercentage(errorRate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Latency:</span>
                    <span className={`font-semibold ${getLatencyColor(metrics.totals.averageLatencyMs)}`}>
                      {formatLatency(metrics.totals.averageLatencyMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Uptime:</span>
                    <span className="font-semibold text-blue-600">{formatDuration(metrics.uptimeMs)}</span>
                  </div>
                </div>
              </div>

              {/* Schedule & Timing - Compact Layout */}
              <div className="bg-white rounded border p-2">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Cadence:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${complianceStyle.className}`}>
                      {complianceStyle.label}
                    </span>
                  </div>
                  {alertSummary && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase text-gray-500 font-medium">Alerts:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAlertClass(alertSummary.severity)}`}>
                        {alertSummary.count}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Target:</span>
                    <span className="font-semibold text-blue-600">{formatLatency(metrics.schedule.targetIntervalMs)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Actual:</span>
                    <span className="font-semibold text-gray-900">{formatLatency(metrics.schedule.lastActualIntervalMs)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Duration:</span>
                    <span className="font-semibold text-gray-900">{formatLatency(metrics.schedule.lastCycleDurationMs)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500 font-medium">Next:</span>
                    <span className="font-semibold text-gray-900">{formatTimestamp(metrics.schedule.nextRunAt)}</span>
                  </div>
                </div>
              </div>

              {metrics.alerts.length > 0 && (
                <div className="bg-white rounded border p-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs uppercase text-gray-500 font-medium">Active Alerts:</span>
                    {metrics.alerts.map(alert => (
                      <div key={alert.id} className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAlertClass(alert.level)}`}>
                          {alert.level.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{alert.message}</span>
                        {alert.detail && (
                          <span className="text-xs text-gray-500">({alert.detail})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Endpoint Performance - Ultra Compact Table */}
              {sortedEndpoints.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-medium text-gray-700 uppercase tracking-wide">
                    Endpoint Performance
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase tracking-wide">
                        <tr>
                          <th className="px-2 py-1 font-semibold">Endpoint</th>
                          <th className="px-2 py-1 font-semibold">Req</th>
                          <th className="px-2 py-1 font-semibold">Err%</th>
                          <th className="px-2 py-1 font-semibold">Latency</th>
                          <th className="px-2 py-1 font-semibold">Last Success</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedEndpoints.map(endpoint => (
                          <tr key={endpoint.key} className="text-gray-700">
                            <td className="px-2 py-1 font-semibold text-gray-800 text-xs">{endpoint.label}</td>
                            <td className="px-2 py-1 text-xs">{endpoint.requestCount}</td>
                            <td className={`px-2 py-1 font-semibold text-xs ${getErrorRateColor(endpoint.errorRate)}`}>
                              {formatPercentage(endpoint.errorRate)}
                            </td>
                            <td className={`px-2 py-1 font-semibold text-xs ${getLatencyColor(endpoint.averageLatencyMs)}`}>
                              {formatLatency(endpoint.averageLatencyMs)}
                            </td>
                            <td className="px-2 py-1 text-xs">{formatTimestamp(endpoint.lastSuccessAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {metrics.events.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-2 py-1.5 bg-gray-50 border-b text-xs font-medium text-gray-700 uppercase tracking-wide">
                    Recent Activity ({metrics.events.length} event{metrics.events.length === 1 ? '' : 's'})
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-gray-100">
                    {metrics.events.slice().reverse().map((event, index) => (
                      <div
                        key={`${event.timestamp}-${index}`}
                        className="px-2 py-1 text-xs flex items-center gap-2"
                      >
                        <span className="font-mono text-gray-400 w-16 text-[10px]">{formatTimestamp(event.timestamp)}</span>
                        <span className={`uppercase tracking-wide font-semibold text-[10px] ${getEventAccent(event.type)}`}>
                          {event.type}
                        </span>
                        <span className="text-gray-700 flex-1 text-[11px]">{event.message}</span>
                        {event.details && (
                          <span className="text-[10px] text-gray-500">
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
