// ---------------------------------------------------------------------------
// Safe expression evaluator — the trust anchor of Creator Mode.
//
// A tiny, whitelisted language: numbers, strings, booleans, identifiers (looked
// up in a supplied context), the arithmetic/comparison/logical operators, and a
// fixed set of numeric functions. It is:
//   • pure         — no side effects, no I/O, no `eval`/Function.
//   • total        — never throws for arithmetic (÷0 → 0); the only runtime error
//                     is referencing an identifier absent from the context.
//   • bounded      — input length and parse depth are capped, so it cannot hang.
//   • deterministic— same input + context → same output, always.
//
// KPI tiles and watch rules compile to this; nothing here can read outside the
// context object it is given, mutate anything, or produce non-numeric effects.
// ---------------------------------------------------------------------------

export type Value = number | boolean | string;
export type Context = Record<string, Value>;

const MAX_LEN = 2000;
const MAX_DEPTH = 100;

// The only callable functions. Fixed, side-effect-free, numeric.
const FUNCTIONS: Record<string, (args: number[]) => number> = {
  min: (a) => (a.length ? Math.min(...a) : 0),
  max: (a) => (a.length ? Math.max(...a) : 0),
  abs: (a) => Math.abs(a[0] ?? 0),
  round: (a) => Math.round(a[0] ?? 0),
  floor: (a) => Math.floor(a[0] ?? 0),
  ceil: (a) => Math.ceil(a[0] ?? 0),
};
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

// --- AST -------------------------------------------------------------------
type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "id"; name: string }
  | { t: "un"; op: string; e: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "call"; name: string; args: Node[] };

// --- Tokenizer -------------------------------------------------------------
type Tok = { k: "num" | "str" | "id" | "op"; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      if ((text.match(/\./g)?.length ?? 0) > 1) throw new ExprError(`Malformed number "${text}".`);
      toks.push({ k: "num", v: text }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1; let out = "";
      while (j < src.length && src[j] !== c) { out += src[j]; j++; }
      if (j >= src.length) throw new ExprError("Unterminated string.");
      toks.push({ k: "str", v: out }); i = j + 1; continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < src.length && isId(src[j])) j++;
      toks.push({ k: "id", v: src.slice(i, j) }); i = j; continue;
    }
    // multi-char operators first
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { toks.push({ k: "op", v: two }); i += 2; continue; }
    if ("+-*/%<>()!,".includes(c)) { toks.push({ k: "op", v: c }); i++; continue; }
    throw new ExprError(`Unexpected character "${c}".`);
  }
  return toks;
}

export class ExprError extends Error {}

// --- Parser (recursive descent, precedence-climbing) -----------------------
class Parser {
  private p = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok | undefined { return this.toks[this.p++]; }
  private eatOp(v: string): boolean { const t = this.peek(); if (t && t.k === "op" && t.v === v) { this.p++; return true; } return false; }
  private guard() { if (++this.depth > MAX_DEPTH) throw new ExprError("Expression too deeply nested."); }

  parse(): Node {
    if (this.toks.length === 0) throw new ExprError("Empty expression.");
    const e = this.parseOr();
    if (this.p < this.toks.length) throw new ExprError(`Unexpected "${this.peek()!.v}".`);
    return e;
  }
  // or → and (('||') and)*
  private parseOr(): Node { this.guard(); let l = this.parseAnd(); while (this.matchWord("or") || this.eatOp("||")) l = { t: "bin", op: "||", l, r: this.parseAnd() }; this.depth--; return l; }
  private parseAnd(): Node { let l = this.parseNot(); while (this.matchWord("and") || this.eatOp("&&")) l = { t: "bin", op: "&&", l, r: this.parseNot() }; return l; }
  private parseNot(): Node { if (this.matchWord("not") || this.eatOp("!")) return { t: "un", op: "!", e: this.parseNot() }; return this.parseCmp(); }
  private parseCmp(): Node {
    let l = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) { this.p++; l = { t: "bin", op: t.v, l, r: this.parseAdd() }; }
      else break;
    }
    return l;
  }
  private parseAdd(): Node { let l = this.parseMul(); for (;;) { const t = this.peek(); if (t && t.k === "op" && (t.v === "+" || t.v === "-")) { this.p++; l = { t: "bin", op: t.v, l, r: this.parseMul() }; } else break; } return l; }
  private parseMul(): Node { let l = this.parseUnary(); for (;;) { const t = this.peek(); if (t && t.k === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) { this.p++; l = { t: "bin", op: t.v, l, r: this.parseUnary() }; } else break; } return l; }
  private parseUnary(): Node { if (this.eatOp("-")) return { t: "un", op: "-", e: this.parseUnary() }; if (this.eatOp("+")) return this.parseUnary(); return this.parsePrimary(); }
  private parsePrimary(): Node {
    this.guard();
    const t = this.next();
    if (!t) throw new ExprError("Unexpected end of expression.");
    let node: Node;
    if (t.k === "num") node = { t: "num", v: Number(t.v) };
    else if (t.k === "str") node = { t: "str", v: t.v };
    else if (t.k === "op" && t.v === "(") { node = this.parseOr(); if (!this.eatOp(")")) throw new ExprError("Missing ')'."); }
    else if (t.k === "id") {
      const low = t.v.toLowerCase();
      if (low === "true" || low === "false") node = { t: "bool", v: low === "true" };
      else if (this.peek()?.k === "op" && this.peek()!.v === "(") { this.p++; node = { t: "call", name: t.v, args: this.parseArgs() }; }
      else node = { t: "id", name: t.v };
    }
    else throw new ExprError(`Unexpected "${t.v}".`);
    this.depth--;
    return node;
  }
  private parseArgs(): Node[] {
    const args: Node[] = [];
    if (this.eatOp(")")) return args;
    args.push(this.parseOr());
    while (this.eatOp(",")) args.push(this.parseOr());
    if (!this.eatOp(")")) throw new ExprError("Missing ')' in function call.");
    return args;
  }
  private matchWord(w: string): boolean { const t = this.peek(); if (t && t.k === "id" && t.v.toLowerCase() === w) { this.p++; return true; } return false; }
}

