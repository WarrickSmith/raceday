'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RaceNavigationData } from '@/types/meetings';

interface UseRaceNavigationOptions {
  navigationData: RaceNavigationData | null;
  currentRaceId: string;
  onNavigationStart?: (target: string) => void | Promise<void>;
  onNavigationComplete?: () => void;
  onError?: (error: Error) => void;
}

interface NavigationState {
  isNavigating: boolean;
  navigationTarget: string | null;
  error: string | null;
}

export function useRaceNavigation({
  navigationData,
  currentRaceId,
  onNavigationStart,
  onNavigationComplete,
  onError,
}: UseRaceNavigationOptions) {
  const [navigationState, setNavigationState] = useState<NavigationState>({
    isNavigating: false,
    navigationTarget: null,
    error: null,
  });
  
  const router = useRouter();

  // Ref to track if we're mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset navigation state when currentRaceId changes with debouncing
  useEffect(() => {
    console.log('🔄 Race navigation: currentRaceId changed to', currentRaceId);

    // Debounce rapid currentRaceId changes during navigation
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        setNavigationState({
          isNavigating: false,
          navigationTarget: null,
          error: null,
        });
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currentRaceId]);

  // Simplified navigation function - no cleanup needed with polling
  const navigateToRace = useCallback(
    (raceId: string, navigationTarget: string) => {
      console.log(`🚀 [${new Date().toISOString()}] Starting navigation to race ${raceId} (${navigationTarget})`);

      setNavigationState({
        isNavigating: true,
        navigationTarget,
        error: null,
      });

      try {
        // Call optional navigation start callback (non-blocking)
        onNavigationStart?.(navigationTarget);

        // Navigate immediately
        router.push(`/race/${raceId}`);
        console.log(`✅ Navigation initiated to race ${raceId}`);

        // Reset navigation state after successful navigation
        setNavigationState({
          isNavigating: false,
          navigationTarget: null,
          error: null,
        });

        // Call completion callback
        onNavigationComplete?.();

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Navigation failed';
        console.error(`❌ Navigation to ${navigationTarget} failed:`, error);

        setNavigationState({
          isNavigating: false,
          navigationTarget: null,
          error: errorMessage,
        });

        onError?.(error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [router, onNavigationStart, onNavigationComplete, onError]
  );

  // Simplified meetings navigation - no cleanup needed with polling
  const navigateToMeetings = useCallback(() => {
    console.log(`🏠 [${new Date().toISOString()}] Starting navigation to meetings`);

    if (!isMountedRef.current) {
      return;
    }

    setNavigationState({
      isNavigating: true,
      navigationTarget: 'meetings',
      error: null,
    });

    try {
      // Call optional navigation start callback (non-blocking)
      onNavigationStart?.('meetings');

      // Navigate immediately
      router.push('/');
      console.log(`✅ Navigation initiated to meetings`);

      // Call completion callback
      onNavigationComplete?.();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Navigation to meetings failed';
      console.error(`❌ Navigation to meetings failed:`, error);

      setNavigationState({
        isNavigating: false,
        navigationTarget: null,
        error: errorMessage,
      });

      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [router, onNavigationStart, onNavigationComplete, onError]);

  const navigateToNextScheduled = useCallback(() => {
    console.log('🎯 Navigate to next scheduled clicked', { navigationData: !!navigationData, nextScheduledRace: !!navigationData?.nextScheduledRace });
    if (!navigationData?.nextScheduledRace) {
      console.log('❌ No next scheduled race available');
      onError?.(new Error('No next scheduled race available'));
      return;
    }
    
    navigateToRace(navigationData.nextScheduledRace.raceId, 'next-scheduled');
  }, [navigationData, navigateToRace, onError]);

  const navigateToPrevious = useCallback(() => {
    console.log('🎯 Navigate to previous clicked', { navigationData: !!navigationData, previousRace: !!navigationData?.previousRace });
    if (!navigationData?.previousRace) {
      console.log('❌ No previous race available');
      onError?.(new Error('No previous race available'));
      return;
    }
    
    navigateToRace(navigationData.previousRace.raceId, 'previous');
  }, [navigationData, navigateToRace, onError]);

  const navigateToNext = useCallback(() => {
    console.log('🎯 Navigate to next clicked', { navigationData: !!navigationData, nextRace: !!navigationData?.nextRace });
    if (!navigationData?.nextRace) {
      console.log('❌ No next race available');
      onError?.(new Error('No next race available'));
      return;
    }
    
    navigateToRace(navigationData.nextRace.raceId, 'next');
  }, [navigationData, navigateToRace, onError]);

  // Button availability checks
  const canNavigateToNextScheduled = Boolean(navigationData?.nextScheduledRace);
  const canNavigateToPrevious = Boolean(navigationData?.previousRace);
  const canNavigateToNext = Boolean(navigationData?.nextRace);

  return {
    navigationState,
    
    // Navigation methods
    navigateToMeetings,
    navigateToNextScheduled,
    navigateToPrevious,
    navigateToNext,
    
    // Button states
    canNavigateToNextScheduled,
    canNavigateToPrevious,
    canNavigateToNext,
  };
}
