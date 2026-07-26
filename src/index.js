// Telegram Translation Bot - Cloudflare Worker
// Free, multi-user, no server needed!

const BOT_TOKEN = ''; // Set via Cloudflare secrets: wrangler secret put BOT_TOKEN
const WEBHOOK_PATH = '/webhook';
const SECRET_PATH = '/secret-path'; // Random string for webhook security

// Free translation APIs (no key needed)
const LANGUAGES = {
  'fa': 'Persian (فارسی)',
  'en': 'English',
  'ar': 'Arabic (العربیة)',
  'tr': 'Turkish (Türkçe)',
  'fr': 'French (Français)',
  'de': 'German (Deutsch)',
  'es': 'Spanish (Español)',
  'ru': 'Russian (Русский)',
  'zh': 'Chinese (中文)',
  'ja': 'Japanese (日本語)',
  'ko': 'Korean (한국어)',
  'hi': 'Hindi (हिन्दी)',
  'pt': 'Portuguese (Português)',
  'it': 'Italian (Italiano)',
  'nl': 'Dutch (Nederlands)',
  'sv': 'Swedish (Svenska)',
  'pl': 'Polish (Polski)',
  'uk': 'Ukrainian (Українська)',
};

// Auto language detection keywords
const AUTO_DETECT = {
  'fa': /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/,
  'ar': /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/,
  'zh': /[\u4E00-\u9FFF\u3400-\u4DBF]/,
  'ja': /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,
  'ko': /[\uAC00-\uD7AF\u1100-\u11FF]/,
  'hi': /[\u0900-\u097F]/,
  'ru': /[\u0400-\u04FF]/,
  'uk': /[\u0400-\u04FF]/,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Webhook endpoint
    if (url.pathname === WEBHOOK_PATH && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    // Set webhook
    if (url.pathname === '/setup' && request.method === 'GET') {
      return setupWebhook(env);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK - Bot is running! 🦉', { status: 200 });
    }

    // Stats
    if (url.pathname === '/stats') {
      return getStats(env);
    }

    return new Response('Translation Bot is running! 🌐', { status: 200 });
  },

  async scheduled(event, env) {
    // Optional: scheduled tasks (e.g., daily stats)
    await env.USER_PREFS.put('last_cron', new Date().toISOString());
  }
};

// Handle incoming webhook
async function handleWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.message) {
      await handleMessage(update.message, env);
    }

    return new Response('OK');
  } catch (error) {
    return new Response('Error: ' + error.message, { status: 500 });
  }
}

// Handle messages
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;
  const userName = message.from.first_name || 'کاربر';

  // Get user's preferred language
  const userLang = await getUserLang(userId, env);
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

  // Handle commands
  if (text && text.startsWith('/')) {
    const [command, ...args] = text.split(' ');
    const cleanCommand = command.split('@')[0].toLowerCase();

    switch (cleanCommand) {
      case '/start':
        await sendMessage(chatId, getWelcome(userName), env);
        return;

      case '/help':
        await sendMessage(chatId, getHelp(), env);
        return;

      case '/lang':
        if (args.length === 1 && LANGUAGES[args[0]]) {
          await setUserLang(userId, args[0], env);
          await sendMessage(chatId, `✅ زبان مقصد: ${LANGUAGES[args[0]]}`, env);
        } else if (args.length === 0) {
          await sendMessage(chatId, getLanguageList(), env);
        } else {
          await sendMessage(chatId, '❌ زبان نامعتبر!\n\nاز /lang برای دیدن لیست زبان‌ها استفاده کنید.', env);
        }
        return;

      case '/translate':
        if (args.length >= 2) {
          const lang = args[0].toLowerCase();
          const textToTranslate = args.slice(1).join(' ');
          const result = await translate(textToTranslate, lang, env);
          if (result) {
            await sendMessage(chatId, `🌐 ${result}`, env);
          }
        } else {
          await sendMessage(chatId, '📝 نحوه استفاده:\n/translate fa Hello World', env);
        }
        return;

      case '/auto':
        await setUserLang(userId, 'auto', env);
        await sendMessage(chatId, '🤖 حالت تشخیص خودکار فعال شد!\nهر متنی بفرستید، زبانش تشخیص داده می‌شه و ترجمه می‌شه.', env);
        return;

      case '/stats':
        if (!isGroup) {
          const stats = await getStats(env);
          await sendMessage(chatId, stats, env);
        }
        return;
    }
  }

  // Handle regular messages (not commands)
  if (text && !text.startsWith('/')) {
    // In groups: only respond to replies to bot messages or mentions
    if (isGroup) {
      const botInfo = await getBotInfo(env);
      const isReplyToBot = message.reply_to_message && message.reply_to_message.from.id === botInfo.id;
      const isMention = text.includes(`@${botInfo.username}`);

      if (!isReplyToBot && !isMention) {
        return; // Ignore messages that don't involve the bot
      }

      // Remove mention from text
      const cleanText = text.replace(/@\w+/g, '').trim();
      if (cleanText) {
        const targetLang = userLang === 'auto' ? null : userLang;
        const result = await translate(cleanText, targetLang, env);
        if (result) {
          await sendMessage(chatId, `🌐 ${result}`, env);
        }
      }
      return;
    }

    // In private chat: translate everything
    const targetLang = userLang === 'auto' ? null : userLang;
    const result = await translate(text, targetLang, env);
    if (result) {
      await sendMessage(chatId, `🌐 ${result}`, env);
    }
  }
}

