/**
 * Polling Error Handler - Task 3 Implementation
 *
 * Provides comprehensive error handling for client-side polling including:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Retry logic with configurable strategies
 * - Error classification and appropriate response strategies
 */

'use client'

import { logDebug, logError, logInfo, logWarn } from '@/utils/logging'

// Error types for classification
export type PollingErrorType =
  | 'network'
  | 'timeout'
  | 'server_error'
  | 'client_error'
  | 'abort'
  | 'unknown'

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

// Retry strategies
export type RetryStrategy = 'exponential' | 'linear' | 'fixed' | 'none'

// Error classification result
export interface ErrorClassification {
  type: PollingErrorType
  severity: ErrorSeverity
  retryable: boolean
  shouldOpenCircuitBreaker: boolean
  message: string
}

// Error handler configuration
export interface ErrorHandlerConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryStrategy: RetryStrategy
  jitterFactor: number
  circuitBreakerThreshold: number
  circuitBreakerTimeout: number
  enableCircuitBreaker: boolean
}

// Default configuration matching Task 3 specifications
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds max
  retryStrategy: 'exponential',
  jitterFactor: 0.1, // 10% jitter
  circuitBreakerThreshold: 5, // 5 consecutive failures
  circuitBreakerTimeout: 60000, // 1 minute before half-open
  enableCircuitBreaker: true,
}

// Circuit breaker states
export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

// Circuit breaker interface
export interface CircuitBreakerStatus {
  state: CircuitBreakerState
  failures: number
  lastFailureTime: number | null
  nextAttemptTime: number | null
  isEnabled: boolean
}

/**
 * Comprehensive polling error handler implementing Task 3 requirements
 */
export class PollingErrorHandler {
  private config: ErrorHandlerConfig

  // Circuit breaker state
  private circuitBreaker: CircuitBreakerStatus = {
    state: 'closed',
    failures: 0,
    lastFailureTime: null,
    nextAttemptTime: null,
    isEnabled: true,
  }

