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
  const isPersian = PERSIAN_PATTERN.test(text);

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
  // تلاش ۱: MyMemory
  const r1 = await translateMyMemory(text, from, to);
  if (r1) return r1;

  // تلاش ۲: Google Translate (غیررسمی)
  const r2 = await translateGoogle(text, from, to);
  if (r2) return r2;

  return null;
}

// ─── MyMemory API ───
async function translateMyMemory(text, from, to) {
  try {
    const langPair = `${from}|${to}`;
    // ایمیل = سقف بالاتر (50K در روز به جای 5K)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}&de=bot@uctranslate.com`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    });

    if (res.status === 429) {
      console.log('MyMemory rate limited, trying fallback');
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData) {
      const result = data.responseData.translatedText;
      if (result && result !== text) return result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ─── Google Translate (غیررسمی، رایگان) ───
async function translateGoogle(text, from, to) {
  try {
    const sl = from === 'auto' ? 'auto' : from;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data && data[0]) {
      // ترکیب همه پاراگراف‌ها
      const translated = data[0].map(p => p[0]).join('');
      if (translated && translated !== text) return translated;
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
