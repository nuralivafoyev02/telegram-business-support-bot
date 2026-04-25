# Telegram Business Support Bot

Node.js + Vercel serverless backend, Supabase SQL schema va Vite/Vue dark admin webapp.

## Nimalar tayyor

- `backend/api/bot.js` — Telegram webhook: `message`, `business_message`, `business_connection`, `my_chat_member` update turlarini qabul qiladi.
- `backend/api/admin.js` — webapp uchun admin REST API.
- `webapp/src/` — Vite + Vue admin panel.
- `supabase/*.sql` — SQL Editor uchun migration fayllari.
- `api/*.js` — Vercel default `/api` runtime wrapperlari. Asosiy kod `backend/api` ichida.

## Asosiy logika

1. Mijoz guruhga yoki Telegram Business shaxsiy chatga yozadi.
2. Bot xabarni tekshiradi:
   - Guruhda request keywordlar bo‘lsa `support_requests` jadvaliga `open` so‘rov sifatida yozadi.
   - Business/private chatda mijoz xabari request sifatida yoziladi.
3. Xodim `#done` yozsa:
   - Shu chatdagi eng oxirgi `open` so‘rov `closed` bo‘ladi.
   - Xodim avtomatik `employees` jadvaliga qo‘shiladi.
   - Xodim statistikasi `v_employee_statistics` view orqali ko‘rinadi.
4. Webapp orqali:
   - Statistika ko‘rish
   - Guruhlarga xabar yuborish
   - Shaxsiy chatga xabar yuborish
   - Kompaniya yaratish/tahrirlash
   - Kompaniya guruhlariga broadcast yuborish
   - Main guruhga xodimlar statistikasini yuborish
   - Admin login/parol va bot sozlamalarini boshqarish mumkin.

## Muhim cheklov

Telegram bot oddiy foydalanuvchilarning barcha shaxsiy chatlarini o‘zi xohlagancha o‘qiy olmaydi. Shaxsiy chatlarni ko‘rish uchun Telegram Business account botga ulangan bo‘lishi va Business botga chatlarni boshqarish ruxsati berilgan bo‘lishi kerak. Shu sabab webhook `business_message` update turini ham qabul qiladi.

## Supabase o‘rnatish

Supabase SQL Editor’da ketma-ket ishga tushiring:

```sql
supabase/001_extensions.sql
supabase/002_schema.sql
supabase/003_views.sql
supabase/004_rls.sql
```

Agar Vercel logida `PGRST205` va `Could not find the table 'public.v_chat_statistics' in the schema cache` xatosi chiqsa, `supabase/003_views.sql` SQL Editor’da qayta ishga tushirilmagan yoki PostgREST schema cache yangilanmagan bo‘ladi. `003_views.sql` oxiridagi `notify pgrst, 'reload schema';` cache’ni yangilaydi.

Default admin:

```txt
login: admin
parol: Admin@12345
```

Deploydan keyin darhol `Sozlamalar → Admin profili` orqali parolni o‘zgartiring.

## Vercel environment variables

Vercel Project Settings → Environment Variables bo‘limiga quyidagilarni qo‘shing:

```env
BOT_TOKEN=123456:telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=change-me-long-random-secret
WEBAPP_URL=https://your-project.vercel.app
MAIN_GROUP_ID=-1001234567890
CRON_SECRET=change-me-cron-secret

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@12345
ADMIN_JWT_SECRET=change-me-64-char-random-secret
AI_MODE_DEFAULT=false
CRON_SECRET=change-me-cron-secret
```

`SUPABASE_SERVICE_ROLE_KEY` faqat backend environmentda turishi kerak. Webappga chiqarilmagan.

## Local ishga tushirish

```bash
npm install
npm run dev:webapp
```

Vercel funksiyalarni lokal test qilish uchun:

```bash
npx vercel dev
```

Backend sintaksis va parser test:

```bash
npm run check:backend
npm run test:parser
```

## Telegram webhook ulash

Deploy bo‘lgandan keyin quyidagini ishga tushiring:

```bash
export BOT_TOKEN="123456:telegram_bot_token"
export WEBHOOK_SECRET="change-me-long-random-secret"
export APP_URL="https://your-project.vercel.app"

curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\
    \"url\": \"$APP_URL/api/bot?secret=$WEBHOOK_SECRET\",\
    \"secret_token\": \"$WEBHOOK_SECRET\",\
    \"allowed_updates\": [\"message\", \"edited_message\", \"business_message\", \"edited_business_message\", \"business_connection\", \"my_chat_member\"]\
  }"
```

Webhook tekshirish:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Bot endpoint health check:

```bash
curl "$APP_URL/api/bot"
```

Javobdagi `env.botToken`, `env.supabaseUrl`, `env.supabaseServiceRoleKey` qiymatlari `true` bo‘lishi kerak. Guruhlar webappda ko‘rinishi uchun webhook `allowed_updates` ichida `my_chat_member` bo‘lishi shart. Guruhdagi oddiy murojaat xabarlarini o‘qish uchun BotFather’da bot privacy mode’ni disable qiling: `/setprivacy` → botni tanlang → `Disable`.

## Fayl strukturasi

```txt
telegram-business-support-bot/
├─ api/
│  ├─ admin.js                 # Vercel wrapper
│  ├─ bot.js                   # Vercel wrapper
│  └─ cron.js                   # Vercel wrapper
├─ backend/
│  ├─ api/
│  │  ├─ admin.js              # Admin API
│  │  ├─ bot.js                # Telegram webhook
│  │  └─ cron.js                # Telegram webhook
│  └─ lib/
│     ├─ auth.js
│     ├─ env.js
│     ├─ http.js
│     ├─ metrics.js
│     ├─ parser.js
│     ├─ report.js
│     ├─ supabase.js
│     └─ telegram.js
├─ supabase/
│  ├─ 001_extensions.sql
│  ├─ 002_schema.sql
│  ├─ 003_views.sql
│  └─ 004_rls.sql
├─ tests/
│  └─ parser.test.js
├─ webapp/
│  ├─ index.html
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
│     ├─ api.js
│     ├─ App.vue
│     ├─ main.js
│     └─ styles.css
├─ .env.example
├─ package.json
└─ vercel.json
```

## Keyingi professional yaxshilashlar

- Xodimlarni webapp orqali qo‘lda qo‘shish/tahrirlash.
- Kompaniya userlarini Telegram `getChatMember` yoki CRM import orqali boyitish.
- AI mode uchun OpenAI / local classifier ulash.
- So‘rovni biror xodimga assign qilish va SLA timer.
- Vercel Cron orqali `/api/cron?secret=CRON_SECRET` endpointini kunlik/haftalik avtomatlashtirish.
