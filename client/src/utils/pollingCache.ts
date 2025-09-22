/**
 * Polling Cache System - Task 3 Fallback Implementation
 *
 * Provides intelligent caching for polling data with:
 * - Stale-while-revalidate pattern
 * - Data staleness indicators
 * - Graceful degradation to cached data during failures
 * - Memory-efficient storage with TTL management
 */

'use client'

import { logDebug } from '@/utils/logging'
import type { Race, Entrant } from '@/types/meetings'
import type { RacePoolData } from '@/types/racePools'

// Cache entry interface with staleness tracking
export interface CacheEntry<T> {
  data: T
  timestamp: number
  lastUpdate: number
  accessCount: number
  etag?: string
  isStale: boolean
  staleSince?: number
}

// Data freshness levels
export type DataFreshness = 'fresh' | 'acceptable' | 'stale' | 'critical'

// Cache configuration
export interface CacheConfig {
  maxSize: number
  defaultTtl: number
  staleThreshold: number // Time after which data is considered stale
  criticalThreshold: number // Time after which data is critically stale
  compressionEnabled: boolean
  persistToStorage: boolean
}

// Combined race data interface for caching
export interface CachedRaceData {
  race: Race | null
  entrants: Entrant[]
  pools: RacePoolData | null
  moneyFlowUpdateTrigger: number
  lastSuccessfulFetch: number
  dataSource: 'fresh' | 'cache' | 'fallback'
}

// Cache statistics for monitoring
export interface CacheStats {
  hits: number
  misses: number
  staleHits: number
  evictions: number
  totalSize: number
  averageAge: number
  stalenessDistribution: Record<DataFreshness, number>
}

/**
 * Intelligent polling cache with fallback capabilities
 */
