"use strict";

const assert = require("assert");
const { deliverAppointmentWhatsApp } = require("./appointment-whatsapp-delivery");

(async function () {
  const calls = [];
  const result = await deliverAppointmentWhatsApp({
    appointment: {
      tenant_id: "tenant-a",
      customer_phone: "+573013507371"
    },
    params: {
      customer_name: "Santiago",
      appointment_date: "viernes, 21 de agosto",
      appointment_time: "03:00 p. m.",
      business_name: "NextforIA"
    },
    customerWindowOpen: async () => true,
    sendText: async (phone, message, options) => {
      calls.push({ phone, message, options });
      options.delivery_result.provider_message_id = "wamid.real-provider-id";
      return true;
    },
    sendTemplate: async () => {
      throw new Error("template_must_not_be_used_inside_customer_window");
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.provider_id, "wamid.real-provider-id");
  assert.strictEqual(result.mode, "text");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].options.tenant_id, "tenant-a");
  assert.ok(calls[0].options.delivery_result);
  console.log("appointment-whatsapp-delivery.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
