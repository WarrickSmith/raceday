# Client Polling Implementation Plan - RaceDay v4.8

## Executive Summary

This document outlines the implementation strategy for a client-side polling system for the RaceDay single race page data updates. The polling strategy provides a predictable, controllable data update mechanism that follows server polling frequencies at a 2x rate to ensure optimal data freshness.

### Key Features
- **Client-side polling**: Follows server polling frequencies at 2x rate
- **Dynamic intervals**: Adjusts based on race timing and status
- **Coordinated fetching**: Single polling cycle for all data sources
- **Automatic termination**: Stops when race status transitions to `final`

---

## Polling Cadence Reference

The client polling strategy mirrors backend polling cadence but executes at **2× the backend frequency** until race status transitions to `final`:

| Backend Interval | Trigger Window | Required Client Interval | Notes |
|------------------|----------------|-------------------------|-------|
| 30 minutes | Early open status baseline windows | 15 minutes | Ensures timeline has same minimum history coverage, twice as frequent as backend |
| 2.5 minutes | -20m to -5m race window | 75 seconds | Maintain twice-the-frequency requirement while staying under 90s cap for UI freshness |
| 1 minute | HTTP-triggered polls, fallback/recovery loops | 30 seconds | Applies to fallback or recovery loops |
| 30 seconds | Ultra-critical, critical, post-start windows | 15 seconds | Continue until race status becomes `final`; stop afterwards |

> **Note**: The client poll scheduler must tolerate backend optimizations (locks, skipped polls) by independently enforcing the client-side minimum cadence while avoiding request storms. Use race status, start time, and last successful fetch timestamps to adjust timers.

---

## Current Architecture Context

### Server Polling Patterns (Reference)
**Master Scheduler**: `/server/master-race-scheduler/src/main.js`
- Runs every 1 minute via CRON
- Coordinates high-frequency polling via enhanced-race-poller

**Dynamic Intervals Based on Race Timing:**
```
T-65m+: 5-minute intervals (baseline capture)
T-30m to T-5m: 1-minute intervals
T-5m to T-3m: 30-second intervals
T-3m to Start: 15-second intervals
Post-start: 15-second intervals until Final
```

### API Endpoints Available for Polling
- `/client/src/app/api/race/[id]/route.ts` - Race data
- `/client/src/app/api/race/[id]/money-flow-timeline/route.ts` - Money flow data
- `/client/src/app/api/race/[id]/pools/route.ts` - Pool data
- `/client/src/app/api/race/[id]/entrants/route.ts` - Entrants data

---

## Implementation Tasks

### Task 1: Create Client-Side Polling Infrastructure
**Status**: Completed
**Priority**: Critical
**Estimated Effort**: 10 hours

**Problem Statement**:
The client needs a centralized polling mechanism that can handle dynamic intervals based on race timing and status, following the specific cadence requirements.

**Task Details**:
1. **Create Core Polling Hook** (`/client/src/hooks/useRacePolling.ts`):
   ```typescript
   interface PollingConfig {
     raceId: string;
     raceStartTime: string;
     raceStatus: string;
     initialData: RaceData;
     onDataUpdate: (data: RaceData) => void;
     onError: (error: Error) => void;
   }

   export function useRacePolling(config: PollingConfig) {
     // Dynamic interval calculation based on cadence table
     // Polling state management
     // Error handling and retry logic
     // Automatic start after initial fetch success
     // Stop when race status becomes 'final'
   }
   ```

2. **Implement Cadence Calculator**:
   ```typescript
   function calculateClientPollingInterval(timeToStart: number, raceStatus: string): number {
     // Backend 30m → Client 15m (900,000ms)
     if (timeToStart > 65) return 900000;
     // Backend 2.5m → Client 75s (75,000ms)
     if (timeToStart > 5) return 75000;
     // Backend 1m → Client 30s (30,000ms)
     if (timeToStart > 3) return 30000;
     // Backend 30s → Client 15s (15,000ms)
     return 15000;
   }
   ```

3. **Add Polling Lifecycle Management**:
   - Start polling only after `RaceContext.loadRaceData` resolves successfully
   - Active, paused, stopped states
   - Automatic stop when race status becomes `final` or `abandoned`
   - Background tab detection and optimization

