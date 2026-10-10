# Telegram Form Worker

Istalgan saytdan **Telegramga xabar** yuborish: matn, rasm, video, audio va hujjat (jami **19MB** gacha).
Har kim shuni **o'z Cloudflare akkauntiga** deploy qiladi va **o'z saytida** ishlatadi. Server kerak emas, bepul tarifda ishlaydi.

```
Sayt (forma)  ──POST──▶  sizning Worker  ──▶  Telegram bot  ──▶  sizning Telegramingiz
```

Bot token va chat ID faqat Workerda (secret) turadi, brauzerga chiqmaydi.

---

## 1-qadam. Telegram bot tayyorlash (2 daqiqa)

1. Telegramda **@BotFather** → `/newbot` → **BOT_TOKEN** ni saqlang.
2. Yaratgan botingizga kirib **/start** bosing (aks holda bot sizga yoza olmaydi).
3. **CHAT_ID** olish: **@userinfobot** ga yozing, u sizning ID ngizni beradi.
   Guruhga yuborish kerak bo'lsa: botni guruhga qo'shing va guruh ID sini oling (odatda `-100...`).

## 2-qadam. Deploy (ikki yo'ldan biri)

### A) Bir tugma bilan (eng oson)
Repoga GitHubda joylagach, shu tugmadan foydalaning:

```
https://deploy.workers.cloudflare.com/?url=https://github.com/muslihiddinlive/telegram-form-worker
```

Cloudflare sizdan `BOT_TOKEN` va `CHAT_ID` ni so'raydi, reponi akkauntingizga nusxalaydi va deploy qiladi.

### B) Terminaldan
```bash
git clone https://github.com/muslihiddinlive/telegram-form-worker.git
cd telegram-form-worker
npm install
npx wrangler login
npx wrangler secret put BOT_TOKEN     # token ni kiriting
npx wrangler secret put CHAT_ID       # chat ID ni kiriting
npx wrangler deploy
```

Deploydan keyin manzil chiqadi, masalan: `https://telegram-form.sizning-akkaunt.workers.dev`

Tekshirish: shu manzilni brauzerda oching, `{"ok":true,"configured":true,...}` chiqishi kerak.
`configured:false` bo'lsa, secretlar qo'yilmagan.

## 3-qadam. Saytga ulash

Saytingizga `widget/tg-form.js` ni nusxalang va shu ikki qatorni qo'ying:

```html
<div data-tg-form data-endpoint="https://telegram-form.sizning-akkaunt.workers.dev"></div>
<script src="/tg-form.js" defer></script>
```

Forma tayyor: ism, aloqa, xabar, fayl biriktirish. Sayt CSS i bilan aralashmaydi (Shadow DOM).

**Sozlamalar** (`div` atributlari):

| Atribut | Ma'nosi | Default |
|---|---|---|
| `data-endpoint` | Worker manzili (majburiy) | — |
| `data-lang` | `uz` / `en` / `ru` | `uz` |
| `data-max-mb` | Jami hajm (MB) | `19` |
| `data-max-files` | Fayllar soni | `5` |
| `data-title` | Sarlavha | tilga qarab |
| `data-accent` | Tugma rangi (`#2563eb`) | ko'k |
| `data-no-name`, `data-no-contact`, `data-no-files` | Maydonni yashirish | — |

Yuborilgach `tg-form:sent` eventi chiqadi:
```js
document.querySelector("[data-tg-form]").addEventListener("tg-form:sent", () => console.log("ketdi"));
```

## Xavfsizlik: ALLOWED_ORIGINS ni sozlang

Standart holatda **istalgan sayt** Workeringizdan foydalana oladi (`"*"`). O'z saytingizni cheklash uchun
`wrangler.toml` da yozing va qayta deploy qiling (yoki Dashboard → Worker → Settings → Variables):

```toml
ALLOWED_ORIGINS = "https://paradoks.pages.dev,https://mysite.com"
```

Bu brauzerlardan boshqa sayt ishlatishini to'xtatadi. Himoyani kuchaytirish uchun qo'shimcha:
- Cloudflare Dashboard → Security → WAF → **Rate limiting rules**: Worker domeniga so'rovlarni cheklang.
- Forma ichida honeypot maydon bor (oddiy botlarni ushlaydi).

## Boshqa sozlamalar (`wrangler.toml` → `[vars]`)

| O'zgaruvchi | Ma'nosi | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | Ruxsat etilgan saytlar (vergul bilan) | `*` |
| `MAX_FILE_MB` | Jami fayl hajmi (MB) | `19` |
| `MAX_FILES` | Fayllar soni | `5` |
| `SITE_NAME` | Telegram xabar sarlavhasidagi sayt nomi | Origin hostname |

## API (o'zingizning formangiz uchun)

`POST <worker-manzil>` — `multipart/form-data`:

| Maydon | Tur |
|---|---|
| `name`, `contact`, `message` | matn (ixtiyoriy, kamida `message` yoki `files` bo'lishi kerak) |
| `files` | fayl, bir nechta marta qo'shsa bo'ladi |
| `website` | honeypot, bo'sh qoldiring |

Javob: `{"ok":true}` yoki `{"ok":false,"error":"..."}` (400/403/413/502).

```bash
curl -X POST https://telegram-form.sizning-akkaunt.workers.dev \
  -F "name=Ali" -F "message=Salom" -F "files=@rasm.jpg"
```

## Cheklovlar

- Jami hajm 19MB: Telegram bot orqali yuklash chegarasi 50MB, lekin Worker xotirasi (128MB) uchun xavfsiz chegara 19MB qoldirilgan.
- Rasm 10MB dan oshsa, Telegram photo qilib olmaydi: avtomatik document sifatida yuboriladi.
- Fayllar Telegramga ketma-ket yuboriladi, ko'p yoki katta fayl bo'lsa bir necha soniya ketadi.
