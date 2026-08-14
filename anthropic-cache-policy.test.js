"use strict";

const assert = require("assert");
const {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  applyAnthropicCachePolicy
} = require("./anthropic-cache-policy");

const request = applyAnthropicCachePolicy({
  staticSystem: [
    { type: "text", text: "base", cache_control: { type: "ephemeral" } },
    { type: "text", text: "customer profile", cache_control: { type: "ephemeral" } },
    { type: "text", text: "appointment setup", cache_control: { type: "ephemeral" } },
    { type: "text", text: "appointment operations", cache_control: { type: "ephemeral" } },
    { type: "text", text: "personality", cache_control: { type: "ephemeral" } }
  ],
  dynamicSystem: [
    { type: "text", text: "customer memory", cache_control: { type: "ephemeral" } }
  ],
  tools: [
    { name: "check_appointment_availability", cache_control: { type: "ephemeral" } },
    { name: "book_appointment", cache_control: { type: "ephemeral" } }
  ]
});

const breakpointCount = request.system.concat(request.tools).filter(function (item) {
  return !!(item && item.cache_control);
}).length;

assert.strictEqual(request.system.length, 6, "all system prompt blocks must be preserved");
assert.strictEqual(request.tools.length, 2, "all tools must be preserved");
assert.strictEqual(breakpointCount, 2, "one stable prompt and one tool breakpoint are sufficient");
assert(breakpointCount <= ANTHROPIC_MAX_CACHE_BREAKPOINTS, "Anthropic request limit must never be exceeded");
assert.strictEqual(request.system[4].cache_control.type, "ephemeral", "last stable system block is the cache boundary");
assert.strictEqual(request.system[5].cache_control, undefined, "dynamic customer context must not be cached");
assert.strictEqual(request.tools[1].cache_control.type, "ephemeral", "tool definitions retain a cache boundary");

console.log("anthropic-cache-policy.test.js ok");
