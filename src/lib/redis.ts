import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache keys
export const CACHE_KEYS = {
  FRANCE_DEPUTIES: 'reps:france:deputies',
  SWEDEN_MPS: 'reps:sweden:mps',
  LAST_SYNC: 'reps:last_sync',
};

// Cache TTL: 60 days (representatives change rarely)
export const CACHE_TTL = 60 * 60 * 24 * 60;
