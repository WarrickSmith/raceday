/**
 * Polling Status Component - Task 3 User Notifications
 *
 * Provides user-facing indicators for polling status including:
 * - Connection status indicators
 * - Error notifications with appropriate messaging
 * - Data staleness warnings
 * - Recovery status updates
 */

'use client'

import React, { useState, useEffect } from 'react'
import type { ErrorClassification, CircuitBreakerState } from '@/utils/pollingErrorHandler'
import type { DataFreshness } from '@/utils/pollingCache'

// Polling status levels
export type PollingStatusLevel = 'healthy' | 'warning' | 'error' | 'offline'

// Status indicator props
export interface PollingStatusProps {
  isActive: boolean
  lastUpdate?: Date | null
  error?: Error | null
  errorClassification?: ErrorClassification | null
  circuitBreakerState?: CircuitBreakerState
  dataFreshness?: DataFreshness
  retryCount?: number
  className?: string
  showDetails?: boolean
  compact?: boolean
}

// Error notification props
export interface ErrorNotificationProps {
  error: Error
  classification: ErrorClassification
  retryCount: number
  isRecovering: boolean
  onDismiss?: () => void
  autoHide?: boolean
  duration?: number
}

// Data staleness indicator props
export interface StalenessIndicatorProps {
  freshness: DataFreshness
  lastUpdate: Date
  showTooltip?: boolean
  className?: string
}

/**
 * Main polling status indicator component
 */
