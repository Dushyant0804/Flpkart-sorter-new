// utils/cacheMetrics.js

class CacheMetrics {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.startTime = Date.now();
  }

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) : 0;
    const missRate = total > 0 ? ((this.misses / total) * 100).toFixed(2) : 0;
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      cache_hits: this.hits,
      cache_misses: this.misses,
      total_requests: total,
      hit_rate_percent: hitRate,
      miss_rate_percent: missRate,
      uptime_seconds: uptimeSec,
      last_reset: new Date(this.startTime).toISOString(),
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.startTime = Date.now();
  }
}

module.exports = new CacheMetrics();
