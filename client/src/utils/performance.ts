/**
 * Performance optimization utilities for the RaceDay application
 * Includes virtualization, memoization, and monitoring utilities
 * Enhanced for Story 4.8 with memory management integration
 */

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { Entrant } from '@/types/meetings';
import { memoryManager } from './memoryManager';

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private enabled = process.env.NODE_ENV === 'development';

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startMeasure(name: string): void {
    if (!this.enabled) return;
    performance.mark(`${name}-start`);
  }

  public endMeasure(name: string): number {
    if (!this.enabled) return 0;
    
    try {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name, 'measure')[0];
      const duration = measure?.duration || 0;
      
      // Store metrics for analysis
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
      
      // Clean up marks
      performance.clearMarks(`${name}-start`);
      performance.clearMarks(`${name}-end`);
      performance.clearMeasures(name);
      
      return duration;
    } catch (error) {
      console.warn('Performance measurement failed:', error);
      return 0;
    }
  }

  public getMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    this.metrics.forEach((values, name) => {
      if (values.length > 0) {
        result[name] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    });
    
    return result;
  }

  public clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Enhanced performance report with memory integration
   */
  public getPerformanceReport(): {
    timing: Record<string, { avg: number; min: number; max: number; count: number }>;
    memory: any;
    recommendations: string[];
  } {
    const timing = this.getMetrics();
    const memoryReport = memoryManager.getPerformanceReport();
    
    const recommendations: string[] = [...memoryReport.recommendations];
    
    // Add timing-based recommendations
    Object.entries(timing).forEach(([name, stats]) => {
      if (stats.avg > 100) {
        recommendations.push(`Consider optimizing ${name} - average time ${stats.avg.toFixed(2)}ms`);
      }
    });

    return {
      timing,
      memory: memoryReport,
      recommendations
    };
  }

  /**
   * Register cleanup for performance data
   */
  public registerMemoryCleanup(): () => void {
    return memoryManager.registerCleanupCallback(() => {
      // Keep only recent metrics during cleanup
      this.metrics.forEach((values, name) => {
        if (values.length > 10) {
          this.metrics.set(name, values.slice(-10));
        }
      });
      console.log('🧹 Cleaned performance metrics');
    });
  }
}

// Virtual scrolling hook for large lists
export function useVirtualScrolling({
  items,
  itemHeight = 60,
  containerHeight = 400,
  overscan = 5
}: {
  items: any[];
  itemHeight?: number;
  containerHeight?: number;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      index: startIndex + index,
      style: {
        position: 'absolute' as const,
        top: (startIndex + index) * itemHeight,
        height: itemHeight,
        width: '100%'
      }
    }));
  }, [items, startIndex, endIndex, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    scrollElementRef,
    visibleItems,
    totalHeight,
    handleScroll
  };
}

// Debounced updates hook
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttled callback hook
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRan = useRef(Date.now());
  
  return useCallback(
    ((...args) => {
      if (Date.now() - lastRan.current >= delay) {
        callback(...args);
        lastRan.current = Date.now();
      }
    }) as T,
    [callback, delay]
  );
}

// Optimized entrant comparison for memo
export const entrantComparison = (prev: Entrant, next: Entrant): boolean => {
  // Only compare fields that affect rendering
  return (
    prev.$id === next.$id &&
    prev.winOdds === next.winOdds &&
    prev.placeOdds === next.placeOdds &&
    prev.isScratched === next.isScratched &&
    prev.holdPercentage === next.holdPercentage &&
    prev.moneyFlowTrend === next.moneyFlowTrend &&
    prev.$updatedAt === next.$updatedAt
  );
};

// Optimized entrants list comparison
export const entrantsListComparison = (prev: Entrant[], next: Entrant[]): boolean => {
  if (prev.length !== next.length) return false;
  
  for (let i = 0; i < prev.length; i++) {
    if (!entrantComparison(prev[i], next[i])) {
      return false;
    }
  }
  
  return true;
};

