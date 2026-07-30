import { evaluateExpression, validateExpression, parseExpression, toBool } from "@/lib/creator/expr";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };
const val = (src: string, ctx = {}) => evaluateExpression(src, ctx).value;
const err = (src: string, ctx = {}) => evaluateExpression(src, ctx).error;

console.log("Safe expression evaluator");

// Arithmetic + precedence
ok("2 + 3 * 4 = 14", val("2 + 3 * 4") === 14);
ok("(2 + 3) * 4 = 20", val("(2 + 3) * 4") === 20);
ok("unary minus", val("-5 + 2") === -3);
ok("divide by zero → 0 (total)", val("10 / 0") === 0);
ok("modulo by zero → 0", val("10 % 0") === 0);
ok("decimals", val("0.5 * 10") === 5);

// Comparisons + logic
ok("comparison true", val("5 > 3") === true);
ok("and short-circuits false", val("false and (1/0 > 5)") === false);
ok("or", val("false or true") === true);
ok("not", val("not false") === true);
ok("! operator", val("!(2 > 1)") === false);
ok("&& / || symbols", val("true && (1 < 2 || 3 < 1)") === true);
ok("chained compare via and", val("1 < 2 and 2 < 3") === true);

// Strings + equality
ok("string equality", val("'USD' == 'USD'") === true);
ok("string inequality", val("'USD' != 'EUR'") === true);
ok("numeric equality across types", val("1 == true") === true);

// Identifiers from context
ok("identifier lookup", val("amount * 2", { amount: 100 }) === 200);
ok("boolean field", val("insured and amount > 50", { insured: true, amount: 100 }) === true);
ok("field in compound rule", toBool(val("uninsured > 1000000 and recourse == 0", { uninsured: 2000000, recourse: 0 }) as boolean) === true);

// Functions
ok("min", val("min(3, 7, 2)") === 2);
ok("max", val("max(3, 7, 2)") === 7);
ok("abs", val("abs(-9)") === 9);
ok("round", val("round(2.6)") === 3);
ok("nested funcs", val("max(abs(-4), min(10, 3))") === 4);

// Errors — total & safe
ok("unknown identifier errors", err("foo + 1") !== undefined);
ok("unknown function errors", err("frobnicate(1)") !== undefined);
ok("unterminated string errors", parseExpression("'abc").error !== undefined);
ok("unexpected char errors", parseExpression("2 @ 3").error !== undefined);
ok("empty errors", parseExpression("").error !== undefined);
ok("trailing garbage errors", parseExpression("2 3").error !== undefined);
ok("deep nesting is bounded", parseExpression("(".repeat(500) + "1" + ")".repeat(500)).error !== undefined);
ok("over-length rejected", parseExpression("1+".repeat(1100) + "1").error !== undefined);
ok("no eval / property access", parseExpression("a.b").error !== undefined);

// validateExpression against an allowed surface
ok("validate ok when ids allowed", validateExpression("amount > 100 and tenor < 90", ["amount", "tenor"]).ok === true);
ok("validate rejects unknown id", validateExpression("amount > secret", ["amount"]).ok === false);
ok("validate allows functions + literals", validateExpression("max(amount, 0) > 0", ["amount"]).ok === true);
ok("validate allows word operators", validateExpression("a and not b or true", ["a", "b"]).ok === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
