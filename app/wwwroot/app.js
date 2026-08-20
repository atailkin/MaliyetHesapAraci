
(function () {
  "use strict";

  const { icon, esc, toast, formModal, confirmModal, infoModal, menu, trapKeys } = window.UI;
  const S = window.Store;

  let doc = S.load();
  let computed = null;
  const open = {};
  let filter = "";
  let filterRaw = "";

  const sys = () => doc.systems.find((s) => s.id === doc.activeSystemId) || doc.systems[0];

  function fmt(n, d) {
    const digits = d === undefined ? doc.settings.decimals : d;
    return (Number.isFinite(n) ? n : 0).toLocaleString(doc.settings.locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function fmtLoose(n, maxDigits) {
    return (Number.isFinite(n) ? n : 0).toLocaleString(doc.settings.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDigits === undefined ? 3 : maxDigits,
    });
  }

  function focusKey(el) {
    if (!el || !el.getAttributeNames) return null;
    if (el.id) return `#${el.id}`;
    const attr = el.getAttributeNames().find((n) => n.startsWith("data-"));
    return attr ? `[${attr}="${el.getAttribute(attr)}"]` : null;
  }

  const HISTORY_LIMIT = 100;
  const COALESCE_MS = 800;
  const history = { past: [], future: [] };
  let baseline = JSON.stringify(doc);
  let lastTag = null;
  let lastAt = 0;

  function record(tag) {
    const now = JSON.stringify(doc);
    if (now === baseline) return;
    if (!(tag && tag === lastTag && Date.now() - lastAt < COALESCE_MS)) {
      history.past.push(baseline);
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.future.length = 0;
    }
    baseline = now;
    lastTag = tag || null;
    lastAt = Date.now();
  }

  function restore(from, to) {
    if (!from.length) return false;
    to.push(baseline);
    doc = JSON.parse(from.pop());
    baseline = JSON.stringify(doc);
    lastTag = null;
    S.save(doc);
    const key = focusKey(document.activeElement);
    render();
    const el = key && document.querySelector(key);
    if (el) { el.focus(); if (el.select) el.select(); }
    return true;
  }

  const undo = () => { if (restore(history.past, history.future)) toast("Geri alındı."); };
  const redo = () => { if (restore(history.future, history.past)) toast("Yinelendi."); };

  function commit(structural, tag) {
    record(tag);
    S.save(doc);
    if (structural) render();
    else refresh();
  }

  function numOrBlank(v) {
    return v === null || v === undefined ? "" : v;
  }

  function setHTMLById(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  const slugKey = (label, taken) => S.slugKey(label, taken);

  function fold(text) {
    const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
    return String(text ?? "")
      .replace(/İ/g, "i").replace(/I/g, "ı")
      .toLocaleLowerCase("tr-TR")
      .replace(/[çğıöşüâîû]/g, (c) => map[c] || c);
  }

  const matches = (text) => !filter || fold(text).includes(filter);

  function setFilter(value) {
    const next = fold(value).trim();
    filterRaw = value;
    if (next === filter) return;
    filter = next;
    render();
    const box = document.getElementById("line-filter");
    if (box) {
      box.focus();
      box.selectionStart = box.selectionEnd = box.value.length;
    }
  }

  function visibleCategories(s) {
    if (!filter) return s.categories.map((c) => ({ cat: c, lines: c.lines }));
    return s.categories
      .map((c) => {
        const lines = matches(c.title) || matches(c.note)
          ? c.lines
          : c.lines.filter((l) => matches(l.name) || matches(l.formula));
        return { cat: c, lines };
      })
      .filter((entry) => entry.lines.length);
  }

  function rateNoteHTML() {
    const r = doc.rates;
    return r.auto && r.fetchedAt
      ? `<span class="rate-note rate-note--auto">${icon("check", 12)} ${esc(r.source || "otomatik")} · ${esc(r.fetchedAt)}</span>`
      : `<span class="rate-note">elle girildi</span>`;
  }

  function topBarHTML() {
    const r = doc.rates;
    return `
      <div class="topbar-row">
        <div class="brand">Maliyet Hesaplama<em>maliyet analiz çalışma sayfası</em></div>
        <span class="spacer"></span>
        <div class="toolbar">
          <button class="btn" id="btn-undo" title="Geri al (Ctrl+Z)"${history.past.length ? "" : " disabled"}>${icon("undo")}</button>
          <button class="btn" id="btn-redo" title="Yinele (Ctrl+Y)"${history.future.length ? "" : " disabled"}>${icon("redo")}</button>
          <span class="toolbar-sep"></span>
          <button class="btn${compareId ? " btn--on" : ""}" id="btn-periods" title="Dönem kaydet ve karşılaştır">${icon("calendar")} Dönemler</button>
          <button class="btn" id="btn-csv" title="Aktif sistemi Excel/CSV olarak dışa aktar">${icon("table")} CSV</button>
          <button class="btn" id="btn-print" title="Grafikli rapor: önizle, yazdır veya PDF olarak kaydet">${icon("printer")} Rapor</button>
          <button class="btn" id="btn-export" title="Yedekleme ve geri yükleme">${icon("download")} Yedek</button>
          <input type="file" id="file-input" accept="application/json" hidden />
          <button class="btn" id="btn-settings" title="Ayarlar">${icon("settings")}</button>
          <button class="btn" id="btn-help" title="Formül yardımı (F1)">${icon("help")} Yardım</button>
        </div>
      </div>
      <div class="topbar-row" style="padding-top:0;padding-bottom:8px;gap:16px">
        <div class="fields" style="gap:10px 14px">
          <label class="field">
            <span class="field-label">USD / ₺</span>
            <span class="field-box"><input type="number" step="any" class="num" id="rate-usd" value="${numOrBlank(r.usd)}" /></span>
          </label>
          <label class="field">
            <span class="field-label">EUR / ₺</span>
            <span class="field-box"><input type="number" step="any" class="num" id="rate-eur" value="${numOrBlank(r.eur)}" /></span>
          </label>
          <button class="btn btn--sm" id="btn-rates" title="Merkez Bankası kurlarını çek">${icon("refresh", 12)} Kurları güncelle</button>
          <span id="rate-note">${rateNoteHTML()}</span>
        </div>
      </div>
      <div class="tabs">
        ${doc.systems.map((s) => `
          <button class="tab ${s.id === doc.activeSystemId ? "tab--active" : ""}" data-system="${s.id}">
            <span>${esc(s.name)}</span>
            ${s.id === doc.activeSystemId ? `<span class="tab-menu" data-sysmenu="${s.id}">${icon("more", 13)}</span>` : ""}
          </button>`).join("")}
        <button class="btn btn--sm tab-add" id="btn-add-system" title="Yeni sistem ekle">${icon("plus", 12)} Sistem</button>
      </div>`;
  }

  function paramsPanelHTML(s) {
    return `
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Üretim</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--plain" id="btn-edit-production" title="Etiket ve birimi düzenle">${icon("pencil", 12)} Düzenle</button>
        </div>
        <div class="panel-body">
          <div class="fields">
            <label class="field field--wide">
              <span class="field-label">${esc(s.production.label)}</span>
              <span class="field-box">
                <input type="number" step="any" class="num" data-production value="${numOrBlank(s.production.value)}" />
                <span class="field-suffix">${esc(s.production.unit)}</span>
              </span>
            </label>
            <div class="rate-note">Tüm maliyetler bu tonaja bölünerek $/${esc(s.production.unit)} olarak gösterilir.</div>
          </div>
        </div>
      </div>`;
  }

  function variablesPanelHTML(s) {
    const rows = s.variables.map((v) => `
      <div class="var-row" data-var="${v.id}">
        <label class="field" style="flex:1">
          <span class="field-label">${esc(v.label)} <span class="var-key">${esc(v.key)}</span></span>
          <span class="field-box">
            <input type="number" step="any" class="num" data-varval="${v.id}" value="${numOrBlank(v.value)}" />
            <span class="field-suffix">${esc(v.unit)}</span>
          </span>
        </label>
        <button class="iconbtn" data-varedit="${v.id}" title="Düzenle">${icon("pencil", 13)}</button>
        <button class="iconbtn iconbtn--danger" data-vardel="${v.id}" title="Sil">${icon("trash", 13)}</button>
      </div>`).join("");

    return `
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Değişkenler</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--plain" id="btn-add-var">${icon("plus", 12)} Değişken ekle</button>
        </div>
        <div class="panel-body">
          ${s.variables.length
            ? `<div class="var-grid">${rows}</div>`
            : `<div class="empty-hint">Formüllerde kullanmak üzere adlandırılmış sayılar tanımlayın (ör. çevrim süresi, hurda fiyatı).</div>`}
        </div>
      </div>`;
  }

  function indicatorsPanelHTML(s) {
    const tiles = s.indicators.map((i) => `
      <div class="kpi" data-ind="${i.id}">
        <div class="kpi-actions">
          <button class="iconbtn" data-indedit="${i.id}" title="Düzenle">${icon("pencil", 12)}</button>
          <button class="iconbtn iconbtn--danger" data-inddel="${i.id}" title="Sil">${icon("trash", 12)}</button>
        </div>
        <div class="kpi-label">${esc(i.label)}</div>
        <div class="kpi-value" id="ind-${i.id}">—</div>
      </div>`).join("");

    return `
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Göstergeler</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--plain" id="btn-add-ind">${icon("plus", 12)} Gösterge ekle</button>
        </div>
        <div class="panel-body">
          ${s.indicators.length
            ? `<div class="kpi-grid">${tiles}</div>`
            : `<div class="empty-hint">Formülle hesaplanan kendi göstergelerinizi ekleyin (ör. verim, birim başına süre).</div>`}
        </div>
      </div>`;
  }

  function lineHTML(line) {
    const cur = `<select class="cell-select" data-linecur="${line.id}">
        ${S.CURRENCIES.map((c) => `<option value="${c}"${c === line.currency ? " selected" : ""}>${S.CUR_SYMBOL[c]} ${c}</option>`).join("")}
      </select>`;

    let mid;
    if (line.mode === "rate") {
      mid = `
        <span class="cell"><input type="number" step="any" data-lineqty="${line.id}" value="${numOrBlank(line.qty)}" />
          <span class="cell-unit">${esc(line.qtyUnit)}</span></span>
        <span class="cell"><input type="number" step="any" data-lineprice="${line.id}" value="${numOrBlank(line.price)}" />
          <span class="cell-unit">${esc(line.priceUnit)}</span></span>`;
    } else if (line.mode === "formula") {
      mid = `<span class="cell cell--span2 cell--formula" data-lineformula="${line.id}" title="Formülü düzenle">
          <span class="formula-text" id="fx-${line.id}">${esc(line.formula || "formül ekleyin…")}</span>
          <span class="cell-unit">${line.basis === "perTon" ? `/ ${esc(sys().production.unit)}` : "toplam"}</span>
        </span>`;
    } else {
      const unit = line.mode === "perTon" ? `/ ${esc(sys().production.unit)}` : "tutar";
      mid = `<span class="cell cell--span2"><input type="number" step="any" data-lineprice="${line.id}" value="${numOrBlank(line.price)}" />
          <span class="cell-unit">${unit}</span></span>`;
    }

    return `
      <div class="line" data-line="${line.id}">
        <input class="line-name" data-linename="${line.id}" value="${esc(line.name)}" />
        <select class="cell-select" data-linemode="${line.id}">
          <option value="rate"${line.mode === "rate" ? " selected" : ""}>Miktar × Fiyat</option>
          <option value="lump"${line.mode === "lump" ? " selected" : ""}>Toplam tutar</option>
          <option value="perTon"${line.mode === "perTon" ? " selected" : ""}>Ton başına</option>
          <option value="formula"${line.mode === "formula" ? " selected" : ""}>Formül</option>
        </select>
        ${mid}
        ${cur}
        <span class="line-result" id="lr-${line.id}">—</span>
        <span class="line-actions">
          <button class="iconbtn" data-lineup="${line.id}" title="Yukarı">${icon("chevronUp", 12)}</button>
          <button class="iconbtn" data-linedown="${line.id}" title="Aşağı">${icon("chevronDown", 12)}</button>
          <button class="iconbtn iconbtn--danger" data-linedel="${line.id}" title="Sil">${icon("trash", 12)}</button>
        </span>
      </div>`;
  }

  function categoryHTML(cat, lines) {
    const isOpen = filter ? true : !!open[cat.id];
    const hidden = cat.lines.length - lines.length;
    return `
      <div class="cat" data-cat="${cat.id}">
        <div class="cat-head" data-cattoggle="${cat.id}">
          <span class="chev ${isOpen ? "chev--open" : ""}">${icon("chevronRight", 14)}</span>
          <span class="cat-name">${esc(cat.title)}</span>
          ${cat.note ? `<span class="cat-note">${esc(cat.note)}</span>` : ""}
          ${hidden > 0 ? `<span class="cat-note">${hidden} kalem gizli</span>` : ""}
          <span class="spacer"></span>
          <span class="cat-actions">
            <button class="iconbtn" data-catedit="${cat.id}" title="Kategoriyi düzenle">${icon("pencil", 13)}</button>
            <button class="iconbtn" data-catup="${cat.id}" title="Yukarı">${icon("chevronUp", 13)}</button>
            <button class="iconbtn" data-catdown="${cat.id}" title="Aşağı">${icon("chevronDown", 13)}</button>
            <button class="iconbtn iconbtn--danger" data-catdel="${cat.id}" title="Kategoriyi sil">${icon("trash", 13)}</button>
          </span>
          <span class="cat-share" id="cs-${cat.id}">—</span>
          <span class="cat-total" id="ct-${cat.id}">—</span>
        </div>
        <div class="cat-body" data-catbody="${cat.id}" style="display:${isOpen ? "block" : "none"}">
          <div class="lines">
            <div class="line line--head">
              <span>Kalem</span><span>Tür</span><span>Miktar / Formül</span><span>Birim Fiyat</span>
              <span>Para Birimi</span><span>$/${esc(sys().production.unit)}</span><span></span>
            </div>
            ${lines.map(lineHTML).join("")}
          </div>
          <div class="line-tools">
            <button class="btn btn--sm btn--plain" data-lineadd="${cat.id}">${icon("plus", 12)} Kalem ekle</button>
          </div>
        </div>
      </div>`;
  }

  function categoriesEmptyHintHTML(s, visible) {
    if (visible.length) return "";
    if (filter) {
      return `<div class="empty-hint">"${esc(filter)}" ile eşleşen kalem bulunamadı.</div>`;
    }
    return `<div class="empty-hint">Henüz kategori yok. "Kategori ekle" ile başlayın.</div>`;
  }

  function summaryHTML(s) {
    return `
      <div class="summary">
        <div class="panel">
          <div class="hero">
            <div class="hero-label">Toplam Maliyet</div>
            <div class="hero-value num" id="hero-total">—</div>
            <div class="hero-sub" id="hero-sub"></div>
          </div>
          <div class="panel-head" style="border-top:0">
            <span class="panel-title">Kategori Dağılımı</span>
          </div>
          <div class="rank" id="rank"></div>
        </div>
      </div>`;
  }

  function render() {
    const s = sys();
    const visible = visibleCategories(s);
    document.getElementById("topbar").innerHTML = topBarHTML();
    document.getElementById("main").innerHTML = `
      ${compareId ? comparePanelHTML() : ""}
      ${paramsPanelHTML(s)}
      ${variablesPanelHTML(s)}
      ${indicatorsPanelHTML(s)}
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Maliyet Kalemleri</span>
          <span class="search">
            ${icon("search", 12)}
            <input type="search" id="line-filter" placeholder="Kalem ara… (Ctrl+F)" value="${esc(filterRaw)}" />
            ${filter ? `<button class="iconbtn" id="btn-clear-filter" title="Aramayı temizle (Esc)">${icon("close", 12)}</button>` : ""}
          </span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--plain" id="btn-add-cat">${icon("plus", 12)} Kategori ekle</button>
        </div>
        <div class="panel-body" style="padding:8px">
          ${visible.map((entry) => categoryHTML(entry.cat, entry.lines)).join("")}
          ${categoriesEmptyHintHTML(s, visible)}
        </div>
      </div>`;
    document.getElementById("aside").innerHTML = summaryHTML(s);
    refresh();
  }

  function refresh() {
    const s = sys();
    computed = S.computeSystem(s, doc.rates);
    const unit = s.production.unit;

    computed.categories.forEach((c) => {
      const share = computed.total !== 0 ? (c.total / computed.total) * 100 : 0;
      const shareEl = document.getElementById(`cs-${c.id}`);
      const totalEl = document.getElementById(`ct-${c.id}`);
      if (shareEl) shareEl.textContent = `${share.toFixed(1)}%`;
      if (totalEl) totalEl.innerHTML = `${fmt(c.total)} <small>$/${esc(unit)}</small>`;
      c.lines.forEach((l) => {
        const el = document.getElementById(`lr-${l.id}`);
        if (!el) return;
        if (l.error) {
          el.className = "line-result line-result--err";
          el.textContent = "hata";
          el.title = l.error;
        } else {
          el.className = "line-result" + (l.value < 0 ? " line-result--credit" : "");
          el.textContent = fmt(l.value);
          el.title = "";
        }
      });
    });

    s.indicators.forEach((def, idx) => {
      const el = document.getElementById(`ind-${def.id}`);
      if (!el) return;
      const res = computed.indicators[idx];
      if (res.error) {
        el.className = "kpi-value kpi-value--err";
        el.textContent = res.error;
      } else {
        el.className = "kpi-value num";
        el.innerHTML = `${fmt(res.value, Number(def.decimals) || 0)}<small>${esc(def.unit)}</small>`;
      }
    });

    setHTMLById("rate-note", rateNoteHTML());

    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = !history.past.length;
    if (redoBtn) redoBtn.disabled = !history.future.length;

    const hero = document.getElementById("hero-total");
    if (hero) hero.innerHTML = `${fmt(computed.total)}<span class="hero-unit">$/${esc(unit)}</span>`;
    const sub = document.getElementById("hero-sub");
    if (sub) {
      const monthly = computed.total * (Number(s.production.value) || 0);
      sub.textContent = `Aylık toplam ≈ $${fmt(monthly, 0)}`;
    }

    renderComparison();
    renderRank(unit);
  }

  function renderRank(unit) {
    const el = document.getElementById("rank");
    if (!el) return;
    const rows = computed.categories
      .filter((c) => Math.abs(c.total) > 0.0005)
      .sort((a, b) => b.total - a.total);
    if (!rows.length) {
      el.innerHTML = `<div class="empty-hint" style="padding:8px 12px">Gösterilecek maliyet yok.</div>`;
      return;
    }
    const max = Math.max(...rows.map((r) => Math.abs(r.total)));
    el.innerHTML = rows.map((r) => {
      const pct = computed.total !== 0 ? (r.total / computed.total) * 100 : 0;
      const neg = r.total < 0;
      return `
        <div class="rank-row" title="${esc(r.title)}: ${fmt(r.total)} $/${esc(unit)}">
          <div>
            <div class="rank-label">${esc(r.title)}</div>
            <div class="rank-bar"><div class="rank-fill${neg ? " rank-fill--neg" : ""}" style="width:${(Math.abs(r.total) / max) * 100}%"></div></div>
          </div>
          <div class="rank-pct">${pct.toFixed(1)}%</div>
          <div class="rank-val${neg ? " rank-val--credit" : ""}">${fmt(r.total)}</div>
        </div>`;
    }).join("");
  }

  let compareId = null;

  const periodOf = (id) => (doc.periods || []).find((p) => p.id === id) || null;

  function defaultPeriodLabel() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function savePeriod() {
    const v = await formModal({
      title: "Dönemi kaydet",
      intro: "Bütün sistemlerin şu anki hali, o günkü kurlarla birlikte dondurulur. " +
             "Sonraki aylarda bu döneme göre neyin ne kadar değiştiğini görebilirsiniz.",
      fields: [{
        key: "label", label: "Dönem adı", value: defaultPeriodLabel(),
        hint: "Örn. 2026-07, ya da \"Temmuz — revize\".",
      }],
      okLabel: "Kaydet",
    });
    if (!v || !v.label.trim()) return;

    const label = v.label.trim();
    const existing = (doc.periods || []).find((p) => p.label === label);
    if (existing && !(await confirmModal(
      "Dönemin üzerine yaz",
      `"${label}" zaten kayıtlı (${existing.savedAt}). Üzerine yazılsın mı?`, "Üzerine yaz"))) return;

    const snapshot = {
      id: existing ? existing.id : S.uid("p"),
      label,
      savedAt: new Date().toISOString().slice(0, 10),
      rates: { usd: Number(doc.rates.usd) || 0, eur: Number(doc.rates.eur) || 0 },
      systems: JSON.parse(JSON.stringify(doc.systems)),
    };
    doc.periods = (doc.periods || []).filter((p) => p.id !== snapshot.id).concat([snapshot]);
    doc.periods.sort((a, b) => String(a.label).localeCompare(String(b.label), "tr"));
    commit(true);
    toast(`"${label}" dönemi kaydedildi.`);
  }

  async function deletePeriod(id) {
    const p = periodOf(id);
    if (!p) return;
    if (!(await confirmModal("Dönemi sil", `"${p.label}" dönemi silinsin mi?`))) return;
    doc.periods = doc.periods.filter((x) => x.id !== id);
    if (compareId === id) compareId = null;
    commit(true);
  }

  function setCompare(id) {
    compareId = id;
    render();
  }

  function periodsMenu(anchor) {
    const items = [
      { id: "save", label: "Bu durumu dönem olarak kaydet", icon: "camera", onSelect: savePeriod },
    ];
    const periods = doc.periods || [];
    if (periods.length) {
      items.push({ sep: true });
      periods.forEach((p) => items.push({
        id: `cmp:${p.id}`,
        label: `${p.id === compareId ? "✓ " : ""}${p.label} ile karşılaştır`,
        icon: "calendar",
        onSelect: () => setCompare(p.id === compareId ? null : p.id),
      }));
      items.push({ sep: true });
      periods.forEach((p) => items.push({
        id: `del:${p.id}`,
        label: `"${p.label}" dönemini sil`,
        icon: "trash",
        danger: true,
        onSelect: () => deletePeriod(p.id),
      }));
    }
    menu(anchor, items);
  }

  function comparisonFor(system, now, periodId) {
    const period = periodOf(periodId);
    if (!period || !now) return null;
    const past = period.systems.find((x) => x.id === system.id)
      || period.systems.find((x) => x.name === system.name);
    if (!past) return null;

    const then = S.computeSystem(past, period.rates);
    const byId = new Map(then.categories.map((c) => [c.id, c]));
    const byTitle = new Map(then.categories.map((c) => [c.title, c]));

    const matched = new Set();
    const rows = now.categories.map((c) => {
      const was = byId.get(c.id) || byTitle.get(c.title);
      if (was) matched.add(was.id);
      return { title: c.title, before: was ? was.total : 0, after: c.total, added: !was };
    });
    then.categories.forEach((c) => {
      if (matched.has(c.id)) return;
      rows.push({ title: c.title, before: c.total, after: 0, removed: true });
    });

    rows.forEach((r) => {
      r.delta = r.after - r.before;
      r.pct = r.before !== 0 ? (r.delta / Math.abs(r.before)) * 100 : null;
    });
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
      period, past, rows,
      before: then.total,
      after: now.total,
      delta: now.total - then.total,
      pct: then.total !== 0 ? ((now.total - then.total) / Math.abs(then.total)) * 100 : null,
    };
  }

  function comparison() {
    return comparisonFor(sys(), computed, compareId);
  }

  const signed = (n, digits) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), digits);
  const pctText = (p) => (p === null ? "—" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`);
  const deltaClass = (n) => (n > 0.0005 ? " delta--up" : n < -0.0005 ? " delta--down" : "");

  function renderComparison() {
    const el = document.getElementById("compare-body");
    if (!el) return;
    const cmp = comparison();
    if (!cmp) {
      el.innerHTML = `<div class="empty-hint" style="padding:10px 12px">
        Bu sistem seçili dönemde kayıtlı değil, karşılaştırılacak veri yok.</div>`;
      return;
    }
    const unit = esc(sys().production.unit);
    const rows = cmp.rows
      .filter((r) => Math.abs(r.delta) > 0.0005 || Math.abs(r.before) > 0.0005)
      .map((r) => `
        <div class="cmp-row">
          <div class="cmp-name">${esc(r.title)}${
            r.added ? ` <span class="cmp-tag">yeni</span>` : ""}${
            r.removed ? ` <span class="cmp-tag">kaldırıldı</span>` : ""}</div>
          <div class="cmp-num">${fmt(r.before)}</div>
          <div class="cmp-num">${fmt(r.after)}</div>
          <div class="cmp-num cmp-delta${deltaClass(r.delta)}">${signed(r.delta)}</div>
          <div class="cmp-num cmp-delta${deltaClass(r.delta)}">${pctText(r.pct)}</div>
        </div>`).join("");

    el.innerHTML = `
      <div class="cmp-hero">
        <div>
          <div class="cmp-hero-label">${esc(cmp.period.label)}</div>
          <div class="cmp-hero-value num">${fmt(cmp.before)}</div>
        </div>
        <div class="cmp-arrow">→</div>
        <div>
          <div class="cmp-hero-label">şimdi</div>
          <div class="cmp-hero-value num">${fmt(cmp.after)}</div>
        </div>
        <div class="cmp-hero-delta${deltaClass(cmp.delta)}">
          <div class="cmp-hero-value num">${signed(cmp.delta)}</div>
          <div class="cmp-hero-label">${pctText(cmp.pct)} · $/${unit}</div>
        </div>
        <span class="spacer"></span>
        <div class="cmp-context">
          USD ${fmtLoose(Number(cmp.period.rates.usd) || 0, 4)} → ${fmtLoose(Number(doc.rates.usd) || 0, 4)}<br />
          ${esc(cmp.past.production.label)} ${fmtLoose(Number(cmp.past.production.value) || 0)}
          → ${fmtLoose(Number(sys().production.value) || 0)} ${unit}
        </div>
      </div>
      <div class="cmp-table">
        <div class="cmp-row cmp-row--head">
          <div>Kategori</div><div class="cmp-num">${esc(cmp.period.label)}</div>
          <div class="cmp-num">Şimdi</div><div class="cmp-num">Δ</div><div class="cmp-num">Δ%</div>
        </div>
        ${rows || `<div class="empty-hint" style="padding:8px 12px">Değişiklik yok.</div>`}
      </div>`;
  }

  function comparePanelHTML() {
    const p = periodOf(compareId);
    return `
      <div class="panel" id="compare-panel">
        <div class="panel-head">
          <span class="panel-title">Karşılaştırma</span>
          <span class="cat-note">${p ? esc(p.label) : ""} → şimdi</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--plain" id="btn-compare-close" title="Karşılaştırmayı kapat">
            ${icon("close", 12)} Kapat</button>
        </div>
        <div id="compare-body"></div>
      </div>`;
  }

  const OPERATORS = [
    ["+", "Toplama", "3 + 4", "7"],
    ["-", "Çıkarma", "10 - 4", "6"],
    ["*", "Çarpma — klavyedeki yıldız, × değil", "6 * 7", "42"],
    ["/", "Bölme — eğik çizgi, ÷ değil", "45 / 4", "11.25"],
    ["^", "Üs alma (kuvvet)", "2 ^ 10", "1024"],
    ["( )", "Parantez — önce hesaplanmasını istediğiniz kısmı içine alın", "(2 + 3) * 4", "20"],
  ];

  const FUNCTIONS = [
    ["abs(x)", "Mutlak değer. Sayının eksi işaretini atar, sonuç her zaman pozitiftir.", "abs(-11.911)", "11.911"],
    ["min(a, b, …)", "En küçüğünü verir. Aralarına virgül koyarak istediğiniz kadar sayı yazabilirsiniz.", "min(538, 512, 549)", "512"],
    ["max(a, b, …)", "En büyüğünü verir. Aynı şekilde birden çok sayı alır.", "max(538, 512, 549)", "549"],
    ["round(x, n)", "Yuvarlar. n, kaç ondalık basamak kalacağını söyler; n yazmazsanız tam sayıya yuvarlar.", "round(12.5862, 2)", "12.59"],
    ["floor(x)", "Aşağı yuvarlar. Ondalık kısım ne olursa olsun bir alttaki tam sayıya iner.", "floor(12.9)", "12"],
    ["ceil(x)", "Yukarı yuvarlar. En ufak ondalık bile olsa bir üstteki tam sayıya çıkar.", "ceil(12.1)", "13"],
    ["sqrt(x)", "Karekök alır.", "sqrt(144)", "12"],
    ["eger(k, a, b)", "Koşul doğruysa a, değilse b sonucunu verir. Excel'deki EĞER ile aynı.", "eger(23 > 20, 5, 0)", "5"],
    ["ve(a, b, …)", "Koşulların hepsi doğruysa 1, değilse 0 verir.", "ve(1 > 0, 5 > 3)", "1"],
    ["veya(a, b, …)", "Koşullardan en az biri doğruysa 1, hiçbiri değilse 0 verir.", "veya(1 > 5, 5 > 3)", "1"],
    ["degil(k)", "Koşulu tersine çevirir.", "degil(1 > 5)", "1"],
  ];

  const COMPARISONS = [
    ["=", "Eşitse", "5 = 5", "1"],
    ["<>", "Eşit değilse", "5 <> 4", "1"],
    [">", "Büyükse", "5 > 4", "1"],
    ["<", "Küçükse", "5 < 4", "0"],
    [">=", "Büyük veya eşitse", "5 >= 5", "1"],
    ["<=", "Küçük veya eşitse", "6 <= 5", "0"],
  ];

  const EXAMPLES = [
    ["miktar * fiyat", "En sık kullanılan hesap: iki değişkeni çarpar."],
    ["-(hurda * hurdaFiyati)", "Başına eksi koyarsanız satır bir geri kazanım/alacak olur ve toplamdan düşülür."],
    ["max(0, uretim - 20000)", "Alt sınır koyar: sonuç eksiye düşerse 0 kabul edilir."],
    ["min(kapasite, uretim)", "İki değerden küçüğünü alır — ör. kapasiteyi aşamayan üretim."],
    ["round(fiyat * 18 / 100, 2)", "%18'i hesaplar ve 2 basamağa yuvarlar. Formülde % işareti yoktur."],
    ["ceil(uretim / 25)", "Kaç sefer/paket gerektiğini bulur; yarım sefer olmadığı için yukarı yuvarlanır."],
    ['kat("Enerji") / toplam * 100', "Enerjinin toplam maliyet içindeki payı (%). Yalnızca göstergelerde çalışır."],
    ["eger(uretim > 20000, 450, 500)", "Kademeli fiyat: üretim eşiği geçtiyse indirimli birim fiyat uygulanır."],
    ["eger(gun > 0, saat / gun, 0)", "Bölmeden önce koşul koyar — veri girilmemişken 0 gösterir."],
  ];

  function helpTable(headers, rows) {
    const head = headers.map((h, i) => `<th${i === 3 ? ' class="help-num"' : ""}>${esc(h)}</th>`).join("");
    const body = rows.map((r) => `
      <tr>
        <td><code>${esc(r[0])}</code></td>
        <td class="help-desc">${esc(r[1])}</td>
        <td><code>${esc(r[2])}</code></td>
        <td class="help-num"><code>${esc(r[3])}</code></td>
      </tr>`).join("");
    return `<div class="help-scroll"><table class="help-tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function helpHTML() {
    const s = sys();
    const unit = esc(s.production.unit);

    const varRows = s.variables.length
      ? s.variables.map((v) => `
          <tr>
            <td><code>${esc(v.key)}</code></td>
            <td class="help-desc">${esc(v.label)}</td>
            <td class="help-num">${fmtLoose(Number(v.value) || 0)}${v.unit ? ` <span class="help-dim">${esc(v.unit)}</span>` : ""}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" class="help-dim">Bu sistemde henüz değişken yok — "Değişkenler" bölümünden ekleyebilirsiniz.</td></tr>`;

    const exampleRows = EXAMPLES.map((e) => `
      <tr>
        <td><code>${esc(e[0])}</code></td>
        <td class="help-desc">${esc(e[1])}</td>
      </tr>`).join("");

    return `<div class="help">
      <p>Formüller Excel'deki gibi çalışır; tek farkı başına <code>=</code> koymazsınız. Sayıları, değişken
      adlarını ve aşağıdaki fonksiyonları serbestçe birleştirebilirsiniz. Yazarken kutunun altındaki önizleme
      sonucu anında gösterir; bir hata varsa kırmızı olarak yazar.</p>

      <h4>İşlemler</h4>
      ${helpTable(["İşlem", "Ne yapar", "Örnek", "Sonuç"], OPERATORS)}
      <div class="help-note">
        <b>İşlem sırası:</b> önce <code>^</code>, sonra <code>*</code> ve <code>/</code>, en son <code>+</code>
        ve <code>-</code> hesaplanır. Bu yüzden <code>2 + 3 * 4</code> sonucu 14'tür.
        Sırayı değiştirmek için parantez kullanın: <code>(2 + 3) * 4</code> → 20.
      </div>

      <h4>Fonksiyonlar</h4>
      ${helpTable(["Fonksiyon", "Ne yapar", "Örnek", "Sonuç"], FUNCTIONS)}
      <div class="help-note">
        <b>Yuvarlama ayrıntıları:</b> <code>round</code> yarımları yukarı yuvarlar
        (<code>round(2.5)</code> → 3). <code>floor</code> ve <code>ceil</code> sayı doğrusu üzerinde hareket
        eder, yani eksi sayılarda <code>floor(-12.1)</code> → -13 ve <code>ceil(-12.1)</code> → -12 verir.
        Parayı gösterirken yuvarlamaya gerek yoktur — ondalık basamak sayısını Ayarlar'dan belirlersiniz;
        <code>round</code> hesabın kendisini kalıcı olarak yuvarlar.
      </div>

      <h4>Koşullar (karşılaştırma)</h4>
      <p>Karşılaştırmalar <b>1</b> (doğru) veya <b>0</b> (yanlış) sonucu verir. Bunları
      <code>eger</code> içinde ya da doğrudan çarpan olarak kullanabilirsiniz.</p>
      ${helpTable(["Karşılaştırma", "Anlamı", "Örnek", "Sonuç"], COMPARISONS)}
      <div class="help-note">
        <b>İki kullanım biçimi:</b> <code>eger(uretim > 20000, 450, 500)</code> — üretim 20000'i
        geçtiyse 450, geçmediyse 500 sonucunu verir. Ya da koşulu doğrudan çarpan yapın:
        <code>(uretim > 20000) * 450</code> — koşul sağlanmazsa sonuç 0 olur.
        Excel'den gelen alışkanlıkla <code>if</code> yazarsanız da çalışır.
      </div>

      <h4>Formülde kullanabileceğiniz hazır adlar</h4>
      <div class="help-scroll"><table class="help-tbl"><tbody>
        <tr><td><code>uretim</code></td><td class="help-desc">Bu sistemin üretim miktarı (${esc(s.production.label)})</td>
          <td class="help-num">${fmtLoose(Number(s.production.value) || 0)} <span class="help-dim">${unit}</span></td></tr>
        <tr><td><code>usd</code></td><td class="help-desc">Güncel USD/₺ kuru</td>
          <td class="help-num">${fmtLoose(Number(doc.rates.usd) || 0, 4)}</td></tr>
        <tr><td><code>eur</code></td><td class="help-desc">Güncel EUR/₺ kuru</td>
          <td class="help-num">${fmtLoose(Number(doc.rates.eur) || 0, 4)}</td></tr>
        <tr><td><code>toplam</code></td><td class="help-desc">Toplam maliyet ($/${unit}) — <b>yalnızca göstergelerde</b></td>
          <td class="help-num">${computed ? fmt(computed.total) : "—"}</td></tr>
        <tr><td><code>kat("Ad")</code></td><td class="help-desc">Adı yazılan kategorinin maliyeti ($/${unit}) — <b>yalnızca göstergelerde</b>. Kategori adını tırnak içinde, ekranda göründüğü gibi yazın.</td>
          <td class="help-num help-dim">örn. kat("Enerji")</td></tr>
      </tbody></table></div>

      <h4>Bu sistemin değişkenleri</h4>
      <p>Değişkenler formülde soldaki kod adıyla anılır. Kod adı, "Değişkenler" bölümünde etiketin yanındaki
      gri kutuda da yazar.</p>
      <div class="help-scroll"><table class="help-tbl">
        <thead><tr><th>Formüldeki adı</th><th>Etiketi</th><th class="help-num">Şu anki değeri</th></tr></thead>
        <tbody>${varRows}</tbody>
      </table></div>

      <h4>Hazır örnekler</h4>
      <div class="help-scroll"><table class="help-tbl"><tbody>${exampleRows}</tbody></table></div>

      <h4>Sık yapılan hatalar</h4>
      <ul>
        <li><b>Ondalık ayracı noktadır.</b> <code>12.5</code> doğru, <code>12,5</code> yanlıştır. Virgül
        yalnızca <code>min</code>, <code>max</code>, <code>round</code> içindeki sayıları ayırmak için kullanılır.</li>
        <li><b>Yüzde işareti yoktur.</b> <code>%18</code> yerine <code>* 18 / 100</code> ya da <code>* 1.18</code> yazın.</li>
        <li><b>Büyük/küçük harf önemlidir.</b> <code>Uretim</code> çalışmaz, <code>uretim</code> çalışır.</li>
        <li><b>Değişken kod adlarında Türkçe karakter ve boşluk olamaz</b> — sadece harf, rakam ve <code>_</code>.
        Etiketi "Cüruf Nakliye Birim" olan bir değişkenin formül adı <code>curufNakliye</code> gibi olur.</li>
        <li><b>Sıfıra bölmek hata vermez</b>, sonucu 0 kabul eder. Beklemediğiniz bir 0 görüyorsanız önce
        bölen değişkeni kontrol edin.</li>
        <li><b>Bir değişkeni silerseniz</b> onu kullanan formüller "Bilinmeyen değişken" hatası verir; formülü
        elle düzeltmeniz gerekir.</li>
      </ul>

      <h4>Formül satırları hakkında</h4>
      <p>Bir maliyet kalemini "Formül" türüne çevirdiğinizde iki şeyi daha belirtirsiniz: sonucun
      <b>aylık toplam tutar</b> mı yoksa <b>zaten ${unit} başına</b> bir tutar mı olduğu ve hangi
      <b>para birimi</b> cinsinden çıktığı. Uygulama gerekli çevirmeyi ve üretime bölmeyi kendisi yapar.
      Formül kutusundaki gri etiketlere tıklayarak ad eklemek, elle yazmaktan daha güvenlidir.</p>
    </div>`;
  }

  function openHelp() {
    if (document.querySelector(".modal--help")) return;
    infoModal("Formül yardımı", helpHTML());
  }

  function formulaHelp(s, extra) {
    const names = ["uretim", "usd", "eur"].concat(s.variables.map((v) => v.key)).concat(extra || []);
    return names;
  }

  function openFormulaEditor(opts) {
    return new Promise((resolve) => {
      const s = sys();
      const names = formulaHelp(s, opts.extraNames);
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal modal--wide" role="dialog" aria-modal="true">
          <div class="modal-head">${esc(opts.title)}</div>
          <div class="modal-body">
            ${opts.fieldsHTML || ""}
            <div class="mfield">
              <label class="mfield-label">Formül</label>
              <textarea id="fx-input">${esc(opts.formula || "")}</textarea>
              <div class="mfield-hint">İşlemler: + − * / ^ ( ) &nbsp;·&nbsp; karşılaştırma: &gt; &lt; &gt;= &lt;= = &lt;&gt;
                &nbsp;·&nbsp; fonksiyonlar: abs, min, max, round, floor, ceil, sqrt, eger, ve, veya, degil.
                <a class="help-link" data-help>Ne anlama geliyorlar?</a></div>
              <div class="chips">${names.map((n) => `<span class="chip" data-chip="${esc(n)}">${esc(n)}</span>`).join("")}</div>
            </div>
            <div class="preview" id="fx-preview">—</div>
          </div>
          <div class="modal-foot">
            <button class="btn" data-act="cancel">İptal</button>
            <button class="btn btn--primary" data-act="ok">Kaydet</button>
          </div>
        </div>`;

      const input = backdrop.querySelector("#fx-input");
      const preview = backdrop.querySelector("#fx-preview");

      const update = () => {
        const totals = {};
        computed.categories.forEach((c) => { totals[c.title] = c.total; });
        const scope = {
          vars: Object.assign({}, computed.scope, { toplam: computed.total }),
          funcs: { kat: (name) => totals[name] || 0 },
        };
        const res = window.Formula.run(input.value, scope);
        if (res.ok) {
          preview.className = "preview";
          preview.innerHTML = `Şu anki değerlerle sonuç: <b>${esc(fmt(res.value, 4))}</b>`;
        } else {
          preview.className = "preview preview--err";
          preview.textContent = res.error;
        }
      };
      const close = (v) => { release(); backdrop.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      const release = trapKeys(onKey);

      input.addEventListener("input", update);
      backdrop.addEventListener("click", (e) => {
        if (e.target.closest("[data-help]")) return openHelp();
        const chip = e.target.closest("[data-chip]");
        if (chip) {
          const at = input.selectionStart ?? input.value.length;
          input.value = input.value.slice(0, at) + chip.dataset.chip + input.value.slice(at);
          input.focus();
          input.selectionStart = input.selectionEnd = at + chip.dataset.chip.length;
          update();
          return;
        }
        if (e.target === backdrop) return close(null);
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") close(null);
        if (act === "ok") {
          const out = { formula: input.value };
          backdrop.querySelectorAll("[data-key]").forEach((el) => { out[el.dataset.key] = el.value; });
          close(out);
        }
      });
      document.body.appendChild(backdrop);
      update();
      input.focus();
    });
  }

  function findLine(id) {
    for (const c of sys().categories) {
      const l = c.lines.find((x) => x.id === id);
      if (l) return { cat: c, line: l };
    }
    return null;
  }

  function moveInArray(arr, index, dir) {
    const to = index + dir;
    if (index < 0 || to < 0 || to >= arr.length) return false;
    [arr[index], arr[to]] = [arr[to], arr[index]];
    return true;
  }

  async function editProduction() {
    const s = sys();
    const v = await formModal({
      title: "Üretim alanını düzenle",
      fields: [
        { key: "label", label: "Etiket", value: s.production.label },
        { key: "unit", label: "Birim", value: s.production.unit, hint: "Maliyet birimi $/<birim> olarak gösterilir." },
      ],
    });
    if (!v) return;
    s.production.label = v.label.trim() || s.production.label;
    s.production.unit = v.unit.trim() || s.production.unit;
    commit(true);
  }

  async function addVariable() {
    const s = sys();
    const v = await formModal({
      title: "Değişken ekle",
      intro: "Değişkenler formüllerde kullanılan adlandırılmış sayılardır.",
      fields: [
        { key: "label", label: "Ad", value: "" },
        { key: "unit", label: "Birim", value: "" },
        { key: "value", label: "Değer", type: "number", value: 0 },
      ],
    });
    if (!v || !v.label.trim()) return;
    s.variables.push(S.V(slugKey(v.label, s.variables.map((x) => x.key)), v.label.trim(), v.unit.trim(), Number(v.value) || 0));
    commit(true);
  }

  async function editVariable(id) {
    const s = sys();
    const variable = s.variables.find((v) => v.id === id);
    if (!variable) return;
    const v = await formModal({
      title: "Değişkeni düzenle",
      fields: [
        { key: "label", label: "Ad", value: variable.label },
        { key: "key", label: "Formül adı", value: variable.key, hint: "Formüllerde bu adla kullanılır. Sadece harf, rakam ve _." },
        { key: "unit", label: "Birim", value: variable.unit },
      ],
    });
    if (!v) return;
    const key = v.key.trim();
    const taken = s.variables.some((x) => x.id !== id && x.key === key);
    const reserved = ["uretim", "usd", "eur", "toplam"].includes(key);
    if (!key || key === variable.key) {
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      toast("Geçersiz formül adı — sadece harf, rakam ve _ kullanın.", true);
    } else if (taken) {
      toast(`"${key}" adı başka bir değişkende kullanılıyor.`, true);
    } else if (reserved) {
      toast(`"${key}" ayrılmış bir addır.`, true);
    } else {
      variable.key = key;
    }
    variable.label = v.label.trim() || variable.label;
    variable.unit = v.unit.trim();
    commit(true);
  }

  async function deleteVariable(id) {
    const s = sys();
    const variable = s.variables.find((v) => v.id === id);
    if (!variable) return;
    if (!(await confirmModal("Değişkeni sil", `"${variable.label}" silinsin mi? Bu değişkeni kullanan formüller hata verecektir.`))) return;
    s.variables = s.variables.filter((v) => v.id !== id);
    commit(true);
  }

  async function addIndicator() {
    const s = sys();
    const res = await openFormulaEditor({
      title: "Gösterge ekle",
      formula: "",
      extraNames: ["toplam"],
      fieldsHTML: `
        <div class="mfield-row">
          <div class="mfield"><label class="mfield-label">Ad</label><input type="text" data-key="label" value="" /></div>
          <div class="mfield"><label class="mfield-label">Birim</label><input type="text" data-key="unit" value="" /></div>
        </div>
        <div class="mfield"><label class="mfield-label">Ondalık basamak</label><input type="number" data-key="decimals" value="2" /></div>`,
    });
    if (!res || !res.label.trim()) return;
    s.indicators.push(S.I(res.label.trim(), res.unit.trim(), Number(res.decimals) || 0, res.formula));
    commit(true);
  }

  async function editIndicator(id) {
    const s = sys();
    const ind = s.indicators.find((i) => i.id === id);
    if (!ind) return;
    const res = await openFormulaEditor({
      title: "Göstergeyi düzenle",
      formula: ind.formula,
      extraNames: ["toplam"],
      fieldsHTML: `
        <div class="mfield-row">
          <div class="mfield"><label class="mfield-label">Ad</label><input type="text" data-key="label" value="${esc(ind.label)}" /></div>
          <div class="mfield"><label class="mfield-label">Birim</label><input type="text" data-key="unit" value="${esc(ind.unit)}" /></div>
        </div>
        <div class="mfield"><label class="mfield-label">Ondalık basamak</label><input type="number" data-key="decimals" value="${esc(ind.decimals)}" /></div>`,
    });
    if (!res) return;
    ind.label = res.label.trim() || ind.label;
    ind.unit = res.unit.trim();
    ind.decimals = Number(res.decimals) || 0;
    ind.formula = res.formula;
    commit(true);
  }

  async function addCategory() {
    const s = sys();
    const v = await formModal({
      title: "Kategori ekle",
      fields: [
        { key: "title", label: "Kategori adı", value: "" },
        { key: "note", label: "Açıklama (isteğe bağlı)", value: "" },
      ],
    });
    if (!v || !v.title.trim()) return;
    const cat = S.C(v.title.trim(), [S.L("Yeni kalem", "lump", { price: 0, currency: "TRY" })], v.note.trim());
    s.categories.push(cat);
    open[cat.id] = true;
    commit(true);
  }

  async function editCategory(id) {
    const s = sys();
    const cat = s.categories.find((c) => c.id === id);
    if (!cat) return;
    const v = await formModal({
      title: "Kategoriyi düzenle",
      fields: [
        { key: "title", label: "Kategori adı", value: cat.title },
        { key: "note", label: "Açıklama", value: cat.note },
      ],
    });
    if (!v) return;
    cat.title = v.title.trim() || cat.title;
    cat.note = v.note.trim();
    commit(true);
  }

  async function deleteCategory(id) {
    const s = sys();
    const cat = s.categories.find((c) => c.id === id);
    if (!cat) return;
    if (!(await confirmModal("Kategoriyi sil", `"${cat.title}" ve içindeki ${cat.lines.length} kalem silinsin mi?`))) return;
    s.categories = s.categories.filter((c) => c.id !== id);
    commit(true);
  }

  async function editLineFormula(id) {
    const found = findLine(id);
    if (!found) return;
    const unit = sys().production.unit;
    const res = await openFormulaEditor({
      title: `Formül — ${found.line.name}`,
      formula: found.line.formula,
      fieldsHTML: `
        <div class="mfield">
          <label class="mfield-label">Sonuç ne ifade ediyor?</label>
          <select data-key="basis">
            <option value="lump"${found.line.basis === "lump" ? " selected" : ""}>Aylık toplam tutar (üretime bölünür)</option>
            <option value="perTon"${found.line.basis === "perTon" ? " selected" : ""}>Zaten ${esc(unit)} başına tutar</option>
          </select>
          <div class="mfield-hint">Sonuç, satırdaki para biriminden $ karşılığına çevrilir.</div>
        </div>`,
    });
    if (!res) return;
    found.line.formula = res.formula;
    found.line.basis = res.basis || found.line.basis;
    commit(true);
  }

  async function addSystem() {
    const v = await formModal({
      title: "Yeni sistem",
      intro: "Her sistem kendi üretim tonajı, değişkenleri ve maliyet kalemleriyle ayrı bir sekmedir.",
      fields: [
        { key: "name", label: "Sistem adı", value: "" },
        {
          key: "from", label: "Başlangıç", type: "select", value: "blank",
          options: [{ value: "blank", label: "Boş sistem" }].concat(doc.systems.map((s) => ({ value: s.id, label: `Kopyala: ${s.name}` }))),
        },
      ],
    });
    if (!v || !v.name.trim()) return;
    let created;
    if (v.from === "blank") {
      created = S.blankSystem(v.name.trim());
    } else {
      const src = doc.systems.find((s) => s.id === v.from);
      created = S.sanitize({ systems: [JSON.parse(JSON.stringify(src))] }).systems[0];
      created.id = S.uid("s");
      created.name = v.name.trim();
      created.variables.forEach((x) => (x.id = S.uid("v")));
      created.indicators.forEach((x) => (x.id = S.uid("i")));
      created.categories.forEach((c) => {
        c.id = S.uid("c");
        c.lines.forEach((l) => (l.id = S.uid("l")));
      });
    }
    doc.systems.push(created);
    doc.activeSystemId = created.id;
    commit(true);
  }

  function systemMenu(anchor, id) {
    const s = doc.systems.find((x) => x.id === id);
    menu(anchor, [
      {
        id: "rename", label: "Yeniden adlandır", icon: "pencil", onSelect: async () => {
          const v = await formModal({ title: "Sistemi yeniden adlandır", fields: [{ key: "name", label: "Ad", value: s.name }] });
          if (!v || !v.name.trim()) return;
          s.name = v.name.trim();
          commit(true);
        },
      },
      {
        id: "duplicate", label: "Kopyasını oluştur", icon: "copy", onSelect: () => {
          const copy = JSON.parse(JSON.stringify(s));
          copy.id = S.uid("s");
          copy.name = `${s.name} (kopya)`;
          copy.variables.forEach((x) => (x.id = S.uid("v")));
          copy.indicators.forEach((x) => (x.id = S.uid("i")));
          copy.categories.forEach((c) => {
            c.id = S.uid("c");
            c.lines.forEach((l) => (l.id = S.uid("l")));
          });
          doc.systems.push(copy);
          doc.activeSystemId = copy.id;
          commit(true);
        },
      },
      { sep: true },
      {
        id: "delete", label: "Sistemi sil", icon: "trash", danger: true, onSelect: async () => {
          if (doc.systems.length === 1) return toast("Son sistem silinemez.", true);
          if (!(await confirmModal("Sistemi sil", `"${s.name}" tamamen silinsin mi?`))) return;
          doc.systems = doc.systems.filter((x) => x.id !== id);
          doc.activeSystemId = doc.systems[0].id;
          commit(true);
        },
      },
    ]);
  }

  function requestRates(manual) {
    if (!window.chrome || !window.chrome.webview) {
      if (manual) toast("Kur servisi yalnızca masaüstü uygulamasında çalışır.", true);
      return;
    }
    if (manual) toast("Kurlar alınıyor…");
    window.chrome.webview.postMessage(JSON.stringify({ type: "fetchRates", manual: !!manual }));
  }

  function onHostMessage(event) {
    let msg;
    try { msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
    catch (e) { return; }
    if (!msg) return;

    if (msg.type === "backup") return onBackupResult(msg);
    if (msg.type === "pdf") return window.Report.onPdfResult(msg);
    if (msg.type === "openPath") {
      if (!msg.ok) toast(msg.error || "Klasör açılamadı.", true);
      return;
    }
    if (msg.type !== "rates") return;

    if (!msg.ok) {
      if (msg.manual !== false) toast(msg.error || "Kurlar alınamadı.", true);
      return;
    }
    const usdEl = document.getElementById("rate-usd");
    const eurEl = document.getElementById("rate-eur");
    if (document.activeElement === usdEl || document.activeElement === eurEl) {
      if (msg.manual !== false) toast("Kur alanı düzenleniyor — güncelleme uygulanmadı.", true);
      return;
    }

    doc.rates.usd = msg.usd;
    doc.rates.eur = msg.eur;
    doc.rates.auto = true;
    doc.rates.fetchedAt = msg.date || "";
    doc.rates.source = msg.source || "";
    if (usdEl) usdEl.value = msg.usd;
    if (eurEl) eurEl.value = msg.eur;
    commit(false);
    toast(`Kurlar güncellendi (${msg.source || ""}).`);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    download(`maliyet-yedek-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(doc, null, 2));
    toast("Yedek indirildi.");
  }

  const LAST_BACKUP_KEY = "maliyet-hesaplama:lastAutoBackup";
  const today = () => new Date().toISOString().slice(0, 10);

  function readLastBackup() {
    try { return window.localStorage.getItem(LAST_BACKUP_KEY); } catch (e) { return null; }
  }
  function writeLastBackup(date) {
    try { window.localStorage.setItem(LAST_BACKUP_KEY, date); } catch (e) { }
  }

  function requestBackup(manual) {
    if (!window.chrome || !window.chrome.webview) {
      if (manual) toast("Otomatik yedekleme yalnızca masaüstü uygulamasında çalışır.", true);
      return;
    }
    S.flush();
    window.chrome.webview.postMessage(JSON.stringify({
      type: "backup", manual: !!manual, json: JSON.stringify(doc, null, 2),
    }));
  }

  function onBackupResult(msg) {
    if (!msg.ok) {
      if (msg.manual) toast(msg.error || "Yedek alınamadı.", true);
      return;
    }
    writeLastBackup(msg.date || today());
    if (msg.manual) toast(`Yedek kaydedildi: ${msg.path}`);
  }

  function backupMenu(anchor) {
    menu(anchor, [
      { id: "download", label: "JSON yedeğini indir", icon: "download", onSelect: exportJSON },
      { id: "now", label: "Şimdi otomatik yedek al", icon: "camera", onSelect: () => requestBackup(true) },
      { sep: true },
      {
        id: "folder", label: "Yedek klasörünü aç", icon: "table", onSelect: () => {
          if (!window.chrome || !window.chrome.webview) return toast("Yalnızca masaüstü uygulamasında.", true);
          window.chrome.webview.postMessage(JSON.stringify({ type: "openPath", what: "backups" }));
        },
      },
      { sep: true },
      { id: "restore", label: "Yedekten geri yükle…", icon: "upload", onSelect: () => document.getElementById("file-input").click() },
    ]);
  }

  function exportCSV() {
    const s = sys();
    const unit = s.production.unit;
    const tr = doc.settings.locale === "tr-TR";
    const sep = tr ? ";" : ",";
    const num = (n) => {
      const str = (Number.isFinite(n) ? n : 0).toFixed(doc.settings.decimals);
      return tr ? str.replace(".", ",") : str;
    };
    const raw = (n) => {
      if (n === "" || n === null || n === undefined || !Number.isFinite(Number(n))) return "";
      const str = String(Number(n));
      return tr ? str.replace(".", ",") : str;
    };
    const MODE_LABEL = { rate: "Miktar × Fiyat", lump: "Toplam tutar", perTon: "Ton başına", formula: "Formül" };
    const cell = (v) => {
      const str = String(v ?? "");
      return /["\n;,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [[`${s.name} — maliyet dökümü`], [`${s.production.label}`, num(s.production.value), unit],
      ["USD/TRY", num(doc.rates.usd), "EUR/TRY", num(doc.rates.eur)], []];
    rows.push(["Kategori", "Kalem", "Tür", "Miktar", "Birim Fiyat", "Para Birimi", `$/${unit}`]);

    s.categories.forEach((cat) => {
      const cc = computed.categories.find((x) => x.id === cat.id);
      cat.lines.forEach((line) => {
        const lr = cc.lines.find((x) => x.id === line.id);
        rows.push([
          cat.title, line.name, MODE_LABEL[line.mode] || line.mode,
          line.mode === "rate" ? raw(line.qty) : (line.mode === "formula" ? line.formula : ""),
          line.mode === "formula" ? "" : raw(line.price),
          line.currency, num(lr ? lr.value : 0),
        ]);
      });
      rows.push([cat.title, "TOPLAM", "", "", "", "", num(cc.total)]);
      rows.push([]);
    });
    rows.push(["GENEL TOPLAM", "", "", "", "", "", num(computed.total)]);

    const cmp = comparison();
    if (cmp) {
      rows.push([], [`DEĞİŞİM — ${cmp.period.label} → şimdi`]);
      rows.push(["Kategori", cmp.period.label, "Şimdi", "Fark", "Fark %"]);
      cmp.rows.forEach((r) => rows.push([
        r.title + (r.added ? " (yeni)" : r.removed ? " (kaldırıldı)" : ""),
        num(r.before), num(r.after), num(r.delta),
        r.pct === null ? "" : num(r.pct),
      ]));
      rows.push(["TOPLAM", num(cmp.before), num(cmp.after), num(cmp.delta),
        cmp.pct === null ? "" : num(cmp.pct)]);
    }

    const csv = "﻿" + rows.map((r) => r.map(cell).join(sep)).join("\r\n");
    download(`${s.name.replace(/[^\wğüşöçİĞÜŞÖÇı -]/gi, "")}-maliyet.csv`, csv, "text/csv;charset=utf-8");
    toast("CSV indirildi.");
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.systems) || !parsed.systems.length) {
          throw new Error("format");
        }
        doc = S.sanitize(parsed);
        commit(true);
        toast("Yedek geri yüklendi.");
      } catch (e) {
        toast("Dosya okunamadı ya da biçimi tanınmıyor.", true);
      }
    };
    reader.onerror = () => toast("Dosya okunamadı.", true);
    reader.readAsText(file);
  }

  async function openSettings() {
    const fields = [
      {
        key: "locale", label: "Sayı biçimi", type: "select", value: doc.settings.locale,
        options: [
          { value: "en-US", label: "1,234.567  (İngilizce)" },
          { value: "tr-TR", label: "1.234,567  (Türkçe)" },
        ],
      },
      { key: "decimals", label: "Maliyet ondalık basamağı", type: "number", value: doc.settings.decimals },
    ];

    const v = await formModal({ title: "Ayarlar", fields });
    if (!v) return;
    doc.settings.locale = v.locale;
    doc.settings.decimals = Math.max(0, Math.min(6, Number(v.decimals) || 0));
    commit(true);
  }

  const isNumberInput = (el) => el instanceof HTMLInputElement && el.type === "number";
  const localeDecimal = () => (doc.settings.locale === "tr-TR" ? "," : ".");

  function parsePastedNumber(text) {
    const raw = String(text).split(/[\t\r\n]/)[0].trim();
    if (!raw) return null;
    const negative = raw.startsWith("-") || /^\(.*\)$/.test(raw);

    let s = raw.replace(/\s/g, "").replace(/[^\d.,]/g, "");
    if (!/\d/.test(s)) return null;

    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    let decimal = null;
    if (lastDot !== -1 && lastComma !== -1) {
      decimal = lastDot > lastComma ? "." : ",";
    } else if (lastDot !== -1 || lastComma !== -1) {
      const sep = lastDot !== -1 ? "." : ",";
      const trailing = s.length - Math.max(lastDot, lastComma) - 1;
      const repeated = s.split(sep).length - 1 > 1;
      if (repeated) decimal = null;
      else if (trailing === 3) decimal = localeDecimal() === sep ? sep : null;
      else decimal = sep;
    }

    if (decimal === null) {
      s = s.replace(/[.,]/g, "");
    } else {
      s = s.split(decimal === "." ? "," : ".").join("").replace(decimal, ".");
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  }

  function parsePastedBlock(text) {
    const rows = String(text).replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
    if (rows.length < 2 && !rows[0].includes("\t")) return null;
    const grid = rows.map((row) => row.split("\t").map(parsePastedNumber));
    return grid.some((row) => row.some((v) => v !== null)) ? grid : null;
  }

  function applyPastedBlock(startEl, grid) {
    const startAttr = columnAttrOf(startEl);
    if (startAttr !== "data-lineqty" && startAttr !== "data-lineprice") return false;

    const lineIds = [...document.querySelectorAll("#main [data-line]")].map((el) => el.dataset.line);
    const startRow = lineIds.indexOf(startEl.closest("[data-line]")?.dataset.line);
    if (startRow === -1) return false;

    const fields = startAttr === "data-lineqty" ? ["qty", "price"] : ["price"];
    let written = 0;
    let skipped = 0;

    grid.forEach((cells, r) => {
      const id = lineIds[startRow + r];
      const found = id && findLine(id);
      if (!found) { skipped += cells.filter((v) => v !== null).length; return; }
      cells.forEach((value, c) => {
        const field = fields[c];
        if (value === null) return;
        if (!field) { skipped++; return; }
        if (found.line.mode === "formula") { skipped++; return; }
        if (field === "qty" && found.line.mode !== "rate") { skipped++; return; }
        found.line[field] = value;
        written++;
      });
    });

    if (!written) return false;
    commit(true);
    toast(skipped
      ? `${written} değer yapıştırıldı, ${skipped} tanesi atlandı. Ctrl+Z ile geri alabilirsiniz.`
      : `${written} değer yapıştırıldı. Ctrl+Z ile geri alabilirsiniz.`);
    return true;
  }

  function onPaste(e) {
    if (!isNumberInput(e.target)) return;
    const text = (e.clipboardData || window.clipboardData || {}).getData?.("text");
    if (!text) return;

    const block = parsePastedBlock(text);
    if (block && applyPastedBlock(e.target, block)) {
      e.preventDefault();
      return;
    }

    const n = parsePastedNumber(text);
    if (n === null) return;
    e.preventDefault();
    e.target.value = String(n);
    e.target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function onWheel(e) {
    if (isNumberInput(e.target) && document.activeElement === e.target) e.target.blur();
  }

  const COLUMN_ATTRS = ["data-linename", "data-lineqty", "data-lineprice"];

  function columnAttrOf(el) {
    return COLUMN_ATTRS.find((a) => el.hasAttribute && el.hasAttribute(a)) || null;
  }

  function moveWithinColumn(el, dir) {
    const attr = columnAttrOf(el);
    if (!attr) return false;
    const column = [...document.querySelectorAll(`#main [${attr}]`)];
    const at = column.indexOf(el);
    const next = column[at + dir];
    if (at === -1 || !next) return false;
    next.focus();
    if (next.select) next.select();
    return true;
  }

  function onClick(e) {
    const s = sys();
    const t = (attr) => e.target.closest(`[data-${attr}]`)?.dataset[attr];
    const byId = (id) => document.getElementById(id);

    if (e.target.closest("#btn-add-system")) return addSystem();
    if (e.target.closest("#btn-periods")) return periodsMenu(e.target.closest("#btn-periods"));
    if (e.target.closest("#btn-compare-close")) return setCompare(null);
    if (e.target.closest("#btn-clear-filter")) return setFilter("");
    if (e.target.closest("#btn-undo")) return undo();
    if (e.target.closest("#btn-redo")) return redo();
    if (e.target.closest("#btn-help")) return openHelp();
    if (e.target.closest("#btn-settings")) return openSettings();
    if (e.target.closest("#btn-export")) return backupMenu(e.target.closest("#btn-export"));
    if (e.target.closest("#btn-csv")) return exportCSV();
    if (e.target.closest("#btn-print")) return window.Report.open();
    if (e.target.closest("#btn-rates")) return requestRates(true);
    if (e.target.closest("#btn-edit-production")) return editProduction();
    if (e.target.closest("#btn-add-var")) return addVariable();
    if (e.target.closest("#btn-add-ind")) return addIndicator();
    if (e.target.closest("#btn-add-cat")) return addCategory();

    const sysMenuId = t("sysmenu");
    if (sysMenuId) return systemMenu(e.target.closest("[data-sysmenu]"), sysMenuId);

    const sysId = t("system");
    if (sysId && sysId !== doc.activeSystemId) {
      doc.activeSystemId = sysId;
      return commit(true);
    }

    let id;
    if ((id = t("varedit"))) return editVariable(id);
    if ((id = t("vardel"))) return deleteVariable(id);
    if ((id = t("indedit"))) return editIndicator(id);
    if ((id = t("inddel"))) return deleteIndicator(id);
    if ((id = t("catedit"))) return editCategory(id);
    if ((id = t("catdel"))) return deleteCategory(id);
    if ((id = t("lineformula"))) return editLineFormula(id);

    if ((id = t("catup")) || (id = t("catdown"))) {
      const dir = e.target.closest("[data-catup]") ? -1 : 1;
      const idx = s.categories.findIndex((c) => c.id === id);
      if (moveInArray(s.categories, idx, dir)) commit(true);
      return;
    }
    if ((id = t("lineadd"))) {
      const cat = s.categories.find((c) => c.id === id);
      cat.lines.push(S.L("Yeni kalem", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "₺/kg", currency: "TRY" }));
      open[cat.id] = true;
      return commit(true);
    }
    if ((id = t("linedel"))) {
      const found = findLine(id);
      if (found) found.cat.lines = found.cat.lines.filter((l) => l.id !== id);
      return commit(true);
    }
    if ((id = t("lineup")) || (id = t("linedown"))) {
      const dir = e.target.closest("[data-lineup]") ? -1 : 1;
      const found = findLine(id);
      if (found) {
        const idx = found.cat.lines.findIndex((l) => l.id === id);
        if (moveInArray(found.cat.lines, idx, dir)) commit(true);
      }
      return;
    }
    if ((id = t("cattoggle"))) {
      if (e.target.closest(".cat-actions")) return;
      open[id] = !open[id];
      const body = document.querySelector(`[data-catbody="${id}"]`);
      const chev = e.target.closest(".cat-head").querySelector(".chev");
      if (body) body.style.display = open[id] ? "block" : "none";
      if (chev) chev.classList.toggle("chev--open", open[id]);
      return;
    }
  }

  async function deleteIndicator(id) {
    const s = sys();
    const ind = s.indicators.find((i) => i.id === id);
    if (!ind) return;
    if (!(await confirmModal("Göstergeyi sil", `"${ind.label}" silinsin mi?`))) return;
    s.indicators = s.indicators.filter((i) => i.id !== id);
    commit(true);
  }

  function onInput(e) {
    const s = sys();
    const el = e.target;
    const d = el.dataset;
    const num = (v) => (v === "" ? "" : Number(v));

    if (el.id === "line-filter") return setFilter(el.value);
    if (el.id === "rate-usd") { doc.rates.usd = num(el.value); doc.rates.auto = false; return commit(false, "rate-usd"); }
    if (el.id === "rate-eur") { doc.rates.eur = num(el.value); doc.rates.auto = false; return commit(false, "rate-eur"); }
    if ("production" in d) { s.production.value = num(el.value); return commit(false, "production"); }
    if (d.varval) {
      const v = s.variables.find((x) => x.id === d.varval);
      if (v) v.value = num(el.value);
      return commit(false, `var:${d.varval}`);
    }
    if (d.linename) {
      const f = findLine(d.linename);
      if (f) f.line.name = el.value;
      return commit(false, `name:${d.linename}`);
    }
    if (d.lineqty || d.lineprice) {
      const f = findLine(d.lineqty || d.lineprice);
      if (f) f.line[d.lineqty ? "qty" : "price"] = num(el.value);
      return commit(false, `${d.lineqty ? "qty" : "price"}:${d.lineqty || d.lineprice}`);
    }
  }

  function onChange(e) {
    const d = e.target.dataset;
    if (d.linemode) {
      const f = findLine(d.linemode);
      if (f) {
        f.line.mode = e.target.value;
        if (f.line.mode === "formula" && !f.line.formula) f.line.formula = "0";
      }
      return commit(true);
    }
    if (d.linecur) {
      const f = findLine(d.linecur);
      if (f) f.line.currency = e.target.value;
      return commit(false);
    }
    if (e.target.id === "file-input") {
      const file = e.target.files && e.target.files[0];
      if (file) importJSON(file);
      e.target.value = "";
    }
  }

  window.Report.configure({
    getDoc: () => doc,
    getCompareId: () => compareId,
    comparisonFor,
    fmt,
    fmtLoose,
    signed,
    pctText,
    deltaClass: (n) => deltaClass(n).trim(),
    saveOptions: (options) => {
      doc.settings.report = options;
      commit(false);
    },
  });

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("paste", onPaste);
  document.addEventListener("wheel", onWheel, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") { e.preventDefault(); return openHelp(); }

    const inModal = !!document.querySelector(".modal-backdrop");

    if (!inModal && e.key === "Enter" && !e.ctrlKey && !e.altKey) {
      if (moveWithinColumn(e.target, e.shiftKey ? -1 : 1)) e.preventDefault();
      return;
    }
    if (!inModal && e.key === "Escape" && e.target.id === "line-filter") {
      e.preventDefault();
      return setFilter("");
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

    if (!inModal && e.key.toLowerCase() === "f") {
      e.preventDefault();
      const box = document.getElementById("line-filter");
      if (box) { box.focus(); box.select(); }
      return;
    }
    if (inModal) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", onHostMessage);
  }

  render();

  if (doc.rates.auto) requestRates(false);

  if (readLastBackup() !== today()) requestBackup(false);
})();
