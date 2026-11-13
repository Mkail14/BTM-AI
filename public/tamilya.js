/**
 * Widget de Tamilya (GROUPE BTM) : une bulle de discussion à coller sur n'importe quel site.
 *
 *   <script src="https://…/tamilya.js" data-site="pub_…" async></script>
 *
 * Options (attributs facultatifs) : data-color, data-position (right | left), data-open (true).
 * Le nom, l'accueil et la mission ne se règlent pas ici : Tamilya garde son identité, et sa
 * mission se règle dans l'espace développeurs.
 * Commandes : Tamilya.open(), Tamilya.close(), Tamilya.ask("question").
 * La conversation reste dans le navigateur du visiteur (sessionStorage).
 */
(() => {
  "use strict";

  const script = document.currentScript;
  if (!script || window.Tamilya) return;
  const opts = script.dataset;
  const site = (opts.site || "").trim();
  if (!site) {
    console.error("[Tamilya] Attribut data-site manquant : copiez la balise depuis votre espace développeurs.");
    return;
  }

  const API = new URL("/api/v1/widget", script.src).href;
  const HOME = new URL("/", script.src).href;
  const color = /^#[0-9a-f]{3,8}$/i.test(opts.color || "") ? opts.color : "#c8295f";
  const left = opts.position === "left";
  const greeting = "Karibu ! Je suis Tamilya. Comment puis-je vous aider ?";
  const STORE = `tamilya:${site}`;
  const MAX_SENT = 20;

  const ERRORS = {
    rate_limited: "Beaucoup de questions d'un coup : réessayez dans un instant.",
    origin_not_allowed: "Ce site n'est pas autorisé pour ce widget (domaine à ajouter dans l'espace développeurs).",
    invalid_site: "Ce widget n'existe plus ou son identifiant est faux.",
    invalid_request: "Message trop long ou illisible.",
    unavailable: "Tamilya se repose un moment. Réessayez plus tard.",
    terms_not_accepted: "Ce widget n'est pas encore activé par le propriétaire du site.",
    account_suspended: "Ce widget est suspendu. Le propriétaire du site doit contacter BTM.",
  };

  let messages = [];
  try {
    messages = JSON.parse(sessionStorage.getItem(STORE) || "[]");
    if (!Array.isArray(messages)) messages = [];
  } catch {
    messages = [];
  }
  const save = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40)));
    } catch {
      /* Stockage indisponible (navigation privée) : la conversation dure le temps de la page. */
    }
  };

  const host = document.createElement("div");
  host.id = "tamilya-widget";
  const root = host.attachShadow({ mode: "open" });
  const side = left ? "left" : "right";

  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .launcher { position: fixed; bottom: 20px; ${side}: 20px; z-index: 2147483000; width: 56px; height: 56px; border: 0; border-radius: 50%;
    background: ${color}; color: #fff; cursor: pointer; display: grid; place-items: center; box-shadow: 0 10px 28px -8px rgb(0 0 0 / .45);
    transition: transform .15s ease, filter .15s ease; }
  .launcher:hover { filter: brightness(1.08); transform: scale(1.04); }
  .launcher:focus-visible, button:focus-visible, textarea:focus-visible { outline: 2px solid ${color}; outline-offset: 2px; }
  .launcher svg { width: 26px; height: 26px; }
  .panel { position: fixed; bottom: 88px; ${side}: 20px; z-index: 2147483000; width: 370px; height: min(560px, calc(100vh - 110px));
    display: none; flex-direction: column; overflow: hidden; border-radius: 18px; background: #fff; color: #1d1d1f;
    box-shadow: 0 24px 60px -18px rgb(0 0 0 / .45); border: 1px solid rgb(0 0 0 / .08); }
  .panel.open { display: flex; }
  @media (max-width: 480px) {
    .panel { inset: auto 8px 84px 8px; width: auto; height: calc(100vh - 100px); }
  }
  header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: ${color}; color: #fff; }
  header .avatar { width: 34px; height: 34px; border-radius: 50%; background: rgb(255 255 255 / .22); display: grid; place-items: center; font-weight: 700; }
  header .title { flex: 1; min-width: 0; }
  header strong { display: block; font-size: 15px; }
  header span { font-size: 12px; opacity: .85; }
  header button { border: 0; background: transparent; color: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 20px; line-height: 1; }
  header button:hover { background: rgb(255 255 255 / .18); }
  .log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f7f7f8; }
  .msg { max-width: 85%; padding: 9px 13px; border-radius: 16px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bot { align-self: flex-start; background: #fff; border: 1px solid rgb(0 0 0 / .07); border-bottom-left-radius: 5px; }
  .user { align-self: flex-end; background: ${color}; color: #fff; border-bottom-right-radius: 5px; }
  .error { align-self: center; font-size: 12.5px; color: #b42318; text-align: center; max-width: 95%; }
  .typing span { display: inline-block; width: 6px; height: 6px; margin: 0 2px; border-radius: 50%; background: #999; animation: blink 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
  form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgb(0 0 0 / .08); background: #fff; }
  textarea { flex: 1; resize: none; border: 1px solid rgb(0 0 0 / .14); border-radius: 12px; padding: 9px 12px; font-size: 14px;
    max-height: 110px; color: inherit; background: #fff; }
  form button { border: 0; border-radius: 12px; padding: 0 14px; background: ${color}; color: #fff; font-weight: 600; cursor: pointer; font-size: 14px; }
  form button:disabled { opacity: .45; cursor: default; }
  footer { padding: 6px; text-align: center; font-size: 11px; color: #888; background: #fff; }
  footer a { color: inherit; }
  @media (prefers-color-scheme: dark) {
    .panel { background: #1c1c1e; color: #f2f2f7; border-color: rgb(255 255 255 / .1); }
    .log { background: #151517; }
    .bot { background: #2c2c2e; border-color: rgb(255 255 255 / .06); }
    form, footer { background: #1c1c1e; border-color: rgb(255 255 255 / .1); }
    textarea { background: #2c2c2e; border-color: rgb(255 255 255 / .14); }
    .error { color: #ff8a80; }
  }
  @media (prefers-reduced-motion: reduce) { .launcher, .typing span { transition: none; animation: none; } }
</style>
<div class="panel" role="dialog" aria-label="Discussion avec Tamilya">
  <header>
    <div class="avatar" aria-hidden="true">T</div>
    <div class="title"><strong>Tamilya</strong><span>Assistante de Mayotte</span></div>
    <button type="button" class="close" aria-label="Fermer">×</button>
  </header>
  <div class="log" aria-live="polite"></div>
  <form>
    <textarea rows="1" maxlength="1000" placeholder="Écrivez votre message…" aria-label="Votre message"></textarea>
    <button type="submit">Envoyer</button>
  </form>
  <footer>Propulsé par <a target="_blank" rel="noopener">BTM AI</a></footer>
</div>
<button type="button" class="launcher" aria-label="Discuter avec Tamilya" aria-expanded="false">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>
  </svg>
</button>`;

  const panel = root.querySelector(".panel");
  const log = root.querySelector(".log");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const send = root.querySelector("form button");
  const launcher = root.querySelector(".launcher");
  root.querySelector("footer a").href = HOME;

  const bubble = (className, text) => {
    const node = document.createElement("div");
    node.className = `msg ${className}`;
    node.textContent = text;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  };

  const render = () => {
    log.textContent = "";
    bubble("bot", greeting);
    for (const m of messages) bubble(m.role === "user" ? "user" : "bot", m.content);
  };

  let busy = false;
  const ask = async (text) => {
    const content = String(text || "").trim().slice(0, 1000);
    if (!content || busy) return;
    busy = true;
    send.disabled = true;
    messages.push({ role: "user", content });
    save();
    bubble("user", content);
    const typing = bubble("bot typing", "");
    typing.innerHTML = "<span></span><span></span><span></span>";
    typing.setAttribute("aria-label", "Tamilya écrit");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ site, messages: messages.slice(-MAX_SENT) }),
      });
      const data = await response.json().catch(() => ({}));
      typing.remove();
      if (response.ok && data.reply) {
        messages.push({ role: "assistant", content: data.reply });
        save();
        bubble("bot", data.reply);
      } else {
        // Question retirée : elle pourra être reposée.
        messages.pop();
        save();
        bubble("error", ERRORS[data.error] || "Tamilya n'a pas pu répondre. Réessayez.");
      }
    } catch {
      typing.remove();
      messages.pop();
      save();
      bubble("error", "Pas de connexion. Vérifiez votre réseau et réessayez.");
    } finally {
      busy = false;
      send.disabled = false;
    }
  };

  const open = () => {
    panel.classList.add("open");
    launcher.setAttribute("aria-expanded", "true");
    input.focus();
  };
  const close = () => {
    panel.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  };

  launcher.addEventListener("click", () => (panel.classList.contains("open") ? close() : open()));
  root.querySelector(".close").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => event.key === "Escape" && close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = "";
    input.style.height = "";
    ask(text);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  });

  render();
  const mount = () => {
    document.body.appendChild(host);
    if (opts.open === "true") open();
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  window.Tamilya = {
    open,
    close,
    ask: (text) => {
      open();
      return ask(text);
    },
  };
})();
