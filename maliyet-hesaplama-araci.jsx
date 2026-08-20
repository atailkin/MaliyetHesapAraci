import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Factory,
  Plus,
  Trash2,
  RotateCcw,
  Settings2,
  Download,
  Upload,
  CheckCircle2,
} from "lucide-react";

/* ============================== helpers ============================== */

const CUR_SYMBOL = { TRY: "\u20ba", USD: "$", EUR: "\u20ac" };
const uid = (() => {
  let n = 0;
  return (p) => `${p}-${++n}-${Math.random().toString(36).slice(2, 7)}`;
})();

/* ---- local persistence (this file is meant to be hosted on your own site,
   so plain localStorage — not the Claude.ai artifact sandbox — is what
   actually persists data between visits) ---- */
const STORAGE_PREFIX = "maliyet-hesaplama:";
const STORAGE_KEYS = [
  "activeTab",
  "dokum.categories",
  "dokum.params",
  "dokum.kpi",
  "hadde.categories",
  "hadde.params",
  "hadde.billet",
];

function hasLS() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function loadLS(key, fallback) {
  if (hasLS()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (raw != null) return JSON.parse(raw);
    } catch (e) {
      /* corrupt entry — fall through to default */
    }
  }
  return typeof fallback === "function" ? fallback() : fallback;
}

function saveLS(key, value) {
  if (!hasLS()) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    /* storage full / disabled — silently skip, in-memory state still works */
  }
}

function exportAllData() {
  const bundle = {};
  STORAGE_KEYS.forEach((k) => {
    const v = loadLS(k, null);
    if (v !== null) bundle[k] = v;
  });
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maliyet-hesaplama-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importAllData(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bundle = JSON.parse(String(reader.result));
      Object.entries(bundle).forEach(([k, v]) => {
        if (STORAGE_KEYS.includes(k)) saveLS(k, v);
      });
      onDone(true);
    } catch (e) {
      onDone(false);
    }
  };
  reader.onerror = () => onDone(false);
  reader.readAsText(file);
}

function toUSD(amount, currency, usdRate, eurRate) {
  if (currency === "USD") return amount;
  if (currency === "TRY") return amount / (usdRate || 1);
  if (currency === "EUR") return amount * ((eurRate || 0) / (usdRate || 1));
  return amount;
}

function lineCostPerMT(line, ctx) {
  const price = Number(line.price) || 0;
  if (line.mode === "perTon") {
    return toUSD(price, line.currency, ctx.usdRate, ctx.eurRate);
  }
  const qty = line.mode === "lump" ? 1 : Number(line.qty) || 0;
  const totalUSD = toUSD(qty * price, line.currency, ctx.usdRate, ctx.eurRate);
  return ctx.production > 0 ? totalUSD / ctx.production : 0;
}

function categoryTotal(category, ctx) {
  return category.lines.reduce((s, l) => s + lineCostPerMT(l, ctx), 0);
}

function reorderLine(categories, catId, lineId, dir) {
  return categories.map((c) => {
    if (c.id !== catId) return c;
    const idx = c.lines.findIndex((l) => l.id === lineId);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= c.lines.length) return c;
    const lines = [...c.lines];
    [lines[idx], lines[newIdx]] = [lines[newIdx], lines[idx]];
    return { ...c, lines };
  });
}

const fmt = (n, d = 3) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const fmt0 = (n) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-US");

/* ============================== default data: DÖKÜM (melt shop) ============================== */

function makeLine(name, mode, extra) {
  return {
    id: uid("l"),
    name,
    mode, // 'rate' | 'lump' | 'perTon'
    qty: extra?.qty ?? null,
    qtyUnit: extra?.qtyUnit ?? "",
    price: extra?.price ?? 0,
    priceUnit: extra?.priceUnit ?? "",
    currency: extra?.currency ?? "TRY",
  };
}

