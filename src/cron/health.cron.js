const cron = require('node-cron');
const env = require('../config/env');

/**
 * Pings /health on a schedule so a failing instance shows up in the logs
 * instead of going quiet. Pointing HEALTH_CHECK_URL at the public Render URL
 * also keeps a free instance from spinning down after 15 minutes idle.
 */

let task = null;

async function checkHealth() {
  const url = `${env.healthCheck.url.replace(/\/+$/, '')}/health`;
  const startedAt = Date.now();

  // fetch() has no default timeout — without this a hung socket would keep the
  // run open until the next tick fires.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const ms = Date.now() - startedAt;

    if (!response.ok) {
      console.warn(`[health-cron] ${url} → ${response.status} ${response.statusText} (${ms}ms)`);
      return;
    }

    const body = await response.json();
    console.log(`[health-cron] ok (${ms}ms) — uptime ${body.uptime}s`);
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timed out after 15s' : error.message;
    console.error(`[health-cron] ${url} unreachable: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the job. Returns null when disabled or misconfigured. */
function startHealthCron() {
  if (!env.healthCheck.enabled) return null;

  if (!cron.validate(env.healthCheck.schedule)) {
    console.error(`[health-cron] invalid HEALTH_CHECK_SCHEDULE: ${env.healthCheck.schedule}`);
    return null;
  }

  // noOverlap: a slow ping must never stack up behind the next scheduled run.
  task = cron.schedule(env.healthCheck.schedule, checkHealth, {
    name: 'health-check',
    noOverlap: true,
  });

  console.log(`  Health cron      : ${env.healthCheck.schedule} → ${env.healthCheck.url}/health`);
  return task;
}

function stopHealthCron() {
  if (task) task.stop();
  task = null;
}

module.exports = { startHealthCron, stopHealthCron, checkHealth };
