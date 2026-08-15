// The KPI formula engine (brief §17, docs/pams/SCORING_ENGINE.md §7):
// "Never execute arbitrary programming code. Use a controlled expression
// parser." No eval, no `new Function()`. A small hand-written
// recursive-descent parser restricted to +, -, *, /, parentheses, named
// variables drawn only from an explicitly declared list, and a tiny
// allow-listed function set (min, max, round, abs).
//
// Two-phase, deliberately: parseFormula() validates and builds an AST
// once, at formula-save time (rejecting anything outside the grammar or
// any variable not in the declared list). evaluateFormula() then runs the
// SAME already-validated AST repeatedly against real measurement inputs —
// no re-parsing of untrusted text happens at measurement-entry time, only
// numeric evaluation of an already-validated tree.

const ALLOWED_FUNCTIONS = new Set(["min", "max", "round", "abs"]);

class FormulaError extends Error {}

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let start = i;
      while (i < expression.length && /[0-9.]/.test(expression[i])) i++;
      tokens.push({ type: "number", value: parseFloat(expression.slice(start, i)) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let start = i;
      while (i < expression.length && /[A-Za-z0-9_]/.test(expression[i])) i++;
      tokens.push({ type: "identifier", value: expression.slice(start, i) });
      continue;
    }
    if ("+-*/(),".includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i++;
      continue;
    }
    throw new FormulaError(`Unrecognized character "${ch}" in formula.`);
  }
  return tokens;
}

/**
 * Recursive-descent parser producing a plain-object AST. `declaredVariables`
 * is the exact set of variable names this formula is allowed to reference —
 * anything else (including accidental typos) is a validation error here,
 * not a silent 0/undefined at evaluation time.
 */
export function parseFormula(expression, declaredVariables = []) {
  const declared = new Set(declaredVariables);
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = (type) => {
    const t = tokens[pos];
    if (!t || t.type !== type) throw new FormulaError(`Expected "${type}" at position ${pos}, got "${t ? t.value : "end of formula"}".`);
    pos++;
    return t;
  };

  function parseExpression() {
    let node = parseTerm();
    while (peek() && (peek().type === "+" || peek().type === "-")) {
      const op = consume(peek().type).type;
      node = { kind: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = parseFactor();
    while (peek() && (peek().type === "*" || peek().type === "/")) {
      const op = consume(peek().type).type;
      node = { kind: "binary", op, left: node, right: parseFactor() };
    }
    return node;
  }
  function parseFactor() {
    const t = peek();
    if (!t) throw new FormulaError("Unexpected end of formula.");
    if (t.type === "-") { consume("-"); return { kind: "negate", value: parseFactor() }; }
    if (t.type === "number") { consume("number"); return { kind: "number", value: t.value }; }
    if (t.type === "(") {
      consume("(");
      const node = parseExpression();
      consume(")");
      return node;
    }
    if (t.type === "identifier") {
      consume("identifier");
      if (peek() && peek().type === "(") {
        if (!ALLOWED_FUNCTIONS.has(t.value)) {
          throw new FormulaError(`"${t.value}" is not an allowed function. Allowed: ${[...ALLOWED_FUNCTIONS].join(", ")}.`);
        }
        consume("(");
        const args = [parseExpression()];
        while (peek() && peek().type === ",") { consume(","); args.push(parseExpression()); }
        consume(")");
        return { kind: "call", name: t.value, args };
      }
      if (!declared.has(t.value)) {
        throw new FormulaError(`"${t.value}" is not a declared variable for this formula. Declared variables: ${[...declared].join(", ") || "(none)"}.`);
      }
      return { kind: "variable", name: t.value };
    }
    throw new FormulaError(`Unexpected token "${t.value}".`);
  }

  const ast = parseExpression();
  if (pos !== tokens.length) throw new FormulaError(`Unexpected trailing content in formula at position ${pos}.`);
  return ast;
}

const FUNCTION_IMPLS = {
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
  round: (args) => Math.round(args[0]),
  abs: (args) => Math.abs(args[0]),
};

/**
 * Evaluates an already-validated AST (from parseFormula) against real
 * variable values. Throws if a variable the AST references is missing
 * from `variables` — a measurement missing a required input is a
 * validation error, never a silent NaN/0 (docs/pams/SCORING_ENGINE.md
 * §15's edge-case table).
 */
export function evaluateFormula(ast, variables = {}) {
  function evalNode(node) {
    switch (node.kind) {
      case "number": return node.value;
      case "negate": return -evalNode(node.value);
      case "variable": {
        if (!(node.name in variables) || variables[node.name] === null || variables[node.name] === undefined) {
          throw new FormulaError(`Missing required value for variable "${node.name}".`);
        }
        return Number(variables[node.name]);
      }
      case "call": return FUNCTION_IMPLS[node.name](node.args.map(evalNode));
      case "binary": {
        const l = evalNode(node.left);
        const r = evalNode(node.right);
        if (node.op === "+") return l + r;
        if (node.op === "-") return l - r;
        if (node.op === "*") return l * r;
        if (node.op === "/") {
          if (r === 0) throw new FormulaError("Division by zero.");
          return l / r;
        }
        throw new FormulaError(`Unknown operator "${node.op}".`);
      }
      default: throw new FormulaError(`Unknown AST node kind "${node.kind}".`);
    }
  }
  return evalNode(ast);
}

/** Convenience: parse + evaluate in one call, for the common case of a
 * one-shot calculation (the formula builder's live preview, for example). */
export function evaluateExpression(expression, declaredVariables, variables) {
  return evaluateFormula(parseFormula(expression, declaredVariables), variables);
}

export { FormulaError };