4. **Implement Error Handling**:
   - Exponential backoff for failed requests
   - Circuit breaker for repeated failures
   - Request deduplication for overlapping polls
   - Graceful degradation to cached data

**Reference Information**:
- Server interval logic: `/server/master-race-scheduler/src/main.js` (`calculateRequiredPollingInterval`)
- Enhanced poller: `/server/enhanced-race-poller/src/main.js`
- Race context: `/client/src/contexts/RaceContext.tsx`

**Acceptance Criteria**:
- [x] Polling intervals match 2x backend frequency exactly
- [x] Polling begins only after initial data load succeeds
- [x] Polling stops automatically for completed races
- [x] Error handling prevents request storms
- [x] Background tab polling is optimized

---

### Task 2: Implement Dynamic Polling Intervals
**Status**: Completed
**Priority**: Critical
**Estimated Effort**: 6 hours

**Problem Statement**:
Client polling intervals need to dynamically adjust based on race timing and status, following the specific 2x backend frequency requirements while handling race status transitions.

**Task Details**:
1. **Create Precise Interval Calculation Logic**:
   ```typescript
   function calculatePollingInterval(timeToStart: number, raceStatus: string): number {
     // Follow exact cadence table requirements
     if (timeToStart > 65) return 900000;   // 15 minutes (backend: 30 min)
     if (timeToStart > 20) return 150000;   // 2.5 minutes (backend: 5 min)
     if (timeToStart > 5) return 75000;     // 75 seconds (backend: 2.5 min)
     if (timeToStart > 3) return 30000;     // 30 seconds (backend: 1 min)
     if (timeToStart > 0) return 15000;     // 15 seconds (backend: 30 sec)
     return raceStatus === 'final' ? 0 : 15000; // Stop if final, else continue
   }
   ```

2. **Add Race Status Awareness**:
   - Polling frequency based on race status (open, closed, interim, final)
   - Automatic polling termination for `final` or `abandoned` status
   - Handle race status transitions and delays
   - Account for race schedule changes

3. **Implement Timing Calculations**:
   - Calculate time to race start accurately using `startTime`
   - Handle timezone considerations properly
   - Account for race delays and schedule updates
   - Use race status and timing heuristics from backend logic

4. **Add Performance Optimizations**:
   - Background tab detection and reduced polling (extend intervals by 2x)
   - Battery-conscious intervals on mobile devices
   - Network condition awareness and adaptation
   - Jitter addition to prevent thundering herd effects

**Reference Information**:
- Server interval logic: `/server/master-race-scheduler/src/main.js` (`calculateRequiredPollingInterval`)
- Enhanced poller: `/server/enhanced-race-poller/src/main.js` (30s internal loops)
- Race timing calculations: existing time-to-start logic
- Performance patterns: `/client/src/hooks/useOptimizedRealtime.ts`

**Acceptance Criteria**:
- [x] Client intervals are exactly 2x server frequency per cadence table
- [x] Intervals adjust automatically based on race timing and status
- [x] Polling stops immediately when race status becomes `final`
- [x] Background tab optimization reduces battery usage
- [x] Jitter prevents synchronized request storms

---

### Task 3: Implement Error Handling and Fallbacks
**Status**: Completed
**Priority**: High
**Estimated Effort**: 6 hours

**Problem Statement**:
Polling requires robust error handling and graceful degradation to maintain reliability when network or API issues occur, especially given the increased request frequency.

**Task Details**:
1. **Implement Exponential Backoff**:
   ```typescript
   class PollingErrorHandler {
     private retryCount = 0;
     private maxRetries = 5;
     private baseDelay = 1000;

     calculateBackoffDelay(): number {
       return Math.min(this.baseDelay * Math.pow(2, this.retryCount), 30000);
     }

     shouldRetry(error: Error): boolean {
       // Implement retry logic based on error type and status code
       // Don't retry on 4xx errors, do retry on 5xx and network errors
     }
   }
   ```

2. **Add Circuit Breaker Pattern**:
   - Stop polling after consecutive failures (5+ failed attempts)
   - Implement health check mechanism with exponential backoff
   - Automatic recovery when service is restored
   - Graceful degradation to extended polling intervals during issues

