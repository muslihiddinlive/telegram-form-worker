// Telegram Form Worker
// Istalgan saytdan Telegramga matn / rasm / video / fayl yuboradi.
//
// Secrets (majburiy):   BOT_TOKEN, CHAT_ID
// Vars (ixtiyoriy):     ALLOWED_ORIGINS, MAX_FILE_MB, MAX_FILES, SITE_NAME
//
// API:  POST /   (multipart/form-data)
//   name, contact, message  - matn maydonlari (ixtiyoriy)
//   files                   - bir yoki bir nechta fayl (ixtiyoriy)
//   website                 - honeypot, bo'sh bo'lishi kerak

const DEFAULT_MAX_MB = 19;
const DEFAULT_MAX_FILES = 5;
const MAX_TEXT = 3500; // Telegram limiti 4096; HTML escape uchun zaxira
const TG_PHOTO_LIMIT = 10 * 1024 * 1024; // sendPhoto limiti 10MB

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cors(request, env) {
  const origin = request.headers.get("Origin");
  const list = (env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const any = list.includes("*");
  const allowed = any || !origin || list.includes(origin);
  const headers = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && (any || list.includes(origin))) {
    headers["Access-Control-Allow-Origin"] = any ? "*" : origin;
  }
  return { allowed, headers, origin };
}

function reply(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders,
    },
  });
}

async function tg(token, method, body) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      body,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok === true, data };
  } catch {
    return { ok: false, data: {} };
  }
}

function pickMethod(file) {
  const t = file.type || "";
  if (t === "image/gif") return ["sendAnimation", "animation"];
  if (t.startsWith("image/") && t !== "image/svg+xml" && file.size <= TG_PHOTO_LIMIT)
    return ["sendPhoto", "photo"];
  if (t.startsWith("video/")) return ["sendVideo", "video"];
  if (t.startsWith("audio/")) return ["sendAudio", "audio"];
  return ["sendDocument", "document"];
}

export default {
  async fetch(request, env) {
    const { allowed, headers, origin } = cors(request, env);

    if (!allowed) return reply({ ok: false, error: "Origin ruxsat etilmagan" }, 403, headers);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const maxMb = num(env.MAX_FILE_MB, DEFAULT_MAX_MB);
    const maxFiles = Math.floor(num(env.MAX_FILES, DEFAULT_MAX_FILES));
    const maxBytes = maxMb * 1024 * 1024;

    // Sog'liqni tekshirish + frontend uchun limitlar
    if (request.method === "GET") {
      return reply(
        { ok: true, service: "telegram-form-worker", maxMb, maxFiles, configured: !!(env.BOT_TOKEN && env.CHAT_ID) },
        200,
        headers
      );
    }

    if (request.method !== "POST")
      return reply({ ok: false, error: "Method not allowed" }, 405, headers);

    try {
      if (!env.BOT_TOKEN || !env.CHAT_ID)
        return reply({ ok: false, error: "Worker sozlanmagan: BOT_TOKEN va CHAT_ID kerak" }, 500, headers);

      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > maxBytes + 512 * 1024)
        return reply({ ok: false, error: `Hajm ${maxMb}MB dan oshmasligi kerak` }, 413, headers);

      let form;
      try {
        form = await request.formData();
      } catch {
        return reply({ ok: false, error: "Noto'g'ri so'rov (multipart/form-data kerak)" }, 400, headers);
      }

      // Honeypot: botlar to'ldiradi
      if (form.get("website")) return reply({ ok: true }, 200, headers);

      const name = (form.get("name") || "").toString().trim().slice(0, 100);
      const contact = (form.get("contact") || "").toString().trim().slice(0, 150);
      const message = (form.get("message") || "").toString().trim().slice(0, MAX_TEXT);
      const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size > 0);

      if (!message && files.length === 0)
        return reply({ ok: false, error: "Matn yoki fayl kiriting" }, 400, headers);

      if (files.length > maxFiles)
        return reply({ ok: false, error: `Maksimum ${maxFiles} ta fayl` }, 400, headers);

      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > maxBytes)
        return reply({ ok: false, error: `Jami hajm ${maxMb}MB dan oshmasligi kerak` }, 413, headers);

      // 1) Matn xabari
      let site = env.SITE_NAME || "";
      if (!site && origin) {
        try {
          site = new URL(origin).hostname;
        } catch {}
      }
      const ip = request.headers.get("CF-Connecting-IP") || "-";
      const country = request.headers.get("CF-IPCountry") || "-";

      const text =
        `📩 <b>Yangi xabar${site ? ` — ${esc(site)}` : ""}</b>\n\n` +
        `👤 <b>Ism:</b> ${esc(name) || "-"}\n` +
        `📞 <b>Aloqa:</b> ${esc(contact) || "-"}\n` +
        (message ? `\n💬 ${esc(message)}\n` : "") +
        `\n🌍 ${esc(country)} · ${esc(ip)}`;

      const fd = new FormData();
      fd.append("chat_id", env.CHAT_ID);
      fd.append("text", text);
      fd.append("parse_mode", "HTML");
      fd.append("disable_web_page_preview", "true");
      const sent = await tg(env.BOT_TOKEN, "sendMessage", fd);
      if (!sent.ok)
        return reply({ ok: false, error: "Telegramga yuborib bo'lmadi (token/chat ID ni tekshiring)" }, 502, headers);

      // 2) Fayllar (ketma-ket)
      for (const file of files) {
        const [method, field] = pickMethod(file);
        const send = (m, f) => {
          const b = new FormData();
          b.append("chat_id", env.CHAT_ID);
          b.append(f, file, file.name || "file");
          b.append("caption", `📎 ${file.name || "file"}`.slice(0, 200));
          return tg(env.BOT_TOKEN, m, b);
        };
        let res = await send(method, field);
        // Rasm/video/audio qabul qilinmasa, hujjat sifatida qayta urinish
        if (!res.ok && method !== "sendDocument") res = await send("sendDocument", "document");
        if (!res.ok)
          return reply({ ok: false, error: `Fayl yuborilmadi: ${file.name || "file"}` }, 502, headers);
      }

      return reply({ ok: true }, 200, headers);
    } catch {
      return reply({ ok: false, error: "Server xatosi" }, 500, headers);
    }
  },
};
