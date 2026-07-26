# 🌐 Telegram Translation Bot - Cloudflare Workers

ربات ترجمه هوشمند تلگرام — رایگان، بدون سرور، چندکاربره

## ✨ ویژگی‌ها

- 🌍 ترجمه ۱۸ زبان مختلف
- 🤖 تشخیص خودکار زبان
- 👥 پشتیبانی چندکاربره
- 🏠 کار در گروه‌ها و چت خصوصی
- ⚡ سریع (Cloudflare Edge)
- 💰 کاملاً رایگان

## 🚀 راه‌اندازی با گوشی

### مرحله ۱: ربات تلگرام بسازید

1. تلگرام رو باز کنید
2. به `@BotFather` برید
3. بفرستید: `/newbot`
4. اسم ربات: `مترجم هوشمند من` (یا هر اسمی)
5. یوزرنیم: `my_translator_bot_xxx` (باید unique باشه)
6. **توکن ربات رو کپی کنید** (مهم!)

### مرحله ۲: اکانت Cloudflare بسازید

1. مرورگر گوشی رو باز کنید
2. برید به `dash.cloudflare.com`
3. ثبت‌نام کنید (رایگان)
4. وارد بشید

### مرحله ۳: Worker بسازید

1. در داشبورد Cloudflare:
   - منوی سمت چپ → **Workers & Pages**
   - **Create** → **Create Worker**
2. اسم دلخواه بذارید (مثلاً `translator-bot`)
3. روی **Deploy** بزنید
4. آدرس Worker رو کپی کنید:
   `https://translator-bot.YOUR_SUBDOMAIN.workers.dev`

### مرحله ۴: کد رو اضافه کنید

1. در صفحه Worker، روی **Edit Code** بزنید
2. کد `src/index.js` رو از این پروژه کپی کنید
3. **Save and Deploy** بزنید

### مرحله ۵: توکن رو تنظیم کنید

1. در صفحه Worker → **Settings** → **Variables and Secrets**
2. **Add Variable** بزنید:
   - Name: `BOT_TOKEN`
   - Value: توکن ربات تلگرام
   - **Secret** رو فعال کنید
3. **Save** کنید

### مرحله ۶: Webhook رو فعال کنید

1. در مرورگر، این آدرس رو باز کنید:
   ```
   https://YOUR-WORKER-URL/setup
   ```
2. باید پیام موفقیت ببینید

### مرحله ۷: KV Namespace بسازید (اختیاری)

1. در داشبورد Cloudflare → **Workers & Pages** → **KV**
2. **Create a namespace** → اسم: `user-prefs`
3. Copy the **KV namespace ID**
4. در صفحه Worker → **Settings** → **Bindings**
5. **Add Binding**:
   - Type: KV Namespace
   - Name: `USER_PREFS`
   - KV namespace: `user-prefs`
6. **Save** کنید

### مرحله ۸: تست کنید!

1. ربات رو در تلگرام پیدا کنید
2. `/start` بزنید
3. یه متن فارسی بفرستید → ترجمه انگلیسی میاد!
4. `/lang fa` بزنید → بعد هر متن انگلیسی فارسی ترجمه میشه!

## 📱 دستورات ربات

| دستور | توضیح |
|-------|-------|
| `/start` | شروع و خوش‌آمدگویی |
| `/help` | راهنما |
| `/lang` | لیست زبان‌ها |
| `/lang fa` | تنظیم فارسی |
| `/lang en` | تنظیم انگلیسی |
| `/lang auto` | تشخیص خودکار |
| `/translate en متن` | ترجمه دستی |

## 🔧 نکات

- در **چت خصوصی**: هر متنی بفرستید خودکار ترجمه میشه
- در **گروه‌ها**: ریپلای به پیام ربات یا نام ربات + متن
- محدودیت روزانه: ~5000 کاراکتر (API رایگان)

## 💡 ارتقاء

برای حذف محدودیت:
- از API کلیددار مثل Google Translate استفاده کنید
- یا LibreTranslate رو روی Vercel Deploy کنید

## 📄 License

MIT - آزاد برای استفاده
