
(function (global) {
  "use strict";

  const PATHS = {
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    refresh: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect width="12" height="8" x="6" y="14"/>',
    settings: '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    sigma: '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a1 1 0 0 1 0 1.2l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    camera: '<path d="M12 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/><path d="M9 3h6l1 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3z"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>',
  };

  function icon(name, size) {
    size = size || 14;
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ""}</svg>`;
  }

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  let toastTimer = null;
  function toast(message, isError) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " toast--err" : "");
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  const modalStack = [];
  let keyTrapInstalled = false;

  function trapKeys(handler) {
    if (!keyTrapInstalled) {
      keyTrapInstalled = true;
      document.addEventListener("keydown", (e) => {
        const top = modalStack[modalStack.length - 1];
        if (top) top.handler(e);
      });
    }
    const entry = { handler };
    modalStack.push(entry);
    return () => {
      const i = modalStack.indexOf(entry);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }

  function formModal(opts) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";

      const fieldsHTML = (opts.fields || []).map((f) => {
        let control;
        if (f.type === "checklist") {
          const ticked = Array.isArray(f.value) ? f.value.map(String) : [];
          control = `<div class="checklist" data-group="${esc(f.key)}">${(f.options || [])
            .map((o) => `<label class="check">
                <input type="checkbox" value="${esc(o.value)}"${ticked.includes(String(o.value)) ? " checked" : ""} />
                <span>${esc(o.label)}</span>
                ${o.hint ? `<em>${esc(o.hint)}</em>` : ""}
              </label>`)
            .join("")}</div>`;
        } else if (f.type === "select") {
          control = `<select data-key="${esc(f.key)}">${(f.options || [])
            .map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}</select>`;
        } else if (f.type === "textarea") {
          control = `<textarea data-key="${esc(f.key)}">${esc(f.value)}</textarea>`;
        } else {
          const step = f.type === "number" ? ' step="any"' : "";
          control = `<input type="${f.type || "text"}"${step} data-key="${esc(f.key)}" value="${esc(f.value)}" />`;
        }
        return `<div class="mfield">
            <label class="mfield-label">${esc(f.label)}</label>
            ${control}
            ${f.hint ? `<div class="mfield-hint">${esc(f.hint)}</div>` : ""}
          </div>`;
      }).join("");

      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">${esc(opts.title || "")}</div>
          <div class="modal-body">
            ${opts.intro ? `<div class="mfield-hint" style="margin-bottom:12px">${esc(opts.intro)}</div>` : ""}
            ${fieldsHTML}
          </div>
          <div class="modal-foot">
            <button class="btn" data-act="cancel">İptal</button>
            <button class="btn btn--primary" data-act="ok">${esc(opts.okLabel || "Tamam")}</button>
          </div>
        </div>`;

      const close = (result) => {
        release();
        backdrop.remove();
        resolve(result);
      };
      const collect = () => {
        const out = {};
        backdrop.querySelectorAll("[data-key]").forEach((el) => { out[el.dataset.key] = el.value; });
        backdrop.querySelectorAll("[data-group]").forEach((group) => {
          out[group.dataset.group] = [...group.querySelectorAll("input:checked")].map((el) => el.value);
        });
        return out;
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(null);
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") close(collect());
      };
      const release = trapKeys(onKey);

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) return close(null);
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") close(null);
        if (act === "ok") close(collect());
      });
      document.body.appendChild(backdrop);
      const first = backdrop.querySelector("input, select, textarea");
      if (first) { first.focus(); if (first.select) first.select(); }
    });
  }

  function confirmModal(title, message, okLabel) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" style="max-width:400px">
          <div class="modal-head">${esc(title)}</div>
          <div class="modal-body"><div style="font-size:13px;color:var(--text-dim)">${esc(message)}</div></div>
          <div class="modal-foot">
            <button class="btn" data-act="cancel">İptal</button>
            <button class="btn btn--primary" data-act="ok">${esc(okLabel || "Sil")}</button>
          </div>
        </div>`;
      const close = (v) => { release(); backdrop.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); };
      const release = trapKeys(onKey);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) return close(false);
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") close(false);
        if (act === "ok") close(true);
      });
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-act="ok"]').focus();
    });
  }

  function infoModal(title, html) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal modal--help" role="dialog" aria-modal="true">
          <div class="modal-head">${esc(title)}</div>
          <div class="modal-body">${html}</div>
          <div class="modal-foot">
            <button class="btn btn--primary" data-act="ok">Kapat</button>
          </div>
        </div>`;
      const close = () => { release(); backdrop.remove(); resolve(); };
      const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") close(); };
      const release = trapKeys(onKey);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop || e.target.closest('[data-act="ok"]')) close();
      });
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-act="ok"]').focus();
    });
  }

  function menu(anchorEl, items) {
    document.querySelectorAll(".menu").forEach((m) => m.remove());
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = items.map((it) => (
      it.sep
        ? '<div class="menu-sep"></div>'
        : `<button class="menu-item${it.danger ? " menu-item--danger" : ""}" data-id="${esc(it.id)}">${it.icon ? icon(it.icon, 14) : ""}<span>${esc(it.label)}</span></button>`
    )).join("");

    const rect = anchorEl.getBoundingClientRect();
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(rect.left, window.innerWidth - w - 8)}px`;
    el.style.top = `${rect.bottom + h > window.innerHeight ? Math.max(8, rect.top - h) : rect.bottom + 2}px`;
    el.style.visibility = "visible";

    const dismiss = () => { el.remove(); document.removeEventListener("mousedown", onDown, true); };
    const onDown = (e) => { if (!el.contains(e.target)) dismiss(); };
    setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
    el.addEventListener("click", (e) => {
      const id = e.target.closest("[data-id]")?.dataset.id;
      if (!id) return;
      dismiss();
      const item = items.find((i) => i.id === id);
      if (item && item.onSelect) item.onSelect();
    });
  }

  global.UI = { icon, esc, toast, formModal, confirmModal, infoModal, menu, trapKeys };
})(window);