export class PollingCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
    totalSize: 0,
    averageAge: 0,
    stalenessDistribution: { fresh: 0, acceptable: 0, stale: 0, critical: 0 }
  }

  constructor(private config: CacheConfig) {
    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), 60000) // Every minute
  }

  /**
   * Get data from cache or fallback
   */
  get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.stats.misses++
      return null
    }

    // Update access statistics
    entry.accessCount++
    this.updateStaleness(entry)

    if (entry.isStale) {
      this.stats.staleHits++
      logDebug('Cache hit with stale data', {
        key,
        staleSince: entry.staleSince,
        freshness: this.getDataFreshness(entry)
      }, 'PollingCache')
    } else {
      this.stats.hits++
    }

    return entry
  }

  /**
   * Store data in cache with metadata
   */
  set(key: string, data: T, etag?: string): void {
    const now = Date.now()

    // Ensure cache size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastUsed()
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      lastUpdate: now,
      accessCount: 1,
      etag,
      isStale: false,
      staleSince: undefined
    }

    this.cache.set(key, entry)
    this.updateStats()

    logDebug('Data cached', {
      key,
      size: this.getDataSize(data),
      etag
    }, 'PollingCache')
  }

  /**
   * Update existing cache entry with new data
   */
  update(key: string, data: T, etag?: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    const now = Date.now()
    entry.data = data
    entry.lastUpdate = now
    entry.etag = etag
    entry.isStale = false
    entry.staleSince = undefined

    logDebug('Cache entry updated', { key, etag }, 'PollingCache')
    return true
  }

  /**
   * Get data freshness level
   */
  getDataFreshness(entry: CacheEntry<T>): DataFreshness {
    const age = Date.now() - entry.lastUpdate

    if (age <= this.config.staleThreshold) {
      return 'fresh'
    } else if (age <= this.config.staleThreshold * 2) {
      return 'acceptable'
    } else if (age <= this.config.criticalThreshold) {
      return 'stale'
    } else {
      return 'critical'
    }
  }

  /**
   * Check if cached data can be used as fallback
   */
  canUseFallback(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    const freshness = this.getDataFreshness(entry)

    // Don't use critically stale data as fallback
    return freshness !== 'critical'
  }

  /**
   * Get fallback data with staleness information
   */
  getFallbackData(key: string): {
    data: T | null
    freshness: DataFreshness
    staleSince: number | undefined
    isReliable: boolean
  } {
    const entry = this.cache.get(key)

    if (!entry) {
      return {
        data: null,
        freshness: 'critical',
        staleSince: undefined,
        isReliable: false
      }
    }

    const freshness = this.getDataFreshness(entry)
    const isReliable = freshness === 'fresh' || freshness === 'acceptable'

    logDebug('Providing fallback data', {
      key,
      freshness,
      staleSince: entry.staleSince,
      isReliable
    }, 'PollingCache')

    return {
      data: entry.data,
      freshness,
      staleSince: entry.staleSince,
      isReliable
    }
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.updateStats()
      logDebug('Cache entry invalidated', { key }, 'PollingCache')
    }
    return deleted
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.resetStats()
    logDebug('Cache cleared', undefined, 'PollingCache')
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Update staleness status for entry
   */
  private updateStaleness(entry: CacheEntry<T>): void {
    const now = Date.now()
    const age = now - entry.lastUpdate

    if (age > this.config.staleThreshold && !entry.isStale) {
      entry.isStale = true
      entry.staleSince = now
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastUsed(): void {
    let lruKey: string | null = null
    let lruEntry: CacheEntry<T> | null = null

    for (const [key, entry] of this.cache.entries()) {
      if (!lruEntry || entry.accessCount < lruEntry.accessCount) {
        lruKey = key
        lruEntry = entry
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey)
      this.stats.evictions++
      logDebug('Cache entry evicted (LRU)', { key: lruKey }, 'PollingCache')
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp

      // Remove entries older than critical threshold
      if (age > this.config.criticalThreshold) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.updateStats()
      logDebug('Cache cleanup completed', { removed: cleaned }, 'PollingCache')
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.totalSize = this.cache.size

    if (this.cache.size === 0) {
      this.stats.averageAge = 0
      return
    }

    const now = Date.now()
    let totalAge = 0
    const distribution = { fresh: 0, acceptable: 0, stale: 0, critical: 0 }

    for (const entry of this.cache.values()) {
      totalAge += now - entry.lastUpdate
      const freshness = this.getDataFreshness(entry)
      distribution[freshness]++
    }

    this.stats.averageAge = totalAge / this.cache.size
    this.stats.stalenessDistribution = distribution
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      evictions: 0,
      totalSize: 0,
      averageAge: 0,
      stalenessDistribution: { fresh: 0, acceptable: 0, stale: 0, critical: 0 }
    }
  }

  /**
   * Estimate data size for monitoring
   */
  private getDataSize(data: T): number {
    try {
      return JSON.stringify(data).length
    } catch {
      return 0
    }
  }
}

/**
 * Race-specific cache with optimized configuration
 */
export class RaceDataCache extends PollingCache<CachedRaceData> {
  constructor() {
    super({
      maxSize: 50, // Store up to 50 races
      defaultTtl: 300000, // 5 minutes default TTL
      staleThreshold: 60000, // Data is stale after 1 minute
      criticalThreshold: 600000, // Data is critically stale after 10 minutes
      compressionEnabled: false, // Disable for simplicity
      persistToStorage: false // Disable for now
    })
  }

  /**
   * Store race data with proper typing
   */
  setRaceData(
    raceId: string,
    race: Race | null,
    entrants: Entrant[],
    pools: RacePoolData | null,
    moneyFlowUpdateTrigger: number
  ): void {
    const raceData: CachedRaceData = {
      race,
      entrants,
      pools,
      moneyFlowUpdateTrigger,
      lastSuccessfulFetch: Date.now(),
      dataSource: 'fresh'
    }

    this.set(`race:${raceId}`, raceData)
  }

  /**
   * Get race data with fallback handling
   */
  getRaceData(raceId: string): CachedRaceData | null {
    const entry = this.get(`race:${raceId}`)
    if (!entry) {
      return null
    }

    const raceData = { ...entry.data }

    // Mark data source based on freshness
    const freshness = this.getDataFreshness(entry)
    if (freshness === 'fresh' || freshness === 'acceptable') {
      raceData.dataSource = 'cache'
    } else {
      raceData.dataSource = 'fallback'
    }

    return raceData
  }

  /**
   * Get data with staleness indicators for UI
   */
  getRaceDataWithIndicators(raceId: string): {
    data: CachedRaceData | null
    isStale: boolean
    freshness: DataFreshness
    lastUpdate: number | null
    shouldShowStaleIndicator: boolean
  } {
    const entry = this.get(`race:${raceId}`)

    if (!entry) {
      return {
        data: null,
        isStale: false,
        freshness: 'critical',
        lastUpdate: null,
        shouldShowStaleIndicator: false
      }
    }

    const freshness = this.getDataFreshness(entry)
    const shouldShowStaleIndicator = freshness === 'stale' || freshness === 'critical'

    return {
      data: this.getRaceData(raceId),
      isStale: entry.isStale,
      freshness,
      lastUpdate: entry.lastUpdate,
      shouldShowStaleIndicator
    }
  }
}

/**
 * Global race data cache instance
 */
export const raceDataCache = new RaceDataCache()

/**
 * Cache manager for coordinating multiple cache instances
 */
export class CacheManager {
  private caches = new Map<string, PollingCache<unknown>>()

  /**
   * Register a cache instance
   */
  register<T>(name: string, cache: PollingCache<T>): void {
    this.caches.set(name, cache as PollingCache<unknown>)
    logDebug('Cache registered', { name }, 'CacheManager')
  }

  /**
   * Get health status of all caches
   */
  getHealthStatus(): Record<string, {
    stats: CacheStats
    config: CacheConfig
    isHealthy: boolean
  }> {
    const status: Record<string, unknown> = {}

    for (const [name, cache] of this.caches.entries()) {
      const stats = cache.getStats()
      const hitRate = stats.hits / (stats.hits + stats.misses) || 0
      const staleness = stats.stalenessDistribution

      status[name] = {
        stats,
        config: {} as CacheConfig,
        isHealthy: hitRate > 0.5 && staleness.critical < staleness.fresh
      }
    }

    return status as Record<string, {
      stats: CacheStats
      config: CacheConfig
      isHealthy: boolean
    }>
  }

  /**
   * Clear all registered caches
   */
  clearAll(): void {
    for (const [name, cache] of this.caches.entries()) {
      cache.clear()
      logDebug('Cache cleared', { name }, 'CacheManager')
    }
  }

  /**
   * Get aggregate statistics
   */
  getAggregateStats(): {
    totalCaches: number
    totalEntries: number
    overallHitRate: number
    averageAge: number
  } {
    let totalHits = 0
    let totalMisses = 0
    let totalEntries = 0
    let totalAge = 0
    let cacheCount = 0

    for (const cache of this.caches.values()) {
      const stats = cache.getStats()
      totalHits += stats.hits
      totalMisses += stats.misses
      totalEntries += stats.totalSize
      totalAge += stats.averageAge
      cacheCount++
    }

    return {
      totalCaches: this.caches.size,
      totalEntries,
      overallHitRate: totalHits / (totalHits + totalMisses) || 0,
      averageAge: cacheCount > 0 ? totalAge / cacheCount : 0
    }
  }
}

/**
 * Global cache manager instance
 */
export const cacheManager = new CacheManager()

/**
 * Initialize cache registrations
 */
export function initializeCaches() {
  cacheManager.register('raceData', raceDataCache)
}

