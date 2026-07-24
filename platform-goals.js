"use strict";

const PLATFORM_GOAL_TOOL = "platform_goal_v1";
const PLATFORM_GOAL_RECORD_ID = "platform-goals:nexforia";
const PLATFORM_GOAL_PREFIX = "[PlatformGoal] ";
const PLATFORM_GOAL_TYPES = new Set(["counter"]);

const DEFAULT_PLATFORM_GOALS = [{
  id: "customers",
  type: "counter",
  label: "Clientes",
  unit: "clientes",
  target: 340,
  active: true,
  updated_at: null,
  updated_by: null
}];

function platformGoalError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function cleanId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePlatformGoal(input, current, actor, now) {
  const source = input || {};
  const previous = current || {};
  const id = cleanId(source.id || previous.id);
  const type = cleanId(source.type || previous.type || "counter");
  const label = cleanText(source.label == null ? previous.label : source.label, 60);
  const unit = cleanText(source.unit == null ? previous.unit : source.unit, 30).toLowerCase();
  const target = Number(source.target == null ? previous.target : source.target);

  if (!id || !/^[a-z][a-z0-9_-]*$/.test(id)) throw platformGoalError("invalid_goal_id");
  if (!PLATFORM_GOAL_TYPES.has(type)) throw platformGoalError("invalid_goal_type");
  if (label.length < 2) throw platformGoalError("invalid_goal_label");
  if (unit.length < 2) throw platformGoalError("invalid_goal_unit");
  if (!Number.isSafeInteger(target) || target < 1 || target > 1000000000) throw platformGoalError("invalid_goal_target");

  return {
    version: 1,
    id,
    type,
    label,
    unit,
    target,
    active: source.active == null ? previous.active !== false : source.active === true,
    updated_at: now || new Date().toISOString(),
    updated_by: cleanText(actor || "super_admin", 100)
  };
}

function parsePlatformGoalTurn(turn) {
  const tools = Array.isArray(turn && turn.tools) ? turn.tools : [];
  if (!tools.includes(PLATFORM_GOAL_TOOL)) return null;
  const raw = String(turn.botReply || "");
  if (!raw.startsWith(PLATFORM_GOAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(PLATFORM_GOAL_PREFIX.length));
    if (parsed.version !== 1) return null;
    return normalizePlatformGoal(parsed, null, parsed.updated_by, parsed.updated_at);
  } catch (_) {
    return null;
  }
}

function platformGoalsFromTurns(turns) {
  const goals = new Map(DEFAULT_PLATFORM_GOALS.map(function (goal) {
    return [goal.id, Object.assign({}, goal)];
  }));
  (turns || []).slice().sort(function (a, b) {
    return new Date(a.ts || 0) - new Date(b.ts || 0);
  }).forEach(function (turn) {
    const parsed = parsePlatformGoalTurn(turn);
    if (parsed) goals.set(parsed.id, parsed);
  });
  return Array.from(goals.values()).filter(function (goal) { return goal.active; });
}

function buildPlatformGoalRecord(goal) {
  return {
    ts: goal.updated_at,
    userId: PLATFORM_GOAL_RECORD_ID,
    userMessage: "",
    botReply: PLATFORM_GOAL_PREFIX + JSON.stringify(goal),
    tools: [PLATFORM_GOAL_TOOL],
    zeroResultQueries: [],
    handoff: false,
    rating: null,
    numTools: 1,
    status: "ok",
    eval: { skip: true, reason: PLATFORM_GOAL_TOOL }
  };
}

module.exports = {
  DEFAULT_PLATFORM_GOALS,
  PLATFORM_GOAL_RECORD_ID,
  PLATFORM_GOAL_TOOL,
  buildPlatformGoalRecord,
  normalizePlatformGoal,
  parsePlatformGoalTurn,
  platformGoalsFromTurns
};
