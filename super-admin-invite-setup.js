"use strict";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderSuperAdminInviteSetup(res, options) {
  options = options || {};
  const valid = options.valid !== false;
  const invite = safeInlineJson(options.invite || "");
  const email = options.email || "";
  const nameHint = options.nameHint || "";
  const reason = options.reason || "El enlace no es válido o ya venció.";

  res.status(options.status || 200).setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crear Super Admin · NexforIA</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Sora:wght@700;800&display=swap');
:root{--navy:#060F22;--cyan:#00A0F0;--page:#F4F7FB;--slate:#66738D;--border:#DDE6F2;--red:#C83F3F;--green:#087E54;--body:"Plus Jakarta Sans",sans-serif;--display:"Sora",sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--page);color:var(--navy);font-family:var(--body);padding:24px}.shell{width:min(520px,100%)}.brand{display:flex;align-items:center;gap:12px;margin:0 0 18px 4px}.brand img{width:48px;height:38px;object-fit:contain}.brand strong{font:800 18px var(--display)}.brand span{display:block;color:#7D8BA3;font-size:11px;margin-top:2px}.card{background:#fff;border:1px solid var(--border);border-radius:24px;padding:30px;box-shadow:0 18px 45px rgba(8,22,52,.09)}.eyebrow{color:#0788C7;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}h1{font:800 28px/1.1 var(--display);letter-spacing:-.03em;margin:0}p{font-size:14px;line-height:1.6;color:var(--slate);margin:12px 0 24px}.email-pill{display:inline-flex;max-width:100%;border-radius:999px;background:#EAF7FE;color:#087FC3;padding:7px 10px;font-size:12px;font-weight:800;overflow-wrap:anywhere}label{display:block;color:#33425E;font-size:12px;font-weight:800;margin:14px 0 6px}input{width:100%;height:46px;border:1px solid #CBD5E1;border-radius:12px;padding:0 13px;font-size:14px;color:#071832;background:#fff}input:focus{outline:3px solid rgba(18,168,244,.15);border-color:#12A8F4}.password-field{position:relative}.password-field input{padding-right:78px}.show{position:absolute;right:7px;top:7px;height:32px;border:0;background:#F1F5F9;color:#52617B;border-radius:8px;padding:0 10px;font-size:11px;font-weight:800}.rules{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rules span{font-size:11px;color:#8A96A8;background:#F5F7FA;border-radius:999px;padding:5px 8px}.rules span.ok{color:var(--green);background:#E7F8F0}.primary{width:100%;min-height:48px;border:0;border-radius:12px;background:linear-gradient(135deg,#25BFFF,#12A8F4);color:#fff;font-size:15px;font-weight:900;margin-top:20px;cursor:pointer}.primary:disabled{opacity:.55;cursor:wait}.error{color:#B94723;font-size:12px;min-height:18px;margin-top:10px;text-align:center}.safe{margin-top:20px;border-top:1px solid #E2E8F0;padding-top:18px;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}.safe:before{content:"✓";grid-row:1/3;width:28px;height:28px;border-radius:9px;background:#E7F8F0;color:var(--green);display:grid;place-items:center;font-weight:900}.safe strong{font-size:12px}.safe span{font-size:11px;color:#78869F;line-height:1.45}.invalid .primary{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}@media(max-width:540px){body{padding:14px}.card{padding:22px;border-radius:20px}h1{font-size:25px}}
</style></head><body><main class="shell"><div class="brand"><img src="/admin/assets/nexfor-mark-light.png" alt=""><div><strong>Nexfor IA</strong><span>Acceso interno Super Admin</span></div></div><section class="card ${valid ? "" : "invalid"}">
${valid ? `<div class="eyebrow">Invitación privada</div><h1>Crea tu acceso Super Admin</h1><p>Este acceso es solo para operación interna de NexforIA. Tu correo autorizado es:</p><div class="email-pill">${escapeHtml(email)}</div><form id="setupForm"><label for="name">Nombre</label><input id="name" autocomplete="name" maxlength="100" value="${escapeHtml(nameHint)}" required><label for="password">Contraseña</label><div class="password-field"><input id="password" type="password" autocomplete="new-password" maxlength="128" required><button class="show" type="button" onclick="togglePasswords()">Mostrar</button></div><div class="rules"><span id="ruleLength">12 caracteres</span><span id="ruleLetter">1 letra</span><span id="ruleNumber">1 número</span></div><label for="passwordConfirmation">Confirma la contraseña</label><input id="passwordConfirmation" type="password" autocomplete="new-password" maxlength="128" required><button class="primary" id="submitBtn" type="submit">Crear acceso Super Admin</button><div class="error" id="error" role="alert"></div></form><div class="safe"><strong>Sin contraseñas por correo</strong><span>La clave queda hasheada. La invitación vence y solo funciona una vez.</span></div>` : `<div class="eyebrow">Invitación no disponible</div><h1>No pudimos validar este enlace</h1><p>${escapeHtml(reason)}</p><a class="primary" href="/admin/super-admin/login">Ir al login Super Admin</a>`}
</section></main>${valid ? `<script>
var invite=${invite},form=document.getElementById("setupForm"),password=document.getElementById("password"),confirmation=document.getElementById("passwordConfirmation");
function setRule(id,ok){var el=document.getElementById(id);el.classList.toggle("ok",ok);}
function updateRules(){var value=password.value||"";setRule("ruleLength",value.length>=12);setRule("ruleLetter",/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value));setRule("ruleNumber",/\\d/.test(value));}
function togglePasswords(){var next=password.type==="password"?"text":"password";password.type=next;confirmation.type=next;document.querySelector(".show").textContent=next==="text"?"Ocultar":"Mostrar";}
password.addEventListener("input",updateRules);form.addEventListener("submit",function(event){event.preventDefault();var button=document.getElementById("submitBtn"),error=document.getElementById("error");error.textContent="";button.disabled=true;button.textContent="Creando acceso...";fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json","x-nextforia-panel-origin":location.origin},body:JSON.stringify({invite:invite,name:document.getElementById("name").value.trim(),password:password.value,password_confirmation:confirmation.value})}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.message||body.error||"No se pudo crear el acceso");return body;});}).then(function(body){location.href=body.redirect||"/admin/super-admin";}).catch(function(err){error.textContent=err.message;button.disabled=false;button.textContent="Crear acceso Super Admin";});});
</script>` : ""}</body></html>`);
}

module.exports = renderSuperAdminInviteSetup;
