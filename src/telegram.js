const axios = require('axios');
const FormData = require('form-data');
const { config } = require('./config');

const TIMEOUT = config.AXIOS_TIMEOUT;

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${config.TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    }, { timeout: TIMEOUT });
  } catch (error) {
    console.error('[Telegram] sendMessage failed:', error.message);
  }
}

async function sendVoice(chatId, audioBuffer) {
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('voice', audioBuffer, { filename: 'response.mp3', contentType: 'audio/mpeg' });
    await axios.post(`${config.TELEGRAM_API}/sendVoice`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
  } catch (error) {
    console.error('[Telegram] sendVoice failed:', error.message);
  }
}

async function getFileUrl(fileId) {
  const res = await axios.get(`${config.TELEGRAM_API}/getFile?file_id=${fileId}`, { timeout: TIMEOUT });
  return `https://api.telegram.org/file/bot${config.TELEGRAM_TOKEN}/${res.data.result.file_path}`;
}

async function setupWebhook() {
  try {
    const domain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
    if (domain) {
      const primaryDomain = domain.split(',')[0].trim();
      const webhookUrl = `https://${primaryDomain}/webhook`;
      await axios.post(`${config.TELEGRAM_API}/setWebhook`, {
        url: webhookUrl,
        secret_token: config.WEBHOOK_SECRET,
      }, { timeout: TIMEOUT });
      console.log(`[Telegram] Webhook set: ${webhookUrl}`);
    } else {
      console.warn('[Telegram] No REPLIT_DOMAINS found — set webhook manually');
    }
  } catch (error) {
    console.error('[Telegram] Webhook setup failed:', error.message);
  }
}

async function sendTyping(chatId) {
  try {
    await axios.post(`${config.TELEGRAM_API}/sendChatAction`, {
      chat_id: chatId,
      action: 'typing',
    }, { timeout: TIMEOUT });
  } catch (error) {
    console.error('[Telegram] sendTyping failed:', error.message);
  }
}

async function sendRecordVoice(chatId) {
  try {
    await axios.post(`${config.TELEGRAM_API}/sendChatAction`, {
      chat_id: chatId,
      action: 'record_voice',
    }, { timeout: TIMEOUT });
  } catch (error) {
    console.error('[Telegram] sendRecordVoice failed:', error.message);
  }
}

module.exports = { sendMessage, sendVoice, getFileUrl, setupWebhook, sendTyping, sendRecordVoice };
