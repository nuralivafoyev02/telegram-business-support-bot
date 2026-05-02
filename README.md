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
   - Guruhda request niyati kuchli bo‘lsa `support_requests` jadvaliga `open` so‘rov sifatida yozadi.
   - Business/private chatda keyword yoki `AI mode`/broad detection yoqilgan bo‘lsa mijozning mazmunli xabari request sifatida yoziladi.
   - Bir mijoz bir open request ustidan ketma-ket yozsa yangi ticket ochilmaydi, xabar `request_events` ichiga `note` bo‘lib qo‘shiladi.
3. Xodim `#done` yozsa yoki guruhda mijozning ochiq ticket xabariga reply qilsa:
   - Shu chatdagi eng oxirgi `open` so‘rov yoki reply qilingan aniq so‘rov `closed` bo‘ladi.
   - Xodim avtomatik `employees` jadvaliga qo‘shiladi.
   - Xodim statistikasi `v_employee_statistics` view orqali ko‘rinadi.
   - `Sozlamalar`dagi yopish tegi o‘zgartirilsa bot shu tegni ham taniydi.
4. Webapp orqali:
   - Statistika ko‘rish
   - Guruhlarga xabar yuborish
   - Shaxsiy chatga xabar yuborish
   - Kompaniya yaratish/tahrirlash
   - Kompaniya guruhlariga broadcast yuborish
   - Main guruhga xodimlar statistikasini yuborish
   - Admin login/parol va bot sozlamalarini boshqarish mumkin.
5. Main guruhda yangilik xabariga reply qilib botga “barcha guruhlarga yubor” mazmunida yozilsa, bot preview chiqaradi. Inline tasdiq bosilgandan keyin xabar main guruh bilan birga barcha faol guruhlarga yuboriladi va natija ro‘yxati main guruhga qaytadi. “Oxirgi yangilanishdagi yuborgan xabarlaringni o‘chir” mazmunidagi so‘rov bilan oxirgi broadcast xabarlari ham tasdiqdan keyin guruhlardan o‘chiriladi.

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
BROADCAST_CONCURRENCY=8
CRON_SECRET=change-me-cron-secret
UYQUR_COMPANY_INFO_URL=https://backend.app.uyqur.uz/dev/company/info-for-bot
UYQUR_COMPANY_INFO_AUTH=company-info-x-auth-token
```

`SUPABASE_SERVICE_ROLE_KEY` faqat backend environmentda turishi kerak. Webappga chiqarilmagan.

`UYQUR_COMPANY_INFO_AUTH` ham faqat backend environmentda turadi. Webapp `Company Activity` paneli ma’lumotni `/api/admin?action=companyInfo` orqali oladi, token browserga yuborilmaydi.

`MAIN_GROUP_ID` noto‘g‘ri bo‘lsa `Telegram sendMessage: Bad Request: chat not found` chiqadi. Buni webappdagi `Sozlamalar → Bot sozlamalari → Main guruh chat ID` orqali ham sozlash mumkin. Chat ID `-100...` formatida bo‘ladi; bot shu guruhda bo‘lishi va xabar yuborish huquqiga ega bo‘lishi kerak.

`BROADCAST_CONCURRENCY` ommaviy xabar yuborish/o‘chirishda nechta Telegram so‘rov parallel ketishini belgilaydi. Default `8`, ruxsat etilgan oraliq `1..20`.

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
    \"allowed_updates\": [\"message\", \"edited_message\", \"business_message\", \"edited_business_message\", \"business_connection\", \"my_chat_member\", \"chat_member\", \"callback_query\"]\
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

Chuqurroq diagnostika:

```bash
curl "$APP_URL/api/bot?diagnostics=1&secret=$WEBHOOK_SECRET"
```

Javobdagi `env.botToken`, `env.supabaseUrl`, `env.supabaseServiceRoleKey` qiymatlari `true`, `diagnostics.supabase.ok` va `diagnostics.telegram.ok` qiymatlari ham `true` bo‘lishi kerak. Guruhlar webappda ko‘rinishi uchun webhook `allowed_updates` ichida `message` va `my_chat_member`, inline tasdiq tugmalari ishlashi uchun `callback_query` bo‘lishi shart. Admin paneldagi `Sozlamalar → Telegram webhook → Webhookni ulash` tugmasi webhookni joriy domen va secret bilan qayta sozlaydi. Guruhdagi oddiy murojaat xabarlarini o‘qish uchun BotFather’da bot privacy mode’ni disable qiling: `/setprivacy` → botni tanlang → `Disable`.

Agar bot webhook sozlanishidan oldin guruhlarga qo‘shilgan bo‘lsa, Telegram eski guruhlar ro‘yxatini botga qayta bermaydi. Bunday guruhlarni webapp ro‘yxatiga tushirish uchun har bir guruh ichida `/register` yoki `/start` yuboring. Bot guruhni ro‘yxatga olishga urinadi va guruhdagi command xabarini o‘chiradi. Xabar o‘chishi uchun bot guruhda admin bo‘lishi va `can_delete_messages` permissionga ega bo‘lishi kerak; permission yetmasa bot reply’da aniq sababini ko‘rsatadi.

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
- AI mode uchun tashqi OpenAI/local provider integratsiyasini ulash.
- So‘rovni biror xodimga assign qilish va SLA timer.
- Vercel Cron orqali `/api/cron?secret=CRON_SECRET` endpointini kunlik/haftalik avtomatlashtirish.