  // Retry state tracking
  private retryCount = 0
  private lastError: Error | null = null

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.circuitBreaker.isEnabled = this.config.enableCircuitBreaker
  }

  /**
   * Classify error type and determine appropriate response strategy
   */
  classifyError(error: unknown): ErrorClassification {
    let classification: ErrorClassification = {
      type: 'unknown',
      severity: 'medium',
      retryable: true,
      shouldOpenCircuitBreaker: false,
      message: 'Unknown error occurred'
    }

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()

      // Abort errors (request cancelled)
      if (error.name === 'AbortError' || errorMessage.includes('abort')) {
        return {
          type: 'abort',
          severity: 'low',
          retryable: false,
          shouldOpenCircuitBreaker: false,
          message: 'Request was cancelled'
        }
      }

      // Network errors
      if (errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout')) {
        classification = {
          type: 'network',
          severity: 'high',
          retryable: true,
          shouldOpenCircuitBreaker: true,
          message: 'Network connectivity issue'
        }
      }

      // Server errors (5xx)
      if (errorMessage.includes('500') ||
          errorMessage.includes('502') ||
          errorMessage.includes('503') ||
          errorMessage.includes('504') ||
          errorMessage.includes('internal server error')) {
        classification = {
          type: 'server_error',
          severity: 'high',
          retryable: true,
          shouldOpenCircuitBreaker: true,
          message: 'Server error - service may be temporarily unavailable'
        }
      }

      // Client errors (4xx) - generally not retryable
      if (errorMessage.includes('400') ||
          errorMessage.includes('401') ||
          errorMessage.includes('403') ||
          errorMessage.includes('404') ||
          errorMessage.includes('429')) {
        classification = {
          type: 'client_error',
          severity: errorMessage.includes('429') ? 'high' : 'medium',
          retryable: errorMessage.includes('429'), // Retry rate limits only
          shouldOpenCircuitBreaker: false,
          message: 'Client error - check request parameters'
        }
      }

      // Timeout errors
      if (errorMessage.includes('timeout')) {
        classification = {
          type: 'timeout',
          severity: 'medium',
          retryable: true,
          shouldOpenCircuitBreaker: false,
          message: 'Request timed out'
        }
      }

      classification.message = error.message || classification.message
    }

    return classification
  }

  /**
   * Calculate backoff delay using specified strategy with jitter
   */
  calculateBackoffDelay(attempt: number): number {
    let delay: number

    switch (this.config.retryStrategy) {
      case 'exponential':
        delay = this.config.baseDelay * Math.pow(2, attempt)
        break
      case 'linear':
        delay = this.config.baseDelay * (attempt + 1)
        break
      case 'fixed':
        delay = this.config.baseDelay
        break
      case 'none':
        return 0
      default:
        delay = this.config.baseDelay * Math.pow(2, attempt)
    }

    // Apply maximum delay limit
    delay = Math.min(delay, this.config.maxDelay)

    // Add jitter to prevent thundering herd effects
    if (this.config.jitterFactor > 0) {
      const jitterRange = delay * this.config.jitterFactor
      const jitter = (Math.random() - 0.5) * 2 * jitterRange
      delay = Math.max(0, delay + jitter)
    }

    return Math.round(delay)
  }

  /**
   * Determine if error should be retried based on classification and current state
   */
  shouldRetry(error: unknown): boolean {
    const classification = this.classifyError(error)

    // Don't retry if not retryable by nature
    if (!classification.retryable) {
      logDebug('Error not retryable', {
        type: classification.type,
        message: classification.message
      }, 'PollingErrorHandler')
      return false
    }

    // Don't retry if max attempts reached
    if (this.retryCount >= this.config.maxRetries) {
      logDebug('Max retry attempts reached', {
        retryCount: this.retryCount,
        maxRetries: this.config.maxRetries
      }, 'PollingErrorHandler')
      return false
    }

    // Don't retry if circuit breaker is open
    if (this.circuitBreaker.state === 'open') {
      logDebug('Circuit breaker is open, blocking retry', undefined, 'PollingErrorHandler')
      return false
    }

    return true
  }

  /**
   * Update circuit breaker state based on error
   */
  updateCircuitBreaker(error: unknown, isSuccess: boolean = false): void {
    if (!this.config.enableCircuitBreaker) {
      return
    }

    const now = Date.now()

    if (isSuccess) {
      // Reset on success
      this.circuitBreaker.failures = 0
      this.circuitBreaker.lastFailureTime = null
      this.circuitBreaker.nextAttemptTime = null

      // Close circuit breaker if it was half-open
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed'
        logInfo('Circuit breaker closed after successful request', undefined, 'PollingErrorHandler')
      }
      return
    }

    // Handle failure
    const classification = this.classifyError(error)

    if (classification.shouldOpenCircuitBreaker) {
      this.circuitBreaker.failures++
      this.circuitBreaker.lastFailureTime = now

      logDebug('Circuit breaker failure count updated', {
        failures: this.circuitBreaker.failures,
        threshold: this.config.circuitBreakerThreshold
      }, 'PollingErrorHandler')

      // Open circuit breaker if threshold reached
      if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold &&
          this.circuitBreaker.state === 'closed') {
        this.circuitBreaker.state = 'open'
        this.circuitBreaker.nextAttemptTime = now + this.config.circuitBreakerTimeout

        logWarn('Circuit breaker opened due to repeated failures', {
          failures: this.circuitBreaker.failures,
          nextAttemptTime: new Date(this.circuitBreaker.nextAttemptTime)
        }, 'PollingErrorHandler')
      }
    }
  }

  /**
   * Check if circuit breaker allows request
   */
  canAttemptRequest(): boolean {
    if (!this.config.enableCircuitBreaker) {
      return true
    }

    const now = Date.now()

    switch (this.circuitBreaker.state) {
      case 'closed':
        return true

      case 'open':
        if (this.circuitBreaker.nextAttemptTime && now >= this.circuitBreaker.nextAttemptTime) {
          // Transition to half-open for test request
          this.circuitBreaker.state = 'half-open'
          logInfo('Circuit breaker transitioning to half-open for test request', undefined, 'PollingErrorHandler')
          return true
        }
        return false

      case 'half-open':
        // Allow one test request in half-open state
        return true

      default:
        return true
    }
  }

  /**
   * Handle error and determine next action
   */
  handleError(error: unknown): {
    shouldRetry: boolean
    retryDelay: number
    classification: ErrorClassification
    circuitBreakerState: CircuitBreakerState
  } {
    this.lastError = error instanceof Error ? error : new Error('Unknown error')
    const classification = this.classifyError(error)

    // Update circuit breaker
    this.updateCircuitBreaker(error, false)

    // Determine if should retry
    const shouldRetry = this.shouldRetry(error)
    let retryDelay = 0

    if (shouldRetry) {
      retryDelay = this.calculateBackoffDelay(this.retryCount)
      this.retryCount++

      logDebug('Error will be retried', {
        classification,
        retryCount: this.retryCount,
        retryDelay,
        circuitBreakerState: this.circuitBreaker.state
      }, 'PollingErrorHandler')
    } else {
      logError('Error will not be retried', {
        classification,
        retryCount: this.retryCount,
        circuitBreakerState: this.circuitBreaker.state,
        error: this.lastError.message
      }, 'PollingErrorHandler')
    }

    return {
      shouldRetry,
      retryDelay,
      classification,
      circuitBreakerState: this.circuitBreaker.state
    }
  }

  /**
   * Handle successful request - reset retry state and circuit breaker
   */
  handleSuccess(): void {
    this.retryCount = 0
    this.lastError = null
    this.updateCircuitBreaker(null, true)

    logDebug('Request succeeded, reset error handler state', undefined, 'PollingErrorHandler')
  }

  /**
   * Reset handler state (useful for new polling cycles)
   */
  reset(): void {
    this.retryCount = 0
    this.lastError = null

    logDebug('Error handler state reset', undefined, 'PollingErrorHandler')
  }

  /**
   * Get current error handler state
   */
  getState() {
    return {
      retryCount: this.retryCount,
      lastError: this.lastError,
      circuitBreaker: { ...this.circuitBreaker },
      config: { ...this.config }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.circuitBreaker.isEnabled = this.config.enableCircuitBreaker

    logDebug('Error handler configuration updated', { config: this.config }, 'PollingErrorHandler')
  }

  /**
   * Get user-friendly error message based on classification
   */
  getUserFriendlyMessage(error: unknown): string {
    const classification = this.classifyError(error)

    switch (classification.type) {
      case 'network':
        return 'Connection issue. Checking your internet connection...'
      case 'server_error':
        return 'Service temporarily unavailable. Retrying...'
      case 'timeout':
        return 'Request taking longer than expected. Retrying...'
      case 'client_error':
        return 'Request error. Please refresh the page if this continues.'
      case 'abort':
        return '' // Don't show message for cancelled requests
      default:
        return 'Temporary issue occurred. Retrying...'
    }
  }

  /**
   * Check if we should show user notification based on error state
   */
  shouldShowUserNotification(error: unknown): boolean {
    const classification = this.classifyError(error)

    // Don't show notifications for:
    // - Abort errors (user-initiated cancellations)
    // - First few retries of low/medium severity errors
    // - When circuit breaker will handle it

    if (classification.type === 'abort') {
      return false
    }

    if (classification.severity === 'low') {
      return false
    }

    // Show notification for:
    // - High/critical severity errors immediately
    // - Medium severity after 2 retries
    // - When circuit breaker is open

    if (classification.severity === 'critical') {
      return true
    }

    if (classification.severity === 'high') {
      return this.retryCount >= 1
    }

    if (classification.severity === 'medium') {
      return this.retryCount >= 2
    }

    return this.circuitBreaker.state === 'open'
  }
}

/**
 * Factory function to create error handler with polling-specific defaults
 */
export function createPollingErrorHandler(config: Partial<ErrorHandlerConfig> = {}): PollingErrorHandler {
  return new PollingErrorHandler({
    ...DEFAULT_CONFIG,
    ...config
  })
}

/**
 * Utility function to wrap async functions with error handling
 */
export async function withErrorHandling<T>(
  handler: PollingErrorHandler,
  operation: () => Promise<T>,
  context: string = 'operation'
): Promise<T> {

  try {
    if (!handler.canAttemptRequest()) {
      throw new Error('Circuit breaker is open, request blocked')
    }

    const result = await operation()
    handler.handleSuccess()
    return result

  } catch (error) {
    logError(`Error in ${context}`, { error }, 'withErrorHandling')

    const errorResponse = handler.handleError(error)

    if (errorResponse.shouldRetry && errorResponse.retryDelay > 0) {
      logDebug(`Retrying ${context} after delay`, {
        delay: errorResponse.retryDelay,
        classification: errorResponse.classification
      }, 'withErrorHandling')

      // Return promise that rejects with retry info
      throw new Error(`Retry scheduled in ${errorResponse.retryDelay}ms`)
    }

    // Re-throw original error if not retrying
    throw error
  }
}

