require('dotenv').config();

const REQUIRED_ENV = [
  'OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'MY_TELEGRAM_ID',
  'WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_KEY'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (isNaN(parseInt(process.env.MY_TELEGRAM_ID, 10))) {
    console.error('[FATAL] MY_TELEGRAM_ID must be a valid number');
    process.exit(1);
  }
}

const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_API: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`,
  MY_TELEGRAM_ID: parseInt(process.env.MY_TELEGRAM_ID, 10),
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  PORT: process.env.PORT || 3000,
  AXIOS_TIMEOUT: 30000,
  MAX_SHORT_MEMORY: 30,
  LIFE_AREAS: ['personal', 'business', 'health', 'relationships', 'goals', 'preferences', 'habits', 'emotions'],
};

module.exports = { validateEnv, config };
