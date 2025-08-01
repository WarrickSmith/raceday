# Single Race Poller Function

HTTP-triggered Appwrite function for client-driven dynamic polling of specific races. Enables true 15-second interval polling controlled by frontend applications.

## Overview

This function complements the baseline `race-data-poller` by providing on-demand, high-frequency polling for races that users are actively viewing. It's designed to be called by client applications when they need real-time updates more frequently than the 5-minute baseline polling.

## Architecture

- **Trigger**: HTTP endpoint (no scheduled execution)
- **Purpose**: Poll a single race on-demand from client applications
- **Resource**: `s-1vcpu-1gb` (lightweight, fast response)
- **Timeout**: 300 seconds (5 minutes)
- **Shared Dependencies**: Uses same utilities as race-data-poller

## API Usage

### Endpoint
```
POST https://cloud.appwrite.io/v1/functions/single-race-poller/executions
```

### Headers
```json
{
  "Content-Type": "application/json",
  "X-Appwrite-Project": "your-project-id"
}
```

### Request Payload
```json
{
  "raceId": "race-uuid-from-database"
}
```

### Response Examples

**Success Response (200):**
```json
{
  "success": true,
  "message": "Race data updated successfully",
  "raceId": "race-123",
  "statistics": {
    "entrantsUpdated": 12,
    "moneyFlowProcessed": 12
  }
}
```

**Race Not Found (404):**
```json
{
  "success": false,
  "error": "Race not found: invalid-race-id"
}
```

**Race Finalized (200):**
```json
{
  "success": false,
  "message": "Race is finalized, polling not required",
  "raceId": "race-123",
  "status": "Final"
}
```

**API Failure (503):**
```json
{
  "success": false,
  "error": "Failed to fetch race data from NZTAB API",
  "raceId": "race-123"
}
```

**Missing Parameters (400):**
```json
{
  "success": false,
  "error": "Missing required parameter: raceId"
}
```

## Frontend Integration

**⚠️ RECOMMENDED ARCHITECTURE**: After encountering HTTP request issues (timeouts, body parsing failures), the **Appwrite Node.js SDK with Next.js Server Actions** approach is superior to direct HTTP calls.

### RECOMMENDED: Next.js Server Actions Approach

**Benefits over Direct HTTP**:
- ✅ **Security**: API keys stay server-side, never exposed to client
- ✅ **Reliability**: Built-in error handling and retry mechanisms  
- ✅ **Type Safety**: Better IDE support and code completion
- ✅ **Timeout Management**: Proper async execution vs HTTP 30s limits
- ✅ **Authentication**: Automatic session/API key management

#### Setup Requirements
1. Install: `npm install node-appwrite` in client directory
2. Add `APPWRITE_API_KEY` to `.env.local` (server-only)
3. Create server actions and hooks as shown below

#### Server Action Implementation
```javascript
// /client/src/app/actions/race-polling.js
"use server";
import { Client, Functions } from "node-appwrite";

export async function triggerRacePolling(raceId) {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY); // Server-only API key

  const functions = new Functions(client);
  
  try {
    const execution = await functions.createExecution(
      'single-race-poller',
      JSON.stringify({ raceId }),
      true // Async execution to avoid timeout
    );
    
    return { success: true, executionId: execution.$id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### React Hook for Dynamic Polling
```javascript
// /client/src/hooks/useRacePolling.js
"use client";
import { useEffect, useState } from 'react';
import { triggerRacePolling } from '@/app/actions/race-polling';

export function useRacePolling(raceId, startTime, isActive = true) {
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollResult, setLastPollResult] = useState(null);

  useEffect(() => {
    if (!raceId || !startTime || !isActive) return;

    const calculateInterval = () => {
      const minutesToStart = Math.floor((new Date(startTime) - new Date()) / (1000 * 60));
      if (minutesToStart <= 5) return 15000;  // 15 seconds
      if (minutesToStart <= 10) return 60000; // 1 minute  
      if (minutesToStart <= 20) return 120000; // 2 minutes
      return 300000; // 5 minutes
    };
    
    let timeoutId;
    const poll = async () => {
      setIsPolling(true);
      try {
        const result = await triggerRacePolling(raceId);
        setLastPollResult(result);
        
        // Stop if race is finalized (would be in result if function checked)
        if (result.status === 'Final') return;
        
      } catch (error) {
        setLastPollResult({ success: false, error: error.message });
      } finally {
        setIsPolling(false);
        timeoutId = setTimeout(poll, calculateInterval());
      }
    };
    
    poll(); // Start immediately
    return () => clearTimeout(timeoutId);
  }, [raceId, startTime, isActive]);

  return { isPolling, lastPollResult };
}
```

#### Component Usage Example
```javascript
// /client/src/components/RaceView.js
import { useRacePolling } from '@/hooks/useRacePolling';

export function RaceView({ race }) {
  const { isPolling, lastPollResult } = useRacePolling(
    race.id, 
    race.startTime, 
    true // Active when viewing race
  );

  return (
    <div>
      <h1>{race.name}</h1>
      {isPolling && <span>⟳ Updating...</span>}
      {lastPollResult?.error && (
        <div className="error">Poll failed: {lastPollResult.error}</div>
      )}
      {/* Race data components with real-time subscriptions */}
    </div>
  );
}
```

### Alternative: Direct HTTP Approach (Not Recommended)

**⚠️ ISSUES ENCOUNTERED**: Direct HTTP requests have shown problems with:
- Body parsing failures (function can't interpret raceId)
- Timeout issues (30-second HTTP limit vs 5-minute function timeout)  
- Manual error handling complexity
- Security concerns (cannot use API keys client-side)

If you must use direct HTTP, here's the corrected implementation:

```javascript
class RaceDynamicPoller {
  constructor(appwriteEndpoint, projectId) {
    this.endpoint = appwriteEndpoint
    this.projectId = projectId
    this.intervalId = null
  }

