const express = require('express');
const { validateEnv, config } = require('./src/config');
const { setupWebhook } = require('./src/telegram');
const { keepAlive } = require('./src/memory');
const { processMessage } = require('./src/processor');

validateEnv();

const app = express();
app.use(express.json({ limit: '1mb' }));

const verifyTelegram = (req, res, next) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== config.WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }
  next();
};

app.post('/webhook', verifyTelegram, (req, res) => {
  res.sendStatus(200);
  console.log('[Webhook] Incoming update received');
  if (req.body && req.body.message) {
    processMessage(req.body.message).catch(err =>
      console.error('[Webhook Error]:', err.message)
    );
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

setInterval(keepAlive, 24 * 60 * 60 * 1000);

app.listen(config.PORT, async () => {
  console.log(`Jarvis running on port ${config.PORT}`);
  await setupWebhook();
});