function initialDokumCategories() {
  return [
    {
      id: uid("c"),
      title: "Enerji",
      note: "Elektrik faturaları",
      lines: [
        makeLine("EAO-PO Enerjisi", "rate", { qty: 16965414, qtyUnit: "kWh", price: 3.110639, priceUnit: "/kWh", currency: "TRY" }),
        makeLine("Servis Enerjisi", "rate", { qty: 2412166, qtyUnit: "kWh", price: 4.037177, priceUnit: "/kWh", currency: "TRY" }),
        makeLine("Sistem Kullanım Bedeli", "lump", { price: 3509420.81, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Elektrod",
      lines: [
        makeLine("EAO Elektrod", "rate", { qty: 46899, qtyUnit: "kg", price: 9.65, priceUnit: "/kg", currency: "USD" }),
        makeLine("PO Elektrod", "rate", { qty: 13165, qtyUnit: "kg", price: 2.269115, priceUnit: "/kg", currency: "USD" }),
      ],
    },
    {
      id: uid("c"),
      title: "Karbon",
      lines: [
        makeLine("Şarj Karbon", "rate", { qty: 473120, qtyUnit: "kg", price: 0.235, priceUnit: "/kg", currency: "USD" }),
        makeLine("Toz Karbon", "rate", { qty: 242300, qtyUnit: "kg", price: 0.235, priceUnit: "/kg", currency: "USD" }),
        makeLine("Granüle Karbon", "rate", { qty: 50500, qtyUnit: "kg", price: 0.255, priceUnit: "/kg", currency: "USD" }),
      ],
    },
    {
      id: uid("c"),
      title: "Kireç",
      note: "Tedarikçi bazlı — istediğiniz kadar satır ekleyin",
      lines: [
        makeLine("Parça Kireç — Tedarikçi 1", "rate", { qty: 735450, qtyUnit: "kg", price: 3.395, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Parça Kireç — Tedarikçi 2", "rate", { qty: 265300, qtyUnit: "kg", price: 3.564961, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Parça Kireç — Tedarikçi 3", "rate", { qty: 219120, qtyUnit: "kg", price: 3.2, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Parça Kireç — Tedarikçi 4", "rate", { qty: 239420, qtyUnit: "kg", price: 3.1, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Granüle Kireç — Tedarikçi 1", "rate", { qty: 76160, qtyUnit: "kg", price: 3.637596, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Granüle Kireç — Tedarikçi 2", "rate", { qty: 51020, qtyUnit: "kg", price: 3.65, priceUnit: "/kg", currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Doğalgaz",
      note: "Pota ısıtma + EAO tüketimi birlikte",
      lines: [
        makeLine("Doğalgaz Tüketimi", "rate", { qty: 463822, qtyUnit: "Sm³", price: 15.334713, priceUnit: "/Sm³", currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Alyaj",
      lines: [
        makeLine("FeSiMn 71", "rate", { qty: 347300, qtyUnit: "kg", price: 1.1058, priceUnit: "/kg", currency: "USD" }),
        makeLine("FeSi 75", "rate", { qty: 104860, qtyUnit: "kg", price: 1.09515, priceUnit: "/kg", currency: "USD" }),
        makeLine("Fluspat", "rate", { qty: 19320, qtyUnit: "kg", price: 0.525, priceUnit: "/kg", currency: "EUR" }),
        makeLine("Surepo", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "/kg", currency: "USD" }),
        makeLine("Citole", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "/kg", currency: "USD" }),
      ],
    },
    {
      id: uid("c"),
      title: "Örtü Tozları",
      lines: [
        makeLine("Tandiş (Unitoz tcp)", "rate", { qty: 10920, qtyUnit: "kg", price: 0.21, priceUnit: "/kg", currency: "EUR" }),
        makeLine("Pota — Yuber", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "/kg", currency: "EUR" }),
      ],
    },
    {
      id: uid("c"),
      title: "Termokupl / Ölçüm",
      lines: [
        makeLine("900mm IMM Sampler", "rate", { qty: 1918, qtyUnit: "adet", price: 1.4, priceUnit: "/adet", currency: "EUR" }),
        makeLine("600mm Termokupl", "rate", { qty: 1170, qtyUnit: "adet", price: 0.85, priceUnit: "/adet", currency: "EUR" }),
        makeLine("1500mm Termokupl", "rate", { qty: 1735, qtyUnit: "adet", price: 1.02, priceUnit: "/adet", currency: "EUR" }),
        makeLine("1700mm Termokupl", "rate", { qty: 0, qtyUnit: "adet", price: 1.07, priceUnit: "/adet", currency: "EUR" }),
        makeLine("TOX Oksijen Probu 1500mm", "rate", { qty: 180, qtyUnit: "adet", price: 9.65, priceUnit: "/adet", currency: "EUR" }),
        makeLine("TOX Oksijen Probu 1700mm", "rate", { qty: 354, qtyUnit: "adet", price: 9.24, priceUnit: "/adet", currency: "EUR" }),
        makeLine("Ölçüm Aparatları vb.", "lump", { price: 15509.7, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Refrakter",
      note: "Doğrudan $/MT olarak girilir (döküm/çanak, döküm/pota vb. oranlarından türetilir)",
      lines: [
        makeLine("EAO Refrakter", "perTon", { price: 2.1, priceUnit: "/MT", currency: "USD" }),
        makeLine("Potalar", "perTon", { price: 2.39, priceUnit: "/MT", currency: "USD" }),
        makeLine("Yürek", "perTon", { price: 0.14, priceUnit: "/MT", currency: "USD" }),
        makeLine("Tandiş", "perTon", { price: 1.63, priceUnit: "/MT", currency: "USD" }),
      ],
    },
    {
      id: uid("c"),
      title: "İşletme Malzemeleri",
      lines: [
        makeLine("Bakır Kalıp 150mm sq", "rate", { qty: 4, qtyUnit: "adet", price: 1470, priceUnit: "/adet", currency: "USD" }),
        makeLine("Bakır Kalıp 130mm sq", "rate", { qty: 8, qtyUnit: "adet", price: 1455, priceUnit: "/adet", currency: "USD" }),
        makeLine("Tamirli Kalıp 150mm", "rate", { qty: 0, qtyUnit: "adet", price: 0, priceUnit: "/adet", currency: "USD" }),
        makeLine("Ca-Si Tel", "rate", { qty: 8770, qtyUnit: "kg", price: 2.47, priceUnit: "/kg", currency: "USD" }),
        makeLine("Al Külçe", "rate", { qty: 8500, qtyUnit: "kg", price: 2.7, priceUnit: "/kg", currency: "EUR" }),
        makeLine("Granül Alüminyum", "rate", { qty: 0, qtyUnit: "kg", price: 3.4, priceUnit: "/kg", currency: "USD" }),
        makeLine("Oksijen Boruları 1\"", "rate", { qty: 822, qtyUnit: "m", price: 76.8, priceUnit: "/m", currency: "TRY" }),
        makeLine("Oksijen Boruları 1/2\"", "rate", { qty: 651, qtyUnit: "m", price: 36.58, priceUnit: "/m", currency: "TRY" }),
        makeLine("Oksijen Borusu 10mm", "rate", { qty: 0, qtyUnit: "m", price: 14.3, priceUnit: "/m", currency: "TRY" }),
        makeLine("Oksijen Borusu 6mm", "rate", { qty: 0, qtyUnit: "m", price: 15.4859, priceUnit: "/m", currency: "TRY" }),
        makeLine("Kalıp Yağı", "rate", { qty: 1313, qtyUnit: "kg", price: 69.5, priceUnit: "/kg", currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Gazlar",
      lines: [
        makeLine("Oksijen — Tedarikçi 1", "rate", { qty: 2043540, qtyUnit: "kg", price: 4.92265, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Oksijen — Tedarikçi 2", "rate", { qty: 218260, qtyUnit: "kg", price: 5.7086, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Argon", "rate", { qty: 238440, qtyUnit: "kg", price: 46.1763, priceUnit: "/kg", currency: "TRY" }),
        makeLine("Azot", "rate", { qty: 16200, qtyUnit: "kg", price: 9.4192, priceUnit: "/kg", currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Personel Maliyeti",
      lines: [
        makeLine("Çebitaş Personel", "lump", { price: 18496389.8, currency: "TRY" }),
        makeLine("Saner Personel", "lump", { price: 4372085.04, currency: "TRY" }),
        makeLine("Servis", "lump", { price: 1837082.28, currency: "TRY" }),
        makeLine("Yemek", "lump", { price: 1002442.06, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Bakım Giderleri",
      lines: [
        makeLine("Elektrik Bakım", "lump", { price: 680193.65, currency: "TRY" }),
        makeLine("Mekanik Bakım", "lump", { price: 1472484.5, currency: "TRY" }),
        makeLine("Su Tesisleri", "lump", { price: 2579052.15, currency: "TRY" }),
        makeLine("Oksijen Tesisleri", "lump", { price: 10645.19, currency: "TRY" }),
        makeLine("İşletme Sarf", "lump", { price: 514601.31, currency: "TRY" }),
        makeLine("Teknik Emniyet", "lump", { price: 349790.26, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "İş Makinaları",
      lines: [makeLine("İş Makinaları", "lump", { price: 1707677.15, currency: "TRY" })],
    },
    {
      id: uid("c"),
      title: "Taşeronlar",
      lines: [
        makeLine("İnşaat İşleri", "lump", { price: 322990, currency: "TRY" }),
        makeLine("Hurda ve Malzeme Transfer", "lump", { price: 2930256, currency: "TRY" }),
        makeLine("Hurda Kesim / Çelik Ayıklama", "lump", { price: 92050, currency: "TRY" }),
        makeLine("Çelik Konstrüksiyon Boru ve İmalat", "lump", { price: 0, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Laboratuvar ve Sosyal Tesisler",
      lines: [
        makeLine("Laboratuvar", "lump", { price: 107176.54, currency: "TRY" }),
        makeLine("Sosyal Tesisler", "lump", { price: 213627.51, currency: "TRY" }),
        makeLine("Sosyal Tesisler — Doğalgaz", "lump", { price: 272777.32, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Cüruf Nakliyesi",
      lines: [makeLine("Cüruf Nakliyesi", "rate", { qty: 5658.8, qtyUnit: "ton", price: 120, priceUnit: "/ton", currency: "TRY" })],
    },
  ];
}

/* ============================== default data: HADDEHANE (rolling mill) ============================== */

function initialHaddeCategories() {
  return [
    {
      id: uid("c"),
      title: "Enerji",
      lines: [makeLine("Enerji Kullanımı", "rate", { qty: 2487314, qtyUnit: "kWh", price: 4.037177, priceUnit: "/kWh", currency: "TRY" })],
    },
    {
      id: uid("c"),
      title: "Doğalgaz",
      lines: [makeLine("Doğalgaz Tüketimi", "rate", { qty: 922755, qtyUnit: "Sm³", price: 15.334713, priceUnit: "/Sm³", currency: "TRY" })],
    },
    {
      id: uid("c"),
      title: "İşletme ve Bakım",
      lines: [
        makeLine("İşletme", "lump", { price: 1086287.35, currency: "TRY" }),
        makeLine("Mekanik Bakım", "lump", { price: 2990970.97, currency: "TRY" }),
        makeLine("Elektrik Bakım", "lump", { price: 665462.68, currency: "TRY" }),
        makeLine("Sarf", "lump", { price: 155451.38, currency: "TRY" }),
        makeLine("Teknik Emniyet", "lump", { price: 313522.21, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Personel Maliyeti",
      lines: [
        makeLine("Çebitaş Personel", "lump", { price: 11666594.08, currency: "TRY" }),
        makeLine("Saner Personel", "lump", { price: 3478297.72, currency: "TRY" }),
        makeLine("Servis", "lump", { price: 1378195.39, currency: "TRY" }),
        makeLine("Yemek", "lump", { price: 752040.91, currency: "TRY" }),
      ],
    },
    {
      id: uid("c"),
      title: "Darphane",
      note: "Etiket ve boya — doğrudan $/MT",
      lines: [
        makeLine("Etiket", "perTon", { price: 42.73, priceUnit: "/MT", currency: "TRY" }),
        makeLine("Boya (1MT / 3.16gr)", "perTon", { price: 24.788, priceUnit: "/MT", currency: "TRY" }),
      ],
    },
  ];
}

function initialBillet() {
  return {
    kutukTuketim: 24404.697,
    kutukFiyati: 538,
    hurdaFiyati: 349,
    tufalFiyati: 48,
    ucBasHurdaPct: 1.44,
    lokumPct: 0.68,
    kisaParcaPct: 1,
    tufalPct: 1,
  };
}

function extraKutukNet(billet, production) {
  const kt = Number(billet.kutukTuketim) || 0;
  const extraBillet = kt - production;
  const extraCostUSD = extraBillet * (Number(billet.kutukFiyati) || 0);
  const extraPerMT = kt > 0 ? extraCostUSD / kt : 0;

  const fireUcBas = (kt / 100) * (Number(billet.ucBasHurdaPct) || 0) * (Number(billet.hurdaFiyati) || 0);
  const fireLokum = (kt / 100) * (Number(billet.lokumPct) || 0) * (Number(billet.hurdaFiyati) || 0);
  const fireKisaParca = (kt / 100) * (Number(billet.kisaParcaPct) || 0) * (Number(billet.hurdaFiyati) || 0);
  const fireTufal = (kt / 100) * (Number(billet.tufalPct) || 0) * (Number(billet.tufalFiyati) || 0);
  const fireTotalUSD = fireUcBas + fireLokum + fireKisaParca + fireTufal;
  const firePerMT = production > 0 ? fireTotalUSD / production : 0;

  const verim = kt > 0 ? (production / kt) * 100 : 0;

  return {
    extraBillet,
    extraPerMT,
    firePerMT,
    netPerMT: extraPerMT - firePerMT,
    verim,
    detail: [
      { name: "Uç Baş - Hurda", pct: billet.ucBasHurdaPct, usd: fireUcBas, perMT: production > 0 ? fireUcBas / production : 0 },
      { name: "Lokum", pct: billet.lokumPct, usd: fireLokum, perMT: production > 0 ? fireLokum / production : 0 },
      { name: "Kısa Parça", pct: billet.kisaParcaPct, usd: fireKisaParca, perMT: production > 0 ? fireKisaParca / production : 0 },
      { name: "Tufal", pct: billet.tufalPct, usd: fireTufal, perMT: production > 0 ? fireTufal / production : 0 },
    ],
  };
}

/* ============================== small UI atoms ============================== */

function NumField({ value, onChange, className = "", placeholder, step = "any" }) {
  return (
    <input
      type="number"
      step={step}
      value={value === null || value === undefined ? "" : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={`num-field ${className}`}
    />
  );
}

function CurrencySelect({ value, onChange }) {
  return (
    <select className="cur-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {["TRY", "USD", "EUR"].map((c) => (
        <option key={c} value={c}>
          {CUR_SYMBOL[c]} {c}
        </option>
      ))}
    </select>
  );
}

/* ============================== line item row ============================== */

function LineRow({ line, ctx, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, accent }) {
  const perMT = lineCostPerMT(line, ctx);
  return (
    <div className="line-row">
      <input
        className="line-name"
        value={line.name}
        onChange={(e) => onChange({ ...line, name: e.target.value })}
      />

      {line.mode === "rate" && (
        <>
          <div className="field-group">
            <NumField value={line.qty} onChange={(v) => onChange({ ...line, qty: v })} />
            <span className="unit-tag">{line.qtyUnit}</span>
          </div>
          <div className="field-group">
            <NumField value={line.price} onChange={(v) => onChange({ ...line, price: v })} />
            <span className="unit-tag">{line.priceUnit}</span>
          </div>
          <CurrencySelect value={line.currency} onChange={(v) => onChange({ ...line, currency: v })} />
        </>
      )}

      {line.mode === "lump" && (
        <>
          <div className="field-group field-group--wide">
            <NumField value={line.price} onChange={(v) => onChange({ ...line, price: v })} />
            <span className="unit-tag">tutar</span>
          </div>
          <CurrencySelect value={line.currency} onChange={(v) => onChange({ ...line, currency: v })} />
        </>
      )}

      {line.mode === "perTon" && (
        <>
          <div className="field-group field-group--wide">
            <NumField value={line.price} onChange={(v) => onChange({ ...line, price: v })} />
            <span className="unit-tag">/MT</span>
          </div>
          <CurrencySelect value={line.currency} onChange={(v) => onChange({ ...line, currency: v })} />
        </>
      )}

      <div className="line-result" style={{ color: accent }}>
        {fmt(perMT, 3)}
        <span className="line-result-unit">$/MT</span>
      </div>

      <div className="line-actions">
        <button
          className="icon-btn icon-btn--small"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Yukarı taşı"
        >
          <ChevronUp size={13} />
        </button>
        <button
          className="icon-btn icon-btn--small"
          onClick={onMoveDown}
          disabled={isLast}
          title="Aşağı taşı"
        >
          <ChevronDown size={13} />
        </button>
        <button className="icon-btn" onClick={onRemove} title="Satırı sil">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/* ============================== category card ============================== */

function CategoryCard({ category, ctx, accent, onUpdateLine, onAddLine, onRemoveLine, onMoveLine, onRemoveCategory, open, onToggle, grandTotal }) {
  const total = categoryTotal(category, ctx);
  const share = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

  return (
    <div className="cat-card">
      <button className="cat-header" onClick={onToggle}>
        <ChevronDown size={16} className={`chev ${open ? "chev--open" : ""}`} />
        <span className="cat-title">{category.title}</span>
        {category.note && <span className="cat-note">{category.note}</span>}
        <span className="cat-spacer" />
        <span className="cat-share">{share.toFixed(1)}%</span>
        <span className="cat-total" style={{ color: accent }}>
          {fmt(total, 3)} <small>$/MT</small>
        </span>
      </button>

      {open && (
        <div className="cat-body">
          <div className="line-row line-row--head">
            <span>Kalem</span>
            <span>Tüketim</span>
            <span>Birim Fiyat</span>
            <span>Para Birimi</span>
            <span>$/MT</span>
            <span />
          </div>
          {category.lines.map((line, idx) => (
            <LineRow
              key={line.id}
              line={line}
              ctx={ctx}
              accent={accent}
              isFirst={idx === 0}
              isLast={idx === category.lines.length - 1}
              onChange={(next) => onUpdateLine(category.id, line.id, next)}
              onRemove={() => onRemoveLine(category.id, line.id)}
              onMoveUp={() => onMoveLine(category.id, line.id, -1)}
              onMoveDown={() => onMoveLine(category.id, line.id, 1)}
            />
          ))}
          <div className="cat-actions">
            <button className="ghost-btn" onClick={() => onAddLine(category.id)}>
              <Plus size={13} /> Kalem ekle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== summary / charts ============================== */

const PALETTE = [
  "#ff8a3d", "#ffb069", "#48c9d0", "#7fe0e5", "#e0c15c",
  "#8b9dc3", "#c98bd8", "#6fcf97", "#e07a7a", "#a3a8b0",
  "#f2994a", "#56ccf2", "#bb6bd9", "#9be564", "#f2c94c",
  "#4f8cc9", "#d97757", "#6ee7d0",
];

function SummaryPanel({ rows, total, accent, extraSection }) {
  const chartData = [...rows]
    .filter((r) => r.value > 0.0005)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, fill: PALETTE[i % PALETTE.length] }));

  return (
    <div className="summary-panel">
      <div className="summary-readout">
        <div className="readout-label">TOPLAM MALİYET</div>
        <div className="readout-value" style={{ textShadow: `0 0 24px ${accent}55` }}>
          {fmt(total, 3)} <span className="readout-unit">$/MT</span>
        </div>
        <div className="load-bar">
          {chartData.map((r) => (
            <div
              key={r.name}
              className="load-seg"
              style={{ width: `${(r.value / total) * 100}%`, background: r.fill }}
              title={`${r.name}: ${fmt(r.value, 3)} $/MT`}
            />
          ))}
        </div>
      </div>

      {extraSection}

      <div className="chart-block">
        <div className="chart-title">Kategori Kırılımı</div>
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3038" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#8b8f98", fontSize: 11 }} stroke="#2c3038" />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fill: "#c9c6c0", fontSize: 11 }}
              stroke="#2c3038"
            />
            <Tooltip
              formatter={(v) => [`${fmt(v, 3)} $/MT`, "Maliyet"]}
              contentStyle={{ background: "#1b1e24", border: "1px solid #2c3038", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "#eae7e0" }}
              itemStyle={{ color: "#eae7e0" }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <div className="chart-title">Pay Dağılımı</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={1}
              stroke="#14161a"
              strokeWidth={2}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${fmt(v, 3)} $/MT (${((v / total) * 100).toFixed(1)}%)`, n]}
              contentStyle={{ background: "#1b1e24", border: "1px solid #2c3038", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "#eae7e0" }}
              itemStyle={{ color: "#eae7e0" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="rank-table">
        {chartData.map((r) => (
          <div key={r.name} className="rank-row">
            <span className="rank-dot" style={{ background: r.fill }} />
            <span className="rank-name">{r.name}</span>
            <span className="rank-pct">{((r.value / total) * 100).toFixed(1)}%</span>
            <span className="rank-val">{fmt(r.value, 3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== general params bar ============================== */

function ParamField({ label, value, onChange, unit, wide }) {
  return (
    <label className={`param-field ${wide ? "param-field--wide" : ""}`}>
      <span className="param-label">{label}</span>
      <div className="param-input-wrap">
        <NumField value={value} onChange={onChange} />
        {unit && <span className="param-unit">{unit}</span>}
      </div>
    </label>
  );
}

function KpiTile({ label, value, unit, decimals = 2 }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-tile-label">{label}</span>
      <span className="kpi-tile-value">
        {fmt(value, decimals)} <small>{unit}</small>
      </span>
    </div>
  );
}

/* ============================== operational KPI card (Döküm) ============================== */

function OperationalKpiCard({ kpi, onChange, production, curuf, elektrikKirli, elektrikCurrency }) {
  const calismaSaatiAy = (Number(kpi.aylikDokumAdedi) || 0) * (Number(kpi.ttt) || 0) / 60;
  const calismaSaatiGun = Number(kpi.calisilanGun) > 0 ? calismaSaatiAy / Number(kpi.calisilanGun) : 0;
  const dokumAgirligi = Number(kpi.aylikDokumAdedi) > 0 ? production / Number(kpi.aylikDokumAdedi) : 0;
  const gunlukDokumAdedi = Number(kpi.calisilanGun) > 0 ? Number(kpi.aylikDokumAdedi) / Number(kpi.calisilanGun) : 0;

  return (
    <div className="cat-card">
      <div className="cat-header cat-header--static">
        <span className="cat-title">Operasyonel Göstergeler</span>
        <span className="cat-note">rapor için — maliyete dahil değil</span>
      </div>
      <div className="cat-body cat-body--kpi">
        <div className="params-fields">
          <ParamField label="TTT (çevrim süresi)" value={kpi.ttt} unit="dk." onChange={(v) => onChange({ ...kpi, ttt: v })} />
          <ParamField label="Çalışılan Gün Sayısı" value={kpi.calisilanGun} unit="gün" onChange={(v) => onChange({ ...kpi, calisilanGun: v })} />
          <ParamField label="Aylık Döküm Adedi" value={kpi.aylikDokumAdedi} unit="adet" onChange={(v) => onChange({ ...kpi, aylikDokumAdedi: v })} />
        </div>
        <div className="kpi-grid">
          <KpiTile label="Çalışma Saati / Gün" value={calismaSaatiGun} unit="s" />
          <KpiTile label="Toplam Çalışma Saati / Ay" value={calismaSaatiAy} unit="s" decimals={1} />
          <KpiTile label="Döküm Ağırlığı" value={dokumAgirligi} unit="MT" />
          <KpiTile label="Günlük Döküm Adedi" value={gunlukDokumAdedi} unit="adet" />
          <KpiTile label="Aylık Tonaj" value={production} unit="MT" decimals={1} />
          <KpiTile label="Cüruf" value={curuf} unit="MT" decimals={1} />
          <KpiTile label="Elektrik - Kirli" value={elektrikKirli} unit={`${elektrikCurrency}/kWh`} decimals={4} />
        </div>
      </div>
    </div>
  );
}

/* ============================== DÖKÜM calculator ============================== */

function DokumCalculator({ accent }) {
  const [categories, setCategories] = useState(() => loadLS("dokum.categories", initialDokumCategories));
  const [params, setParams] = useState(() => loadLS("dokum.params", { usdRate: 43.3414, eurRate: 51.699, production: 32837.926 }));
  const [kpi, setKpi] = useState(() => loadLS("dokum.kpi", { ttt: 63, calisilanGun: 23, aylikDokumAdedi: 430 }));
  const [openMap, setOpenMap] = useState({});

  useEffect(() => { saveLS("dokum.categories", categories); }, [categories]);
  useEffect(() => { saveLS("dokum.params", params); }, [params]);
  useEffect(() => { saveLS("dokum.kpi", kpi); }, [kpi]);

  const ctx = { usdRate: Number(params.usdRate) || 0, eurRate: Number(params.eurRate) || 0, production: Number(params.production) || 0 };

  const rows = useMemo(
    () => categories.map((c) => ({ name: c.title, value: categoryTotal(c, ctx) })),
    [categories, ctx.usdRate, ctx.eurRate, ctx.production]
  );
  const total = rows.reduce((s, r) => s + r.value, 0);

  const curufLine = categories.find((c) => c.title === "Cüruf Nakliyesi")?.lines[0];
  const curuf = curufLine ? Number(curufLine.qty) || 0 : 0;
  const eaoEnerjiLine = categories.find((c) => c.title === "Enerji")?.lines.find((l) => l.name === "EAO-PO Enerjisi");
  const elektrikKirli = eaoEnerjiLine ? Number(eaoEnerjiLine.price) || 0 : 0;
  const elektrikCurrency = eaoEnerjiLine ? CUR_SYMBOL[eaoEnerjiLine.currency] : CUR_SYMBOL.TRY;

  const updateLine = (catId, lineId, next) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: c.lines.map((l) => (l.id === lineId ? next : l)) })));
  const addLine = (catId) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: [...c.lines, makeLine("Yeni kalem", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "/kg", currency: "TRY" })] })));
  const removeLine = (catId, lineId) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: c.lines.filter((l) => l.id !== lineId) })));
  const moveLine = (catId, lineId, dir) => setCategories((cs) => reorderLine(cs, catId, lineId, dir));
  const toggle = (catId) => setOpenMap((m) => ({ ...m, [catId]: !m[catId] }));
  const reset = () => {
    setCategories(initialDokumCategories());
    setParams({ usdRate: 43.3414, eurRate: 51.699, production: 32837.926 });
    setKpi({ ttt: 63, calisilanGun: 23, aylikDokumAdedi: 430 });
  };

  return (
    <div className="calc-grid">
      <div className="calc-main">
        <div className="params-bar">
          <div className="params-bar-title">
            <Settings2 size={14} /> Genel Parametreler
          </div>
          <div className="params-fields">
            <ParamField label="USD Kuru" value={params.usdRate} unit="₺" onChange={(v) => setParams((p) => ({ ...p, usdRate: v }))} />
            <ParamField label="EUR Kuru" value={params.eurRate} unit="₺" onChange={(v) => setParams((p) => ({ ...p, eurRate: v }))} />
            <ParamField label="Aylık Üretim" value={params.production} unit="MT" wide onChange={(v) => setParams((p) => ({ ...p, production: v }))} />
          </div>
          <button className="ghost-btn ghost-btn--reset" onClick={reset}>
            <RotateCcw size={13} /> Varsayılanlara dön
          </button>
        </div>

        <OperationalKpiCard
          kpi={kpi}
          onChange={setKpi}
          production={ctx.production}
          curuf={curuf}
          elektrikKirli={elektrikKirli}
          elektrikCurrency={elektrikCurrency}
        />

        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            ctx={ctx}
            accent={accent}
            grandTotal={total}
            open={!!openMap[c.id]}
            onToggle={() => toggle(c.id)}
            onUpdateLine={updateLine}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onMoveLine={moveLine}
          />
        ))}
      </div>

      <SummaryPanel rows={rows} total={total} accent={accent} />
    </div>
  );
}

/* ============================== HADDEHANE calculator ============================== */

function HaddehaneCalculator({ accent }) {
  const [categories, setCategories] = useState(() => loadLS("hadde.categories", initialHaddeCategories));
  const [params, setParams] = useState(() => loadLS("hadde.params", { usdRate: 43.3414, eurRate: 51.699, production: 23293.448 }));
  const [billet, setBillet] = useState(() => loadLS("hadde.billet", initialBillet));
  const [openMap, setOpenMap] = useState({});

  useEffect(() => { saveLS("hadde.categories", categories); }, [categories]);
  useEffect(() => { saveLS("hadde.params", params); }, [params]);
  useEffect(() => { saveLS("hadde.billet", billet); }, [billet]);

  const ctx = { usdRate: Number(params.usdRate) || 0, eurRate: Number(params.eurRate) || 0, production: Number(params.production) || 0 };

  const catRows = useMemo(
    () => categories.map((c) => ({ name: c.title, value: categoryTotal(c, ctx) })),
    [categories, ctx.usdRate, ctx.eurRate, ctx.production]
  );
  const extra = useMemo(() => extraKutukNet(billet, ctx.production), [billet, ctx.production]);

  const rows = [...catRows, { name: "Ekstra Kütük (net)", value: extra.netPerMT }];
  const total = rows.reduce((s, r) => s + r.value, 0);

  const updateLine = (catId, lineId, next) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: c.lines.map((l) => (l.id === lineId ? next : l)) })));
  const addLine = (catId) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: [...c.lines, makeLine("Yeni kalem", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "/kg", currency: "TRY" })] })));
  const removeLine = (catId, lineId) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, lines: c.lines.filter((l) => l.id !== lineId) })));
  const moveLine = (catId, lineId, dir) => setCategories((cs) => reorderLine(cs, catId, lineId, dir));
  const toggle = (catId) => setOpenMap((m) => ({ ...m, [catId]: !m[catId] }));
  const reset = () => {
    setCategories(initialHaddeCategories());
    setParams({ usdRate: 43.3414, eurRate: 51.699, production: 23293.448 });
    setBillet(initialBillet());
  };

  const extraSection = (
    <div className="extra-card">
      <div className="extra-title">Ekstra Kütük &amp; Fire (net)</div>
      <div className="extra-grid">
        <ParamField label="Kütük Tüketimi" value={billet.kutukTuketim} unit="ton" onChange={(v) => setBillet((b) => ({ ...b, kutukTuketim: v }))} />
        <ParamField label="Kütük Fiyatı" value={billet.kutukFiyati} unit="$/ton" onChange={(v) => setBillet((b) => ({ ...b, kutukFiyati: v }))} />
        <ParamField label="Hurda Fiyatı" value={billet.hurdaFiyati} unit="$/ton" onChange={(v) => setBillet((b) => ({ ...b, hurdaFiyati: v }))} />
        <ParamField label="Tufal Fiyatı" value={billet.tufalFiyati} unit="$/ton" onChange={(v) => setBillet((b) => ({ ...b, tufalFiyati: v }))} />
        <ParamField label="Uç Baş - Hurda" value={billet.ucBasHurdaPct} unit="%" onChange={(v) => setBillet((b) => ({ ...b, ucBasHurdaPct: v }))} />
        <ParamField label="Lokum" value={billet.lokumPct} unit="%" onChange={(v) => setBillet((b) => ({ ...b, lokumPct: v }))} />
        <ParamField label="Kısa Parça" value={billet.kisaParcaPct} unit="%" onChange={(v) => setBillet((b) => ({ ...b, kisaParcaPct: v }))} />
        <ParamField label="Tufal" value={billet.tufalPct} unit="%" onChange={(v) => setBillet((b) => ({ ...b, tufalPct: v }))} />
      </div>
      <div className="extra-readout">
        <div className="extra-readout-item">
          <span>Çubuk Demir Verimi</span>
          <strong>{extra.verim.toFixed(2)}%</strong>
        </div>
        <div className="extra-readout-item">
          <span>Ekstra Kullanılan Kütük</span>
          <strong>{fmt0(extra.extraBillet)} ton</strong>
        </div>
        <div className="extra-readout-item">
          <span>Ekstra Kütük Maliyeti</span>
          <strong>{fmt(extra.extraPerMT, 3)} $/MT</strong>
        </div>
        <div className="extra-readout-item">
          <span>Fire Geri Kazanımı (kredi)</span>
          <strong>&minus;{fmt(extra.firePerMT, 3)} $/MT</strong>
        </div>
        <div className="extra-readout-item extra-readout-item--net" style={{ color: accent }}>
          <span>Net Etki</span>
          <strong>{fmt(extra.netPerMT, 3)} $/MT</strong>
        </div>
      </div>
    </div>
  );

  return (
    <div className="calc-grid">
      <div className="calc-main">
        <div className="params-bar">
          <div className="params-bar-title">
            <Settings2 size={14} /> Genel Parametreler
          </div>
          <div className="params-fields">
            <ParamField label="USD Kuru" value={params.usdRate} unit="₺" onChange={(v) => setParams((p) => ({ ...p, usdRate: v }))} />
            <ParamField label="EUR Kuru" value={params.eurRate} unit="₺" onChange={(v) => setParams((p) => ({ ...p, eurRate: v }))} />
            <ParamField label="Çubuk Demir Üretimi" value={params.production} unit="ton" wide onChange={(v) => setParams((p) => ({ ...p, production: v }))} />
          </div>
          <button className="ghost-btn ghost-btn--reset" onClick={reset}>
            <RotateCcw size={13} /> Varsayılanlara dön
          </button>
        </div>

        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            ctx={ctx}
            accent={accent}
            grandTotal={total}
            open={!!openMap[c.id]}
            onToggle={() => toggle(c.id)}
            onUpdateLine={updateLine}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onMoveLine={moveLine}
          />
        ))}

        <div className="cat-card">
          <div className="cat-header cat-header--static">
            <span className="cat-title">Ekstra Kütük &amp; Fire (net)</span>
            <span className="cat-spacer" />
            <span className="cat-share">{total > 0 ? ((extra.netPerMT / total) * 100).toFixed(1) : "0.0"}%</span>
            <span className="cat-total" style={{ color: accent }}>
              {fmt(extra.netPerMT, 3)} <small>$/MT</small>
            </span>
          </div>
        </div>
      </div>

      <SummaryPanel rows={rows} total={total} accent={accent} extraSection={extraSection} />
    </div>
  );
}

/* ============================== app shell ============================== */

export default function App() {
  const [tab, setTab] = useState(() => loadLS("activeTab", "dokum"));
  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);
  const accent = tab === "dokum" ? "#ff8a3d" : "#48c9d0";

  useEffect(() => { saveLS("activeTab", tab); }, [tab]);

  const handleImportClick = () => fileInputRef.current && fileInputRef.current.click();
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    importAllData(file, (ok) => {
      setImportMsg(ok ? "success" : "error");
      if (ok) setTimeout(() => window.location.reload(), 700);
      else setTimeout(() => setImportMsg(null), 3000);
    });
    e.target.value = "";
  };

  return (
    <div className="app" style={{ "--accent": accent }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .app {
          --bg: #14161a;
          --surface: #1b1e24;
          --surface-2: #21252c;
          --border: #2b2f38;
          --text: #eae7e0;
          --text-dim: #9a9ea6;
          --text-faint: #61656d;
          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', sans-serif;
          min-height: 100%;
          padding: 0;
        }
        .app * { box-sizing: border-box; }

        .top-bar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px 14px;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, #17191e, #14161a);
        }
        .top-brand {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 17px;
          letter-spacing: 0.02em;
        }
        .top-brand span { color: var(--accent); }
        .top-sub {
          font-size: 11.5px;
          color: var(--text-faint);
          margin-left: 4px;
        }
        .top-sub--save { display: flex; align-items: center; gap: 5px; color: #6fcf97; }
        .tab-switch {
          margin-left: auto;
          display: flex;
          gap: 6px;
          background: var(--surface-2);
          padding: 4px;
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        .backup-actions { display: flex; align-items: center; gap: 8px; }
        .backup-msg { font-size: 11px; }
        .backup-msg--ok { color: #6fcf97; }
        .backup-msg--err { color: #e07a7a; }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--text-dim);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all .15s ease;
        }
        .tab-btn--active.tab-btn--dokum { background: #ff8a3d1f; color: #ff9f5c; }
        .tab-btn--active.tab-btn--hadde { background: #48c9d01f; color: #63d6dc; }

        .calc-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 18px;
          padding: 18px 22px 60px;
          align-items: start;
        }
        @media (max-width: 980px) {
          .calc-grid { grid-template-columns: 1fr; }
        }

        .params-bar {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 14px;
          display: flex;
          flex-wrap: wrap;
          align-items: end;
          gap: 16px 22px;
        }
        .params-bar-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-dim);
          width: 100%;
        }
        .params-fields { display: flex; flex-wrap: wrap; gap: 16px 22px; flex: 1; }
        .param-field { display: flex; flex-direction: column; gap: 5px; min-width: 110px; }
        .param-field--wide { min-width: 150px; }
        .param-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); }
        .param-input-wrap { display: flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px; }
        .param-unit { font-size: 11px; color: var(--text-faint); font-family: 'JetBrains Mono', monospace; }

        .num-field {
          background: transparent;
          border: none;
          color: var(--text);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          width: 100%;
          outline: none;
        }
        .num-field::-webkit-outer-spin-button, .num-field::-webkit-inner-spin-button { opacity: 0.4; }

        .ghost-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px dashed var(--border);
          color: var(--text-dim);
          font-size: 11.5px;
          padding: 7px 11px;
          border-radius: 7px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
        }
        .ghost-btn:hover { border-color: var(--accent); color: var(--text); }
        .ghost-btn--reset { margin-left: auto; }

        .cat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 10px;
          overflow: hidden;
        }
        .cat-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 14px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
        }
        .cat-header--static { cursor: default; }
        .chev { color: var(--text-faint); transition: transform .15s ease; flex-shrink: 0; }
        .chev--open { transform: rotate(180deg); }
        .cat-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13.5px; }
        .cat-note { font-size: 11px; color: var(--text-faint); }
        .cat-spacer { flex: 1; }
        .cat-share { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-faint); }
        .cat-total { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; min-width: 108px; text-align: right; }
        .cat-total small { font-size: 9.5px; color: var(--text-faint); margin-left: 3px; }

        .cat-body { padding: 4px 14px 14px; border-top: 1px solid var(--border); }
        .cat-body--kpi { padding-top: 14px; display: flex; flex-direction: column; gap: 14px; }
        .cat-actions { padding-top: 8px; }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 10px;
        }
        .kpi-tile {
          display: flex;
          flex-direction: column;
          gap: 5px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .kpi-tile-label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
        .kpi-tile-value { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; color: var(--text); }
        .kpi-tile-value small { font-size: 10px; font-weight: 500; color: var(--text-faint); margin-left: 2px; }

        .line-row {
          display: grid;
          grid-template-columns: 1.6fr 1.15fr 1.15fr 0.85fr 100px 78px;
          gap: 8px;
          align-items: center;
          padding: 7px 0;
          border-bottom: 1px solid #23262d;
        }
        .line-row:last-of-type { border-bottom: none; }
        .line-row--head {
          padding-top: 12px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--text-faint);
        }
        .line-name {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          font-family: 'Inter', sans-serif;
          outline: none;
          padding: 4px 2px;
        }
        .line-name:focus { color: var(--text); }
        .field-group { display: flex; align-items: center; gap: 5px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
        .field-group--wide { grid-column: span 1; }
        .unit-tag { font-size: 10px; color: var(--text-faint); white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
        .cur-select {
          background: var(--surface-2);
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: 6px;
          padding: 6px 4px;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
        }
        .cur-select option { background: var(--surface-2); color: var(--text); }
        .line-result { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; text-align: right; }
        .line-result-unit { font-size: 9px; color: var(--text-faint); margin-left: 3px; }
        .line-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
        .icon-btn { background: transparent; border: none; color: var(--text-faint); cursor: pointer; padding: 4px; border-radius: 5px; display: flex; }
        .icon-btn:hover { color: #e07a7a; background: #e07a7a15; }
        .icon-btn--small { padding: 3px; color: var(--text-faint); }
        .icon-btn--small:hover { color: var(--accent); background: var(--accent-soft, #ffffff12); }
        .icon-btn:disabled { opacity: 0.25; cursor: default; }
        .icon-btn:disabled:hover { color: var(--text-faint); background: transparent; }

        .summary-panel {
          position: sticky;
          top: 18px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .summary-readout { text-align: center; padding-bottom: 4px; }
        .readout-label { font-size: 10.5px; letter-spacing: .1em; color: var(--text-faint); margin-bottom: 6px; }
        .readout-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 34px;
          font-weight: 600;
          color: var(--accent);
        }
        .readout-unit { font-size: 13px; color: var(--text-dim); }
        .load-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 12px; background: var(--surface-2); }
        .load-seg { height: 100%; }

        .extra-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
        .extra-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 12.5px; margin-bottom: 10px; }
        .extra-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin-bottom: 12px; }
        .extra-readout { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 10px; }
        .extra-readout-item { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-dim); }
        .extra-readout-item strong { font-family: 'JetBrains Mono', monospace; color: var(--text); font-weight: 600; font-size: 12px; }
        .extra-readout-item--net { border-top: 1px dashed var(--border); padding-top: 6px; margin-top: 2px; }
        .extra-readout-item--net strong { font-size: 13.5px; }

        .chart-block { }
        .chart-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); margin-bottom: 8px; }

        .rank-table { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
        .rank-row { display: grid; grid-template-columns: 8px 1fr auto auto; gap: 8px; align-items: center; font-size: 11.5px; }
        .rank-dot { width: 8px; height: 8px; border-radius: 50%; }
        .rank-name { color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rank-pct { color: var(--text-faint); font-family: 'JetBrains Mono', monospace; font-size: 10.5px; }
        .rank-val { font-family: 'JetBrains Mono', monospace; font-weight: 600; min-width: 62px; text-align: right; }

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
      `}</style>

      <div className="top-bar">
        <div className="top-brand">
          Maliyet <span>Hesaplama</span> Aracı
        </div>
        <div className="top-sub top-sub--save">
          <CheckCircle2 size={12} /> bu tarayıcıya otomatik kaydedilir
        </div>
        <div className="tab-switch">
          <button
            className={`tab-btn tab-btn--dokum ${tab === "dokum" ? "tab-btn--active" : ""}`}
            onClick={() => setTab("dokum")}
          >
            <Flame size={14} /> Çelikhane (Döküm)
          </button>
          <button
            className={`tab-btn tab-btn--hadde ${tab === "hadde" ? "tab-btn--active" : ""}`}
            onClick={() => setTab("hadde")}
          >
            <Factory size={14} /> Haddehane
          </button>
        </div>
        <div className="backup-actions">
          <button className="ghost-btn" onClick={exportAllData} title="Tüm verileri JSON olarak indir">
            <Download size={13} /> Yedek indir
          </button>
          <button className="ghost-btn" onClick={handleImportClick} title="JSON yedeği geri yükle">
            <Upload size={13} /> Yedek yükle
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
          {importMsg === "success" && <span className="backup-msg backup-msg--ok">Yüklendi, yenileniyor…</span>}
          {importMsg === "error" && <span className="backup-msg backup-msg--err">Geçersiz dosya</span>}
        </div>
      </div>

      {tab === "dokum" ? <DokumCalculator accent={accent} /> : <HaddehaneCalculator accent={accent} />}
    </div>
  );
}
