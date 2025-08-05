import { Query } from 'appwrite';
import { databases } from '@/lib/appwrite-client';
import { Race } from '@/types/meetings';

// Type declaration for debug function on window
declare global {
  interface Window {
    debugRaceFetch?: (meetingId?: string) => Promise<Race[]>;
  }
}

// Test database connection on module load (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('🔌 Database client loaded:', !!databases);
}

/**
 * Race data service functions for client-side operations
 */

// Debug helper - only available in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.debugRaceFetch = async (meetingId = '44f3707e-49a3-4b16-b6c3-456b8a1f9e9d') => {
    try {
      console.log('🔍 Debug: Testing race fetch for meetingId:', meetingId);
      const result = await fetchRacesForMeeting(meetingId);
      console.log('🔍 Debug: Race fetch result:', result.length, 'races');
      return result;
    } catch (error) {
      console.error('🔍 Debug: Race fetch failed:', error);
      return [];
    }
  };
}

export interface RaceServiceError {
  message: string;
  meetingId?: string;
  code?: string;
}

/**
 * Fetch races for a specific meeting
 * @param meetingId - The meeting ID to fetch races for
 * @returns Promise<Race[]> - Array of races ordered by race number
 */
export async function fetchRacesForMeeting(meetingId: string): Promise<Race[]> {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🏁 Fetching races for meetingId:', meetingId);
    }
    
    // First try: Query by meeting field directly (if it's a relationship ID)
    let response;
    try {
      response = await databases.listDocuments('raceday-db', 'races', [
        Query.equal('meeting', meetingId),
        Query.orderAsc('raceNumber'),
        Query.limit(20),
      ]);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🏁 Direct meeting query result:', response.documents.length, 'races found');
      }
    } catch (directError) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚨 Direct meeting query failed:', directError);
      }
      
      // Fallback: Get all races and filter client-side (not ideal but works)
      try {
        const allRacesResponse = await databases.listDocuments('raceday-db', 'races', [
          Query.limit(100)
        ]);
        
        // Filter races by meetingId on the client side
        const filteredRaces = allRacesResponse.documents.filter((race: Record<string, unknown>) => {
          // Check if meeting is a string ID
          if (typeof race.meeting === 'string') {
            return race.meeting === meetingId;
          }
          
          // Check if meeting is an object with meetingId property
          if (typeof race.meeting === 'object' && race.meeting && 'meetingId' in race.meeting) {
            return (race.meeting as Record<string, unknown>).meetingId === meetingId;
          }
          
          // Check if meeting is an object with $id property
          if (typeof race.meeting === 'object' && race.meeting && '$id' in race.meeting) {
            return (race.meeting as Record<string, unknown>).$id === meetingId;
          }
          
          return false;
        });
        
        // Sort by race number
        filteredRaces.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.raceNumber as number) - (b.raceNumber as number)
        );
        
        response = { documents: filteredRaces };
        
        if (process.env.NODE_ENV === 'development') {
          console.log('🏁 Client-side filtered result:', response.documents.length, 'races found');
        }
      } catch (fallbackError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('🚨 Fallback query also failed:', fallbackError);
        }
        throw fallbackError;
      }
    }
    
    return response.documents as unknown as Race[];
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('🚨 Error fetching races:', error);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to fetch races: ${errorMessage}`);
  }
}

/**
 * Validate race data structure
 * @param race - Race object to validate
 * @returns boolean - True if valid race object
 */
export function validateRaceData(race: unknown): race is Race {
  return (
    typeof race === 'object' &&
    race !== null &&
    '$id' in race &&
    'raceId' in race &&
    'raceNumber' in race &&
    'name' in race &&
    'startTime' in race &&
    'meeting' in race &&
    'status' in race &&
    typeof (race as Record<string, unknown>).$id === 'string' &&
    typeof (race as Record<string, unknown>).raceId === 'string' &&
    typeof (race as Record<string, unknown>).raceNumber === 'number' &&
    typeof (race as Record<string, unknown>).name === 'string' &&
    typeof (race as Record<string, unknown>).startTime === 'string' &&
    typeof (race as Record<string, unknown>).meeting === 'object' &&
    typeof (race as Record<string, unknown>).status === 'string'
  );
}

/**
 * Race status enum values
 */
export const RACE_STATUS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  RUNNING: 'Running',
  FINALIZED: 'Finalized',
} as const;

export type RaceStatus = typeof RACE_STATUS[keyof typeof RACE_STATUS];

/**
 * Get status color for race status
 * @param status - Race status
 * @returns string - Tailwind color class
 */
export function getRaceStatusColor(status: string): string {
  switch (status) {
    case RACE_STATUS.OPEN:
      return 'text-green-600';
    case RACE_STATUS.CLOSED:
      return 'text-yellow-600';
    case RACE_STATUS.RUNNING:
      return 'text-blue-600';
    case RACE_STATUS.FINALIZED:
      return 'text-gray-600';
    default:
      return 'text-gray-400';
  }
}