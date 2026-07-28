// a ring buffer of recent job records plus the debug toggle, so a page can be
// interrogated after the fact without re-running anything.

import { debugState } from '../support';
import type { JobRecord } from '../types';

export const devtools = {
  maxJobs: 20,
  jobs: [] as JobRecord[],

  record(job: JobRecord): void {
    this.jobs.push(job);
    if (this.jobs.length > this.maxJobs) this.jobs.shift();
  },

  last(): JobRecord | null {
    return this.jobs[this.jobs.length - 1] || null;
  },

  clear(): void {
    this.jobs.length = 0;
  },

  enable(): void {
    debugState.enabled = true;
    debugState.resolved = true;
  },

  disable(): void {
    debugState.enabled = false;
    debugState.resolved = true;
  },

  isEnabled(): boolean {
    return debugState.enabled;
  },

  /** console.table of the buffer, and the same rows returned for programmatic use. */
  report(): Array<{ id: number; name: string; status: string; ms: number; targets: number }> {
    const rows = this.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      ms: Math.round(j.duration || 0),
      targets: j.targetCount
    }));
    try {
      console.table(rows);
    } catch {
      try {
        console.log(rows);
      } catch {
        /* noop */
      }
    }
    return rows;
  }
};
