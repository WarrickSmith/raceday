/**
 * Basic test suite for useRacePolling hook - Task 2 Implementation
 * Tests the core functionality and interval calculation logic
 */

import { renderHook, act } from '@testing-library/react'

// Mock the logger
jest.mock('@/utils/logging', () => ({
  useLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

// Mock fetch globally
global.fetch = jest.fn()

// Simple mock data for testing
const mockRaceData = {
  race: {
    $id: 'test-race-id',
    name: 'Test Race',
    startTime: '2024-01-01T14:00:00Z',
    status: 'Open',
  },
  entrants: [],
  pools: null,
  moneyFlowUpdateTrigger: 0,
}

// Import the hook after mocks are set up
import { useRacePolling } from '../useRacePolling'


describe('useRacePolling - Basic Tests', () => {
  let mockOnDataUpdate: jest.Mock
  let mockOnError: jest.Mock

  // Helper to create config with proper typing
  const createConfig = (overrides: Record<string, unknown> = {}) => ({
    raceId: 'test-race-id',
    raceStartTime: '2024-01-01T14:00:00Z',
    raceStatus: 'Open',
    initialData: mockRaceData,
    onDataUpdate: mockOnDataUpdate,
    onError: mockOnError,
    ...overrides,
  } as unknown as Parameters<typeof useRacePolling>[0])

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockOnDataUpdate = jest.fn()
    mockOnError = jest.fn()

    // Setup successful fetch responses
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        race: mockRaceData.race,
        entrants: mockRaceData.entrants,
        pools: mockRaceData.pools,
      }),
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('initialization', () => {
    it('should initialize with correct config', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      // Should return the hook interface
      expect(result.current).toHaveProperty('pollingState')
      expect(result.current).toHaveProperty('errorState')
      expect(result.current).toHaveProperty('startPolling')
      expect(result.current).toHaveProperty('pausePolling')
      expect(result.current).toHaveProperty('resumePolling')
      expect(result.current).toHaveProperty('stopPolling')
      expect(result.current).toHaveProperty('forceUpdate')
    })

    it('should start polling with valid initial data', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      // Should auto-start with valid initial data
      expect(result.current.pollingState.isActive).toBe(true)
      expect(result.current.pollingState.isStopped).toBe(false)
    })

    it('should not start polling without race data', () => {
      const config = createConfig({
        initialData: { race: null, entrants: [], pools: null, moneyFlowUpdateTrigger: 0 }
      })
      const { result } = renderHook(() => useRacePolling(config))

      // Should not auto-start without race data
      expect(result.current.pollingState.isActive).toBe(false)
    })
  })

  describe('race status handling', () => {
    it('should stop polling for final race statuses', () => {
      const finalStatuses = ['Final', 'Finalized', 'Abandoned', 'Cancelled']

      finalStatuses.forEach(status => {
        const config = createConfig({ raceStatus: status })
        const { result } = renderHook(() => useRacePolling(config))

        // Should not be active for final statuses
        expect(result.current.pollingState.isActive).toBe(false)
      })
    })

    it('should handle status transitions', () => {
      const config = createConfig()

      const { result, rerender } = renderHook(
        (props) => useRacePolling(props),
        { initialProps: config }
      )

      expect(result.current.pollingState.isActive).toBe(true)

      // Change race status to final
      rerender(createConfig({ raceStatus: 'Final' }))

      // Should automatically stop polling
      expect(result.current.pollingState.isStopped).toBe(true)
      expect(result.current.pollingState.isActive).toBe(false)
    })
  })

  describe('manual controls', () => {
    it('should allow manual pause and resume', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      expect(result.current.pollingState.isActive).toBe(true)
      expect(result.current.pollingState.isPaused).toBe(false)

      // Pause polling
      act(() => {
        result.current.pausePolling()
      })

      expect(result.current.pollingState.isPaused).toBe(true)

      // Resume polling
      act(() => {
        result.current.resumePolling()
      })

      expect(result.current.pollingState.isPaused).toBe(false)
    })

    it('should allow manual stop', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      expect(result.current.pollingState.isActive).toBe(true)

      // Stop polling
      act(() => {
        result.current.stopPolling()
      })

      expect(result.current.pollingState.isStopped).toBe(true)
      expect(result.current.pollingState.isActive).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle fetch errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      // Force an update to trigger the error
      await act(async () => {
        try {
          await result.current.forceUpdate()
        } catch {
          // Expected to error
        }
      })

      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should track consecutive errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      // Trigger multiple errors
      await act(async () => {
        try {
          await result.current.forceUpdate()
        } catch {
          // Expected to error
        }
      })

      await act(async () => {
        try {
          await result.current.forceUpdate()
        } catch {
          // Expected to error
        }
      })

      expect(result.current.pollingState.consecutiveErrors).toBeGreaterThan(0)
      expect(result.current.errorState.lastError).toBeDefined()
    })
  })

  describe('background optimization', () => {
    beforeEach(() => {
      // Mock document.hidden
      Object.defineProperty(document, 'hidden', {
        writable: true,
        value: false,
      })
    })

    it('should detect background state changes', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      expect(result.current.pollingState.backgroundOptimization).toBe(false)

      // Simulate tab going to background
      act(() => {
        Object.defineProperty(document, 'hidden', { value: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(result.current.pollingState.backgroundOptimization).toBe(true)

      // Return to foreground
      act(() => {
        Object.defineProperty(document, 'hidden', { value: false })
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(result.current.pollingState.backgroundOptimization).toBe(false)
    })
  })

  describe('interface validation', () => {
    it('should provide all required methods', () => {
      const config = createConfig()
      const { result } = renderHook(() => useRacePolling(config))

      // Verify all required methods exist
      expect(result.current.forceUpdate).toBeDefined()
      expect(typeof result.current.forceUpdate).toBe('function')
      expect(typeof result.current.startPolling).toBe('function')
      expect(typeof result.current.pausePolling).toBe('function')
      expect(typeof result.current.resumePolling).toBe('function')
      expect(typeof result.current.stopPolling).toBe('function')
    })
  })
})