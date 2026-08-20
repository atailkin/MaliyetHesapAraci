
(function (global) {
  "use strict";

  const truthy = (x) => Number(x) !== 0;

  const FUNCS = {
    abs: (x) => Math.abs(x),
    sqrt: (x) => Math.sqrt(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    min: (...a) => Math.min(...a),
    max: (...a) => Math.max(...a),
    round: (x, d) => {
      const p = Math.pow(10, Math.round(d || 0));
      return Math.round(x * p) / p;
    },
    eger: (test, whenTrue, whenFalse) => (truthy(test) ? whenTrue : whenFalse),
    ve: (...a) => (a.every(truthy) ? 1 : 0),
    veya: (...a) => (a.some(truthy) ? 1 : 0),
    degil: (x) => (truthy(x) ? 0 : 1),
  };

  const ALIASES = { if: "eger" };

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }

      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
        const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
        tokens.push({ t: "num", v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        tokens.push({ t: "name", v: m[0] });
        i += m[0].length;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = src.indexOf(ch, i + 1);
        if (end === -1) throw new Error("Kapatılmamış tırnak işareti");
        tokens.push({ t: "str", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      const pair = src.substr(i, 2);
      if (pair === "<=" || pair === ">=" || pair === "<>" || pair === "==" || pair === "!=") {
        tokens.push({ t: "cmp", v: pair === "==" ? "=" : (pair === "!=" ? "<>" : pair) });
        i += 2;
        continue;
      }
      if (ch === "<" || ch === ">" || ch === "=") { tokens.push({ t: "cmp", v: ch }); i++; continue; }

      if ("+-*/^(),".indexOf(ch) !== -1) { tokens.push({ t: ch }); i++; continue; }
      throw new Error(`Beklenmeyen karakter: "${ch}"`);
    }
    return tokens;
  }

  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const eat = (t) => {
      if (!tokens[pos] || tokens[pos].t !== t) {
        throw new Error(`"${t}" bekleniyordu`);
      }
      return tokens[pos++];
    };

    function parseCompare() {
      const node = parseExpr();
      if (peek() && peek().t === "cmp") {
        const op = tokens[pos++].v;
        return { k: "cmp", op, a: node, b: parseExpr() };
      }
      return node;
    }
    function parseExpr() {
      let node = parseTerm();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        const op = tokens[pos++].t;
        node = { k: "bin", op, a: node, b: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      let node = parseUnary();
      while (peek() && (peek().t === "*" || peek().t === "/")) {
        const op = tokens[pos++].t;
        node = { k: "bin", op, a: node, b: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && (peek().t === "-" || peek().t === "+")) {
        const op = tokens[pos++].t;
        return { k: "un", op, a: parseUnary() };
      }
      return parsePower();
    }
    function parsePower() {
      const base = parsePrimary();
      if (peek() && peek().t === "^") {
        pos++;
        return { k: "bin", op: "^", a: base, b: parseUnary() };
      }
      return base;
    }
    function parsePrimary() {
      const tok = peek();
      if (!tok) throw new Error("Formül eksik kaldı");

      if (tok.t === "num") { pos++; return { k: "num", v: tok.v }; }
      if (tok.t === "str") { pos++; return { k: "str", v: tok.v }; }
      if (tok.t === "(") {
        pos++;
        const inner = parseCompare();
        eat(")");
        return inner;
      }
      if (tok.t === "name") {
        pos++;
        if (peek() && peek().t === "(") {
          pos++;
          const args = [];
          if (peek() && peek().t !== ")") {
            args.push(parseCompare());
            while (peek() && peek().t === ",") { pos++; args.push(parseCompare()); }
          }
          eat(")");
          return { k: "call", name: tok.v, args };
        }
        return { k: "ref", name: tok.v };
      }
      throw new Error(`Beklenmeyen "${tok.v ?? tok.t}"`);
    }

    const ast = parseCompare();
    if (pos < tokens.length) {
      throw new Error(`Fazladan "${tokens[pos].v ?? tokens[pos].t}"`);
    }
    return ast;
  }

  function evaluate(node, scope) {
    switch (node.k) {
      case "num": return node.v;
      case "str": return node.v;
      case "un": {
        const v = evaluate(node.a, scope);
        return node.op === "-" ? -v : +v;
      }
      case "cmp": {
        const a = evaluate(node.a, scope);
        const b = evaluate(node.b, scope);
        switch (node.op) {
          case "<": return a < b ? 1 : 0;
          case ">": return a > b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
          case "=": return a === b ? 1 : 0;
          case "<>": return a !== b ? 1 : 0;
        }
        return 0;
      }
      case "bin": {
        const a = evaluate(node.a, scope);
        const b = evaluate(node.b, scope);
        switch (node.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? 0 : a / b;
          case "^": return Math.pow(a, b);
        }
        return 0;
      }
      case "ref": {
        const vars = scope.vars || {};
        if (!Object.prototype.hasOwnProperty.call(vars, node.name)) {
          throw new Error(`Bilinmeyen değişken: ${node.name}`);
        }
        const v = Number(vars[node.name]);
        return Number.isFinite(v) ? v : 0;
      }
      case "call": {
        const custom = scope.funcs || {};
        const name = Object.prototype.hasOwnProperty.call(ALIASES, node.name)
          ? ALIASES[node.name]
          : node.name;
        const fn = Object.prototype.hasOwnProperty.call(custom, name)
          ? custom[name]
          : (Object.prototype.hasOwnProperty.call(FUNCS, name) ? FUNCS[name] : null);
        if (typeof fn !== "function") throw new Error(`Bilinmeyen fonksiyon: ${node.name}()`);
        return fn(...node.args.map((a) => evaluate(a, scope)));
      }
    }
    return 0;
  }

  function collectRefs(node, out) {
    if (!node || typeof node !== "object") return out;
    if (node.k === "ref") out.add(node.name);
    ["a", "b"].forEach((key) => node[key] && collectRefs(node[key], out));
    (node.args || []).forEach((a) => collectRefs(a, out));
    return out;
  }

  const cache = new Map();
  const CACHE_LIMIT = 500;

  function compile(src) {
    const key = String(src ?? "");
    if (cache.has(key)) return cache.get(key);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    let result;
    try {
      if (!key.trim()) throw new Error("Formül boş");
      const ast = parse(tokenize(key));
      result = { ok: true, ast, refs: [...collectRefs(ast, new Set())] };
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    cache.set(key, result);
    return result;
  }

  function run(src, scope) {
    const compiled = compile(src);
    if (!compiled.ok) return { ok: false, value: 0, error: compiled.error };
    try {
      const value = evaluate(compiled.ast, scope || {});
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, value: 0, error: "Sonuç sayı değil" };
    } catch (err) {
      return { ok: false, value: 0, error: err.message };
    }
  }

  global.Formula = { compile, run, FUNC_NAMES: Object.keys(FUNCS) };
})(window);