3. **Create Fallback to Cached Data**:
   - Use last known good data when polling fails
   - Implement data staleness indicators for users
   - Maintain data integrity with timestamp tracking
   - Graceful degradation with appropriate user notification

4. **Add User Error Notifications**:
   - Subtle indicators for polling connectivity issues
   - Clear messaging for extended outages or degraded service
   - Recovery status notifications when service is restored
   - Avoid overwhelming users with transient error messages

**Reference Information**:
- Error handling in existing API routes
- User notification patterns in existing components
- Caching strategies in current implementation

**Acceptance Criteria**:
- [x] Polling failures don't crash the application
- [x] Users are appropriately notified of data issues
- [x] Recovery is automatic when service is restored
- [x] Cached data provides graceful degradation
- [x] Circuit breaker prevents infinite retry loops

---

### Task 4: Add Polling Coordination Logic
**Status**: Not Started
**Priority**: High
**Estimated Effort**: 8 hours

**Problem Statement**:
Multiple data sources (race data, entrants, pools, money flow) need coordinated polling to ensure consistency, avoid API overload, and maintain the 2x backend frequency requirement.

**Task Details**:
1. **Create Central Polling Coordinator**:
   ```typescript
   interface RaceDataSources {
     race: RaceData;
     entrants: Entrant[];
     pools: PoolData;
     moneyFlow: MoneyFlowData[];
   }

   export function useCoordinatedRacePolling(raceId: string, initialData: any): RaceDataSources {
     // Single polling cycle for all data sources
     // Coordinated API calls with staggered timing
     // Consistent error handling across sources
     // Respect 2x backend frequency requirement
   }
   ```

2. **Implement Staggered Request Logic**:
   - Sequence API calls within each polling cycle
   - Add 100-200ms delays between different data source requests
   - Implement request deduplication for concurrent calls
   - Prevent simultaneous requests to same endpoints

3. **Add Data Consistency Management**:
   - Ensure all data sources use same polling interval from cadence table
   - Maintain data version consistency across updates
   - Handle partial update failures gracefully
   - Preserve data integrity during race status transitions

4. **Optimize API Usage**:
   - Combine related API calls where possible
   - Use conditional requests (ETags, Last-Modified) to reduce bandwidth
   - Implement intelligent caching to reduce redundant requests
   - Monitor and respect backend rate limits

**Reference Information**:
- API endpoints: `/client/src/app/api/race/[id]/route.ts`
- Money flow API: `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`
- Pools API: `/client/src/app/api/race/[id]/pools/route.ts`

**Acceptance Criteria**:
- [ ] All race data sources poll in coordinated cycles
- [ ] API load respects 2x backend frequency limits
- [ ] Data consistency is maintained across sources
- [ ] Staggered requests prevent server overload
- [ ] Error handling works gracefully across all data types

---

### Task 5: Create useUnifiedRaceRealtime Hook
**Status**: Not Started
**Priority**: High
**Estimated Effort**: 14 hours

**Problem Statement**:
The application needs a unified hook that manages polling lifecycle and provides real-time-like data updates to components while maintaining clean interface contracts.

**Task Details**:
1. **Design Hook Interface**:
   ```typescript
   interface UnifiedRaceRealtimeResult {
     raceData: RaceData | null;
     entrants: Entrant[];
     pools: PoolData | null;
     moneyFlowUpdateTrigger: number;
     lastEntrantsUpdate: number;
     isLoading: boolean;
     error: Error | null;
     refetch: () => Promise<void>;
   }

   export function useUnifiedRaceRealtime(raceId: string): UnifiedRaceRealtimeResult {
     // Integration with useRacePolling hook
     // Coordinated batch fetching logic
     // Polling-specific state management
   }
   ```

2. **Implement Coordinated Data Fetching**:
   - Single polling cycle fetches race, entrants, pools data
   - Stagger API calls within each cycle to avoid simultaneous requests
   - Maintain data consistency across all sources
   - Handle data transformation logic

3. **Manage State Updates**:
   - Process polling updates and broadcast to components
   - Maintain `moneyFlowUpdateTrigger` increment mechanism
   - Update `lastEntrantsUpdate` timestamp on data changes
   - Provide consistent state structure for consuming components