// Translation function using free APIs
async function translate(text, targetLang, env) {
  try {
    // Detect source language
    const detectedLang = detectLanguage(text);

    // If auto mode and same language detected, translate to English
    let finalTarget = targetLang;
    if (!targetLang || targetLang === 'auto') {
      finalTarget = detectedLang === 'en' ? 'fa' : 'en';
    }

    // If source and target are the same, pick another language
    if (detectedLang === finalTarget) {
      finalTarget = finalTarget === 'en' ? 'fa' : 'en';
    }

    // Use MyMemory API (free, no key needed)
    const sourceLang = detectedLang || 'auto';
    const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${finalTarget}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      const translated = data.responseData.translatedText;
      const targetName = LANGUAGES[finalTarget] || finalTarget;
      return `${translated}\n\n📎 ${targetName}`;
    }

    return null;
  } catch (error) {
    console.error('Translation error:', error);
    return null;
  }
}

// Detect language from text
function detectLanguage(text) {
  for (const [lang, pattern] of Object.entries(AUTO_DETECT)) {
    if (pattern.test(text)) {
      return lang;
    }
  }
  return 'en'; // Default to English
}

// Get/set user language preference
async function getUserLang(userId, env) {
  try {
    return await env.USER_PREFS.get(`lang:${userId}`) || 'fa';
  } catch {
    return 'fa';
  }
}

async function setUserLang(userId, lang, env) {
  try {
    await env.USER_PREFS.put(`lang:${userId}`, lang);
  } catch (error) {
    console.error('Error setting lang:', error);
  }
}

// Telegram API helpers
async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
}

async function getBotInfo(env) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await response.json();
    return data.result;
  } catch {
    return { id: 0, username: 'bot' };
  }
}

// Setup webhook
async function setupWebhook(env) {
  const workerUrl = env.WORKER_URL || 'https://telegram-translator-bot.YOUR_SUBDOMAIN.workers.dev';
  const webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;

  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}`;

  const response = await fetch(url);
  const data = await response.json();

  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Get stats
async function getStats(env) {
  try {
    const list = await env.USER_PREFS.list({ prefix: 'lang:' });
    const userCount = list.keys.length;
    const lastCron = await env.USER_PREFS.get('last_cron');

    return `📊 آمار ربات:\n👥 تعداد کاربران: ${userCount}\n⏰ آخرین بروزرسانی: ${lastCron || 'ن/A'}`;
  } catch {
    return '📊 آمار در دسترس نیست';
  }
}

// Welcome message
function getWelcome(userName) {
  return `👋 سلام ${userName}!

🌐 من ربات مترجم هوشمندم!

✨ قابلیت‌ها:
• ترجمه خودکار هر متنی
• پشتیبانی ۱۸ زبان مختلف
• کار در گروه‌ها و چت خصوصی

📝 نحوه استفاده:
• هر متنی بفرستید → ترجمه می‌شه
• /lang → تنظیم زبان مقصد
• /lang fa → تنظیم فارسی
• /lang auto → حالت خودکار
• /translate en متن فارسی → ترجمه دستی
• /help → راهنما

🚀 همین الان شروع کنید!`;
}

// Help message
function getHelp() {
  return `📖 راهنمای ربات مترجم:

🔹 دستورات:
• /lang → انتخاب زبان مقصد
• /lang fa → تنظیم فارسی
• /lang en → تنظیم انگلیسی
• /lang auto → تشخیص خودکار
• /translate <کد زبان> <متن> → ترجمه دستی

🔹 در گروه‌ها:
• ریپلای به پیام ربات → ترجمه
• @bot نام ربات + متن → ترجمه

🔹 زبان‌های موجود:
fa, en, ar, tr, fr, de, es, ru, zh, ja, ko, hi, pt, it, nl, sv, pl, uk

💡 نکته: در چت خصوصی، هر متنی ارسال کنید خودکار ترجمه می‌شه!`;
}

// Language list
function getLanguageList() {
  let list = '🌍 لیست زبان‌ها:\n\n';

  for (const [code, name] of Object.entries(LANGUAGES)) {
    list += `• ${code} - ${name}\n`;
  }

  list += '\n📝 نحوه استفاده:\n/lang fa';
  return list;
}
