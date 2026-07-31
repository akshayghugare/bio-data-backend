const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { verifyConnection } = require('./services/email.service');
const { startHealthCron, stopHealthCron } = require('./cron/health.cron');

const server = http.createServer(app);
let shuttingDown = false;

async function start() {
  await connectDB();

  // Report a broken SMTP config at boot rather than at the first registration.
  const mail = await verifyConnection();
  if (!mail.ok) console.warn(`  SMTP not ready: ${mail.error}`);

  server.listen(env.port, () => {
    console.log('─'.repeat(56));
    console.log(`  FindJodi API running on http://localhost:${env.port}`);
    console.log(`  Environment      : ${env.nodeEnv}`);
    console.log(`  PAYMENT_REQUIRED : ${env.paymentRequired}`);
    console.log(`  Email verify     : ${env.mail.enabled ? 'SMTP' : 'console (MAIL_ENABLED=false)'}`);
    // Started after listen() so the first ping cannot beat the open port.
    startHealthCron();
    console.log('─'.repeat(56));
  });
}

/** Drain connections and close the DB pool so restarts don't drop requests. */
async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down gracefully…`);
  stopHealthCron();

  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();

  server.close(async () => {
    await disconnectDB();
    console.log('Shutdown complete');
    process.exit(code);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

start().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

module.exports = server;
