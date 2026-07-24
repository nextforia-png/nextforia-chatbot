"use strict";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function safeJson(value) {
  return JSON.stringify(value || {}).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function formatCop(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return "$" + String(Math.max(0, Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

module.exports = function renderClientOnboarding(res, options) {
  options = options || {};
  const tenant = options.tenant || { id: "pilot-demo", name: "Tu negocio" };
  const record = options.record || { status: "draft", completion: 0, setup_completed: false, answers: {} };
  const demo = !!options.demo;
  const apiPath = options.apiPath || "/admin/client-onboarding/data";
  const actor = options.actor || "";
  const adminEmail = options.adminEmail || actor;
  const plan = options.plan || null;
  const plans = Array.isArray(options.plans) ? options.plans : (plan ? [plan] : []);
  const bot = options.bot || null;
  const selectedPlanId = String(tenant.plan_id || plan && plan.id || "");
  const planName = plan && (plan.nombre || plan.name) || tenant.plan_id || "Plan asignado";
  const botName = bot && (bot.nombre || bot.name) || tenant.assigned_bot_id || "Asistente asignado";
  const botDescription = bot && bot.descripcion || "Configurado por el equipo de Nextfor IA.";
  const planChoices = plans.map(function (item) {
    const id = String(item.id || "");
    const name = item.nombre || item.name || id;
    const prices = [
      Number.isFinite(Number(item.precio_setup)) ? formatCop(item.precio_setup) + " instalación" : "",
      Number.isFinite(Number(item.precio_mensual)) ? formatCop(item.precio_mensual) + "/mes" : ""
    ].filter(Boolean).join(" · ");
    const benefits = (Array.isArray(item.beneficios) ? item.beneficios : []).slice(0, 3);
    return '<label class="planChoice"><input type="radio" name="selected_plan" value="' + escapeHtml(id) + '"' +
      (id === selectedPlanId ? " checked" : "") + '><span class="planChoiceBody"><span class="planChoiceTop"><strong>' +
      escapeHtml(name) + '</strong>' + (item.etiqueta ? '<em>' + escapeHtml(item.etiqueta) + '</em>' : "") +
      '</span><small>' + escapeHtml(item.descripcion || "Plan disponible para tu asistente.") + '</small>' +
      (prices ? '<b>' + escapeHtml(prices) + '</b>' : "") +
      (benefits.length ? '<ul>' + benefits.map(function (benefit) { return "<li>" + escapeHtml(benefit) + "</li>"; }).join("") + "</ul>" : "") +
      '</span></label>';
  }).join("");

  res.status(200).setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Configura tu asistente · Nextfor IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root{--navy-950:#060F22;--navy-900:#0A1836;--navy-800:#0E2148;--navy-700:#122A5C;--cyan-50:#E8F7FE;--cyan-100:#C9ECFC;--cyan-300:#57C2F3;--cyan-400:#26ADEE;--cyan-500:#00A0F0;--cyan-600:#0587CC;--cyan-700:#0A6BA1;--slate-50:#F6F8FB;--slate-100:#EDF1F7;--slate-200:#DFE6F0;--slate-300:#C6D1E0;--slate-400:#94A3BC;--slate-500:#647289;--slate-700:#313C50;--slate-900:#101728;--green:#14A971;--green-soft:#E7F7F0;--amber:#F5A524;--red:#EF4E4E;--card:#fff;--line:#DFE6F0;--gradient-cyan:linear-gradient(135deg,#26ADEE 0%,#00A0F0 55%,#0587CC 100%);--gradient-hero:radial-gradient(120% 120% at 85% 0%,rgba(23,53,112,.55) 0%,rgba(10,24,54,0) 55%),linear-gradient(160deg,#0E2148 0%,#060F22 100%);--shadow:0 16px 40px rgba(10,24,54,.12);--glow:0 10px 34px rgba(0,160,240,.28)}
*{box-sizing:border-box}html{background:var(--slate-50)}body{margin:0;min-height:100vh;background:var(--slate-50);color:var(--slate-700);font-family:"Plus Jakarta Sans",ui-sans-serif,sans-serif}button,input,textarea{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid rgba(0,160,240,.28);outline-offset:2px}.hidden{display:none!important}
.top{height:72px;padding:0 max(24px,calc((100vw - 1200px)/2));background:var(--navy-900);display:flex;align-items:center;justify-content:space-between;color:#fff}.brand{display:flex;align-items:center;gap:12px}.brand img{width:32px;height:32px;object-fit:contain}.brand strong{display:block;font:700 17px Sora,sans-serif}.brand span{display:block;margin-top:2px;color:#9DB0CD;font-size:11px}.secure{display:flex;align-items:center;gap:7px;color:#CFE0F5;font-size:12px;font-weight:700}.secure i{width:8px;height:8px;border-radius:50%;background:var(--green)}
.welcome{min-height:calc(100vh - 72px);background:var(--gradient-hero);position:relative;overflow:hidden;display:grid;place-items:center;padding:48px 24px}.welcome:before,.welcome:after{content:"";position:absolute;border-radius:50%;filter:blur(1px);pointer-events:none}.welcome:before{width:440px;height:440px;right:-180px;top:-210px;background:radial-gradient(circle,rgba(0,160,240,.18),transparent 68%)}.welcome:after{width:360px;height:360px;left:-170px;bottom:-190px;background:radial-gradient(circle,rgba(38,173,238,.12),transparent 68%)}.welcomeInner{position:relative;z-index:1;max-width:760px;text-align:center}.lumenWrap{width:142px;height:142px;margin:0 auto 18px;position:relative}.lumenWrap img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 14px 28px rgba(0,160,240,.28));animation:float 6s ease-in-out infinite}.hello{position:absolute;right:-70px;top:5px;background:#fff;color:var(--navy-800);padding:9px 13px;border-radius:14px 14px 14px 4px;box-shadow:var(--shadow);font-size:12px;font-weight:800}.online{position:absolute;left:-44px;bottom:5px;padding:7px 11px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);backdrop-filter:blur(8px);border-radius:999px;color:#CFE0F5;font-size:11px;font-weight:700}.online:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:6px}.overline{color:var(--cyan-300);font-size:11px;font-weight:800;letter-spacing:.14em}.welcome h1{margin:12px auto 15px;color:#fff;font:800 clamp(32px,5vw,48px)/1.08 Sora,sans-serif;letter-spacing:-.04em}.welcome h1 em{font-style:normal;color:var(--cyan-400)}.welcome p{max-width:650px;margin:0 auto;color:rgba(255,255,255,.78);font-size:16px;line-height:1.65}.startBtn{height:54px;margin-top:28px;padding:0 24px;border:0;border-radius:14px;background:var(--gradient-cyan);color:#fff;font-weight:800;font-size:16px;box-shadow:var(--glow)}.trust{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-top:22px;color:#BED0E8;font-size:12px}.trust span:before{content:"✓";color:#52D39B;font-weight:900;margin-right:7px}.stepsIntro{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:28px}.introStep{display:flex;align-items:center;gap:8px;color:#D7E5F6;font-size:11px;font-weight:700}.introStep b{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:var(--gradient-cyan);color:#fff}.introLine{width:28px;height:1px;background:rgba(255,255,255,.2)}
.setupPage{max-width:1200px;margin:0 auto;padding:32px 24px 70px}.setupHead{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.setupHead h1{margin:0;color:var(--navy-900);font:800 30px/1.15 Sora,sans-serif;letter-spacing:-.04em}.setupHead p{margin:8px 0 0;color:var(--slate-500);font-size:14px}.saveStatus{display:flex;align-items:center;gap:7px;background:var(--green-soft);color:#087B51;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:800}.saveStatus:before{content:"✓"}
.layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:22px;align-items:start}.formCard,.previewCard,.contractCard{background:#fff;border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}.formCard{overflow:hidden}.formTop{padding:22px;border-bottom:1px solid var(--line)}.stepMeta{display:flex;align-items:center;justify-content:space-between;gap:14px;color:var(--slate-500);font-size:12px;font-weight:700}.stepDots{display:flex;gap:6px}.stepDot{width:25px;height:25px;border:0;border-radius:50%;background:var(--slate-200);color:var(--slate-500);font-size:11px;font-weight:800}.stepDot.active{background:var(--navy-700);color:#fff}.stepDot.done{background:var(--cyan-500);color:#fff}.progress{height:7px;margin-top:13px;border-radius:999px;background:var(--slate-100);overflow:hidden}.progress span{display:block;height:100%;background:var(--gradient-cyan);border-radius:inherit;transition:width .3s ease}.panel{display:none;padding:26px 28px}.panel.active{display:block;animation:rise .22s ease-out}.panel h2{margin:0;color:var(--navy-900);font:800 23px/1.2 Sora,sans-serif;letter-spacing:-.03em}.panel>p{margin:7px 0 22px;color:var(--slate-500);font-size:13px;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.field{display:grid;gap:7px;align-content:start}.field.wide{grid-column:1/-1}.field span{font-size:12px;color:var(--slate-700);font-weight:800}.field small{font-size:10.5px;line-height:1.4;color:var(--slate-500)}.field input,.field textarea{width:100%;border:1px solid var(--slate-300);border-radius:12px;background:#fff;color:var(--slate-900);padding:12px 13px}.field input{height:46px}.field textarea{min-height:116px;line-height:1.5;resize:vertical}.field input[readonly]{background:var(--slate-50);color:var(--slate-500)}.field.invalid input,.field.invalid textarea{border-color:var(--red);box-shadow:0 0 0 3px rgba(239,78,78,.1)}.fieldError{min-height:13px;color:var(--red);font-size:10.5px}.segment{display:flex;gap:8px;flex-wrap:wrap}.segment label{position:relative}.segment input{position:absolute;opacity:0;pointer-events:none}.segment span{display:block;padding:9px 14px;border:1.5px solid var(--slate-300);border-radius:999px;font-size:12px;font-weight:700}.segment input:checked+span{background:var(--cyan-50);border-color:var(--cyan-500);color:var(--cyan-700)}.info{display:flex;gap:10px;padding:13px 14px;border:1px solid #BEE6FB;border-radius:13px;background:var(--cyan-50);color:#075985;font-size:11.5px;line-height:1.5}.actions{display:flex;align-items:center;gap:10px;padding:15px 20px;border-top:1px solid var(--line);background:#FBFDFF}.actions p{margin:0 auto 0 0;color:var(--slate-500);font-size:11px}.btn{height:43px;border-radius:12px;padding:0 16px;border:1px solid var(--slate-300);background:#fff;color:var(--navy-900);font-size:12px;font-weight:800}.btn.primary{border:0;background:var(--gradient-cyan);color:#fff;box-shadow:0 8px 22px rgba(0,160,240,.2)}.btn:disabled{opacity:.5;cursor:not-allowed}
.planChoices{display:grid;gap:12px}.planChoice{display:block;position:relative}.planChoice input{position:absolute;opacity:0;pointer-events:none}.planChoiceBody{display:block;border:1.5px solid var(--slate-300);border-radius:15px;padding:15px;background:#fff;transition:.18s}.planChoice input:checked+.planChoiceBody{border-color:var(--cyan-500);background:var(--cyan-50);box-shadow:0 0 0 3px rgba(0,160,240,.1)}.planChoiceTop{display:flex;align-items:center;justify-content:space-between;gap:10px}.planChoiceTop strong{color:var(--navy-900);font-size:14px}.planChoiceTop em{font-style:normal;padding:4px 7px;border-radius:999px;background:var(--navy-800);color:#fff;font-size:9px;font-weight:800}.planChoice small{display:block;margin-top:5px;color:var(--slate-500);font-size:11px;line-height:1.45}.planChoice b{display:block;margin-top:9px;color:var(--cyan-700);font-size:12px}.planChoice ul{margin:9px 0 0;padding-left:18px;color:var(--slate-700);font-size:10.5px;line-height:1.55}.planEmpty{padding:16px;border:1px dashed var(--slate-300);border-radius:14px;background:var(--slate-50);color:var(--slate-500);font-size:12px}
.right{display:grid;gap:16px;position:sticky;top:16px}.liveLabel{display:flex;align-items:center;gap:8px;color:var(--slate-500);font-size:11.5px}.liveLabel b{padding:5px 10px;border-radius:999px;background:var(--cyan-50);color:var(--cyan-700)}.previewCard{overflow:hidden}.chatHead{background:var(--navy-800);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}.avatar{width:38px;height:38px;border-radius:50%;background:var(--gradient-cyan);display:grid;place-items:center;font-weight:900}.chatHead strong{display:block;font-size:13px}.chatHead span{display:block;margin-top:2px;color:#64D5A5;font-size:10px}.autopilot{margin-left:auto;border-radius:999px;background:rgba(255,255,255,.1);padding:5px 8px;font-size:9.5px;font-weight:800}.messages{min-height:285px;padding:16px;background:#EAF2F6;display:flex;flex-direction:column;gap:10px}.bubble{max-width:82%;padding:11px 13px;border-radius:14px;font-size:12px;line-height:1.5}.bubble.customer{align-self:flex-start;background:#fff;border-radius:14px 14px 14px 4px}.bubble.bot{align-self:flex-end;background:var(--gradient-cyan);color:#fff;border-radius:14px 14px 4px 14px}.bubble small{display:block;margin-bottom:4px;font-size:9px;font-weight:800}.previewInput{padding:12px;border-top:1px solid var(--line);display:flex;gap:8px}.previewInput span{flex:1;padding:10px 12px;border-radius:999px;background:var(--slate-50);color:var(--slate-400);font-size:10.5px}.previewInput b{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--gradient-cyan);color:#fff}.contractCard{padding:18px}.contractTitle{display:flex;align-items:center;gap:10px;margin-bottom:13px}.contractTitle img{width:44px;height:44px;object-fit:contain}.contractTitle strong{display:block;color:var(--navy-900);font:700 14px Sora,sans-serif}.contractTitle span{font-size:10.5px;color:var(--slate-500)}.contractGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.contractItem{padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--slate-50)}.contractItem small{display:block;color:var(--slate-500);font-size:9.5px;text-transform:uppercase;letter-spacing:.08em}.contractItem strong{display:block;margin-top:5px;color:var(--navy-900);font-size:12px}.contractItem p{margin:4px 0 0;color:var(--slate-500);font-size:9.5px;line-height:1.4}.locked{margin-top:11px;color:var(--slate-500);font-size:10px}.locked:before{content:"🔒";margin-right:6px}
.errorBox{display:none;margin:0 28px 18px;padding:12px 14px;border-radius:12px;background:#FFF2F2;color:#A83232;font-size:12px}.errorBox.show{display:block}.complete{min-height:calc(100vh - 72px);padding:50px 22px;background:var(--gradient-hero);display:grid;place-items:center;text-align:center}.completeInner{max-width:670px}.complete img{width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 14px 28px rgba(0,160,240,.3))}.completeBadge{display:inline-block;margin-top:8px;padding:7px 11px;border-radius:999px;background:rgba(20,169,113,.18);color:#8FF0C4;font-size:10px;font-weight:800;letter-spacing:.1em}.complete h1{margin:16px 0 12px;color:#fff;font:800 34px/1.12 Sora,sans-serif;letter-spacing:-.04em}.complete p{margin:0;color:#C6D5E9;line-height:1.65;font-size:14px}.complete .startBtn{text-decoration:none;display:inline-grid;place-items:center}
@keyframes float{50%{transform:translateY(-9px)}}@keyframes rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media(max-width:860px){.layout{grid-template-columns:1fr}.right{position:static}.setupHead{display:block}.saveStatus{width:max-content;margin-top:13px}.previewCard{display:none}}
@media(max-width:620px){.top{height:64px;padding:0 16px}.secure{font-size:0}.welcome{min-height:calc(100vh - 64px);padding:34px 18px}.lumenWrap{width:118px;height:118px}.hello{right:-48px;font-size:10px}.online{left:-34px;font-size:9px}.welcome h1{font-size:32px}.welcome p{font-size:14px}.stepsIntro{display:grid;justify-content:start;width:max-content;margin-left:auto;margin-right:auto}.introLine{display:none}.setupPage{padding:22px 13px 92px}.setupHead h1{font-size:25px}.panel{padding:22px 16px}.grid{grid-template-columns:1fr}.field.wide{grid-column:auto}.formTop{padding:18px 16px}.actions{position:sticky;bottom:0;z-index:3;display:grid;grid-template-columns:auto 1fr;padding:12px}.actions p{grid-column:1/-1;order:-1}.actions .primary{width:100%}.contractGrid{grid-template-columns:1fr}.right{gap:12px}.formCard,.contractCard{border-radius:18px}}
</style>
</head>
<body>
<header class="top"><div class="brand"><img src="/admin/assets/nexfor-mark-light.png" alt=""><div><strong>Nextfor IA</strong><span>Configuración segura</span></div></div><div class="secure"><i></i>Acceso privado de ${escapeHtml(tenant.name || tenant.company_name || "tu empresa")}</div></header>

<section class="welcome${record.setup_completed ? " hidden" : ""}" id="welcome">
  <div class="welcomeInner">
    <div class="lumenWrap"><img src="/admin/assets/lumen.png" alt="Lumen, la mascota de Nextfor IA"><span class="hello">¡Hola! Soy Lumen</span><span class="online">en línea · 24/7</span></div>
    <div class="overline">✧ CONFIGUREMOS TU ASISTENTE</div>
    <h1>Mientras no estás, la IA <em>atiende por ti.</em></h1>
    <p>Cuéntanos lo esencial de tu empresa. Guardaremos cada avance y tu asistente aprenderá cómo responder, qué ofrecer y cuándo pedir ayuda.</p>
    <button class="startBtn" type="button" id="startSetup">Configurar mi asistente →</button>
    <div class="trust"><span>Sin contraseñas de WhatsApp</span><span>Guardado seguro</span><span>Solo datos de tu empresa</span></div>
    <div class="stepsIntro"><span class="introStep"><b>1</b>Tu negocio</span><i class="introLine"></i><span class="introStep"><b>2</b>Lo que ofreces</span><i class="introLine"></i><span class="introStep"><b>3</b>Cómo debe atender</span><i class="introLine"></i><span class="introStep"><b>4</b>Revisar y terminar</span></div>
  </div>
</section>

<main class="setupPage hidden" id="setupPage">
  <header class="setupHead"><div><h1>Deja tu asistente listo</h1><p>Completa cuatro pasos. Puedes guardar y continuar después.</p></div><span class="saveStatus" id="saveStatus">Avance listo para guardar</span></header>
  <div class="layout">
    <section class="formCard">
      <div class="formTop"><div class="stepMeta"><span id="stepLabel">Paso 1 de 4 · Tu negocio</span><div class="stepDots" id="stepDots"></div></div><div class="progress"><span id="progressBar"></span></div></div>
      <form id="setupForm" novalidate>
        <section class="panel active" data-step="0">
          <h2>Empecemos por tu empresa</h2><p>Con esto tu asistente se presenta bien y sabe cuándo puede atender.</p>
          <div class="grid">
            <label class="field"><span>¿Cómo se llama tu empresa?</span><input data-field="business.brand_name" maxlength="120" autocomplete="organization"><small class="fieldError"></small></label>
            <label class="field"><span>Correo del administrador</span><input data-field="team.admin_email" type="email" readonly value="${escapeHtml(adminEmail)}"><small>Es el correo de tu cuenta y no se puede cambiar aquí.</small></label>
            <label class="field"><span>Correo de contacto</span><input data-field="business.contact_email" type="email" maxlength="180" autocomplete="email"><small class="fieldError"></small></label>
            <label class="field"><span>Teléfono</span><input data-field="business.contact_phone" type="tel" maxlength="40" autocomplete="tel"><small class="fieldError"></small></label>
            <label class="field"><span>Número de WhatsApp</span><input data-field="meta.whatsapp_number" type="tel" maxlength="40" placeholder="+57..."><small class="fieldError"></small></label>
            <label class="field wide"><span>¿Cuáles son tus horarios de atención?</span><textarea data-field="operations.business_hours" maxlength="1200" placeholder="Ej. lunes a sábado, 9:00 a.m. a 6:00 p.m."></textarea><small class="fieldError"></small></label>
          </div>
        </section>
        <section class="panel" data-step="1">
          <h2>Muestra lo que sabes hacer</h2><p>Cada dato ayuda a responder mejor y a convertir preguntas en oportunidades.</p>
          <div class="grid">
            <label class="field wide"><span>¿Qué productos o servicios ofreces?</span><textarea data-field="operations.services_products" maxlength="5000" placeholder="Describe tus categorías, servicios principales y enlaces útiles."></textarea><small class="fieldError"></small></label>
            <label class="field"><span>Preguntas frecuentes</span><textarea data-field="operations.frequent_questions" maxlength="4000" placeholder="Pregunta y respuesta ideal."></textarea><small class="fieldError"></small></label>
            <label class="field"><span>Políticas importantes</span><textarea data-field="operations.important_policies" maxlength="5000" placeholder="Cambios, garantías, pagos, envíos, cancelaciones y excepciones."></textarea><small class="fieldError"></small></label>
          </div>
        </section>
        <section class="panel" data-step="2">
          <h2>Que suene como tu equipo</h2><p>Define la voz del bot y el momento exacto para entregar la conversación a una persona.</p>
          <div class="grid">
            <label class="field wide"><span>Contacto de soporte humano</span><input data-field="team.human_support_contact" maxlength="1000" placeholder="Nombre, correo o teléfono del responsable"><small class="fieldError"></small></label>
            <label class="field wide"><span>Instrucciones de comunicación del bot</span><textarea data-field="operations.bot_instructions" maxlength="5000" placeholder="Ej. cercano y claro; no inventar precios; confirmar datos antes de escalar."></textarea><small class="fieldError"></small></label>
            <div class="field wide"><span>Tono de comunicación</span><div class="segment"><label><input type="radio" name="tone" data-field="voice.formality" value="cercano"><span>Cercano</span></label><label><input type="radio" name="tone" data-field="voice.formality" value="neutral"><span>Neutral</span></label><label><input type="radio" name="tone" data-field="voice.formality" value="formal"><span>Formal</span></label></div></div>
            <div class="field wide"><span>Uso de emojis</span><div class="segment"><label><input type="radio" name="emojis" data-field="voice.emojis" value="ninguno"><span>Ninguno</span></label><label><input type="radio" name="emojis" data-field="voice.emojis" value="pocos"><span>Pocos</span></label><label><input type="radio" name="emojis" data-field="voice.emojis" value="moderados"><span>Moderados</span></label><label><input type="radio" name="emojis" data-field="voice.emojis" value="frecuentes"><span>Frecuentes</span></label></div></div>
            <div class="info wide"><strong>Seguro:</strong><span>Nunca te pediremos contraseñas ni claves de WhatsApp en este formulario. La conexión se hace después y con acompañamiento.</span></div>
          </div>
        </section>
        <section class="panel" data-step="3">
          <h2>Elige el plan para tu empresa</h2><p>Selecciona uno de los planes disponibles para tu bot. Los planes y precios vienen del catálogo oficial de Nextfor IA.</p>
          <div class="planChoices" id="planChoices">${planChoices || '<div class="planEmpty">No hay planes disponibles para este bot en este momento.</div>'}</div>
          <div class="contractGrid" style="margin-top:14px">
            <article class="contractItem"><small>Bot asignado</small><strong>${escapeHtml(botName)}</strong><p>${escapeHtml(botDescription)}</p></article>
          </div>
          <div class="info" style="margin-top:16px"><strong>Elección directa:</strong><span>Al guardar, tu selección se aplica directamente a tu empresa. No requiere autorización de Super Admin.</span></div>
          <div class="info" style="margin-top:16px"><strong>Último paso:</strong><span>Al terminar, guardaremos la configuración y te llevaremos al Panel de Control. En tus próximos ingresos abrirá directamente el panel.</span></div>
        </section>
      </form>
      <div class="errorBox" id="errorBox" role="alert"></div>
      <footer class="actions"><p id="actionMessage">Tu avance se guarda en los datos de tu empresa.</p><button class="btn" id="backBtn" type="button">← Atrás</button><button class="btn" id="saveBtn" type="button">Guardar</button><button class="btn primary" id="nextBtn" type="button">Siguiente →</button></footer>
    </section>
    <aside class="right">
      <div class="liveLabel"><b>✧ En vivo</b><span>Así usará tus datos el asistente</span></div>
      <section class="previewCard">
        <header class="chatHead"><span class="avatar" id="botAvatar">N</span><div><strong id="previewBot">${escapeHtml(botName)}</strong><span>en línea · 24/7</span></div><b class="autopilot">✧ Autopiloto</b></header>
        <div class="messages"><div class="bubble customer">Hola, ¿me puedes ayudar?</div><div class="bubble bot"><small>✧ Asistente IA</small><span id="previewGreeting">¡Hola! Claro que sí. Cuéntame qué necesitas.</span></div><div class="bubble customer">¿Qué ofrecen y en qué horario atienden?</div><div class="bubble bot"><small>✧ Asistente IA</small><span id="previewAnswer">En cuanto completes esos datos, podré responder esta pregunta por ti.</span></div></div>
        <div class="previewInput"><span>Escribe un mensaje...</span><b>➤</b></div>
      </section>
      <section class="contractCard"><div class="contractTitle"><img src="/admin/assets/lumen.png" alt=""><div><strong>Tu configuración</strong><span>Elige tu plan y revisa el bot asignado</span></div></div><div class="contractGrid"><div class="contractItem"><small>Plan elegido</small><strong id="sidePlanName">${escapeHtml(planName)}</strong></div><div class="contractItem"><small>Bot</small><strong>${escapeHtml(botName)}</strong></div></div><div class="locked">Los precios provienen del catálogo central.</div></section>
    </aside>
  </div>
</main>

<section class="complete hidden" id="complete">
  <div class="completeInner"><img src="/admin/assets/lumen.png" alt="Lumen"><div class="completeBadge">✧ CONFIGURACIÓN COMPLETADA</div><h1>Tu asistente ya conoce lo esencial de tu empresa.</h1><p>Guardamos la información en el registro de ${escapeHtml(tenant.name || "tu empresa")}. Ahora puedes entrar al Panel de Control y revisar su operación.</p><a class="startBtn" href="/admin/panel?tab=summary">Entrar a mi panel →</a></div>
</section>

<script>
var INITIAL=${safeJson(record)};
var API_PATH=${safeJson(apiPath)};
var DEMO=${demo ? "true" : "false"};
var COMPANY_NAME=${safeJson(tenant.name || tenant.company_name || "Tu empresa")};
var ADMIN_EMAIL=${safeJson(adminEmail)};
var BOT_NAME=${safeJson(botName)};
var PLANS=${safeJson(plans)};
var SELECTED_PLAN_ID=${safeJson(selectedPlanId)};
var step=0,dirty=false,busy=false;
var STEPS=[{label:"Tu negocio"},{label:"Lo que ofreces"},{label:"Cómo atiende"},{label:"Tu plan y bot"}];
var REQUIRED={
  0:["business.brand_name","team.admin_email","business.contact_email","business.contact_phone","meta.whatsapp_number","operations.business_hours"],
  1:["operations.services_products","operations.frequent_questions","operations.important_policies"],
  2:["team.human_support_contact","operations.bot_instructions"],
  3:["__plan_id"]
};
function clone(v){return JSON.parse(JSON.stringify(v||{}))}
function getPath(source,path){return String(path).split(".").reduce(function(value,key){return value&&value[key]!=null?value[key]:undefined},source)}
function setPath(target,path,value){var parts=String(path).split("."),cursor=target;parts.forEach(function(key,index){if(index===parts.length-1)cursor[key]=value;else{if(!cursor[key]||typeof cursor[key]!=="object")cursor[key]={};cursor=cursor[key]}})}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function collect(){var answers=clone(INITIAL.answers||{});document.querySelectorAll("[data-field]").forEach(function(field){if(field.type==="radio"){if(!field.checked)return;setPath(answers,field.getAttribute("data-field"),field.value)}else setPath(answers,field.getAttribute("data-field"),field.value)});setPath(answers,"team.admin_email",ADMIN_EMAIL);return answers}
function fill(){var answers=INITIAL.answers||{};if(!getPath(answers,"business.brand_name"))setPath(answers,"business.brand_name",COMPANY_NAME);if(!getPath(answers,"team.admin_email"))setPath(answers,"team.admin_email",ADMIN_EMAIL);if(!getPath(answers,"business.contact_email"))setPath(answers,"business.contact_email",ADMIN_EMAIL);document.querySelectorAll("[data-field]").forEach(function(field){var value=getPath(answers,field.getAttribute("data-field"));if(field.type==="radio"){var fallback=field.name==="tone"?"cercano":"moderados";field.checked=field.value===(value||fallback)}else if(value!=null)field.value=value});render();updatePreview()}
function completion(answers){var all=Object.keys(REQUIRED).reduce(function(list,key){return list.concat(REQUIRED[key])},[]),done=all.filter(function(path){return path==="__plan_id"?!!SELECTED_PLAN_ID:String(getPath(answers,path)||"").trim()}).length;return Math.round(done/all.length*100)}
function clearErrors(){document.querySelectorAll(".field.invalid").forEach(function(field){field.classList.remove("invalid");var msg=field.querySelector(".fieldError");if(msg)msg.textContent=""})}
function validate(currentOnly){clearErrors();var answers=collect(),paths=currentOnly?REQUIRED[step]:Object.keys(REQUIRED).reduce(function(list,key){return list.concat(REQUIRED[key])},[]),missing=[];paths.forEach(function(path){if(path==="__plan_id"){if(SELECTED_PLAN_ID)return;missing.push(path);return}if(String(getPath(answers,path)||"").trim())return;missing.push(path);var field=document.querySelector('[data-field="'+path+'"]');if(field){var wrap=field.closest(".field");if(wrap){wrap.classList.add("invalid");var msg=wrap.querySelector(".fieldError");if(msg)msg.textContent="Completa este campo para continuar."}}});var email=String(getPath(answers,"business.contact_email")||"");if(email&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){missing.push("business.contact_email");var emailField=document.querySelector('[data-field="business.contact_email"]'),emailWrap=emailField&&emailField.closest(".field");if(emailWrap){emailWrap.classList.add("invalid");emailWrap.querySelector(".fieldError").textContent="Escribe un correo válido."}}return missing}
function render(){document.querySelectorAll(".panel").forEach(function(panel){panel.classList.toggle("active",Number(panel.getAttribute("data-step"))===step)});document.getElementById("stepLabel").textContent="Paso "+(step+1)+" de "+STEPS.length+" · "+STEPS[step].label;document.getElementById("progressBar").style.width=((step+1)/STEPS.length*100)+"%";document.getElementById("stepDots").innerHTML=STEPS.map(function(item,index){return '<button class="stepDot '+(index<step?"done":index===step?"active":"")+'" type="button" data-go="'+index+'" aria-label="Paso '+(index+1)+': '+esc(item.label)+'">'+(index<step?"✓":index+1)+"</button>"}).join("");document.querySelectorAll("[data-go]").forEach(function(button){button.onclick=function(){var target=Number(button.getAttribute("data-go"));if(target<=step){step=target;render();window.scrollTo(0,0)}}});document.getElementById("backBtn").disabled=step===0||busy;document.getElementById("saveBtn").disabled=busy;document.getElementById("nextBtn").disabled=busy;document.getElementById("nextBtn").textContent=step===STEPS.length-1?"Terminar configuración →":"Siguiente →"}
function updatePreview(){var answers=collect(),name=String(getPath(answers,"business.brand_name")||COMPANY_NAME),hours=String(getPath(answers,"operations.business_hours")||"nuestros horarios"),offering=String(getPath(answers,"operations.services_products")||"nuestros productos y servicios"),formal=String(getPath(answers,"voice.formality")||"cercano"),emoji=String(getPath(answers,"voice.emojis")||"moderados"),hello=formal==="formal"?"Bienvenido a "+name+". ¿Cómo podemos ayudarle?":"¡Hola! Bienvenido a "+name+". ¿Cómo te ayudo?";if(emoji!=="ninguno")hello+=" 👋";document.getElementById("previewGreeting").textContent=hello;document.getElementById("previewAnswer").textContent="Ofrecemos "+offering+". Atendemos "+hours+".";document.getElementById("botAvatar").textContent=String(BOT_NAME||"N").trim().charAt(0).toUpperCase()}
function showError(message){var box=document.getElementById("errorBox");box.textContent=message||"";box.classList.toggle("show",!!message)}
function setBusy(value,message){busy=value;document.getElementById("backBtn").disabled=value||step===0;document.getElementById("saveBtn").disabled=value;document.getElementById("nextBtn").disabled=value;if(message)document.getElementById("actionMessage").textContent=message}
function request(status){var answers=collect();if(DEMO){INITIAL.answers=answers;INITIAL.status=status;INITIAL.completion=completion(answers);INITIAL.setup_completed=status==="completed";return Promise.resolve({onboarding:INITIAL,selected_plan_id:SELECTED_PLAN_ID,redirect:"/admin/panel?tab=summary"})}return fetch(API_PATH,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({answers:answers,status:status,plan_id:SELECTED_PLAN_ID})}).then(function(response){return response.json().then(function(body){if(!response.ok){var error=new Error(body.message||body.error||"No se pudo guardar");error.body=body;throw error}if(body.selected_plan_id)SELECTED_PLAN_ID=body.selected_plan_id;return body})})}
function saveDraft(){setBusy(true,"Guardando tu avance…");showError("");request("draft").then(function(body){INITIAL=body.onboarding;dirty=false;document.getElementById("saveStatus").textContent="Avance guardado";document.getElementById("actionMessage").textContent="Avance guardado. Puedes continuar cuando quieras."}).catch(function(error){showError(error.message);document.getElementById("actionMessage").textContent="No pudimos guardar el avance."}).finally(function(){setBusy(false)})}
function finish(){var missing=validate(false);if(missing.length){showError("Completa los campos señalados antes de terminar.");var first=document.querySelector(".field.invalid"),panel=first&&first.closest(".panel");if(panel){step=Number(panel.getAttribute("data-step"));render()}return}setBusy(true,"Guardando y preparando tu panel…");showError("");request("completed").then(function(body){INITIAL=body.onboarding;dirty=false;document.getElementById("setupPage").classList.add("hidden");document.getElementById("complete").classList.remove("hidden");setTimeout(function(){location.href=body.redirect||"/admin/panel?tab=summary"},1200)}).catch(function(error){showError(error.message);document.getElementById("actionMessage").textContent="Revisa la información e intenta nuevamente.";setBusy(false)})}
document.getElementById("startSetup").onclick=function(){document.getElementById("welcome").classList.add("hidden");document.getElementById("setupPage").classList.remove("hidden");window.scrollTo(0,0)};
document.getElementById("backBtn").onclick=function(){if(step>0){step--;render();window.scrollTo(0,0)}};
document.getElementById("saveBtn").onclick=saveDraft;
document.getElementById("nextBtn").onclick=function(){if(step===STEPS.length-1){finish();return}var missing=validate(true);if(missing.length){showError("Completa los campos señalados para continuar.");return}showError("");step++;render();window.scrollTo(0,0)};
document.getElementById("setupForm").addEventListener("input",function(){dirty=true;document.getElementById("saveStatus").textContent="Cambios sin guardar";updatePreview()});
document.querySelectorAll('input[name="selected_plan"]').forEach(function(input){input.addEventListener("change",function(){SELECTED_PLAN_ID=input.value;var selected=PLANS.find(function(plan){return plan.id===SELECTED_PLAN_ID});document.getElementById("sidePlanName").textContent=selected&&(selected.nombre||selected.name)||SELECTED_PLAN_ID;dirty=true;document.getElementById("saveStatus").textContent="Plan elegido · falta guardar";showError("")})});
window.addEventListener("beforeunload",function(event){if(!dirty||busy)return;event.preventDefault();event.returnValue=""});
fill();
</script>
</body>
</html>`);
};
