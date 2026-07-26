// Telegram Voice Clone Bot - Cloudflare Workers
// ویس بفرست + متن بفرست = با همون صدا می‌خونه!

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
    return new Response('Voice Clone Bot 🎤', { status: 200 });
  }
};

// ─── Webhook ───
async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    if (update.message) await handleMessage(update.message, env);
    return new Response('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Error', { status: 500 });
  }
}

// ─── مدیریت پیام‌ها ───
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // ─── دستورات ───
  if (text && text.startsWith('/')) {
    const cmd = text.split('@')[0].split(' ')[0].toLowerCase();

    if (cmd === '/start') {
      await send(chatId, `🎤 سلام!

من ربات کلون صدا هستم!

📌 نحوه استفاده:
۱. یه پیام صوتی بفرست (نمونه صدا)
۲. متنی که می‌خوای با اون صدا خونده بشه رو بنویس
۳. من متن رو با صدای تو می‌خونم! 🎙️

📝 دستورات:
/start - شروع
/help - راهنما
/voices - لیست صداهای ذخیره شده
/delete - حذف صدای ذخیره شده`, env);
      return;
    }

    if (cmd === '/help') {
      await send(chatId, `📖 راهنما:

🔹 مرحله ۱: یه پیام صوتی بفرست
(حداقل ۳ ثانیه باشه)

🔹 مرحله ۲: متن بنویس
(فارسی یا انگلیسی)

🔹 مرحله ۳: ربات متن رو با صدای تو می‌خونه!

⚠️ نکات:
• هر بار پیام صوتی بفرستی، صدای جدید کلون می‌شه
• حداکثر ۱۰,۰۰۰ کاراکتر در ماه (رایگان)
• فرمت‌های پشتیبانی: OGG, MP3, WAV, M4A`, env);
      return;
    }

    if (cmd === '/voices') {
      const voices = await getUserVoices(userId, env);
      if (voices.length === 0) {
        await send(chatId, `⚠️ هنوز صدایی ذخیره نکردید!

یه پیام صوتی بفرستید تا صداتون کلون بشه.`, env);
      } else {
        let list = '🎙️ صداهای ذخیره شده:\n\n';
        voices.forEach((v, i) => {
          list += `${i + 1}. ${v.name} (${v.language})\n`;
        });
        list += '\n📞 برای حذف: /delete';
        await send(chatId, list, env);
      }
      return;
    }

    if (cmd === '/delete') {
      await deleteUserVoices(userId, env);
      await send(chatId, `✅ همه صداهای ذخیره شده حذف شد.`, env);
      return;
    }
  }

  // ─── پیام صوتی → کلون صدا ───
  if (msg.voice || msg.audio) {
    await handleVoiceMessage(msg, env);
    return;
  }

  // ─── متن → تبدیل به صدا با کلون ───
  if (text) {
    await handleTextMessage(chatId, userId, text, env);
    return;
  }
}

// ─── مدیریت پیام صوتی ───
async function handleVoiceMessage(msg, env) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;

  await send(chatId, `⏳ در حال پردازش صدا...`, env);

  // دانلود فایل صوتی از تلگرام
  const audioBuffer = await downloadTelegramFile(fileId, env);
  if (!audioBuffer) {
    await send(chatId, `❌ خطا در دانلود فایل صوتی`, env);
    return;
  }

  // آپلود به ElevenLabs و کلون صدا
  const voiceId = await createVoiceClone(userId, audioBuffer, env);
  if (!voiceId) {
    await send(chatId, `❌ خطا در کلون صدا. لطفاً دوباره امتحان کنید.`, env);
    return;
  }

  await send(chatId, `✅ صدای شما کلون شد! 🎉

حالا یه متن بنویسید تا با صدای شما خونده بشه.

📝 مثال:
سلام خوبی
Hello how are you`, env);
}

