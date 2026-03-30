// src/lib/job-store.ts
// Job state management — uses Redis in production, in-memory Map for local dev
import { Redis } from "@upstash/redis";

export type ExportJob = {
  id: string;
  status: "queued" | "downloading" | "preparing" | "remotion_rendering" | "complete" | "error";
  progress: number;
  output_url?: string;
  error?: string;
  created_at: string;
};

const JOB_PREFIX = "job:";
const JOB_TTL = 60 * 60 * 2; // 2 hours — auto-cleanup old jobs

// ---- Redis-backed store (production) ----
function createRedisStore() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  return {
    async get(jobId: string): Promise<ExportJob | null> {
      const data = await redis.get<ExportJob>(`${JOB_PREFIX}${jobId}`);
      return data || null;
    },
    async set(job: ExportJob): Promise<void> {
      await redis.set(`${JOB_PREFIX}${job.id}`, job, { ex: JOB_TTL });
    },
    async delete(jobId: string): Promise<void> {
      await redis.del(`${JOB_PREFIX}${jobId}`);
    },
  };
}

// ---- In-memory store (local dev fallback) ----
function createMemoryStore() {
  const jobs = new Map<string, ExportJob>();

  return {
    async get(jobId: string): Promise<ExportJob | null> {
      return jobs.get(jobId) || null;
    },
    async set(job: ExportJob): Promise<void> {
      jobs.set(job.id, job);
    },
    async delete(jobId: string): Promise<void> {
      jobs.delete(jobId);
    },
  };
}

// Auto-select based on environment
const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const jobStore = hasRedis ? createRedisStore() : createMemoryStore();

if (!hasRedis) {
  console.log("[job-store] No Redis configured — using in-memory store (local dev only)");
}
