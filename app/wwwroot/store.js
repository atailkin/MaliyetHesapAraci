
(function (global) {
  "use strict";

  const STORAGE_KEY = "maliyet-hesaplama:doc";
  const LEGACY_KEYS = [
    "activeTab", "dokum.categories", "dokum.params", "dokum.kpi",
    "hadde.categories", "hadde.params", "hadde.billet",
  ];
  const LEGACY_PREFIX = "maliyet-hesaplama:";

  const CURRENCIES = ["TRY", "USD", "EUR"];
  const CUR_SYMBOL = { TRY: "₺", USD: "$", EUR: "€" };

  let seq = 0;
  const uid = (p) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const RESERVED_KEYS = ["uretim", "usd", "eur", "toplam"];

  function slugKey(label, taken) {
    const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };
    let base = String(label || "")
      .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] || c)
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join("");
    if (!base || /^[0-9]/.test(base)) base = "v" + base;
    let key = base;
    let n = 2;
    while ((taken && taken.includes(key)) || RESERVED_KEYS.includes(key)) key = base + n++;
    return key;
  }

  function hasLS() {
    try { return typeof window !== "undefined" && !!window.localStorage; }
    catch (e) { return false; }
  }
  function readRaw(key) {
    if (!hasLS()) return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  }
  function writeRaw(key, value) {
    if (!hasLS()) return;
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { }
  }

  function L(name, mode, o) {
    o = o || {};
    return {
      id: uid("l"),
      name,
      mode,
      qty: o.qty ?? null,
      qtyUnit: o.qtyUnit ?? "",
      price: o.price ?? 0,
      priceUnit: o.priceUnit ?? "",
      currency: o.currency ?? "TRY",
      formula: o.formula ?? "",
      basis: o.basis ?? "lump",
    };
  }
  function C(title, lines, note) {
    return { id: uid("c"), title, note: note || "", lines };
  }
  function V(key, label, unit, value) {
    return { id: uid("v"), key, label, unit, value };
  }
  function I(label, unit, decimals, formula) {
    return { id: uid("i"), label, unit, decimals, formula };
  }

  function defaultDokum() {
    return {
      id: uid("s"),
      name: "Çelikhane (Döküm)",
      production: { label: "Aylık Üretim", unit: "MT", value: 32837.926 },
      variables: [
        V("ttt", "TTT (çevrim süresi)", "dk", 63),
        V("gun", "Çalışılan Gün", "gün", 23),
        V("dokumAdedi", "Aylık Döküm Adedi", "adet", 430),
        V("curuf", "Cüruf", "MT", 5658.8),
        V("curufNakliye", "Cüruf Nakliye Birim", "₺/ton", 120),
      ],
      indicators: [
        I("Çalışma Saati / Gün", "s", 2, "dokumAdedi * ttt / 60 / gun"),
        I("Toplam Çalışma Saati / Ay", "s", 1, "dokumAdedi * ttt / 60"),
        I("Döküm Ağırlığı", "MT", 2, "uretim / dokumAdedi"),
        I("Günlük Döküm Adedi", "adet", 2, "dokumAdedi / gun"),
        I("Aylık Tonaj", "MT", 1, "uretim"),
        I("Cüruf Oranı", "%", 2, "curuf / uretim * 100"),
        I("Enerji Payı", "%", 1, 'kat("Enerji") / toplam * 100'),
      ],
      categories: [
        C("Enerji", [
          L("EAO-PO Enerjisi", "rate", { qty: 16965414, qtyUnit: "kWh", price: 3.110639, priceUnit: "₺/kWh", currency: "TRY" }),
          L("Servis Enerjisi", "rate", { qty: 2412166, qtyUnit: "kWh", price: 4.037177, priceUnit: "₺/kWh", currency: "TRY" }),
          L("Sistem Kullanım Bedeli", "lump", { price: 3509420.81, currency: "TRY" }),
        ], "Elektrik faturaları"),
        C("Elektrod", [
          L("EAO Elektrod", "rate", { qty: 46899, qtyUnit: "kg", price: 9.65, priceUnit: "$/kg", currency: "USD" }),
          L("PO Elektrod", "rate", { qty: 13165, qtyUnit: "kg", price: 2.269115, priceUnit: "$/kg", currency: "USD" }),
        ]),
        C("Karbon", [
          L("Şarj Karbon", "rate", { qty: 473120, qtyUnit: "kg", price: 0.235, priceUnit: "$/kg", currency: "USD" }),
          L("Toz Karbon", "rate", { qty: 242300, qtyUnit: "kg", price: 0.235, priceUnit: "$/kg", currency: "USD" }),
          L("Granüle Karbon", "rate", { qty: 50500, qtyUnit: "kg", price: 0.255, priceUnit: "$/kg", currency: "USD" }),
        ]),
        C("Kireç", [
          L("Parça Kireç — Tedarikçi 1", "rate", { qty: 735450, qtyUnit: "kg", price: 3.395, priceUnit: "₺/kg", currency: "TRY" }),
          L("Parça Kireç — Tedarikçi 2", "rate", { qty: 265300, qtyUnit: "kg", price: 3.564961, priceUnit: "₺/kg", currency: "TRY" }),
          L("Parça Kireç — Tedarikçi 3", "rate", { qty: 219120, qtyUnit: "kg", price: 3.2, priceUnit: "₺/kg", currency: "TRY" }),
          L("Parça Kireç — Tedarikçi 4", "rate", { qty: 239420, qtyUnit: "kg", price: 3.1, priceUnit: "₺/kg", currency: "TRY" }),
          L("Granüle Kireç — Tedarikçi 1", "rate", { qty: 76160, qtyUnit: "kg", price: 3.637596, priceUnit: "₺/kg", currency: "TRY" }),
          L("Granüle Kireç — Tedarikçi 2", "rate", { qty: 51020, qtyUnit: "kg", price: 3.65, priceUnit: "₺/kg", currency: "TRY" }),
        ], "Tedarikçi bazlı — istediğiniz kadar satır ekleyin"),
        C("Doğalgaz", [
          L("Doğalgaz Tüketimi", "rate", { qty: 463822, qtyUnit: "Sm³", price: 15.334713, priceUnit: "₺/Sm³", currency: "TRY" }),
        ], "Pota ısıtma + EAO tüketimi birlikte"),
        C("Alyaj", [
          L("FeSiMn 71", "rate", { qty: 347300, qtyUnit: "kg", price: 1.1058, priceUnit: "$/kg", currency: "USD" }),
          L("FeSi 75", "rate", { qty: 104860, qtyUnit: "kg", price: 1.09515, priceUnit: "$/kg", currency: "USD" }),
          L("Fluspat", "rate", { qty: 19320, qtyUnit: "kg", price: 0.525, priceUnit: "€/kg", currency: "EUR" }),
          L("Surepo", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "$/kg", currency: "USD" }),
          L("Citole", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "$/kg", currency: "USD" }),
        ]),
        C("Örtü Tozları", [
          L("Tandiş (Unitoz tcp)", "rate", { qty: 10920, qtyUnit: "kg", price: 0.21, priceUnit: "€/kg", currency: "EUR" }),
          L("Pota — Yuber", "rate", { qty: 0, qtyUnit: "kg", price: 0, priceUnit: "€/kg", currency: "EUR" }),
        ]),
        C("Termokupl / Ölçüm", [
          L("900mm IMM Sampler", "rate", { qty: 1918, qtyUnit: "adet", price: 1.4, priceUnit: "€/adet", currency: "EUR" }),
          L("600mm Termokupl", "rate", { qty: 1170, qtyUnit: "adet", price: 0.85, priceUnit: "€/adet", currency: "EUR" }),
          L("1500mm Termokupl", "rate", { qty: 1735, qtyUnit: "adet", price: 1.02, priceUnit: "€/adet", currency: "EUR" }),
          L("1700mm Termokupl", "rate", { qty: 0, qtyUnit: "adet", price: 1.07, priceUnit: "€/adet", currency: "EUR" }),
          L("TOX Oksijen Probu 1500mm", "rate", { qty: 180, qtyUnit: "adet", price: 9.65, priceUnit: "€/adet", currency: "EUR" }),
          L("TOX Oksijen Probu 1700mm", "rate", { qty: 354, qtyUnit: "adet", price: 9.24, priceUnit: "€/adet", currency: "EUR" }),
          L("Ölçüm Aparatları vb.", "lump", { price: 15509.7, currency: "TRY" }),
        ]),
        C("Refrakter", [
          L("EAO Refrakter", "perTon", { price: 2.1, currency: "USD" }),
          L("Potalar", "perTon", { price: 2.39, currency: "USD" }),
          L("Yürek", "perTon", { price: 0.14, currency: "USD" }),
          L("Tandiş", "perTon", { price: 1.63, currency: "USD" }),
        ], "Doğrudan $/MT olarak girilir"),
        C("İşletme Malzemeleri", [
          L("Bakır Kalıp 150mm sq", "rate", { qty: 4, qtyUnit: "adet", price: 1470, priceUnit: "$/adet", currency: "USD" }),
          L("Bakır Kalıp 130mm sq", "rate", { qty: 8, qtyUnit: "adet", price: 1455, priceUnit: "$/adet", currency: "USD" }),
          L("Tamirli Kalıp 150mm", "rate", { qty: 0, qtyUnit: "adet", price: 0, priceUnit: "$/adet", currency: "USD" }),
          L("Ca-Si Tel", "rate", { qty: 8770, qtyUnit: "kg", price: 2.47, priceUnit: "$/kg", currency: "USD" }),
          L("Al Külçe", "rate", { qty: 8500, qtyUnit: "kg", price: 2.7, priceUnit: "€/kg", currency: "EUR" }),
          L("Granül Alüminyum", "rate", { qty: 0, qtyUnit: "kg", price: 3.4, priceUnit: "$/kg", currency: "USD" }),
          L("Oksijen Boruları 1\"", "rate", { qty: 822, qtyUnit: "m", price: 76.8, priceUnit: "₺/m", currency: "TRY" }),
          L("Oksijen Boruları 1/2\"", "rate", { qty: 651, qtyUnit: "m", price: 36.58, priceUnit: "₺/m", currency: "TRY" }),
          L("Oksijen Borusu 10mm", "rate", { qty: 0, qtyUnit: "m", price: 14.3, priceUnit: "₺/m", currency: "TRY" }),
          L("Oksijen Borusu 6mm", "rate", { qty: 0, qtyUnit: "m", price: 15.4859, priceUnit: "₺/m", currency: "TRY" }),
          L("Kalıp Yağı", "rate", { qty: 1313, qtyUnit: "kg", price: 69.5, priceUnit: "₺/kg", currency: "TRY" }),
        ]),
        C("Gazlar", [
          L("Oksijen — Tedarikçi 1", "rate", { qty: 2043540, qtyUnit: "kg", price: 4.92265, priceUnit: "₺/kg", currency: "TRY" }),
          L("Oksijen — Tedarikçi 2", "rate", { qty: 218260, qtyUnit: "kg", price: 5.7086, priceUnit: "₺/kg", currency: "TRY" }),
          L("Argon", "rate", { qty: 238440, qtyUnit: "kg", price: 46.1763, priceUnit: "₺/kg", currency: "TRY" }),
          L("Azot", "rate", { qty: 16200, qtyUnit: "kg", price: 9.4192, priceUnit: "₺/kg", currency: "TRY" }),
        ]),
        C("Personel Maliyeti", [
          L("Çebitaş Personel", "lump", { price: 18496389.8, currency: "TRY" }),
          L("Saner Personel", "lump", { price: 4372085.04, currency: "TRY" }),
          L("Servis", "lump", { price: 1837082.28, currency: "TRY" }),
          L("Yemek", "lump", { price: 1002442.06, currency: "TRY" }),
        ]),
        C("Bakım Giderleri", [
          L("Elektrik Bakım", "lump", { price: 680193.65, currency: "TRY" }),
          L("Mekanik Bakım", "lump", { price: 1472484.5, currency: "TRY" }),
          L("Su Tesisleri", "lump", { price: 2579052.15, currency: "TRY" }),
          L("Oksijen Tesisleri", "lump", { price: 10645.19, currency: "TRY" }),
          L("İşletme Sarf", "lump", { price: 514601.31, currency: "TRY" }),
          L("Teknik Emniyet", "lump", { price: 349790.26, currency: "TRY" }),
        ]),
        C("İş Makinaları", [L("İş Makinaları", "lump", { price: 1707677.15, currency: "TRY" })]),
        C("Taşeronlar", [
          L("İnşaat İşleri", "lump", { price: 322990, currency: "TRY" }),
          L("Hurda ve Malzeme Transfer", "lump", { price: 2930256, currency: "TRY" }),
          L("Hurda Kesim / Çelik Ayıklama", "lump", { price: 92050, currency: "TRY" }),
          L("Çelik Konstrüksiyon Boru ve İmalat", "lump", { price: 0, currency: "TRY" }),
        ]),
        C("Laboratuvar ve Sosyal Tesisler", [
          L("Laboratuvar", "lump", { price: 107176.54, currency: "TRY" }),
          L("Sosyal Tesisler", "lump", { price: 213627.51, currency: "TRY" }),
          L("Sosyal Tesisler — Doğalgaz", "lump", { price: 272777.32, currency: "TRY" }),
        ]),
        C("Cüruf Nakliyesi", [
          L("Cüruf Nakliyesi", "formula", { formula: "curuf * curufNakliye", currency: "TRY", basis: "lump" }),
        ], "Cüruf tonajı 'Değişkenler' bölümünden gelir"),
      ],
    };
  }

  function defaultHadde() {
    return {
      id: uid("s"),
      name: "Haddehane",
      production: { label: "Çubuk Demir Üretimi", unit: "ton", value: 23293.448 },
      variables: [
        V("kutukTuketim", "Kütük Tüketimi", "ton", 24404.697),
        V("kutukFiyati", "Kütük Fiyatı", "$/ton", 538),
        V("hurdaFiyati", "Hurda Fiyatı", "$/ton", 349),
        V("tufalFiyati", "Tufal Fiyatı", "$/ton", 48),
        V("ucBas", "Uç Baş - Hurda", "%", 1.44),
        V("lokum", "Lokum", "%", 0.68),
        V("kisaParca", "Kısa Parça", "%", 1),
        V("tufal", "Tufal", "%", 1),
      ],
      indicators: [
        I("Çubuk Demir Verimi", "%", 2, "uretim / kutukTuketim * 100"),
        I("Ekstra Kullanılan Kütük", "ton", 0, "kutukTuketim - uretim"),
        I("Aylık Tonaj", "ton", 1, "uretim"),
      ],
      categories: [
        C("Enerji", [
          L("Enerji Kullanımı", "rate", { qty: 2487314, qtyUnit: "kWh", price: 4.037177, priceUnit: "₺/kWh", currency: "TRY" }),
        ]),
        C("Doğalgaz", [
          L("Doğalgaz Tüketimi", "rate", { qty: 922755, qtyUnit: "Sm³", price: 15.334713, priceUnit: "₺/Sm³", currency: "TRY" }),
        ]),
        C("İşletme ve Bakım", [
          L("İşletme", "lump", { price: 1086287.35, currency: "TRY" }),
          L("Mekanik Bakım", "lump", { price: 2990970.97, currency: "TRY" }),
          L("Elektrik Bakım", "lump", { price: 665462.68, currency: "TRY" }),
          L("Sarf", "lump", { price: 155451.38, currency: "TRY" }),
          L("Teknik Emniyet", "lump", { price: 313522.21, currency: "TRY" }),
        ]),
        C("Personel Maliyeti", [
          L("Çebitaş Personel", "lump", { price: 11666594.08, currency: "TRY" }),
          L("Saner Personel", "lump", { price: 3478297.72, currency: "TRY" }),
          L("Servis", "lump", { price: 1378195.39, currency: "TRY" }),
          L("Yemek", "lump", { price: 752040.91, currency: "TRY" }),
        ]),
        C("Darphane", [
          L("Etiket", "perTon", { price: 42.73, currency: "TRY" }),
          L("Boya (1MT / 3.16gr)", "perTon", { price: 24.788, currency: "TRY" }),
        ], "Etiket ve boya"),
        C("Ekstra Kütük & Fire", [
          L("Ekstra Kütük", "formula", {
            formula: "(kutukTuketim - uretim) * kutukFiyati / kutukTuketim",
            currency: "USD", basis: "perTon",
          }),
          L("Fire Geri Kazanımı", "formula", {
            formula: "-(kutukTuketim / 100 * (ucBas + lokum + kisaParca) * hurdaFiyati + kutukTuketim / 100 * tufal * tufalFiyati)",
            currency: "USD", basis: "lump",
          }),
        ], "Fire satırı negatiftir — toplamdan düşer"),
      ],
    };
  }

  function defaultDoc() {
    const systems = [defaultDokum(), defaultHadde()];
    return {
      version: 2,
      activeSystemId: systems[0].id,
      rates: { usd: 43.3414, eur: 51.699, auto: true, fetchedAt: null, source: null },
      settings: { locale: "en-US", decimals: 3 },
      periods: [],
      systems,
    };
  }

  function blankSystem(name) {
    return {
      id: uid("s"),
      name: name || "Yeni Sistem",
      production: { label: "Aylık Üretim", unit: "MT", value: 1000 },
      variables: [],
      indicators: [],
      categories: [C("Yeni Kategori", [L("Yeni kalem", "lump", { price: 0, currency: "TRY" })])],
    };
  }

  function migrateLegacy() {
    const dokumCats = readRaw(LEGACY_PREFIX + "dokum.categories");
    const haddeCats = readRaw(LEGACY_PREFIX + "hadde.categories");
    if (!dokumCats && !haddeCats) return null;

    const doc = defaultDoc();
    const dokumParams = readRaw(LEGACY_PREFIX + "dokum.params");
    const haddeParams = readRaw(LEGACY_PREFIX + "hadde.params");
    const kpi = readRaw(LEGACY_PREFIX + "dokum.kpi");
    const billet = readRaw(LEGACY_PREFIX + "hadde.billet");

    const normalize = (cats) => cats.map((c) => ({
      id: uid("c"),
      title: c.title || "Kategori",
      note: c.note || "",
      lines: (c.lines || []).map((l) => Object.assign(L(l.name || "Kalem", l.mode || "lump", {}), {
        qty: l.qty ?? null, qtyUnit: l.qtyUnit || "", price: l.price ?? 0,
        priceUnit: l.priceUnit || "", currency: l.currency || "TRY",
      })),
    }));

    const rates = dokumParams || haddeParams;
    if (rates) {
      doc.rates.usd = Number(rates.usdRate) || doc.rates.usd;
      doc.rates.eur = Number(rates.eurRate) || doc.rates.eur;
      doc.rates.auto = false;
    }

    if (dokumCats) {
      const s = doc.systems[0];
      s.categories = normalize(dokumCats);
      if (dokumParams) s.production.value = Number(dokumParams.production) || s.production.value;
      if (kpi) {
        const set = (key, v) => {
          const found = s.variables.find((x) => x.key === key);
          if (found && Number.isFinite(Number(v))) found.value = Number(v);
        };
        set("ttt", kpi.ttt); set("gun", kpi.calisilanGun); set("dokumAdedi", kpi.aylikDokumAdedi);
      }
      const curufLine = (dokumCats.find((c) => c.title === "Cüruf Nakliyesi") || {}).lines;
      if (curufLine && curufLine[0]) {
        const cv = s.variables.find((x) => x.key === "curuf");
        const cf = s.variables.find((x) => x.key === "curufNakliye");
        if (cv) cv.value = Number(curufLine[0].qty) || cv.value;
        if (cf) cf.value = Number(curufLine[0].price) || cf.value;
        const cat = s.categories.find((c) => c.title === "Cüruf Nakliyesi");
        if (cat) {
          cat.lines = [L("Cüruf Nakliyesi", "formula", { formula: "curuf * curufNakliye", currency: "TRY", basis: "lump" })];
          cat.note = "Cüruf tonajı 'Değişkenler' bölümünden gelir";
        }
      }
    }

    if (haddeCats) {
      const s = doc.systems[1];
      const extraCat = s.categories[s.categories.length - 1];
      s.categories = normalize(haddeCats).concat([extraCat]);
      if (haddeParams) s.production.value = Number(haddeParams.production) || s.production.value;
      if (billet) {
        const map = {
          kutukTuketim: billet.kutukTuketim, kutukFiyati: billet.kutukFiyati,
          hurdaFiyati: billet.hurdaFiyati, tufalFiyati: billet.tufalFiyati,
          ucBas: billet.ucBasHurdaPct, lokum: billet.lokumPct,
          kisaParca: billet.kisaParcaPct, tufal: billet.tufalPct,
        };
        s.variables.forEach((v) => {
          if (Number.isFinite(Number(map[v.key]))) v.value = Number(map[v.key]);
        });
      }
    }

    const activeTab = readRaw(LEGACY_PREFIX + "activeTab");
    doc.activeSystemId = activeTab === "hadde" ? doc.systems[1].id : doc.systems[0].id;

    writeRaw(STORAGE_KEY, doc);
    LEGACY_KEYS.forEach((k) => {
      try { window.localStorage.removeItem(LEGACY_PREFIX + k); } catch (e) { }
    });
    return doc;
  }

  function sanitize(doc) {
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.systems) || !doc.systems.length) {
      return defaultDoc();
    }
    doc.version = 2;
    doc.rates = Object.assign({ usd: 43.3414, eur: 51.699, auto: true, fetchedAt: null, source: null }, doc.rates);
    doc.settings = Object.assign({ locale: "en-US", decimals: 3 }, doc.settings);

    doc.periods = (Array.isArray(doc.periods) ? doc.periods : [])
      .filter((p) => p && Array.isArray(p.systems) && p.systems.length)
      .map((p) => ({
        id: p.id || uid("p"),
        label: p.label || "Dönem",
        savedAt: p.savedAt || "",
        rates: Object.assign({ usd: 0, eur: 0 }, p.rates),
        systems: sanitize({ systems: p.systems, activeSystemId: null }).systems,
      }));

    doc.systems.forEach((s) => {
      s.id = s.id || uid("s");
      s.name = s.name || "Sistem";
      s.production = Object.assign({ label: "Üretim", unit: "MT", value: 0 }, s.production);
      s.variables = Array.isArray(s.variables) ? s.variables : [];
      s.indicators = Array.isArray(s.indicators) ? s.indicators : [];
      s.categories = Array.isArray(s.categories) ? s.categories : [];
      s.variables.forEach((v) => { v.id = v.id || uid("v"); });
      s.indicators.forEach((i) => { i.id = i.id || uid("i"); });
      s.categories.forEach((c) => {
        c.id = c.id || uid("c");
        c.lines = Array.isArray(c.lines) ? c.lines : [];
        c.lines.forEach((l) => {
          l.id = l.id || uid("l");
          l.mode = l.mode || "lump";
          l.currency = l.currency || "TRY";
          l.basis = l.basis || "lump";
          l.formula = l.formula || "";
        });
      });
    });
    if (!doc.systems.some((s) => s.id === doc.activeSystemId)) {
      doc.activeSystemId = doc.systems[0].id;
    }
    return doc;
  }

  function load() {
    const stored = readRaw(STORAGE_KEY);
    if (stored) return sanitize(stored);
    const migrated = migrateLegacy();
    if (migrated) return sanitize(migrated);
    return defaultDoc();
  }

  let saveTimer = null;
  let pending = null;
  function flush() {
    if (!pending) return;
    clearTimeout(saveTimer);
    writeRaw(STORAGE_KEY, pending);
    pending = null;
  }
  function save(doc) {
    pending = doc;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 200);
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  function toUSD(amount, currency, rates) {
    if (currency === "USD") return amount;
    if (currency === "TRY") return amount / (Number(rates.usd) || 1);
    if (currency === "EUR") return amount * ((Number(rates.eur) || 0) / (Number(rates.usd) || 1));
    return amount;
  }

  function scopeFor(system, rates) {
    const vars = { uretim: Number(system.production.value) || 0, usd: Number(rates.usd) || 0, eur: Number(rates.eur) || 0 };
    system.variables.forEach((v) => { vars[v.key] = Number(v.value) || 0; });
    return vars;
  }

  function lineCost(line, system, rates, scope) {
    const production = Number(system.production.value) || 0;
    const vars = scope || scopeFor(system, rates);

    if (line.mode === "formula") {
      const res = global.Formula.run(line.formula, { vars });
      if (!res.ok) return { value: 0, error: res.error };
      const usd = toUSD(res.value, line.currency, rates);
      const value = line.basis === "perTon" ? usd : (production > 0 ? usd / production : 0);
      return { value, error: null };
    }
    const price = Number(line.price) || 0;
    if (line.mode === "perTon") return { value: toUSD(price, line.currency, rates), error: null };

    const qty = line.mode === "lump" ? 1 : Number(line.qty) || 0;
    const usd = toUSD(qty * price, line.currency, rates);
    return { value: production > 0 ? usd / production : 0, error: null };
  }

  function categoryTotal(category, system, rates, scope) {
    return category.lines.reduce((sum, l) => sum + lineCost(l, system, rates, scope).value, 0);
  }

  function computeSystem(system, rates) {
    const scope = scopeFor(system, rates);
    const categories = system.categories.map((c) => ({
      id: c.id,
      title: c.title,
      total: categoryTotal(c, system, rates, scope),
      lines: c.lines.map((l) => Object.assign({ id: l.id }, lineCost(l, system, rates, scope))),
    }));
    const total = categories.reduce((s, c) => s + c.total, 0);

    const byTitle = {};
    categories.forEach((c) => { byTitle[c.title] = c.total; });

    const indicatorScope = {
      vars: Object.assign({}, scope, { toplam: total }),
      funcs: { kat: (name) => byTitle[name] || 0 },
    };
    const indicators = system.indicators.map((i) => {
      const res = global.Formula.run(i.formula, indicatorScope);
      return { id: i.id, value: res.value, error: res.ok ? null : res.error };
    });

    return { categories, total, indicators, scope };
  }

  global.Store = {
    STORAGE_KEY, CURRENCIES, CUR_SYMBOL,
    uid, L, C, V, I, slugKey, RESERVED_KEYS,
    load, save, flush, sanitize, defaultDoc, blankSystem,
    toUSD, scopeFor, lineCost, categoryTotal, computeSystem,
  };
})(window);