// Memory efficient odds history processing
export function useOptimizedOddsHistory(entrants: Entrant[], maxHistoryPoints = 20) {
  return useMemo(() => {
    const historyMap = new Map<string, number[]>();
    
    entrants.forEach(entrant => {
      if (entrant.oddsHistory && entrant.oddsHistory.length > 0) {
        // Sample the odds history to reduce memory usage
        const history = entrant.oddsHistory;
        const sampledHistory = history.length > maxHistoryPoints
          ? sampleArray(history.map(h => h.winOdds), maxHistoryPoints)
          : history.map(h => h.winOdds);
        
        historyMap.set(entrant.$id, sampledHistory);
      }
    });
    
    return historyMap;
  }, [entrants, maxHistoryPoints]);
}

// Efficient array sampling for large datasets
function sampleArray<T>(array: T[], sampleSize: number): T[] {
  if (array.length <= sampleSize) return array;
  
  const step = array.length / sampleSize;
  const sampled: T[] = [];
  
  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(i * step);
    sampled.push(array[index]);
  }
  
  return sampled;
}

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  {
    threshold = 0,
    root = null,
    rootMargin = '0%',
    freezeOnceVisible = false
  }: {
    threshold?: number;
    root?: Element | null;
    rootMargin?: string;
    freezeOnceVisible?: boolean;
  } = {}
) {
  const [entry, setEntry] = useState<IntersectionObserverEntry>();

  const frozen = entry?.isIntersecting && freezeOnceVisible;

  const updateEntry = ([entry]: IntersectionObserverEntry[]): void => {
    setEntry(entry);
  };

  useEffect(() => {
    const node = elementRef?.current;
    const hasIOSupport = !!window.IntersectionObserver;

    if (!hasIOSupport || frozen || !node) return;

    const observerParams = { threshold, root, rootMargin };
    const observer = new IntersectionObserver(updateEntry, observerParams);

    observer.observe(node);

    return () => observer.disconnect();
  }, [elementRef, JSON.stringify(threshold), root, rootMargin, frozen]);

  return entry;
}

// Bundle analysis utilities
export const BundleAnalyzer = {
  /**
   * Log component render counts for debugging
   */
  logRender: (componentName: string): void => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 ${componentName} rendered at ${new Date().toISOString()}`);
    }
  },

  /**
   * Measure bundle size impact
   */
  measureBundleImpact: (feature: string, callback: () => void): void => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.startMeasure(`bundle-${feature}`);
    
    callback();
    
    const duration = monitor.endMeasure(`bundle-${feature}`);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📦 Bundle impact for ${feature}: ${duration.toFixed(2)}ms`);
    }
  }
};

// React Suspense utilities
export function withSuspense<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function SuspenseWrapper(props: P) {
    const Suspense = React.Suspense;
    const defaultFallback = React.createElement('div', {}, 'Loading...');
    
    return React.createElement(
      Suspense,
      { fallback: fallback || defaultFallback },
      React.createElement(Component, props)
    );
  };
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Hook for component memory management
 */
export function useMemoryOptimization() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Register cleanup with memory manager
    cleanupRef.current = memoryManager.registerCleanupCallback(() => {
      // Component-specific cleanup logic
      console.log('🧹 Component memory cleanup triggered');
    });

    // Register performance cleanup
    const performanceCleanup = performanceMonitor.registerMemoryCleanup();

    return () => {
      cleanupRef.current?.();
      performanceCleanup();
    };
  }, []);

  const triggerCleanup = useCallback(() => {
    memoryManager.triggerCleanup();
  }, []);

  const getMemoryReport = useCallback(() => {
    return performanceMonitor.getPerformanceReport();
  }, []);

  return {
    triggerCleanup,
    getMemoryReport
  };
}

/**
 * Hook for tracking component render performance with memory awareness
 */
export function useRenderTracking(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current++;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 ${componentName} render #${renderCount.current}`);
      
      // Track excessive re-renders
      if (renderCount.current > 10) {
        console.warn(`⚠️ ${componentName} has rendered ${renderCount.current} times - check for optimization opportunities`);
      }
    }
  });

  // Memory cleanup for render tracking
  useEffect(() => {
    return memoryManager.registerCleanupCallback(() => {
      renderCount.current = 0;
    });
  }, []);

  return renderCount.current;
}