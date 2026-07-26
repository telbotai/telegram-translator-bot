// Telegram Translation Bot - Cloudflare Workers
// فارسی → انگلیسی | هر زبان دیگه → فارسی

const WEBHOOK_PATH = '/webhook';
const PERSIAN_PATTERN = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === WEBHOOK_PATH && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/setup') return setupWebhook(env);
    if (url.pathname === '/health') return new Response('OK 🦉', { status: 200 });
    return new Response('Translation Bot 🌐', { status: 200 });
  }
};

// ─── Webhook ───
async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    if (update.message) await handleMessage(update.message, env);
    if (update.inline_query) await handleInlineQuery(update.inline_query, env);
    return new Response('OK');
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

// ─── مدیریت پیام‌ها ───
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const chatType = msg.chat.type;

  if (text && text.startsWith('/')) {
    const cmd = text.split('@')[0].split(' ')[0].toLowerCase();

    if (cmd === '/start') {
      await send(chatId, `🌐 سلام!

من ربات مترجم هوشمندم.

📌 چت خصوصی:
هر متنی بفرستید → خودکار ترجمه:
• فارسی → انگلیسی
• هر زبان دیگه → فارسی

📌 گروه‌ها:
ریپلای + /t → ترجمه

📌 اینلاین:
@بات_نام متن`, env);
      return;
    }

    if (cmd === '/help') {
      await send(chatId, `📖 راهنما:
🔹 چت خصوصی → خودکار
🔹 گروه → ریپلای + /t
🔹 اینلاین → @بات_نام متن`, env);
      return;
    }

    if (cmd === '/t') {
      if (chatType === 'group' || chatType === 'supergroup') {
        if (msg.reply_to_message && msg.reply_to_message.text) {
          const result = await translateSmart(msg.reply_to_message.text);
          await send(chatId, `🌐 ${result}`, env);
        } else {
          await send(chatId, `⚠️ روی پیام ریپلای کنید و /t بزنید.`, env);
        }
      } else {
        await send(chatId, `⚠️ در چت خصوصی هر متنی بفرستید خودکار ترجمه می‌شه!`, env);
      }
      return;
    }
  }

  // پیام معمولی (فقط خصوصی)
  if (text && chatType === 'private') {
    const result = await translateSmart(text);
    await send(chatId, result, env);
  }
}

// ─── اینلاین ───
async function handleInlineQuery(query, env) {
  const text = query.query.trim();
  const queryId = query.id;

  if (!text) {
    await answerInline(queryId, [{
      type: 'article', id: 'help',
      title: '🌐 ترجمه هوشمند',
      description: 'متن رو بنویسید تا ترجمه بشه',
      input_message_content: { message_text: '📝 متنی بنویسید بعد از @بات_نام' }
    }], env);
    return;
  }

  const result = await translateSmart(text);

  await answerInline(queryId, [{
    type: 'article', id: 'translation',
    title: `🌐 ${result.substring(0, 50)}`,
    description: text.substring(0, 40),
    input_message_content: { message_text: `🌐 ${result}` }
  }], env);
}

// ─── ترجمه هوشمند ───
async function translateSmart(text) {
  const isPersian = PERSIAN_PATTERN.test(text);

  if (isPersian) {
    const r = await translateWithFallback(text, 'fa', 'en');
    return r || '❌ خطا در ترجمه';
  } else {
    const r = await translateWithFallback(text, 'en', 'fa');
    return r || '❌ خطا در ترجمه';
  }
}

// ─── ترجمه با fallback ───
async function translateWithFallback(text, from, to) {
  // تلاش ۱: Lingva Translate (رایگان، open-source)
  const r1 = await translateLingva(text, from, to);
  if (r1) return r1;

  // تلاش ۲: Google Translate مستقیم
  const r2 = await translateGoogleDirect(text, from, to);
  if (r2) return r2;

  // تلاش ۳: LibreTranslate (عمومی)
  const r3 = await translateLibre(text, from, to);
  if (r3) return r3;

  return null;
}

// ─── Lingva Translate (اولویت اول) ───
async function translateLingva(text, from, to) {
  try {
    // چندین instancia عمومی
    const instances = [
      'https://lingva.thedaviddelta.com',
      'https://lingva.ml',
      'https://lingva.kavin.rocks',
    ];

    for (const base of instances) {
      try {
        const url = `${base}/api/v1/${from}/${to}/${encodeURIComponent(text)}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'TelegramBot/1.0' }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.translation && data.translation !== text) {
            return data.translation;
          }
        }
      } catch (e) {
        continue; // سعی کن اینستنس بعدی
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ─── Google Translate مستقیم ───
async function translateGoogleDirect(text, from, to) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data && data[0]) {
      const translated = data[0].map(p => p[0]).join('');
      if (translated && translated !== text) return translated;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ─── LibreTranslate (عمومی) ───
async function translateLibre(text, from, to) {
  try {
    const instances = [
      'https://libretranslate.com',
      'https://translate.fortytwo-it.com',
    ];

    for (const base of instances) {
      try {
        const url = `${base}/translate`;
        const res = await fetch(url, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: text,
            source: from,
            target: to,
            format: 'text'
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.translatedText && data.translatedText !== text) {
            return data.translatedText;
          }
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ─── ارسال پیام ───
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

// ─── پاسخ اینلاین ───
async function answerInline(queryId, results, env) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerInlineQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inline_query_id: queryId,
      results: results,
      cache_time: 1
    })
  });
}

// ─── تنظیم Webhook ───
async function setupWebhook(env) {
  const workerUrl = env.WORKER_URL || `https://uctranslate.hadis-vpm-f17.workers.dev`;
  const webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}&allowed_updates=["message","inline_query"]`);
  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
