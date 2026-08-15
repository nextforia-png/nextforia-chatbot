"use strict";

const assert = require("assert");
const vm = require("vm");
const configurationUi = require("./customer-bot-configuration");
const renderCustomerPanel = require("./customer-panel");

assert(configurationUi.markup.includes("Tu bot ya está atendiendo. Ahora afínalo."));
assert(configurationUi.markup.includes('href="/admin/client-onboarding?edit=1"'));
assert(configurationUi.markup.includes("El cuestionario que llenaste en el setup"));
assert(configurationUi.markup.includes("Guardar y aplicar cambios"));
assert(configurationUi.markup.includes("siguiente respuesta del bot"));
assert(configurationUi.styles.includes("@media(max-width:860px)"));
assert(configurationUi.clientScript.includes('["shipping","Datos para un envío","Con Aura o Atlas"]'));
assert(configurationUi.clientScript.includes('["reminders","Recordatorio de cita o reserva","Con Tempo o Atlas"]'));
assert(configurationUi.clientScript.includes("¿Cómo cobras el envío?"));
assert(configurationUi.clientScript.includes("shipping.flat_fee_cop"));
assert(configurationUi.clientScript.includes("shipping.free_over_cop"));
assert(configurationUi.clientScript.includes("shipping.policy"));
assert(configurationUi.clientScript.includes("nxSetShippingMode"));
assert(configurationUi.clientScript.includes("nxConfigSaveSequence+=1"));
assert(configurationUi.clientScript.includes("result.applied!==true"));
assert(configurationUi.clientScript.includes("Cambios aplicados al bot"));
assert(configurationUi.clientScript.includes('typeof payload.can_edit==="boolean"'));
assert(configurationUi.clientScript.includes("nxSelectLogoFile"));
assert(configurationUi.clientScript.includes("preparePanelImage(file)"));
assert(configurationUi.clientScript.includes("Descripción pública en WhatsApp"));
assert(configurationUi.clientScript.includes("Nombre del bot y nombre que quieres mostrar en WhatsApp"));
assert(configurationUi.clientScript.includes("Foto de WhatsApp y nombre del bot"));
assert(configurationUi.clientScript.includes("Nombre público de WhatsApp"));
assert(configurationUi.clientScript.includes("Nombre que quieres"));
assert(configurationUi.clientScript.includes("WhatsApp muestra"));
assert(configurationUi.clientScript.includes("Solicitar o cambiar nombre en Meta"));
assert(configurationUi.clientScript.includes("display_name_pending_review"));
assert(configurationUi.clientScript.includes("display_name_approved_re_registration_required"));
assert(configurationUi.clientScript.includes("display_name_declined"));
assert(configurationUi.clientScript.includes("display_name_change_required"));
assert(configurationUi.clientScript.includes("nxSafeWhatsAppManagerUrl"));
assert.match(configurationUi.clientScript, /business\\\.facebook\\\.com\\\/wa\\\/manage\\\/phone-numbers/);
assert(configurationUi.clientScript.includes("La dirección también se publica"));
assert(configurationUi.clientScript.includes("Verificando perfil en WhatsApp"));
assert(!configurationUi.clientScript.includes("URL del logo o imagen"));
new Function(configurationUi.clientScript);
const uiContext = {
  state: { whatsappProfileSync: null, personalityCanEdit: true },
  PANEL_CONTEXT: { businessName: "RAV Toys" },
  document: { addEventListener: function () {} },
  window: {},
  esc: function (value) { return String(value == null ? "" : value); },
  attr: function (value) { return String(value == null ? "" : value); },
  clearTimeout: clearTimeout,
  setTimeout: setTimeout
};
vm.runInNewContext(configurationUi.clientScript, uiContext);
const pendingNameCard = uiContext.nxWhatsAppDisplayNameState({
  status: "display_name_pending_review",
  desired_display_name: "RAV Bot",
  current_display_name: "RAV toys",
  manager_url: "https://business.facebook.com/wa/manage/phone-numbers/?waba_id=waba-one&phone_number_id=phone-one"
}, "RAV Bot");
assert(pendingNameCard.includes("RAV Bot"));
assert(pendingNameCard.includes("RAV toys"));
assert(pendingNameCard.includes("En revisión"));
assert(pendingNameCard.includes("Solicitar o cambiar nombre en Meta"));
const unsafeNameCard = uiContext.nxWhatsAppDisplayNameState({
  status: "display_name_change_required",
  manager_url: "https://evil.example/steal"
}, "RAV Bot");
assert(!unsafeNameCard.includes("evil.example"));
assert(!unsafeNameCard.includes("Solicitar o cambiar nombre en Meta"));

function render(role, tenant) {
  let html = "";
  const res = {
    status() { return this; },
    setHeader() { return this; },
    send(value) { html = String(value); return this; }
  };
  renderCustomerPanel(res, {
    auth: { name: "QA", role },
    capabilities: {},
    initialTab: "setup",
    botVersion: "v-config-test",
    tenantContext: tenant
  });
  return html;
}

const auraHtml = render("admin", {
  id: "tenant-a",
  company_name: "Empresa A",
  plan_id: "nextfor-aura",
  assigned_bot_id: "atencion-cliente"
});
assert(auraHtml.includes("Tu bot ya está atendiendo. Ahora afínalo."));
assert(auraHtml.includes('PANEL_PERSONALITY_PATH="/admin/panel/bot-personality"'));
assert(auraHtml.includes('PANEL_ACCOUNT_PATH="/admin/panel/account-profile"'));
assert(auraHtml.includes("Administrador de la cuenta"));
assert(auraHtml.includes("Celular de contacto"));
assert(auraHtml.includes("Cambiar contraseña"));
assert(auraHtml.includes("preparePanelImage"));
assert(auraHtml.includes("new FileReader()"));
assert(auraHtml.includes("reader.readAsDataURL(file)"));
assert(!auraHtml.includes("URL.createObjectURL(file)"));
assert(auraHtml.includes('canvas.toDataURL("image/jpeg"'));
assert(auraHtml.includes("/whatsapp-profile-sync"));
assert(auraHtml.includes("Bot y perfil de WhatsApp actualizados"));
assert(auraHtml.includes("Bot aplicado · cambia el nombre público en Meta"));
assert(auraHtml.includes("Bot aplicado · nombre en revisión de Meta"));
assert(auraHtml.includes("Bot aplicado · actualiza el perfil en WhatsApp Business"));
assert(auraHtml.includes("Herramientas para la empresa → Perfil de empresa"));
assert(auraHtml.includes('sync.status==="manual_app_required"'));
assert(auraHtml.includes("Bot aplicado · WhatsApp no actualizado"));
assert(auraHtml.includes("loadBotSetup();loadBotPersonality(false)"));
assert(auraHtml.includes("Versión v-config-test"));
assert(!auraHtml.includes(">RAV Toys<"));

const viewerHtml = render("viewer", {
  id: "tenant-b",
  company_name: "Empresa B",
  plan_id: "nextfor-uno",
  assigned_bot_id: "atencion-cliente"
});
assert(viewerHtml.includes("Empresa B"));
assert(viewerHtml.includes("nxApplyEditPermissions"));

console.log("customer-bot-configuration.test.js ok");