4. **Handle Lifecycle Events**:
   - Initialize polling after initial data load
   - Pause/resume based on page visibility
   - Clean up on component unmount
   - Stop polling when race status is `final`

**Reference Information**:
- API endpoints for batched fetching
- Data transformation requirements
- State shape expectations from consuming components

**Acceptance Criteria**:
- [ ] Hook provides unified interface for all race data
- [ ] Data fetching is coordinated and efficient
- [ ] `moneyFlowUpdateTrigger` mechanism works correctly
- [ ] Memory usage is optimized
- [ ] Error handling behaviors are comprehensive

---

### Task 6: Create Money Flow Timeline Hook with Polling
**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 8 hours

**Problem Statement**:
The money flow timeline needs its own hook that coordinates with the main polling cycle and responds to update triggers while maintaining timeline data consistency.

**Task Details**:
1. **Design Hook Interface**:
   ```typescript
   interface MoneyFlowTimelineResult {
     timelineData: MoneyFlowData[];
     isLoading: boolean;
     error: Error | null;
     refetch: () => Promise<void>;
   }

   export function useMoneyFlowTimeline(
     raceId: string,
     updateTrigger: number
   ): MoneyFlowTimelineResult {
     // Coordinate with main polling cycle timing
     // Respond to updateTrigger increments
     // Maintain timeline data synchronization
   }
   ```

2. **Integrate with Polling Cycle**:
   - Coordinate with main `useRacePolling` hook timing
   - Respond to `moneyFlowUpdateTrigger` increments from main hook
   - Fetch money flow data as part of unified polling cycle
   - Maintain timeline data synchronization

3. **Implement Internal Polling Logic**:
   - Add interval-based refetching using same cadence calculations
   - Ensure win/place pool increments update together per polling cycle
   - Maintain timeline consistency across all data sources
   - Optimize network usage with request deduplication

4. **Handle Race Finalization**:
   - Halt timeline polling once race status is `final`
   - Preserve last-known values for replay functionality
   - Ensure clean polling lifecycle termination

