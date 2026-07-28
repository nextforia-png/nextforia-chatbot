"use strict";

const assert = require("assert");
const renderClientOnboarding = require("./client-onboarding-page");

let html = "";
const res = {
  status: function () { return res; },
  setHeader: function () { return res; },
  send: function (value) {
    html = value;
    return res;
  }
};
renderClientOnboarding(res, {
  tenant: { id: "tenant-render-test", name: "Tenant Render Test" },
  adminEmail: "admin@example.com",
  record: {
    status: "draft",
    completion: 0,
    setup_completed: false,
    answers: { setup_goal: "customer_service" }
  },
  questionnaire: {
    questions: [{
      id: "new_real_setup_question",
      path: "customer_service_setup.new_training_rule",
      section: "business",
      order: 999,
      active: true,
      required: false,
      type: "textarea",
      label: "Nueva pregunta real"
    }]
  }
});

assert.match(html, /function renderDynamicQuestions\(\)/);
assert.match(html, /createQuestionField\(question\)/);
assert.match(html, /question\.path!=="setup_goal"&&questionApplies\(question\)/);
assert.match(html, /grid\.querySelector\(fieldSelector\(question\.path\)\)/);
assert.match(html, /customer_service_setup\.new_training_rule/);

console.log("client-onboarding-page.test.js: ok");
