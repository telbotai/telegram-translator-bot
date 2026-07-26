// Telegram Translation Bot - Cloudflare Workers
// قانون ساده: فارسی → انگلیسی | هر زبان دیگه → فارسی

const WEBHOOK_PATH = '/webhook';

// تشخیص زبان فارسی/عربی/اردو
const PERSIAN_PATTERN = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// تشخیص زبان انگلیسی
const ENGLISH_PATTERN = /^[a-zA-Z\s\d\.\,\!\?\;\:\'\"\-\(\)\/\@\#\$\%\^\&\*\+\=\[\]\{\}\|\\\<\>\~\`]+$/;

// تشخیص زبان چینی
const CHINESE_PATTERN = /[\u4E00-\u9FFF\u3400-\u4DBF]/;

// تشخیص زبان ژاپنی
const JAPANESE_PATTERN = /[\u3040-\u309F\u30A0-\u30FF]/;

// تشخیص زبان کره‌ای
const KOREAN_PATTERN = /[\uAC00-\uD7AF\u1100-\u11FF]/;

// تشخیص زبان روسی/اوکراینی
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;

// تشخیص زبان هندی
const HINDI_PATTERN = /[\u0900-\u097F]/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Webhook
    if (url.pathname === WEBHOOK_PATH && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    // Setup webhook
    if (url.pathname === '/setup') {
      return setupWebhook(env);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('Bot is running! 🦉', { status: 200 });
    }

    return new Response('Translation Bot 🌐', { status: 200 });
  }
};

// Webhook handler
async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    if (update.message) {
      await handleMessage(update.message, env);
    }
    return new Response('OK');
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

// اصلی‌ترین تابع - مدیریت پیام‌ها
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const chatType = msg.chat.type; // private, group, supergroup

  // دستورات
  if (text && text.startsWith('/')) {
    const cmd = text.split('@')[0].split(' ')[0].toLowerCase();

    if (cmd === '/start') {
      await send(chatId, `🌐 سلام!

من ربات مترجم هوشمندم.

📌 در چت خصوصی:
هر متنی بفرستید خودکار ترجمه می‌شه:
• فارسی → انگلیسی
• انگلیسی/هر زبان دیگه → فارسی

📌 در گروه‌ها:
روی پیام مورد نظر ریپلای کنید و بفرستید:
/t

🎯 همین! ساده و سریع.`, env);
      return;
    }

    if (cmd === '/help') {
      await send(chatId, `📖 راهنما:

🔹 چت خصوصی:
هر متنی بفرستید → خودکار ترجمه

🔹 گروه‌ها:
ریپلای + /t → ترجمه

🔹 قانون ترجمه:
• فارسی → انگلیسی
• هر زبان دیگه → فارسی`, env);
      return;
    }

    // /t در گروه فقط
    if (cmd === '/t') {
      if (chatType === 'group' || chatType === 'supergroup') {
        // بررسی کن آیا ریپلای شده
        if (msg.reply_to_message && msg.reply_to_message.text) {
          const originalText = msg.reply_to_message.text;
          const senderName = msg.reply_to_message.from.first_name || '';
          const result = await translateSmart(originalText);
          await send(chatId, `🌐 ${result}`, env);
        } else {
          await send(chatId, `⚠️ باید روی پیام مورد نظر ریپلای کنید و /t بزنید.`, env);
        }
      } else {
        await send(chatId, `⚠️ این دستور فقط در گروه‌ها کار می‌کنه.

در چت خصوصی هر متنی بفرستید خودکار ترجمه می‌شه!`, env);
      }
      return;
    }
  }

  // پیام معمولی (فقط چت خصوصی)
  if (text && chatType === 'private') {
    const result = await translateSmart(text);
    await send(chatId, result, env);
  }
}

// تابع ترجمه هوشمند
// قانون: فارسی → انگلیسی | هر چیز دیگه → فارسی
async function translateSmart(text) {
  const isPersian = PERSIAN_PATTERN.test(text);

  if (isPersian) {
    // فارسی → انگلیسی
    const translated = await translate(text, 'fa', 'en');
    return translated || '❌ خطا در ترجمه';
  } else {
    // هر زبان دیگه → فارسی
    const translated = await translate(text, 'auto', 'fa');
    return translated || '❌ خطا در ترجمه';
  }
}

// ترجمه با MyMemory API (رایگان)
async function translate(text, from, to) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.responseStatus === 200 && data.responseData) {
      const result = data.responseData.translatedText;

      // اگه ترجمه فرقی نکرد، یعنی شاید منبع اشتباه بود
      if (result.toLowerCase() === text.toLowerCase()) {
        // سعی کن از منبع دیگه ترجمه کنه
        const url2 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fa`;
        const res2 = await fetch(url2);
        const data2 = await res2.json();
        if (data2.responseStatus === 200 && data2.responseData) {
          return data2.responseData.translatedText;
        }
      }

      return result;
    }
    return null;
  } catch (e) {
    console.error('Translation error:', e);
    return null;
  }
}

// ارسال پیام
async function send(chatId, text, env) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });
}

// تنظیم webhook
async function setupWebhook(env) {
  const workerUrl = env.WORKER_URL || `https://${env.CF_WORKER_NAME || 'translator-bot'}.YOUR_SUBDOMAIN.workers.dev`;
  const webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;

  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