// ─── مدیریت پیام متنی ───
async function handleTextMessage(chatId, userId, text, env) {
  // بررسی کن صدا ذخیره شده
  const voiceId = await getUserVoiceId(userId, env);
  if (!voiceId) {
    await send(chatId, `⚠️ اول یه پیام صوتی بفرستید تا صداتون کلون بشه!`, env);
    return;
  }

  await send(chatId, `⏳ در حال ساخت صدا...`, env);

  // تبدیل متن به صدا با کلون
  const audioBuffer = await textToSpeech(text, voiceId, env);
  if (!audioBuffer) {
    await send(chatId, `❌ خطا در ساخت صدا`, env);
    return;
  }

  // ارسال فایل صوتی
  await sendVoice(chatId, audioBuffer, env);
}

// ─── دانلود فایل از تلگرام ───
async function downloadTelegramFile(fileId, env) {
  try {
    // گرفتن اطلاعات فایل
    const fileRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) return null;

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;

    // دانلود فایل
    const res = await fetch(fileUrl);
    if (!res.ok) return null;

    return await res.arrayBuffer();
  } catch (e) {
    console.error('Download error:', e);
    return null;
  }
}

// ─── کلون صدا با ElevenLabs ───
async function createVoiceClone(userId, audioBuffer, env) {
  try {
    // نام صدا
    const voiceName = `user_${userId}_${Date.now()}`;

    // آپلود برای کلون
    const formData = new FormData();
    formData.append('name', voiceName);
    formData.append('files', new Blob([audioBuffer], { type: 'audio/ogg' }), 'sample.ogg');

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('ElevenLabs error:', err);
      return null;
    }

    const data = await res.json();
    const voiceId = data.voice_id;

    // ذخیره voiceId برای کاربر
    await saveUserVoiceId(userId, voiceId, env);

    return voiceId;
  } catch (e) {
    console.error('Clone error:', e);
    return null;
  }
}

// ─── تبدیل متن به صدا ───
async function textToSpeech(text, voiceId, env) {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('TTS error:', err);
      return null;
    }

    return await res.arrayBuffer();
  } catch (e) {
    console.error('TTS error:', e);
    return null;
  }
}

// ─── ذخیره و بازیابی صدا ───
async function saveUserVoiceId(userId, voiceId, env) {
  try {
    // ذخیره آخرین voiceId
    await env.USER_PREFS.put(`voice:${userId}`, voiceId);

    // اضافه کردن به لیست صداها
    const listKey = `voices:${userId}`;
    const existing = await env.USER_PREFS.get(listKey);
    const voices = existing ? JSON.parse(existing) : [];
    voices.push({
      voiceId: voiceId,
      name: `صدای ${voices.length + 1}`,
      created: new Date().toISOString()
    });
    await env.USER_PREFS.put(listKey, JSON.stringify(voices));
  } catch (e) {
    console.error('Save error:', e);
  }
}

async function getUserVoiceId(userId, env) {
  try {
    return await env.USER_PREFS.get(`voice:${userId}`);
  } catch (e) {
    return null;
  }
}

async function getUserVoices(userId, env) {
  try {
    const data = await env.USER_PREFS.get(`voices:${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

async function deleteUserVoices(userId, env) {
  try {
    const voices = await getUserVoices(userId, env);

    // حذف از ElevenLabs
    for (const v of voices) {
      try {
        await fetch(`https://api.elevenlabs.io/v1/voices/${v.voiceId}`, {
          method: 'DELETE',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }
        });
      } catch (e) {}
    }

    // حذف از KV
    await env.USER_PREFS.delete(`voice:${userId}`);
    await env.USER_PREFS.delete(`voices:${userId}`);
  } catch (e) {
    console.error('Delete error:', e);
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

// ─── ارسال صدا ───
async function sendVoice(chatId, audioBuffer, env) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendVoice`, {
    method: 'POST',
    body: formData
  });
}

// ─── تنظیم Webhook ───
async function setupWebhook(env) {
  const workerUrl = env.WORKER_URL || `https://uctranslate.hadis-vpm-f17.workers.dev`;
  const webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}&allowed_updates=["message"]`);
  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
