
(function (global) {
  "use strict";

  const SLOTS = [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
  ];

  const TAIL = [
    "#86b6ef",
    "#f5a483",
    "#74d3b0",
    "#f5c95e",
    "#f3b8cd",
    "#4aa84a",
    "#9085e9",
    "#f09190",
    "#a8b0bd",
  ];

  const colorAt = (i) => (i < SLOTS.length ? SLOTS[i] : TAIL[(i - SLOTS.length) % TAIL.length]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  const n = (v) => (Math.round(v * 100) / 100).toString();

  function barPath(x, y, width, height, radius, dir) {
    const r = Math.max(0, Math.min(radius, width, height / 2));
    const end = x + dir * width;
    const tip = end - dir * r;
    const sweep = dir > 0 ? 1 : 0;
    return [
      `M ${n(x)} ${n(y)}`,
      `L ${n(tip)} ${n(y)}`,
      `A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(end)} ${n(y + r)}`,
      `L ${n(end)} ${n(y + height - r)}`,
      `A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(tip)} ${n(y + height)}`,
      `L ${n(x)} ${n(y + height)}`,
      "Z",
    ].join(" ");
  }

  const CX = 170;
  const CY = 170;
  const R_OUTER = 150;
  const R_INNER = 92;

  function ringSlice(a0, a1, rOuter, rInner) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x = (r, a) => CX + r * Math.cos(a);
    const y = (r, a) => CY + r * Math.sin(a);
    return [
      `M ${n(x(rOuter, a0))} ${n(y(rOuter, a0))}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${n(x(rOuter, a1))} ${n(y(rOuter, a1))}`,
      `L ${n(x(rInner, a1))} ${n(y(rInner, a1))}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${n(x(rInner, a0))} ${n(y(rInner, a0))}`,
      "Z",
    ].join(" ");
  }

  function donut(rows, opts) {
    opts = opts || {};
    const fmt = opts.fmt || String;
    const slices = rows.filter((r) => r.value > 0);
    const total = slices.reduce((sum, r) => sum + r.value, 0);
    if (!slices.length || total <= 0) return "";

    if (slices.length === 1) {
      const only = slices[0];
      return wrapDonut(
        `<path class="slice" d="${ringSlice(-Math.PI / 2, Math.PI / 2, R_OUTER, R_INNER)}"
              fill="${colorAt(0)}" data-key="${esc(only.key)}"><title>${esc(only.title)} — 100%</title></path>
         <path class="slice" d="${ringSlice(Math.PI / 2, Math.PI * 1.5, R_OUTER, R_INNER)}"
              fill="${colorAt(0)}" data-key="${esc(only.key)}"><title>${esc(only.title)} — 100%</title></path>`,
        centerHTML(opts), "");
    }

    const gapAngle = 2 / R_OUTER;
    let angle = -Math.PI / 2;
    const paths = [];
    const labels = [];

    slices.forEach((row, i) => {
      const span = (row.value / total) * Math.PI * 2;
      const pct = (row.value / total) * 100;
      const inset = Math.min(gapAngle, span / 4) / 2;
      const a0 = angle + inset;
      const a1 = angle + span - inset;
      const fill = colorAt(i);

      paths.push(
        `<path class="slice" d="${ringSlice(a0, a1, R_OUTER, R_INNER)}" fill="${fill}"` +
        ` data-key="${esc(row.key)}" tabindex="0" role="listitem">` +
        `<title>${esc(row.title)} — ${esc(fmt(row.value))} (${pct.toFixed(1)}%)</title></path>`);

      const mid = (a0 + a1) / 2;
      const rLabel = (R_OUTER + R_INNER) / 2;
      const lx = CX + rLabel * Math.cos(mid);
      const ly = CY + rLabel * Math.sin(mid);
      const text = pct >= 4 ? `${pct.toFixed(1)}%` : pct >= 3 ? String(i + 1) : null;
      if (text) {
        labels.push(
          `<text class="slice-label" x="${n(lx)}" y="${n(ly)}" text-anchor="middle"` +
          ` dominant-baseline="central">${esc(text)}</text>`);
      }
      angle += span;
    });

    return wrapDonut(paths.join(""), centerHTML(opts), labels.join(""));
  }

  function centerHTML(opts) {
    if (!opts.centerValue) return "";
    return `
      <text class="donut-center-value" x="${CX}" y="${CY - 6}" text-anchor="middle"
            dominant-baseline="central">${esc(opts.centerValue)}</text>
      <text class="donut-center-label" x="${CX}" y="${CY + 20}" text-anchor="middle"
            dominant-baseline="central">${esc(opts.centerLabel || "")}</text>`;
  }

  function wrapDonut(paths, center, labels) {
    return `<svg class="chart chart--donut" viewBox="0 0 340 340" role="list"
      aria-label="Kategori payları">${paths}${labels}${center}</svg>`;
  }

  const ROW_H = 26;
  const BAR_H = 14;
  const LABEL_W = 190;
  const VALUE_W = 96;
  const PAD_R = 12;

  function barsH(rows, opts) {
    opts = opts || {};
    const fmt = opts.fmt || String;
    if (!rows.length) return "";

    const width = opts.width || 720;
    const plotW = width - LABEL_W - VALUE_W - PAD_R;
    const maxPos = Math.max(0, ...rows.map((r) => r.value));
    const maxNeg = Math.max(0, ...rows.map((r) => -r.value));
    const span = maxPos + maxNeg;
    if (span <= 0) return "";

    const zeroX = LABEL_W + (maxNeg / span) * plotW;
    const scale = plotW / span;
    const height = rows.length * ROW_H + 8;

    const marks = rows.map((row, i) => {
      const y = i * ROW_H + 4;
      const barY = y + (ROW_H - BAR_H) / 2;
      const neg = row.value < 0;
      const w = Math.abs(row.value) * scale;
      const cls = neg ? "bar bar--credit" : "bar";
      const valueX = neg ? LABEL_W - 8 : zeroX + Math.abs(row.value) * scale + 8;
      return `
        <g class="bar-row" data-key="${esc(row.key)}">
          <title>${esc(row.title)} — ${esc(fmt(row.value))}</title>
          <text class="bar-name" x="${LABEL_W - 10}" y="${n(y + ROW_H / 2)}"
                text-anchor="end" dominant-baseline="central">${esc(row.title)}</text>
          <path class="${cls}" d="${barPath(zeroX, barY, Math.max(w, 0.6), BAR_H, 4, neg ? -1 : 1)}" />
          <text class="bar-value${neg ? " bar-value--credit" : ""}" x="${n(valueX)}"
                y="${n(y + ROW_H / 2)}" text-anchor="${neg ? "end" : "start"}"
                dominant-baseline="central">${esc(fmt(row.value))}</text>
        </g>`;
    }).join("");

    const axis = `<line class="axis" x1="${n(zeroX)}" y1="0" x2="${n(zeroX)}" y2="${n(height - 8)}" />`;

    return `<svg class="chart chart--bars" viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="xMinYMin meet" role="img"
      aria-label="${esc(opts.title || "Kategori maliyetleri")}">${axis}${marks}</svg>`;
  }

  function barsDiverging(rows, opts) {
    opts = opts || {};
    const fmt = opts.fmt || String;
    const shown = rows.filter((r) => Math.abs(r.value) > 0.0005);
    if (!shown.length) return "";

    const width = opts.width || 720;
    const plotW = width - LABEL_W - VALUE_W - PAD_R;

    const up = Math.max(0, ...shown.map((r) => r.value));
    const down = Math.max(0, ...shown.map((r) => -r.value));
    const span = up + down;
    if (span <= 0) return "";

    const zeroX = LABEL_W + (down / span) * plotW;
    const scale = plotW / span;
    const height = shown.length * ROW_H + 8;

    const marks = shown.map((row, i) => {
      const y = i * ROW_H + 4;
      const barY = y + (ROW_H - BAR_H) / 2;
      const rose = row.value > 0;
      const w = Math.abs(row.value) * scale;
      const valueX = rose ? zeroX + w + 8 : zeroX - w - 8;
      return `
        <g class="bar-row" data-key="${esc(row.key)}">
          <title>${esc(row.title)} — ${esc(fmt(row.value))}</title>
          <text class="bar-name" x="${LABEL_W - 10}" y="${n(y + ROW_H / 2)}"
                text-anchor="end" dominant-baseline="central">${esc(row.title)}</text>
          <path class="bar ${rose ? "bar--up" : "bar--down"}"
                d="${barPath(zeroX, barY, Math.max(w, 0.6), BAR_H, 4, rose ? 1 : -1)}" />
          <text class="bar-value ${rose ? "bar-value--up" : "bar-value--down"}" x="${n(valueX)}"
                y="${n(y + ROW_H / 2)}" text-anchor="${rose ? "start" : "end"}"
                dominant-baseline="central">${esc(fmt(row.value))}</text>
        </g>`;
    }).join("");

    const axis = `<line class="axis" x1="${n(zeroX)}" y1="0" x2="${n(zeroX)}" y2="${n(height - 8)}" />`;

    return `<svg class="chart chart--bars" viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="xMinYMin meet" role="img"
      aria-label="${esc(opts.title || "Değişim")}">${axis}${marks}</svg>`;
  }

  global.Charts = { donut, barsH, barsDiverging, colorAt, SLOTS, TAIL };
})(window);