**Reference Information**:
- API endpoint: `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`
- Data processing requirements
- Integration points: `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Acceptance Criteria**:
- [ ] Timeline updates coordinate with main race polling cycle
- [ ] `refetch()` triggers work correctly
- [ ] Data processing performance is maintained
- [ ] Polling stops cleanly when race status becomes `final`
- [ ] Timeline consistency is preserved across components

---

### Task 7: Update Race Page Components for Polling Integration
**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 6 hours

**Problem Statement**:
Race page components need to integrate with the polling hooks and handle data updates appropriately while maintaining excellent user experience.

**Task Details**:
1. **Update Core Race Page Components**:
   - `client/src/components/race-view/RacePageContent.tsx`: Integrate polling hooks
   - `client/src/components/race-view/RaceDataHeader.tsx`: Display polling status
   - `client/src/components/race-view/EnhancedEntrantsGrid.tsx`: Handle polling-derived timestamps
   - `client/src/components/race-view/RaceFooter.tsx`: Show polling metadata

2. **Update Main Race Page**:
   - Modify `/client/src/app/race/[id]/page.tsx` to use polling hooks
   - Ensure SSR/initial data loading is preserved
   - Maintain error handling and loading states
   - Integrate polling lifecycle management

3. **Add Polling Status Indicators**:
   - Optional: Add lightweight polling diagnostics panel
   - Show last update timestamps
   - Display polling health indicators
   - Provide developer tooling for polling-based debugging

4. **Maintain Data Display Behavior**:
   - Ensure components re-render on polling data updates
   - Preserve existing animation and visual feedback
   - Maintain value flash animations for data changes
   - Keep loading states and error handling patterns

**Reference Information**:
- Current page structure: `/client/src/app/race/[id]/page.tsx`
- Client view component: `/client/src/components/ClientRaceView.tsx`
- All race page components listed above

**Acceptance Criteria**:
- [ ] Components render correctly with polling data updates
- [ ] User experience is smooth and responsive
- [ ] Loading states and error handling work properly
- [ ] Performance is maintained with polling updates
- [ ] Data updates are visually clear to users

---

### Task 8: Backend Coordination and Rate Limiting
**Status**: Not Started
**Priority**: High
**Estimated Effort**: 4 hours

**Problem Statement**:
Aggressive client polling (2x backend frequency) requires coordination with the backend team to ensure system stability and appropriate rate limiting.

**Task Details**:
1. **Coordinate with Backend Team**:
   - Confirm rate limits on all polled endpoints can handle 2x frequency
   - Ensure Appwrite functions/APIs can handle increased request volume
   - Validate server capacity for coordinated client polling
   - Plan load testing with realistic polling scenarios

2. **Implement Client-Side Rate Limiting**:
   - Add request throttling to prevent accidental overload
   - Implement circuit breaker patterns for repeated failures
   - Add jitter to polling intervals to prevent thundering herd
   - Monitor and respect backend response time degradation

3. **Add Polling Metrics and Monitoring**:
   - Instrument client polling with comprehensive metrics
   - Track request counts, error rates, and latency per endpoint
   - Monitor polling frequency compliance with cadence table
   - Add alerts for polling-related performance issues

4. **Plan Deployment Strategy**:
   - Define deployment plan with feature flags
   - Prepare staged deployment strategy to mitigate risk
   - Create deployment checklist for polling implementation
   - Plan monitoring during deployment for performance impact

**Reference Information**:
- `/client/src/utils/logging.ts`
- `/server/enhanced-race-poller/src/main.js`
- Infrastructure monitoring dashboards
- Backend API rate limiting configurations

**Acceptance Criteria**:
- [ ] Backend team confirms API capacity for 2x polling frequency
- [ ] Client-side rate limiting prevents overload scenarios
- [ ] Comprehensive monitoring is in place for polling metrics
- [ ] Deployment strategy minimizes risk of service disruption
- [ ] Performance impact is measured and acceptable

---

### Task 9: Performance Optimization
**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 7 hours

**Problem Statement**:
Polling requires careful optimization to maintain performance while adhering to the 2x backend frequency requirement and minimizing resource usage.

**Task Details**:
1. **Implement Intelligent Caching**:
   ```typescript
   interface CacheStrategy {
     key: string;
     ttl: number;
     staleWhileRevalidate: boolean;
     compression: boolean;
     etag?: string;
   }

   export function useCachedPolling(config: CacheStrategy) {
     // Implement intelligent caching for polling data
     // Use ETags and Last-Modified headers from API responses
     // Implement stale-while-revalidate pattern
     // Compress cached data to reduce memory usage
   }
   ```

2. **Add Request Deduplication and Optimization**:
   - Prevent multiple identical requests in flight
   - Implement request queueing for overlapping polls
   - Add request cancellation for stale requests
   - Use conditional requests to minimize bandwidth

3. **Optimize Polling Intervals with Background Detection**:
   - Detect background tabs and extend polling intervals by 2x
   - Pause polling completely after 5+ minutes of inactivity
   - Resume normal polling immediately when tab becomes active
   - Add page visibility API integration for immediate response

4. **Add Memory and Network Optimizations**:
   - Implement data compression for large responses
   - Add request batching where possible
   - Optimize polling intervals based on actual data change frequency
   - Monitor memory usage and implement cleanup for long-running sessions

**Reference Information**:
- Current performance patterns: `/client/src/hooks/useOptimizedRealtime.ts`
- Performance targets: `/docs/architecture.md:687-706`
- Caching patterns in existing API routes
- Page Visibility API documentation

**Acceptance Criteria**:
- [ ] Polling performance meets performance targets
- [ ] Memory usage is optimized with intelligent caching
- [ ] Background tab polling is battery-conscious
- [ ] Network usage is minimized through request optimization
- [ ] Page visibility changes trigger appropriate polling behavior

---

### Task 10: Client Configuration and Monitoring
**Status**: Not Started
**Priority**: Low
**Estimated Effort**: 4 hours

**Problem Statement**:
Polling behavior needs to be configurable and monitorable for debugging, optimization, and operational visibility.

**Task Details**:
1. **Add Environment Configuration**:
   ```typescript
   // Environment variables for polling behavior
   NEXT_PUBLIC_POLLING_ENABLED=true
   NEXT_PUBLIC_POLLING_DEBUG_MODE=false
   NEXT_PUBLIC_POLLING_TIMEOUT=10000
   NEXT_PUBLIC_POLLING_MAX_RETRIES=5
   NEXT_PUBLIC_BACKGROUND_POLLING_MULTIPLIER=2
   ```

2. **Implement Comprehensive Polling Metrics**:
   - Track polling success rates per endpoint and race
   - Monitor average response times and 95th percentile latency
   - Count retry attempts, failures, and circuit breaker activations
   - Measure data freshness metrics and polling frequency compliance
   - Track background tab optimization effectiveness

3. **Create Debug Mode and Developer Tools**:
   - Detailed logging of polling behavior and timing decisions
   - Visual indicators for polling status in developer mode
   - Performance metrics dashboard for polling analysis
   - Data consistency validation tools for debugging
   - Race timing and interval calculation debugging

4. **Add Operational Monitoring**:
   - Integration with existing logging infrastructure
   - Alerts for polling performance degradation
   - Dashboard for polling health across all active races
   - Historical trending of polling performance metrics

**Reference Information**:
- Environment configuration patterns in project
- Existing logging utility: `/client/src/utils/logging.ts`
- Debug tooling examples in current codebase

**Acceptance Criteria**:
- [ ] Polling behavior is fully configurable via environment variables
- [ ] Comprehensive monitoring provides actionable operational insights
- [ ] Debug mode assists in troubleshooting polling issues
- [ ] Metrics integration works with existing monitoring infrastructure
- [ ] Performance dashboards provide clear visibility into polling health

---

### Task 11: Testing and Validation
**Status**: Not Started
**Priority**: High
**Estimated Effort**: 10 hours

**Problem Statement**:
Ensure polling provides excellent data quality and user experience while meeting the 2x backend frequency requirement.

**Task Details**:
1. **Create Comprehensive Integration Tests**:
   ```typescript
   describe('Polling Data Consistency', () => {
     it('should provide timely data updates');
     it('should handle race status transitions correctly');
     it('should maintain data freshness within acceptable limits');
     it('should respect 2x backend frequency requirement');
     it('should stop polling when race status becomes final');
   });
   ```

2. **Performance and Load Testing**:
   - Load test polling under various race conditions and user loads
   - Memory usage profiling for extended polling periods
   - Network usage analysis and bandwidth optimization validation
   - Battery usage testing on mobile devices
   - Validate polling frequency compliance with cadence table

3. **Error Recovery and Edge Case Testing**:
   - Network interruption scenarios and automatic recovery
   - API error response handling (4xx, 5xx, timeouts)
   - Background tab behavior validation and optimization
   - Race status edge cases and timing transitions
   - Circuit breaker and exponential backoff validation

4. **User Experience Testing**:
   - Data freshness perception testing
   - Loading state behavior during polling failures
   - Error notification effectiveness and user comprehension
   - Performance during high-activity race periods
   - Mobile device performance and battery impact

**Reference Information**:
- Current testing patterns in `/client/src/hooks/__tests__/`
- Performance testing requirements and benchmarks
- Race status transition test scenarios

**Acceptance Criteria**:
- [ ] All integration tests pass with polling implementation
- [ ] Performance meets defined benchmarks
- [ ] Error recovery works correctly in all failure scenarios
- [ ] User experience is excellent
- [ ] Polling frequency compliance is validated across all race timing scenarios

---

### Task 12: Update Architecture Documentation
**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 5 hours

**Problem Statement**:
The polling implementation requires comprehensive documentation to ensure maintainability and knowledge transfer.

**Task Details**:
1. **Create Core Architecture Documents**:
   - Document client-side polling architecture
   - Create data flow diagrams for polling lifecycle
   - Document the 2x frequency requirement and cadence table
   - Add sequence charts showing polling lifecycle and stop conditions

2. **Add Polling-Specific Documentation**:
   - Include diagrams showing client/server polling coordination
   - Document background tab optimization and performance considerations
   - Add troubleshooting guide for common polling issues
   - Document error handling and recovery strategies

3. **Create Developer Documentation**:
   - API integration patterns for polling
   - Hook usage examples and best practices
   - Performance optimization guidelines
   - Configuration and monitoring setup

4. **Document Operational Procedures**:
   - Monitoring and alerting setup
   - Performance tuning guidelines
   - Debugging procedures
   - Incident response for polling issues

**Reference Information**:
- `/docs/Money-Flow-Timeline-System-Architecture.md`
- `/docs/architecture/index.md`
- `/docs/architecture/3-frontend-architecture-nextjs-15.md`
- `/docs/architecture/12-client-integration.md`

**Acceptance Criteria**:
- [ ] All documentation reflects polling architecture accurately
- [ ] Examples and code snippets are comprehensive
- [ ] Performance considerations are documented
- [ ] Troubleshooting guides are actionable
- [ ] Operational procedures are clear and complete

---

## Implementation Timeline

### Phase 1: Foundation (Tasks 1-3)
**Duration**: 2 weeks
**Priority**: Critical path for implementation

1. Create polling infrastructure with correct cadence
2. Implement dynamic intervals (2x backend frequency)
3. Implement error handling and fallbacks

### Phase 2: Core Implementation (Tasks 4-6)
**Duration**: 3 weeks
**Priority**: Essential for functionality

1. Add polling coordination logic
2. Create useUnifiedRaceRealtime hook
3. Create money flow timeline hook

### Phase 3: Integration (Tasks 7-8)
**Duration**: 1.5 weeks
**Priority**: User experience and stability

1. Update race page components
2. Backend coordination and rate limiting

### Phase 4: Quality and Documentation (Tasks 9-12)
**Duration**: 2.5 weeks
**Priority**: Performance and maintainability

1. Performance optimization
2. Configuration and monitoring
3. Testing and validation
4. Documentation

**Total Estimated Duration**: 9 weeks

---

## Success Metrics

### Technical Metrics
- **Polling Frequency Compliance**: Client intervals exactly 2x backend frequency per cadence table
- **Data Freshness**: Average time from server update to client display meets targets
- **Error Rate**: Polling error rate below defined thresholds
- **Performance**: Page load and update times meet performance targets
- **Resource Usage**: Memory and network usage optimized

### User Experience Metrics
- **Perceived Performance**: Smooth and responsive data updates
- **Reliability**: Consistent and predictable data delivery
- **Battery Life**: Mobile battery usage within acceptable limits
- **Error Recovery**: Fast recovery from connectivity issues

### Development Metrics
- **Code Simplicity**: Clean and maintainable polling implementation
- **Debugging**: Easy troubleshooting with comprehensive logging
- **Feature Velocity**: Fast development of new data features
- **Operational Visibility**: Clear monitoring and alerting

---

## Risk Mitigation Strategies

### High-Risk Areas

1. **Polling Frequency Compliance**
   - **Risk**: Client polling might not maintain exact 2x backend frequency
   - **Mitigation**: Implement precise cadence calculations with comprehensive testing and monitoring

2. **Backend API Overload**
   - **Risk**: 2x polling frequency might overwhelm backend systems
   - **Mitigation**: Coordinate with backend team, implement circuit breakers, and plan staged deployment

3. **Data Consistency During Race Status Transitions**
   - **Risk**: Polling might miss rapid changes during critical race periods
   - **Mitigation**: Use 15-second intervals during critical periods and validate with extensive testing

4. **Performance on Mobile Devices**
   - **Risk**: Increased polling might impact battery life and performance
   - **Mitigation**: Implement background tab optimization and intelligent caching

### Implementation Risks

1. **Complex State Management**
   - **Risk**: Polling state might become difficult to manage across components
   - **Mitigation**: Use centralized hooks and clear state management patterns

2. **User Experience**
   - **Risk**: Users might perceive delays in data updates
   - **Mitigation**: Use 2x backend frequency to ensure fast updates

3. **API Rate Limiting**
   - **Risk**: Increased request volume might trigger rate limits
   - **Mitigation**: Coordinate with backend team and implement graceful degradation

---

## Conclusion

This implementation plan provides a comprehensive roadmap for creating a client-side polling system with precise 2x backend frequency requirements. The polling approach offers several advantages:

- **Reliability**: Predictable and consistent data updates
- **Control**: Full control over data fetching timing and error handling
- **Simplicity**: Clear architectural patterns
- **Performance**: Fast data updates with optimized resource usage

Success depends on careful implementation of the precise cadence requirements, robust error handling, backend coordination, and performance optimization to deliver an excellent user experience for RaceDay users.