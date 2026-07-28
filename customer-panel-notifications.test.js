"use strict";

const assert = require("assert");
const renderCustomerPanel = require("./customer-panel");

let html = "";
const res = {
  status: function () { return this; },
  setHeader: function () { return this; },
  send: function (value) { html = String(value); return this; }
};

renderCustomerPanel(res, {
  auth: { name: "Admin", role: "admin" },
  capabilities: {},
  initialTab: "notifications",
  botVersion: "v-test"
});

assert(html.includes("function notificationCardKey"));
assert(html.includes('data-action-url="'));
assert(html.includes('notificationAction(this.dataset.actionUrl)'));
assert(!html.includes('onclick="notificationAction("+JSON.stringify'));

console.log("customer-panel-notifications.test.js OK");
