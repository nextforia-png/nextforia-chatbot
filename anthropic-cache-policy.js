"use strict";

const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;

function withoutCacheControl(value) {
  if (!value || typeof value !== "object") return value;
  const copy = Object.assign({}, value);
  delete copy.cache_control;
  return copy;
}

function applyAnthropicCachePolicy(options) {
  options = options || {};
  const staticSystem = (options.staticSystem || []).filter(Boolean).map(withoutCacheControl);
  const dynamicSystem = (options.dynamicSystem || []).filter(Boolean).map(withoutCacheControl);
  const tools = (options.tools || []).filter(Boolean).map(withoutCacheControl);
  let breakpoints = 0;

  // One breakpoint caches the complete stable system prefix, regardless of how
  // many tenant prompt blocks compose it. Dynamic customer context stays out.
  if (staticSystem.length) {
    staticSystem[staticSystem.length - 1] = Object.assign({}, staticSystem[staticSystem.length - 1], {
      cache_control: { type: "ephemeral" }
    });
    breakpoints++;
  }

  // A second breakpoint caches the tool definitions. Keeping this centralized
  // prevents new bot modules from exceeding Anthropic's request-wide limit.
  if (tools.length && breakpoints < ANTHROPIC_MAX_CACHE_BREAKPOINTS) {
    tools[tools.length - 1] = Object.assign({}, tools[tools.length - 1], {
      cache_control: { type: "ephemeral" }
    });
    breakpoints++;
  }

  return {
    system: staticSystem.concat(dynamicSystem),
    tools,
    cache_breakpoints: breakpoints
  };
}

module.exports = {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  applyAnthropicCachePolicy
};
