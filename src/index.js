// Telegram Translation Bot - Cloudflare Workers
// فارسی → انگلیسی | هر زبان دیگه → فارسی
// پشتیبانی: چت خصوصی + گروه با /t + حالت اینلاین

const WEBHOOK_PATH = '/webhook';

// تشخیص فارسی/عربی
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

  // ─── دستورات ───
  if (text && text.startsWith('/')) {
    const cmd = text.split('@')[0].split(' ')[0].toLowerCase();

    if (cmd === '/start') {
      await send(chatId, `🌐 سلام!

من ربات مترجم هوشمندم.

📌 چت خصوصی:
هر متنی بفرستید → خودکار ترجمه:
• فارسی → انگلیسی
• هر زبان دیگه → فارسی

📌 گروه‌ها (وقتی ربات عضو هست):
ریپلای + /t → ترجمه

📌 اینلاین (هر جا):
@بات_نام متن
ترجمه توی هر چتی نشون داده می‌شه!`, env);
      return;
    }

    if (cmd === '/help') {
      await send(chatId, `📖 راهنما:

🔹 چت خصوصی → خودکار
🔹 گروه → ریپلای + /t
🔹 اینلاین → @بات_نام متن

🎯 قانون:
فارسی → انگلیسی
بقیه → فارسی`, env);
      return;
    }

    // /t در گروه
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

  // ─── پیام معمولی (فقط خصوصی) ───
  if (text && chatType === 'private') {
    const result = await translateSmart(text);
    await send(chatId, result, env);
  }
}

// ─── حالت اینلاین ───
// کاربر می‌نویسه: @بات_نام متن
// ربات ترجمه رو به صورت نتیجه نشون می‌ده
async function handleInlineQuery(query, env) {
  const text = query.query.trim();
  const queryId = query.id;

  // اگه متنی وارد نشده
  if (!text) {
    await answerInline(queryId, [{
      type: 'article',
      id: 'help',
      title: '🌐 ترجمه هوشمند',
      description: 'متن رو بنویسید تا ترجمه بشه',
      input_message_content: {
        message_text: '📝 متنی بنویسید بعد از @بات_نام'
      }
    }], env);
    return;
  }

  // ترجمه متن
  const result = await translateSmart(text);
  const isPersian = PERSIAN_PATTERN.test(text);
  const direction = isPersian ? 'فارسی → انگلیسی' : 'به فارسی';

  await answerInline(queryId, [{
    type: 'article',
    id: 'translation',
    title: `🌐 ${result.substring(0, 50)}`,
    description: `${direction}: ${text.substring(0, 40)}...`,
    input_message_content: {
      message_text: `🌐 ${result}`
    }
  }], env);
}

// ─── ترجمه هوشمند ───
async function translateSmart(text) {
  const isPersian = PERSIAN_PATTERN.test(text);

  if (isPersian) {
    const r = await translate(text, 'fa', 'en');
    return r || '❌ خطا در ترجمه';
  } else {
    const r = await translate(text, 'auto', 'fa');
    return r || '❌ خطا در ترجمه';
  }
}

// ─── MyMemory API (رایگان) ───
async function translate(text, from, to) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
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
  const workerUrl = env.WORKER_URL || `https://translator-bot.${env.CF_SUBDOMAIN || 'YOUR_SUBDOMAIN'}.workers.dev`;
  const webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
