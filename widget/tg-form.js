/*!
 * tg-form.js — istalgan saytga Telegram aloqa formasini qo'shadi.
 * Bog'liqlik yo'q, Shadow DOM ishlatadi (sayt CSS i bilan aralashmaydi).
 *
 * Ishlatish:
 *   <div data-tg-form data-endpoint="https://telegram-form.USER.workers.dev"></div>
 *   <script src="tg-form.js" defer></script>
 *
 * Atributlar (hammasi ixtiyoriy, data-endpoint dan tashqari):
 *   data-endpoint   Worker manzili (majburiy)
 *   data-lang       uz | en | ru            (default: uz)
 *   data-max-mb     jami hajm, MB            (default: 19)
 *   data-max-files  fayllar soni             (default: 5)
 *   data-title      forma sarlavhasi
 *   data-accent     tugma rangi, masalan #2563eb
 *   data-no-name / data-no-contact / data-no-files   maydonni yashirish
 */
(() => {
  const T = {
    uz: {
      title: "Menga yozing", name: "Ismingiz", contact: "Telegram / telefon / email",
      message: "Xabaringiz...", attach: "📎 Fayl biriktirish", hint: (mb, n) => `Jami ${mb}MB gacha, ${n} tagacha fayl`,
      send: "Yuborish", sending: "Yuborilmoqda...", ok: "✅ Xabar yuborildi, rahmat!",
      empty: "Matn yozing yoki fayl biriktiring", tooMany: (n) => `Maksimum ${n} ta fayl`,
      tooBig: (t, mb) => `Jami hajm ${t} — ${mb}MB dan oshmasligi kerak`, fail: "Xatolik yuz berdi", net: "Tarmoq xatosi, qayta urinib ko'ring",
    },
    en: {
      title: "Send me a message", name: "Your name", contact: "Telegram / phone / email",
      message: "Your message...", attach: "📎 Attach files", hint: (mb, n) => `Up to ${mb}MB total, max ${n} files`,
      send: "Send", sending: "Sending...", ok: "✅ Message sent, thank you!",
      empty: "Write a message or attach a file", tooMany: (n) => `Maximum ${n} files`,
      tooBig: (t, mb) => `Total size ${t} exceeds ${mb}MB`, fail: "Something went wrong", net: "Network error, please try again",
    },
    ru: {
      title: "Напишите мне", name: "Ваше имя", contact: "Telegram / телефон / email",
      message: "Ваше сообщение...", attach: "📎 Прикрепить файлы", hint: (mb, n) => `До ${mb}МБ суммарно, не более ${n} файлов`,
      send: "Отправить", sending: "Отправка...", ok: "✅ Сообщение отправлено, спасибо!",
      empty: "Напишите сообщение или прикрепите файл", tooMany: (n) => `Максимум ${n} файлов`,
      tooBig: (t, mb) => `Общий размер ${t} превышает ${mb}МБ`, fail: "Произошла ошибка", net: "Ошибка сети, попробуйте ещё раз",
    },
  };

  const CSS = `
    :host { display: block; }
    * { box-sizing: border-box; }
    form { display: grid; gap: 12px; max-width: 520px; font: inherit; color: inherit; position: relative; }
    h3 { margin: 0 0 4px; font-size: 1.25em; }
    input[type=text], textarea {
      width: 100%; padding: 12px 14px; font: inherit; color: inherit; background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 10px; outline: none;
    }
    input[type=text]:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
    textarea { resize: vertical; min-height: 110px; }
    .pick { cursor: pointer; padding: 12px 14px; border: 1px dashed color-mix(in srgb, currentColor 40%, transparent); border-radius: 10px; display: block; }
    .pick small { display: block; opacity: .65; margin-top: 2px; }
    ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: .9em; }
    li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; border-radius: 8px; background: color-mix(in srgb, currentColor 8%, transparent); }
    li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li button { all: unset; cursor: pointer; opacity: .7; padding: 0 4px; }
    li button:hover { opacity: 1; }
    .send { padding: 12px 16px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .send:disabled { opacity: .6; cursor: not-allowed; }
    .status { min-height: 1.3em; margin: 0; font-size: .95em; }
    .status.ok { color: #16a34a; } .status.err { color: #dc2626; }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  `;

  const fmtMB = (b) => (b / 1048576).toFixed(2) + " MB";

  function mount(host) {
    if (host.__tgMounted) return;
    host.__tgMounted = true;

    const d = host.dataset;
    const endpoint = (d.endpoint || "").trim();
    const t = T[d.lang] || T.uz;
    const maxMb = Number(d.maxMb) > 0 ? Number(d.maxMb) : 19;
    const maxFiles = Number(d.maxFiles) > 0 ? Number(d.maxFiles) : 5;
    const maxBytes = maxMb * 1048576;
    const has = (k) => !(k in d); // data-no-xxx bo'lmasa — ko'rsatiladi

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}</style>
      <form novalidate style="--accent:${d.accent || "#2563eb"}">
        <h3></h3>
        ${has("noName") ? `<input type="text" name="name" maxlength="100" autocomplete="name">` : ""}
        ${has("noContact") ? `<input type="text" name="contact" maxlength="150">` : ""}
        <textarea name="message" rows="5" maxlength="3500"></textarea>
        ${has("noFiles") ? `<label class="pick"><span class="attach"></span><small class="hint"></small><input type="file" multiple hidden></label><ul></ul>` : ""}
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="send" type="submit"></button>
        <p class="status" role="status"></p>
      </form>`;

    const $ = (s) => root.querySelector(s);
    const form = $("form");
    $("h3").textContent = d.title || t.title;
    if (form.name) form.name.placeholder = t.name;
    if (form.contact) form.contact.placeholder = t.contact;
    form.message.placeholder = t.message;
    const sendBtn = $(".send");
    sendBtn.textContent = t.send;
    const statusEl = $(".status");
    const setStatus = (m, c = "") => { statusEl.textContent = m; statusEl.className = "status " + c; };

    let files = [];
    const fileInput = $("input[type=file]");
    const list = $("ul");

    function render() {
      if (!list) return;
      list.innerHTML = "";
      files.forEach((f, i) => {
        const li = document.createElement("li");
        const s = document.createElement("span");
        s.textContent = `${f.name} (${fmtMB(f.size)})`;
        const x = document.createElement("button");
        x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "remove");
        x.onclick = () => { files.splice(i, 1); render(); };
        li.append(s, x);
        list.appendChild(li);
      });
    }

    if (fileInput) {
      $(".attach").textContent = t.attach;
      $(".hint").textContent = t.hint(maxMb, maxFiles);
      fileInput.addEventListener("change", () => {
        const merged = [...files, ...Array.from(fileInput.files)];
        fileInput.value = "";
        if (merged.length > maxFiles) return setStatus(t.tooMany(maxFiles), "err");
        const total = merged.reduce((s, f) => s + f.size, 0);
        if (total > maxBytes) return setStatus(t.tooBig(fmtMB(total), maxMb), "err");
        files = merged;
        setStatus("");
        render();
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!endpoint) return setStatus("data-endpoint yo'q", "err");
      const text = form.message.value.trim();
      if (!text && files.length === 0) return setStatus(t.empty, "err");

      const fd = new FormData();
      fd.append("name", form.name ? form.name.value.trim() : "");
      fd.append("contact", form.contact ? form.contact.value.trim() : "");
      fd.append("message", text);
      fd.append("website", form.website.value);
      files.forEach((f) => fd.append("files", f, f.name));

      sendBtn.disabled = true;
      setStatus(t.sending);
      try {
        const res = await fetch(endpoint, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          setStatus(t.ok, "ok");
          form.reset(); files = []; render();
          host.dispatchEvent(new CustomEvent("tg-form:sent", { bubbles: true }));
        } else {
          setStatus("❌ " + (data.error || t.fail), "err");
        }
      } catch {
        setStatus("❌ " + t.net, "err");
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  const init = () => document.querySelectorAll("[data-tg-form]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.TgForm = { mount, init };
})();
