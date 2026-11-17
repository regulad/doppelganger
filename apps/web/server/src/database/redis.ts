import Redis from "ioredis";

let redis: Redis | null | undefined;

/**
 * The server's Redis client, or null outside production, where there's no
 * Redis to connect to.
 */
export function getRedis(): Redis | null {
  if (redis === undefined) {
    redis =
      process.env.NODE_ENV === "production"
        ? new Redis({ host: "redis", port: 6379 })
        : null;
  }
  return redis;
}
