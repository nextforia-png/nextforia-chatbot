"use strict";

const assert = require("assert");
const {
  DEFAULT_PLATFORM_GOALS,
  PLATFORM_GOAL_RECORD_ID,
  PLATFORM_GOAL_TOOL,
  buildPlatformGoalRecord,
  normalizePlatformGoal,
  parsePlatformGoalTurn,
  platformGoalsFromTurns
} = require("./platform-goals");

assert.strictEqual(DEFAULT_PLATFORM_GOALS[0].id, "customers");
assert.strictEqual(DEFAULT_PLATFORM_GOALS[0].target, 340);

const updated = normalizePlatformGoal({
  id: "customers",
  type: "counter",
  label: "Clientes activos",
  unit: "clientes",
  target: 500
}, DEFAULT_PLATFORM_GOALS[0], "owner@example.test", "2026-07-24T12:00:00.000Z");

assert.deepStrictEqual(updated, {
  version: 1,
  id: "customers",
  type: "counter",
  label: "Clientes activos",
  unit: "clientes",
  target: 500,
  active: true,
  updated_at: "2026-07-24T12:00:00.000Z",
  updated_by: "owner@example.test"
});

const record = buildPlatformGoalRecord(updated);
assert.strictEqual(record.userId, PLATFORM_GOAL_RECORD_ID);
assert.deepStrictEqual(record.tools, [PLATFORM_GOAL_TOOL]);
assert.deepStrictEqual(parsePlatformGoalTurn(record), updated);
assert.strictEqual(platformGoalsFromTurns([record]).find(function (goal) { return goal.id === "customers"; }).target, 500);

assert.throws(function () {
  normalizePlatformGoal({ id: "customers", target: 0 }, DEFAULT_PLATFORM_GOALS[0], "owner");
}, /invalid_goal_target/);
assert.throws(function () {
  normalizePlatformGoal({ id: "revenue", type: "currency", label: "Ingresos", unit: "COP", target: 10 }, null, "owner");
}, /invalid_goal_type/);

console.log("platform-goals.test.js: ok");
