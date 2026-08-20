
(function (global) {
  "use strict";

  const { esc, formModal, toast } = global.UI;
  const S = global.Store;
  const C = global.Charts;

  let ctx = null;
  const configure = (c) => { ctx = c; };

  const SECTIONS = [
    ["ozet", "Özet ve göstergeler"],
    ["grafikler", "Grafikler (pasta ve çubuk)"],
    ["kategori", "Kategori özeti tablosu"],
    ["kalem", "Kalem detayı"],
    ["karsilastirma", "Dönem karşılaştırması"],
    ["varsayimlar", "Varsayımlar ve girdiler"],
  ];
  const DEFAULT_SECTIONS = SECTIONS.map(([k]) => k);

  const MODE_LABEL = {
    rate: "Miktar × Fiyat", lump: "Toplam tutar", perTon: "Ton başına", formula: "Formül",
  };

  let previewOpen = false;

  function savedOptions() {
    const doc = ctx.getDoc();
    const saved = (doc.settings && doc.settings.report) || {};
    const known = doc.systems.map((s) => s.id);
    const systems = (Array.isArray(saved.systems) ? saved.systems : []).filter((id) => known.includes(id));
    return {
      systems: systems.length ? systems : [doc.activeSystemId],
      sections: Array.isArray(saved.sections) && saved.sections.length ? saved.sections : DEFAULT_SECTIONS,
      orientation: saved.orientation === "landscape" ? "landscape" : "portrait",
    };
  }

  async function askOptions() {
    const doc = ctx.getDoc();
    const current = savedOptions();
    const comparing = !!ctx.getCompareId();

    const v = await formModal({
      title: "Rapor",
      intro: "Rapora nelerin gireceğini seçin. Seçiminiz bir sonraki sefere hatırlanır.",
      okLabel: "Önizle",
      fields: [
        {
          key: "systems", label: "Sistemler", type: "checklist", value: current.systems,
          options: doc.systems.map((s) => ({ value: s.id, label: s.name })),
        },
        {
          key: "sections", label: "Bölümler", type: "checklist", value: current.sections,
          options: SECTIONS.map(([k, label]) => ({
            value: k,
            label,
            hint: k === "karsilastirma" && !comparing ? "karşılaştırma açık değil — atlanır" : "",
          })),
        },
        {
          key: "orientation", label: "Sayfa yönü", type: "select", value: current.orientation,
          options: [
            { value: "portrait", label: "Dikey" },
            { value: "landscape", label: "Yatay (geniş tablolar için)" },
          ],
        },
      ],
    });
    if (!v) return null;

    const options = {
      systems: v.systems.length ? v.systems : [doc.activeSystemId],
      sections: v.sections,
      orientation: v.orientation === "landscape" ? "landscape" : "portrait",
    };
    ctx.saveOptions(options);
    return options;
  }

  const has = (options, key) => options.sections.includes(key);

  function stamp() {
    const d = new Date();
    const loc = ctx.getDoc().settings.locale;
    return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
  }

  function coverHTML(system, comp) {
    const doc = ctx.getDoc();
    const r = doc.rates;
    const monthly = comp.total * (Number(system.production.value) || 0);
    return `
      <header class="rp-cover">
        <div>
          <h1 class="rp-title">${esc(system.name)}</h1>
          <div class="rp-subtitle">Maliyet Analizi</div>
        </div>
        <dl class="rp-meta">
          <div><dt>${esc(system.production.label)}</dt>
            <dd>${ctx.fmtLoose(Number(system.production.value) || 0)} ${esc(system.production.unit)}</dd></div>
          <div><dt>Birim maliyet</dt>
            <dd>${ctx.fmt(comp.total)} $/${esc(system.production.unit)}</dd></div>
          <div><dt>Aylık toplam</dt><dd>$${ctx.fmt(monthly, 0)}</dd></div>
          <div><dt>Kurlar</dt>
            <dd>USD ${ctx.fmtLoose(Number(r.usd) || 0, 4)} · EUR ${ctx.fmtLoose(Number(r.eur) || 0, 4)}
              <em>${r.auto && r.fetchedAt ? esc(`${r.source || "otomatik"} · ${r.fetchedAt}`) : "elle girildi"}</em></dd></div>
          <div><dt>Rapor tarihi</dt><dd>${esc(stamp())}</dd></div>
        </dl>
      </header>`;
  }

  function summaryHTML(system, comp) {
    const tiles = system.indicators.map((def, i) => {
      const res = comp.indicators[i];
      return `
        <div class="rp-tile">
          <div class="rp-tile-label">${esc(def.label)}</div>
          <div class="rp-tile-value">${res.error
            ? `<span class="rp-err">${esc(res.error)}</span>`
            : `${esc(ctx.fmt(res.value, Number(def.decimals) || 0))}<small>${esc(def.unit)}</small>`}</div>
        </div>`;
    }).join("");
    if (!tiles) return "";
    return `
      <section class="rp-section">
        <h2>Göstergeler</h2>
        <div class="rp-tiles">${tiles}</div>
      </section>`;
  }

  function rankedRows(comp) {
    return comp.categories
      .filter((c) => Math.abs(c.total) > 0.0005)
      .map((c) => ({ key: c.id, title: c.title, value: c.total }))
      .sort((a, b) => b.value - a.value);
  }

  function chartsHTML(system, comp) {
    const rows = rankedRows(comp);
    if (!rows.length) return "";
    const unit = esc(system.production.unit);
    const money = (v) => `${ctx.fmt(v)} $/${system.production.unit}`;

    const positives = rows.filter((r) => r.value > 0);
    const credits = rows.filter((r) => r.value < 0);
    const shareBase = positives.reduce((sum, r) => sum + r.value, 0);

    const legend = positives.map((r, i) => {
      const pct = shareBase > 0 ? (r.value / shareBase) * 100 : 0;
      return `
        <tr class="rp-legend-row" data-key="${esc(r.key)}">
          <td class="rp-legend-no">${i + 1}</td>
          <td><span class="rp-swatch" style="background:${C.colorAt(i)}"></span>${esc(r.title)}</td>
          <td class="rp-num">${ctx.fmt(r.value)}</td>
          <td class="rp-num">${pct.toFixed(1)}%</td>
        </tr>`;
    }).join("");

    const creditNote = credits.length
      ? `<p class="rp-note">Alacak kalemleri pastada yer almaz — bir bütünün payı olamazlar:
           ${credits.map((c) => `${esc(c.title)} (${ctx.fmt(c.value)})`).join(", ")}.
           Çubuk grafikte ve tablolarda tam olarak yer alırlar.</p>`
      : "";

    return `
      <section class="rp-section rp-section--charts">
        <h2>Maliyet dağılımı</h2>
        <div class="rp-charts">
          <figure class="rp-figure rp-figure--donut">
            ${C.donut(positives, {
              fmt: money,
              centerValue: ctx.fmt(comp.total),
              centerLabel: `$/${system.production.unit}`,
            })}
            <figcaption>Kategori payları — büyükten küçüğe, saat yönünde.</figcaption>
          </figure>
          <div class="rp-legend">
            <table>
              <thead><tr><th></th><th>Kategori</th><th class="rp-num">$/${unit}</th><th class="rp-num">Pay</th></tr></thead>
              <tbody>${legend}</tbody>
            </table>
          </div>
        </div>
        ${creditNote}
        <figure class="rp-figure rp-figure--bars">
          ${C.barsH(rows, { fmt: (v) => ctx.fmt(v), title: "Kategori maliyetleri" })}
          <figcaption>Kategori başına maliyet, $/${unit}. Yeşil çubuklar toplamdan düşen alacaklardır.</figcaption>
        </figure>
      </section>`;
  }

  function categoryTableHTML(system, comp) {
    const production = Number(system.production.value) || 0;
    const rows = comp.categories
      .map((c) => {
        const source = system.categories.find((x) => x.id === c.id);
        return { ...c, lines: source ? source.lines.length : 0 };
      })
      .sort((a, b) => b.total - a.total);

    const body = rows.map((c) => `
      <tr>
        <td>${esc(c.title)}</td>
        <td class="rp-num">${comp.total !== 0 ? ((c.total / comp.total) * 100).toFixed(1) : "0.0"}%</td>
        <td class="rp-num">${ctx.fmt(c.total)}</td>
        <td class="rp-num">${ctx.fmt(c.total * production, 0)}</td>
        <td class="rp-num">${c.lines}</td>
      </tr>`).join("");

    return `
      <section class="rp-section">
        <h2>Kategori özeti</h2>
        <table class="rp-table">
          <thead><tr>
            <th>Kategori</th><th class="rp-num">Pay</th>
            <th class="rp-num">$/${esc(system.production.unit)}</th>
            <th class="rp-num">Aylık tutar ($)</th><th class="rp-num">Kalem</th>
          </tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr>
            <td>TOPLAM</td><td class="rp-num">100.0%</td>
            <td class="rp-num">${ctx.fmt(comp.total)}</td>
            <td class="rp-num">${ctx.fmt(comp.total * production, 0)}</td>
            <td class="rp-num">${system.categories.reduce((sum, c) => sum + c.lines.length, 0)}</td>
          </tr></tfoot>
        </table>
      </section>`;
  }

  function lineDetailHTML(system, comp) {
    const production = Number(system.production.value) || 0;
    const unit = esc(system.production.unit);

    const blocks = system.categories.map((cat) => {
      const cc = comp.categories.find((x) => x.id === cat.id);
      if (!cc) return "";
      const body = cat.lines.map((line) => {
        const lr = cc.lines.find((x) => x.id === line.id) || { value: 0 };
        const qty = line.mode === "rate" ? ctx.fmtLoose(Number(line.qty) || 0)
          : line.mode === "formula" ? `<code>${esc(line.formula)}</code>` : "";
        const price = line.mode === "formula" ? "" : ctx.fmtLoose(Number(line.price) || 0);
        return `
          <tr>
            <td>${esc(line.name)}</td>
            <td class="rp-dim">${esc(MODE_LABEL[line.mode] || line.mode)}</td>
            <td class="rp-num">${qty}${line.qtyUnit ? ` <span class="rp-dim">${esc(line.qtyUnit)}</span>` : ""}</td>
            <td class="rp-num">${price}${line.priceUnit ? ` <span class="rp-dim">${esc(line.priceUnit)}</span>` : ""}</td>
            <td class="rp-dim">${esc(line.currency)}</td>
            <td class="rp-num${lr.value < 0 ? " rp-credit" : ""}">${lr.error ? "hata" : ctx.fmt(lr.value)}</td>
            <td class="rp-num">${lr.error ? "" : ctx.fmt(lr.value * production, 0)}</td>
            <td class="rp-num rp-dim">${comp.total !== 0 && !lr.error
              ? ((lr.value / comp.total) * 100).toFixed(2) + "%" : ""}</td>
          </tr>`;
      }).join("");

      return `
        <table class="rp-table rp-table--lines">
          <thead>
            <tr class="rp-cat-head">
              <th colspan="5">${esc(cat.title)}${cat.note ? ` <span class="rp-dim">— ${esc(cat.note)}</span>` : ""}</th>
              <th class="rp-num">${ctx.fmt(cc.total)}</th>
              <th class="rp-num">${ctx.fmt(cc.total * production, 0)}</th>
              <th class="rp-num">${comp.total !== 0 ? ((cc.total / comp.total) * 100).toFixed(2) : "0.00"}%</th>
            </tr>
            <tr>
              <th>Kalem</th><th>Tür</th><th class="rp-num">Miktar</th><th class="rp-num">Birim fiyat</th>
              <th>Para br.</th><th class="rp-num">$/${unit}</th>
              <th class="rp-num">Aylık ($)</th><th class="rp-num">Pay</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`;
    }).join("");

    return `
      <section class="rp-section">
        <h2>Kalem detayı</h2>
        ${blocks}
      </section>`;
  }

  function comparisonHTML(cmp, system) {
    if (!cmp) return "";
    const unit = esc(system.production.unit);
    const rows = cmp.rows.map((r) => `
      <tr>
        <td>${esc(r.title)}${r.added ? ' <span class="rp-tag">yeni</span>' : ""}${
          r.removed ? ' <span class="rp-tag">kaldırıldı</span>' : ""}</td>
        <td class="rp-num">${ctx.fmt(r.before)}</td>
        <td class="rp-num">${ctx.fmt(r.after)}</td>
        <td class="rp-num ${ctx.deltaClass(r.delta)}">${ctx.signed(r.delta)}</td>
        <td class="rp-num ${ctx.deltaClass(r.delta)}">${ctx.pctText(r.pct)}</td>
      </tr>`).join("");

    const chartRows = cmp.rows
      .map((r) => ({ key: r.title, title: r.title, value: r.delta }))
      .sort((a, b) => b.value - a.value);

    return `
      <section class="rp-section">
        <h2>Dönem karşılaştırması — ${esc(cmp.period.label)} → şimdi</h2>
        <p class="rp-note">Geçmiş dönem kendi kurlarıyla hesaplanır, bugünün kuruyla yeniden
          fiyatlanmaz. Kayıt tarihi: ${esc(cmp.period.savedAt || "—")}.</p>
        <figure class="rp-figure rp-figure--bars">
          ${C.barsDiverging(chartRows, { fmt: (v) => ctx.signed(v), title: "Kategori bazında değişim" })}
          <figcaption>Kategori bazında değişim, $/${unit}. Sağa doğru artış, sola doğru azalış.</figcaption>
        </figure>
        <table class="rp-table">
          <thead><tr>
            <th>Kategori</th><th class="rp-num">${esc(cmp.period.label)}</th>
            <th class="rp-num">Şimdi</th><th class="rp-num">Δ</th><th class="rp-num">Δ%</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td>TOPLAM</td>
            <td class="rp-num">${ctx.fmt(cmp.before)}</td>
            <td class="rp-num">${ctx.fmt(cmp.after)}</td>
            <td class="rp-num ${ctx.deltaClass(cmp.delta)}">${ctx.signed(cmp.delta)}</td>
            <td class="rp-num ${ctx.deltaClass(cmp.delta)}">${ctx.pctText(cmp.pct)}</td>
          </tr></tfoot>
        </table>
      </section>`;
  }

  function assumptionsHTML(system) {
    const doc = ctx.getDoc();
    const vars = system.variables.map((v) => `
      <tr>
        <td>${esc(v.label)}</td>
        <td><code>${esc(v.key)}</code></td>
        <td class="rp-num">${ctx.fmtLoose(Number(v.value) || 0)}</td>
        <td class="rp-dim">${esc(v.unit)}</td>
      </tr>`).join("");

    const indicators = system.indicators.map((i) => `
      <tr><td>${esc(i.label)}</td><td><code>${esc(i.formula)}</code></td><td class="rp-dim">${esc(i.unit)}</td></tr>`).join("");

    const formulaLines = system.categories.flatMap((cat) =>
      cat.lines.filter((l) => l.mode === "formula").map((l) => `
        <tr>
          <td>${esc(cat.title)}</td><td>${esc(l.name)}</td>
          <td><code>${esc(l.formula)}</code></td>
          <td class="rp-dim">${esc(l.currency)} · ${l.basis === "perTon"
            ? `${esc(system.production.unit)} başına` : "aylık toplam"}</td>
        </tr>`)).join("");

    return `
      <section class="rp-section">
        <h2>Varsayımlar ve girdiler</h2>
        <table class="rp-table">
          <thead><tr><th>Girdi</th><th>Formül adı</th><th class="rp-num">Değer</th><th>Birim</th></tr></thead>
          <tbody>
            <tr><td>${esc(system.production.label)}</td><td><code>uretim</code></td>
              <td class="rp-num">${ctx.fmtLoose(Number(system.production.value) || 0)}</td>
              <td class="rp-dim">${esc(system.production.unit)}</td></tr>
            <tr><td>USD / ₺</td><td><code>usd</code></td>
              <td class="rp-num">${ctx.fmtLoose(Number(doc.rates.usd) || 0, 4)}</td><td class="rp-dim">₺</td></tr>
            <tr><td>EUR / ₺</td><td><code>eur</code></td>
              <td class="rp-num">${ctx.fmtLoose(Number(doc.rates.eur) || 0, 4)}</td><td class="rp-dim">₺</td></tr>
            ${vars}
          </tbody>
        </table>
        ${indicators ? `<h3>Gösterge formülleri</h3>
          <table class="rp-table">
            <thead><tr><th>Gösterge</th><th>Formül</th><th>Birim</th></tr></thead>
            <tbody>${indicators}</tbody>
          </table>` : ""}
        ${formulaLines ? `<h3>Formüllü maliyet kalemleri</h3>
          <table class="rp-table">
            <thead><tr><th>Kategori</th><th>Kalem</th><th>Formül</th><th>Sonuç</th></tr></thead>
            <tbody>${formulaLines}</tbody>
          </table>` : ""}
      </section>`;
  }

  function systemReportHTML(system, options, isFirst) {
    const doc = ctx.getDoc();
    const comp = S.computeSystem(system, doc.rates);
    const cmp = has(options, "karsilastirma")
      ? ctx.comparisonFor(system, comp, ctx.getCompareId())
      : null;

    return `
      <article class="rp-doc${isFirst ? "" : " rp-doc--break"}">
        ${coverHTML(system, comp)}
        ${has(options, "ozet") ? summaryHTML(system, comp) : ""}
        ${has(options, "grafikler") ? chartsHTML(system, comp) : ""}
        ${has(options, "kategori") ? categoryTableHTML(system, comp) : ""}
        ${cmp ? comparisonHTML(cmp, system) : ""}
        ${has(options, "kalem") ? lineDetailHTML(system, comp) : ""}
        ${has(options, "varsayimlar") ? assumptionsHTML(system) : ""}
      </article>`;
  }

  function build(options) {
    const doc = ctx.getDoc();
    const chosen = doc.systems.filter((s) => options.systems.includes(s.id));
    const systems = chosen.length ? chosen : [doc.systems[0]];
    const host = document.getElementById("report");
    host.innerHTML = systems.map((s, i) => systemReportHTML(s, options, i === 0)).join("");
    setPageOrientation(options.orientation);
  }

  function teardown() {
    const host = document.getElementById("report");
    if (host) host.innerHTML = "";
  }

  function setPageOrientation(orientation) {
    let style = document.getElementById("page-rule");
    if (!style) {
      style = document.createElement("style");
      style.id = "page-rule";
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: A4 ${orientation === "landscape" ? "landscape" : "portrait"}; margin: 12mm 10mm; }`;
  }

  let tip = null;

  function onPointerMove(e) {
    const host = document.getElementById("report");
    if (!host || !host.innerHTML) return;
    const mark = e.target.closest ? e.target.closest("#report [data-key]") : null;
    if (!mark) return clearHot();

    const key = mark.dataset.key;
    host.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
    host.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach((el) => el.classList.add("is-hot"));
    host.classList.add("has-hot");

    const title = mark.querySelector(":scope > title");
    if (!title) return hideTip();

    if (!tip) {
      tip = document.createElement("div");
      tip.className = "rp-tip";
      document.body.appendChild(tip);
    }
    tip.textContent = title.textContent;
    tip.style.display = "block";
    const pad = 14;
    const x = Math.min(e.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - pad)}px`;
  }

  function hideTip() {
    if (tip) tip.style.display = "none";
  }

  function clearHot() {
    hideTip();
    const host = document.getElementById("report");
    if (!host) return;
    host.classList.remove("has-hot");
    host.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
  }

  function barHTML() {
    return `
      <div class="rp-bar">
        <span class="rp-bar-title">Rapor önizleme</span>
        <span class="rp-bar-note">Pasta diliminin üzerine gelin — kategori adı görünür.</span>
        <span class="spacer"></span>
        <button class="btn" data-rp="print">${global.UI.icon("printer")} Yazdır</button>
        <button class="btn btn--primary" data-rp="pdf">${global.UI.icon("download")} PDF olarak kaydet</button>
        <button class="btn" data-rp="close">${global.UI.icon("close")} Kapat</button>
      </div>`;
  }

  async function open() {
    const options = await askOptions();
    if (!options) return;
    build(options);
    const host = document.getElementById("report");
    host.insertAdjacentHTML("afterbegin", barHTML());
    previewOpen = true;
    document.body.classList.add("previewing");
    window.scrollTo(0, 0);
  }

  function close() {
    previewOpen = false;
    document.body.classList.remove("previewing");
    clearHot();
    teardown();
  }

  function print() {
    if (!previewOpen) build(savedOptions());
    global.print();
  }

  function savePdf() {
    if (!previewOpen) build(savedOptions());
    const options = savedOptions();
    const doc = ctx.getDoc();
    const first = doc.systems.find((s) => options.systems.includes(s.id)) || doc.systems[0];
    if (!global.chrome || !global.chrome.webview) {
      toast("PDF kaydetme yalnızca masaüstü uygulamasında çalışır.", true);
      if (!previewOpen) teardown();
      return;
    }
    toast("PDF hazırlanıyor…");
    global.chrome.webview.postMessage(JSON.stringify({
      type: "savePdf",
      orientation: options.orientation,
      name: first ? first.name : "rapor",
    }));
  }

  function onPdfResult(msg) {
    if (!previewOpen) teardown();
    if (!msg.ok) return toast(msg.error || "PDF kaydedilemedi.", true);
    toast(`PDF kaydedildi: ${msg.path}`);
  }

  global.addEventListener("beforeprint", () => {
    if (!previewOpen && !document.getElementById("report").innerHTML) build(savedOptions());
  });
  global.addEventListener("afterprint", () => {
    if (!previewOpen) teardown();
  });
  document.addEventListener("mousemove", onPointerMove);

  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-rp]");
    if (!act) return;
    if (act.dataset.rp === "print") return print();
    if (act.dataset.rp === "pdf") return savePdf();
    if (act.dataset.rp === "close") return close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && previewOpen && !document.querySelector(".modal-backdrop")) close();
  });

  global.Report = { configure, open, close, print, savePdf, onPdfResult, build, teardown, SECTIONS, savedOptions };
})(window);
