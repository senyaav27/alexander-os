import { config } from './config.js';

export async function sendTelegram(text:string, chatId=config.TELEGRAM_ALLOWED_USER_ID, fetcher:typeof fetch=fetch) {
  if(!config.TELEGRAM_BOT_TOKEN || !chatId) throw new Error('Telegram is not configured');
  const response=await fetcher(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:text.slice(0,4096)})});
  if(!response.ok) throw new Error(`Telegram send failed (${response.status})`);
}

export async function setWebhook() {
  if(!config.TELEGRAM_BOT_TOKEN || !config.PUBLIC_BASE_URL || !config.TELEGRAM_WEBHOOK_SECRET) return;
  const response=await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:`${config.PUBLIC_BASE_URL.replace(/\/$/,'')}/telegram/webhook`,secret_token:config.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query']})});
  if(!response.ok) throw new Error(`Telegram webhook setup failed (${response.status})`);
}