export function PollingStatus({
  isActive,
  lastUpdate,
  error,
  errorClassification,
  circuitBreakerState = 'closed',
  dataFreshness = 'fresh',
  retryCount = 0,
  className = '',
  showDetails = false,
  compact = false
}: PollingStatusProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Determine overall status level
  const statusLevel: PollingStatusLevel = React.useMemo(() => {
    if (circuitBreakerState === 'open') return 'offline'
    if (error && errorClassification?.severity === 'critical') return 'error'
    if (error || dataFreshness === 'stale') return 'warning'
    if (!isActive) return 'offline'
    return 'healthy'
  }, [isActive, error, errorClassification, circuitBreakerState, dataFreshness])

  // Show/hide based on status
  useEffect(() => {
    setIsVisible(statusLevel !== 'healthy' || showDetails)
  }, [statusLevel, showDetails])

  // Status messages
  const getStatusMessage = (): string => {
    if (circuitBreakerState === 'open') {
      return 'Service temporarily unavailable'
    }

    if (error && errorClassification) {
      switch (errorClassification.type) {
        case 'network':
          return retryCount > 0 ? 'Reconnecting...' : 'Connection issue'
        case 'server_error':
          return 'Service issue - retrying'
        case 'timeout':
          return 'Slow connection - retrying'
        default:
          return 'Temporary issue - retrying'
      }
    }

    if (dataFreshness === 'stale') {
      return 'Using recent data'
    }

    if (dataFreshness === 'critical') {
      return 'Data may be outdated'
    }

    if (!isActive) {
      return 'Updates paused'
    }

    return 'Live updates active'
  }

  // Status colors and icons
  const getStatusStyling = () => {
    switch (statusLevel) {
      case 'healthy':
        return {
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          icon: '●',
          iconColor: 'text-green-500'
        }
      case 'warning':
        return {
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          icon: '⚠',
          iconColor: 'text-yellow-500'
        }
      case 'error':
        return {
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          icon: '●',
          iconColor: 'text-red-500'
        }
      case 'offline':
        return {
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          icon: '●',
          iconColor: 'text-gray-400'
        }
    }
  }

  const styling = getStatusStyling()

  if (!isVisible && !showDetails) {
    return null
  }

  const baseClasses = compact
    ? `inline-flex items-center px-2 py-1 text-xs rounded-md border ${styling.bgColor} ${styling.textColor} ${styling.borderColor}`
    : `flex items-center justify-between p-3 rounded-lg border ${styling.bgColor} ${styling.textColor} ${styling.borderColor}`

  return (
    <div className={`${baseClasses} ${className}`}>
      <div className="flex items-center space-x-2">
        <span className={`${styling.iconColor} ${compact ? 'text-xs' : 'text-sm'}`}>
          {styling.icon}
        </span>
        <span className={compact ? 'text-xs' : 'text-sm font-medium'}>
          {getStatusMessage()}
        </span>
        {retryCount > 0 && !compact && (
          <span className="text-xs opacity-70">
            (attempt {retryCount})
          </span>
        )}
      </div>

      {showDetails && lastUpdate && !compact && (
        <span className="text-xs opacity-70">
          {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}

/**
 * Error notification component with auto-dismiss
 */
export function ErrorNotification({
  error, // eslint-disable-line @typescript-eslint/no-unused-vars
  classification,
  retryCount,
  isRecovering,
  onDismiss,
  autoHide = true,
  duration = 5000
}: ErrorNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)

  // Auto-hide for transient errors
  useEffect(() => {
    if (autoHide && classification.severity !== 'critical') {
      const timer = setTimeout(() => {
        setIsVisible(false)
        onDismiss?.()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [autoHide, classification.severity, duration, onDismiss])

  // Don't show for abort errors or low severity
  if (classification.type === 'abort' || classification.severity === 'low') {
    return null
  }

  if (!isVisible) {
    return null
  }

  const getMessage = (): string => {
    if (isRecovering) {
      return 'Reconnecting...'
    }

    switch (classification.type) {
      case 'network':
        return 'Connection issue. Please check your internet connection.'
      case 'server_error':
        return 'Service temporarily unavailable. We\'re working to restore it.'
      case 'timeout':
        return 'Connection is slower than usual. Please wait...'
      case 'client_error':
        return 'Unable to load data. Please refresh the page if this continues.'
      default:
        return 'Temporary issue occurred. Retrying automatically...'
    }
  }

  const getNotificationStyling = () => {
    if (isRecovering) {
      return {
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        icon: '🔄'
      }
    }

    switch (classification.severity) {
      case 'critical':
        return {
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          icon: '❌'
        }
      case 'high':
        return {
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-700',
          borderColor: 'border-orange-200',
          icon: '⚠️'
        }
      default:
        return {
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          icon: '⚠️'
        }
    }
  }

  const styling = getNotificationStyling()

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg border shadow-lg ${styling.bgColor} ${styling.textColor} ${styling.borderColor}`}>
      <div className="flex items-start space-x-3">
        <span className="flex-shrink-0 text-lg">
          {styling.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {getMessage()}
          </p>
          {retryCount > 0 && !isRecovering && (
            <p className="mt-1 text-xs opacity-70">
              Retry attempt {retryCount}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={() => {
              setIsVisible(false)
              onDismiss()
            }}
            className="flex-shrink-0 text-sm opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Data staleness indicator
 */
export function StalenessIndicator({
  freshness,
  lastUpdate,
  showTooltip = true,
  className = ''
}: StalenessIndicatorProps) {
  const [showTooltipState, setShowTooltipState] = useState(false)

  // Don't show for fresh data
  if (freshness === 'fresh') {
    return null
  }

  const getStalenessInfo = () => {
    const now = new Date()
    const ageMs = now.getTime() - lastUpdate.getTime()
    const ageMinutes = Math.floor(ageMs / 60000)
    const ageSeconds = Math.floor((ageMs % 60000) / 1000)

    const ageText = ageMinutes > 0
      ? `${ageMinutes}m ${ageSeconds}s ago`
      : `${ageSeconds}s ago`

    switch (freshness) {
      case 'acceptable':
        return {
          icon: '🟡',
          text: 'Recent data',
          tooltip: `Last updated ${ageText}`,
          color: 'text-yellow-600'
        }
      case 'stale':
        return {
          icon: '🟠',
          text: 'Older data',
          tooltip: `Last updated ${ageText}`,
          color: 'text-orange-600'
        }
      case 'critical':
        return {
          icon: '🔴',
          text: 'Outdated',
          tooltip: `Last updated ${ageText} - data may be unreliable`,
          color: 'text-red-600'
        }
    }
  }

  const info = getStalenessInfo()

  return (
    <div
      className={`relative inline-flex items-center space-x-1 ${className}`}
      onMouseEnter={() => showTooltip && setShowTooltipState(true)}
      onMouseLeave={() => setShowTooltipState(false)}
    >
      <span className="text-xs">{info.icon}</span>
      <span className={`text-xs font-medium ${info.color}`}>
        {info.text}
      </span>

      {showTooltip && showTooltipState && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap z-10">
          {info.tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  )
}

/**
 * Comprehensive polling health indicator
 */
export interface PollingHealthProps {
  isActive: boolean
  lastUpdate?: Date | null
  error?: Error | null
  errorClassification?: ErrorClassification | null
  circuitBreakerState?: CircuitBreakerState
  dataFreshness?: DataFreshness
  retryCount?: number
  showNotifications?: boolean
  className?: string
}

export function PollingHealth({
  isActive,
  lastUpdate,
  error,
  errorClassification,
  circuitBreakerState,
  dataFreshness = 'fresh',
  retryCount = 0,
  showNotifications = true,
  className = ''
}: PollingHealthProps) {
  const [dismissedErrors, setDismissedErrors] = useState(new Set<string>())

  // Generate unique error key for dismissal tracking
  const errorKey = error ? `${error.message}-${retryCount}` : ''

  const shouldShowNotification =
    showNotifications &&
    error &&
    errorClassification &&
    !dismissedErrors.has(errorKey) &&
    (errorClassification.severity === 'high' || errorClassification.severity === 'critical' || retryCount >= 2)

  const handleDismissError = () => {
    if (errorKey) {
      setDismissedErrors(prev => new Set(prev).add(errorKey))
    }
  }

  return (
    <div className={className}>
      {/* Status indicator */}
      <PollingStatus
        isActive={isActive}
        lastUpdate={lastUpdate}
        error={error}
        errorClassification={errorClassification}
        circuitBreakerState={circuitBreakerState}
        dataFreshness={dataFreshness}
        retryCount={retryCount}
        compact
      />

      {/* Data staleness indicator */}
      {lastUpdate && (
        <StalenessIndicator
          freshness={dataFreshness}
          lastUpdate={lastUpdate}
          className="ml-2"
        />
      )}

      {/* Error notification */}
      {shouldShowNotification && error && errorClassification && (
        <ErrorNotification
          error={error}
          classification={errorClassification}
          retryCount={retryCount}
          isRecovering={circuitBreakerState === 'half-open'}
          onDismiss={handleDismissError}
          autoHide={errorClassification.severity !== 'critical'}
        />
      )}
    </div>
  )
}

// Export all components
export default PollingStatus