// --- Coercions -------------------------------------------------------------
export function toNumber(v: Value): number { if (typeof v === "number") return Number.isFinite(v) ? v : 0; if (typeof v === "boolean") return v ? 1 : 0; const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
export function toBool(v: Value): boolean { if (typeof v === "boolean") return v; if (typeof v === "number") return v !== 0; return v.length > 0 && v !== "0" && v.toLowerCase() !== "false"; }

const WORD_OPS = new Set(["and", "or", "not", "true", "false"]);

// --- Evaluator -------------------------------------------------------------
function ev(n: Node, ctx: Context): Value {
  switch (n.t) {
    case "num": return n.v;
    case "str": return n.v;
    case "bool": return n.v;
    case "id": {
      if (!(n.name in ctx)) throw new ExprError(`Unknown field "${n.name}".`);
      return ctx[n.name];
    }
    case "un": return n.op === "!" ? !toBool(ev(n.e, ctx)) : -toNumber(ev(n.e, ctx));
    case "call": {
      const fn = FUNCTIONS[n.name.toLowerCase()];
      if (!fn) throw new ExprError(`Unknown function "${n.name}".`);
      return fn(n.args.map((a) => toNumber(ev(a, ctx))));
    }
    case "bin": {
      const op = n.op;
      if (op === "&&") return toBool(ev(n.l, ctx)) && toBool(ev(n.r, ctx));
      if (op === "||") return toBool(ev(n.l, ctx)) || toBool(ev(n.r, ctx));
      const l = ev(n.l, ctx); const r = ev(n.r, ctx);
      if (op === "==" || op === "!=") {
        const eq = typeof l === "number" || typeof r === "number" ? toNumber(l) === toNumber(r) : String(l) === String(r);
        return op === "==" ? eq : !eq;
      }
      const a = toNumber(l); const b = toNumber(r);
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? 0 : a / b;
        case "%": return b === 0 ? 0 : a % b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
      }
      throw new ExprError(`Unknown operator "${op}".`);
    }
  }
}

// Collect every identifier referenced (for static validation against a surface).
function idsOf(n: Node, out: Set<string>): void {
  switch (n.t) {
    case "id": out.add(n.name); break;
    case "un": idsOf(n.e, out); break;
    case "bin": idsOf(n.l, out); idsOf(n.r, out); break;
    case "call": n.args.forEach((a) => idsOf(a, out)); break;
    default: break;
  }
}

// --- Public API ------------------------------------------------------------
export function parseExpression(src: string): { ast?: Node; error?: string } {
  if (typeof src !== "string") return { error: "Expression must be text." };
  if (src.length > MAX_LEN) return { error: `Expression too long (max ${MAX_LEN}).` };
  try { return { ast: new Parser(tokenize(src)).parse() }; }
  catch (e) { return { error: e instanceof ExprError ? e.message : "Invalid expression." }; }
}

export function evaluateExpression(src: string, ctx: Context): { value?: Value; error?: string } {
  const { ast, error } = parseExpression(src);
  if (!ast) return { error };
  try { return { value: ev(ast, ctx) }; }
  catch (e) { return { error: e instanceof ExprError ? e.message : "Evaluation failed." }; }
}

// Parse + check every identifier is either an allowed field or a function name.
export function validateExpression(src: string, allowedKeys: string[]): { ok: boolean; error?: string } {
  const { ast, error } = parseExpression(src);
  if (!ast) return { ok: false, error };
  const ids = new Set<string>();
  idsOf(ast, ids);
  const allowed = new Set(allowedKeys);
  for (const id of ids) {
    if (WORD_OPS.has(id.toLowerCase())) continue;
    if (!allowed.has(id)) return { ok: false, error: `Unknown field "${id}".` };
  }
  return { ok: true };
}