  async pollRace(raceId) {
    try {
      const response = await fetch(`${this.endpoint}/v1/functions/single-race-poller/executions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': this.projectId
          // NOTE: Cannot include API key in client-side requests
        },
        body: JSON.stringify({
          body: JSON.stringify({ raceId }), // Double JSON encoding required
          async: true  // Prevents 30-second timeout
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        console.warn('Poll failed:', result.error || result.message)
        
        // Stop polling if race is finalized
        if (result.status === 'Final') {
          this.stopPolling()
        }
      }
      
      return result
    } catch (error) {
      console.error('Poll request failed:', error)
      return { success: false, error: error.message }
    }
  }

  startDynamicPolling(raceId, startTime) {
    const calculateInterval = () => {
      const now = new Date()
      const raceStart = new Date(startTime)
      const minutesToStart = Math.floor((raceStart.getTime() - now.getTime()) / (1000 * 60))
      
      if (minutesToStart <= 5) return 15000      // 15 seconds
      if (minutesToStart <= 10) return 60000     // 1 minute
      if (minutesToStart <= 20) return 120000    // 2 minutes
      return 300000 // 5 minutes (fallback to baseline)
    }

    const poll = async () => {
      await this.pollRace(raceId)
      
      // Recalculate interval for next poll
      const nextInterval = calculateInterval()
      this.intervalId = setTimeout(poll, nextInterval)
    }

    // Start polling immediately
    poll()
  }

  stopPolling() {
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
  }
}

// Usage (not recommended - use Server Actions instead)
const poller = new RaceDynamicPoller('https://cloud.appwrite.io', 'your-project-id')
poller.startDynamicPolling('race-123', '2025-07-31T14:30:00Z')
```

## Why Server Actions Solve HTTP Issues

The research identified these specific problems with direct HTTP requests:

1. **Body Parsing Failures**: Appwrite functions expect complex JSON structure, not simple `{ raceId }` 
2. **Timeout Issues**: HTTP requests limited to 30 seconds, but functions can run 5 minutes
3. **Security Limitations**: Cannot safely include API keys in client-side requests
4. **Error Handling**: Manual parsing of Appwrite-specific error formats

**Server Actions eliminate all these issues** by using the official Appwrite SDK server-side, providing:
- Proper JSON serialization that the function can parse
- Async execution that bypasses HTTP timeout limits  
- Secure API key usage only on the server
- Built-in exception handling with meaningful error messages

## Local Development & Testing

### Prerequisites
- Environment variables configured in `/server/.env`
- Race data exists in database (run daily-meetings and daily-races functions first)

### Testing Commands

```bash
# Test with valid race ID
npm run single-race '{"raceId":"your-race-uuid"}'

# Test error handling (missing raceId)
npm run single-race '{}'

# Test with race that doesn't exist
npm run single-race '{"raceId":"invalid-id"}'
```

### Expected Output

```bash
🚀 Starting single-race-poller locally (non-Docker)...
📥 HTTP Payload: {
  "raceId": "race-123"
}
[2025-07-31T10:30:00.000Z] LOG: Single race polling request
  Data: {
    "raceId": "race-123",
    "timestamp": "2025-07-31T10:30:00.000Z",
    "requestSource": "client-app"
  }
[2025-07-31T10:30:01.500Z] LOG: Polling single race: Race 1 (Open)
[2025-07-31T10:30:02.800Z] LOG: Successfully fetched race event data from NZTAB API
[2025-07-31T10:30:03.200Z] LOG: Single race polling completed successfully
📤 HTTP Response (200): {
  "success": true,
  "message": "Race data updated successfully",
  "raceId": "race-123",
  "statistics": {
    "entrantsUpdated": 12,
    "moneyFlowProcessed": 12
  }
}
✅ Function completed successfully!
```

## Deployment

### Deploy Function
```bash
npm run deploy:single-race
```

### Update Environment Variables Only
```bash
npm run vars:single-race
```

### Deploy All Functions
```bash
npm run deploy
```

## Data Flow

1. **Client Request**: Frontend sends HTTP POST with `{ raceId }`
2. **Validation**: Function validates race exists and isn't finalized
3. **API Call**: Fetches latest data from NZTAB API (10s timeout)
4. **Data Processing**: Updates entrants and money flow data
5. **Database Update**: Saves to Appwrite database
6. **Real-time Push**: Appwrite subscriptions notify connected clients
7. **HTTP Response**: Returns success/failure with statistics

## Performance Considerations

- **Fast Response**: Typically completes in 2-5 seconds
- **API Timeout**: 10-second timeout for NZTAB API calls
- **No Retries**: Fails fast for client-requested polls
- **Resource Efficient**: Smaller allocation than baseline poller
- **Rate Limiting**: Consider implementing client-side rate limiting to prevent abuse

## Error Handling

- **Graceful Degradation**: Returns structured error responses, never throws exceptions
- **Comprehensive Logging**: All operations logged for debugging
- **Status Codes**: Proper HTTP status codes for different error types
- **Client Guidance**: Error messages help clients decide whether to retry

## Integration with Baseline Poller

The single-race-poller works alongside the scheduled `race-data-poller`:

- **Baseline Poller**: Maintains 1-hour window of races every 5 minutes
- **Single Race Poller**: Provides on-demand updates for actively viewed races
- **Shared Data**: Both update the same database collections
- **Real-time Sync**: Both trigger the same Appwrite real-time subscriptions

This architecture ensures that race data is always current while allowing high-frequency updates only when needed.