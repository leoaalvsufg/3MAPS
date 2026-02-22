/**
 * server/cluster.js
 * Cluster mode entry point for the 3Maps server.
 *
 * - In production (NODE_ENV=production) or when CLUSTER=true:
 *   Forks up to Math.min(os.cpus().length, 4) workers (configurable via CLUSTER_WORKERS).
 *   Auto-restarts dead workers.
 * - Otherwise: runs server/index.js directly in single-process mode.
 */

import cluster from 'node:cluster';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Determine whether to use cluster mode
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CLUSTER_ENABLED = IS_PRODUCTION || process.env.CLUSTER === 'true';

if (!CLUSTER_ENABLED) {
  // Single-process mode: just import and run the server directly
  await import('./index.js');
} else {
  // ---------------------------------------------------------------------------
  // Cluster mode
  // ---------------------------------------------------------------------------

  const maxWorkers = 4;
  const cpuCount = os.cpus().length;
  const workerCount = process.env.CLUSTER_WORKERS
    ? Math.max(1, parseInt(process.env.CLUSTER_WORKERS, 10) || 1)
    : Math.min(cpuCount, maxWorkers);

  if (cluster.isPrimary) {
    // eslint-disable-next-line no-console
    console.log(
      `[cluster] Primary ${process.pid} starting ${workerCount} worker(s) ` +
      `(CPUs: ${cpuCount}, NODE_ENV: ${process.env.NODE_ENV ?? 'development'})`
    );

    // Fork workers
    for (let i = 0; i < workerCount; i++) {
      cluster.fork();
    }

    // Auto-restart dead workers
    cluster.on('exit', (worker, code, signal) => {
      // eslint-disable-next-line no-console
      console.log(
        `[cluster] Worker ${worker.process.pid} died ` +
        `(code=${code}, signal=${signal}). Restarting...`
      );
      cluster.fork();
    });

    cluster.on('online', (worker) => {
      // eslint-disable-next-line no-console
      console.log(`[cluster] Worker ${worker.process.pid} is online`);
    });
  } else {
    // Worker process: run the server
    await import('./index.js');
  }
}
