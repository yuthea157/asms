import { describe, it, expect } from "vitest";
import { parseFormula, evaluateFormula, evaluateExpression, FormulaError } from "../formulaEngine.js";

describe("formula engine", () => {
  it("evaluates the brief's own worked KPI formulas (§17)", () => {
    expect(evaluateExpression(
      "actualMinutesProduced / availableMinutes * 100",
      ["actualMinutesProduced", "availableMinutes"],
      { actualMinutesProduced: 385, availableMinutes: 480 }
    )).toBeCloseTo(80.208, 2);

    expect(evaluateExpression(
      "absentWorkerDays / scheduledWorkerDays * 100",
      ["absentWorkerDays", "scheduledWorkerDays"],
      { absentWorkerDays: 12, scheduledWorkerDays: 200 }
    )).toBeCloseTo(6, 5);

    expect(evaluateExpression(
      "separations / averageWorkforce * 100",
      ["separations", "averageWorkforce"],
      { separations: 5, averageWorkforce: 250 }
    )).toBeCloseTo(2, 5);

    expect(evaluateExpression(
      "defectiveUnits / inspectedUnits * 100",
      ["defectiveUnits", "inspectedUnits"],
      { defectiveUnits: 40, inspectedUnits: 500 }
    )).toBeCloseTo(8, 5);
  });

  it("respects operator precedence and parentheses", () => {
    expect(evaluateExpression("2 + 3 * 4", [], {})).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4", [], {})).toBe(20);
    expect(evaluateExpression("10 - 2 - 3", [], {})).toBe(5);
  });

  it("supports the allow-listed function set", () => {
    expect(evaluateExpression("min(a, b)", ["a", "b"], { a: 5, b: 3 })).toBe(3);
    expect(evaluateExpression("max(a, b)", ["a", "b"], { a: 5, b: 3 })).toBe(5);
    expect(evaluateExpression("round(a)", ["a"], { a: 4.6 })).toBe(5);
    expect(evaluateExpression("abs(a)", ["a"], { a: -7 })).toBe(7);
  });

  it("rejects a variable not in the declared list at PARSE time, not at eval time", () => {
    expect(() => parseFormula("a + b", ["a"])).toThrow(FormulaError);
    expect(() => parseFormula("a + b", ["a"])).toThrow(/not a declared variable/);
  });

  it("rejects a function outside the allow-list — never falls through to eval/Function", () => {
    expect(() => parseFormula("eval(a)", ["a"])).toThrow(/not an allowed function/);
    expect(() => parseFormula("constructor(a)", ["a"])).toThrow(/not an allowed function/);
  });

  it("rejects unrecognized characters (blocks any attempt at arbitrary code)", () => {
    expect(() => parseFormula("a; b", ["a", "b"])).toThrow(FormulaError);
    expect(() => parseFormula("a `template`", ["a"])).toThrow(FormulaError);
  });

  it("throws (never silently returns NaN/0) when a measurement is missing a required variable", () => {
    const ast = parseFormula("a / b", ["a", "b"]);
    expect(() => evaluateFormula(ast, { a: 10 })).toThrow(/Missing required value for variable "b"/);
  });

  it("throws on division by zero rather than returning Infinity/NaN", () => {
    const ast = parseFormula("a / b", ["a", "b"]);
    expect(() => evaluateFormula(ast, { a: 10, b: 0 })).toThrow(/Division by zero/);
  });

  it("parses once and evaluates the same AST repeatedly against different inputs", () => {
    const ast = parseFormula("actual / target * 100", ["actual", "target"]);
    expect(evaluateFormula(ast, { actual: 55, target: 100 })).toBeCloseTo(55, 10);
    expect(evaluateFormula(ast, { actual: 70, target: 100 })).toBeCloseTo(70, 10);
  });

  it("supports unary negation", () => {
    expect(evaluateExpression("-a + 10", ["a"], { a: 3 })).toBe(7);
  });
});
