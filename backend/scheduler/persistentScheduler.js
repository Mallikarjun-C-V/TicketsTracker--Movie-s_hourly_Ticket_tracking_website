import { runDuePollingBatch } from '../services/pollingService.js';

let timer = null;
let running = false;
let stopping = false;

async function tick() {
  if (running || stopping) return;
  running = true;
  try {
    await runDuePollingBatch(5);
  } catch (error) {
    console.error('Scheduler tick failed:', error?.message || error);
  } finally {
    running = false;
    if (!stopping) timer = setTimeout(tick, 2000);
  }
}

export function startScheduler() {
  if (timer || running) return;
  stopping = false;
  console.log('Persistent tracker scheduler started (MongoDB is the source of truth).');
  void tick();
}

export async function stopScheduler() {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = null;
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
}
