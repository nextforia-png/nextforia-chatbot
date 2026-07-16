"use strict";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function renderCustomerPasswordSetup(res, options) {
  const valid = !!(options && options.valid);
  const invite = JSON.stringify(options && options.invite || "");
  const reason = escapeHtml(options && options.reason || "Este enlace no está disponible.");
  const status = valid ? 200 : Number(options && options.status) || 403;
  const formContent = valid ? `
    <div class="formEyebrow">Cliente #1 · RAV Toys</div>
    <h1>Crea tu acceso al Panel de Control</h1>
    <p class="lead">Elige el usuario y la contraseña que usarás para consultar WhatsApp, Instagram y las conversaciones de tu equipo.</p>
    <form id="setupForm" novalidate>
      <div class="field">
        <label for="name">Nombre del administrador</label>
        <input id="name" name="name" autocomplete="name" maxlength="100" placeholder="Ej. Santiago V" required autofocus>
      </div>
      <div class="field">
        <label for="username">Usuario</label>
        <input id="username" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="40" placeholder="Ej. admin.rav" required>
      </div>
      <div class="field">
        <label for="password">Contraseña</label>
        <div class="passwordWrap">
          <input id="password" name="password" type="password" autocomplete="new-password" maxlength="128" placeholder="Mínimo 10 caracteres" required>
          <button class="showButton" id="showButton" type="button">Mostrar</button>
        </div>
        <div class="requirements" aria-label="Requisitos de contraseña">
          <span id="ruleLength"><i aria-hidden="true"></i>10 caracteres</span>
          <span id="ruleLetter"><i aria-hidden="true"></i>Una letra</span>
          <span id="ruleNumber"><i aria-hidden="true"></i>Un número</span>
        </div>
      </div>
      <div class="field">
        <label for="passwordConfirmation">Confirma la contraseña</label>
        <input id="passwordConfirmation" name="password_confirmation" type="password" autocomplete="new-password" maxlength="128" placeholder="Repite la contraseña" required>
        <div class="matchMessage" id="matchMessage" aria-live="polite"></div>
      </div>
      <button class="primary" id="submitButton" type="submit" disabled>Crear acceso</button>
      <div class="error" id="error" role="alert" aria-live="assertive"></div>
    </form>
    <div class="loginPrompt">¿Ya tienes acceso? <a href="/admin/panel">Inicia sesión</a></div>` : `
    <div class="invalidState">
      <div class="invalidIcon" aria-hidden="true">!</div>
      <div class="formEyebrow">RAV Toys · Panel de Control</div>
      <h1>Este enlace no está disponible</h1>
      <p class="lead">${reason}</p>
      <a class="primary primaryLink" href="/admin/panel">Ir al inicio de sesión</a>
    </div>`;

  res.status(status).setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0A1836">
  <title>Crear acceso · RAV Toys</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    :root{--navy-950:#060F22;--navy-900:#0A1836;--navy-800:#0E2148;--cyan-50:#EAF8FF;--cyan-300:#57C2F3;--cyan-500:#00A0F0;--cyan-600:#0587CC;--cyan-700:#0A6BA1;--slate-50:#F6F8FB;--slate-100:#EDF1F7;--slate-200:#DFE6F0;--slate-300:#C6D1E0;--slate-400:#94A3BC;--slate-500:#647289;--slate-700:#313C50;--green:#0B7A50;--danger:#EF4E4E;--display:"Sora","Avenir Next",sans-serif;--body:"Plus Jakarta Sans","Avenir Next",sans-serif}
    *{box-sizing:border-box}html{background:var(--slate-50)}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:34px;background:linear-gradient(145deg,#EDF2F8,#F8FAFD);color:var(--navy-900);font-family:var(--body)}button,input{font:inherit}.setupShell{width:min(1080px,100%);min-height:690px;display:grid;grid-template-columns:430px minmax(0,1fr);overflow:hidden;border:1px solid var(--slate-200);border-radius:26px;background:#fff;box-shadow:0 40px 90px -30px rgba(6,15,34,.4)}
    .brandPanel{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:44px 40px;color:#fff;background:linear-gradient(158deg,var(--navy-800),var(--navy-950))}.brandPanel:before{content:"";position:absolute;top:-130px;right:-100px;width:360px;height:360px;background:radial-gradient(circle,rgba(0,160,240,.4),transparent 68%)}.brand,.brandStory,.progress{position:relative}.brand{display:flex;align-items:center;gap:12px}.brandMark{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;color:#fff;background:linear-gradient(135deg,#2AB8F5,var(--cyan-500));box-shadow:0 12px 30px -10px rgba(0,160,240,.8);font:800 14px var(--display)}.brandName{font:700 17px var(--display);letter-spacing:-.02em}.brandSub{margin-top:3px;color:rgba(255,255,255,.6);font-size:12px}.storyEyebrow{margin-bottom:14px;color:var(--cyan-300);font-size:11px;font-weight:800;letter-spacing:.14em}.brandStory h2{margin:0 0 16px;font:800 31px/1.14 var(--display);letter-spacing:-.03em}.brandStory h2 span{color:var(--cyan-300)}.brandStory>p{margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.65}.benefits{display:grid;gap:14px;margin-top:26px}.benefit{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,.9);font-size:14px}.check{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border-radius:8px;background:rgba(0,160,240,.18);color:var(--cyan-300)}.check svg{width:14px;height:14px}.progress{display:flex;align-items:center;gap:10px;padding-top:8px;color:rgba(255,255,255,.55);font-size:12px}.progressBars{display:flex;gap:6px}.progressBars i{width:8px;height:5px;border-radius:999px;background:rgba(255,255,255,.22)}.progressBars i:first-child{width:24px;background:linear-gradient(90deg,#2AB8F5,var(--cyan-500))}
    .formPanel{display:grid;place-items:center;padding:46px 52px 42px}.formInner{width:min(100%,500px)}.formEyebrow{margin-bottom:12px;color:var(--cyan-600);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.formInner h1{margin:0 0 14px;color:var(--navy-900);font:800 32px/1.12 var(--display);letter-spacing:-.04em}.lead{max-width:470px;margin:0 0 28px;color:var(--slate-700);font-size:15px;line-height:1.6}.field{margin-top:20px}.field label{display:block;margin-bottom:9px;color:var(--navy-900);font-size:14px;font-weight:700}.field input{width:100%;height:52px;padding:0 16px;border:1.5px solid var(--slate-300);border-radius:12px;outline:none;background:#fff;color:var(--navy-900);font-size:15px;font-weight:500;transition:border-color .18s,box-shadow .18s}.field input::placeholder{color:var(--slate-400)}.field input:focus{border-color:var(--cyan-500);box-shadow:0 0 0 4px rgba(0,160,240,.14)}.passwordWrap{position:relative}.passwordWrap input{padding-right:108px}.showButton{position:absolute;top:50%;right:8px;min-width:86px;min-height:36px;transform:translateY(-50%);border:0;border-radius:9px;background:var(--slate-100);color:var(--slate-500);font-size:13px;font-weight:700;cursor:pointer}.showButton:hover{color:var(--navy-900);background:var(--slate-200)}.requirements{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.requirements span{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid transparent;border-radius:999px;background:var(--slate-50);color:var(--slate-400);font-size:12.5px;font-weight:600;transition:.2s}.requirements i{width:17px;height:17px;display:grid;place-items:center;border:2px solid currentColor;border-radius:50%}.requirements i:after{content:""}.requirements span.met{border-color:rgba(0,160,240,.35);background:var(--cyan-50);color:var(--cyan-700)}.requirements span.met i{border:0}.requirements span.met i:after{content:"✓";font-size:13px;font-style:normal;font-weight:900}.matchMessage{min-height:18px;margin-top:9px;font-size:12.5px;font-weight:700}.matchMessage.ok{color:var(--green)}.matchMessage.bad{color:var(--danger)}.primary{width:100%;min-height:56px;margin-top:22px;border:0;border-radius:14px;background:linear-gradient(135deg,#29B8F5,var(--cyan-500) 55%,var(--cyan-600));box-shadow:0 10px 24px -10px rgba(0,160,240,.6);color:#fff;font:800 16px var(--display);cursor:pointer;transition:.18s}.primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 30px -8px rgba(0,160,240,.55)}.primary:disabled{opacity:.5;filter:saturate(.85);cursor:not-allowed;box-shadow:none}.primaryLink{display:grid;place-items:center;text-decoration:none}.loginPrompt{margin-top:17px;text-align:center;color:var(--slate-500);font-size:13.5px}.loginPrompt a{color:var(--cyan-600);font-weight:700;text-decoration:none}.loginPrompt a:hover{color:var(--cyan-700);text-decoration:underline}.error{min-height:18px;margin-top:9px;color:#B94723;text-align:center;font-size:12.5px}.invalidState{padding:14px 0}.invalidIcon{width:50px;height:50px;display:grid;place-items:center;margin-bottom:18px;border-radius:15px;background:#FFF3E6;color:#B66A10;font:800 23px var(--display)}
    :focus-visible{outline:3px solid rgba(0,160,240,.3);outline-offset:2px}
    @media(max-width:780px){body{display:block;padding:0;background:var(--slate-50)}.setupShell{width:100%;min-height:100vh;display:block;border:0;border-radius:0;box-shadow:none}.brandPanel{display:block;padding:22px 24px 0;background:var(--slate-50);color:var(--navy-900)}.brandPanel:before,.brandStory,.progress{display:none}.brandMark{width:46px;height:46px}.brandName{font-size:17px}.brandSub{color:var(--slate-500)}.formPanel{display:block;padding:28px 24px max(34px,env(safe-area-inset-bottom))}.formInner{max-width:none}.formInner h1{font-size:27px;line-height:1.13}.formEyebrow{font-size:11px;margin-bottom:10px}.lead{margin-bottom:26px;font-size:14px}.field{margin-top:19px}.field label{font-size:13.5px;margin-bottom:8px}.field input{height:52px;font-size:14px}.requirements{gap:7px}.requirements span{padding:6px 10px;font-size:12px}.primary{min-height:54px;margin-top:20px}.loginPrompt{padding-bottom:8px;font-size:13px}}
    @media(max-width:370px){.brandPanel{padding-left:18px;padding-right:18px}.formPanel{padding-left:18px;padding-right:18px}.requirements span{font-size:11.5px}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
  </style>
</head>
<body>
  <main class="setupShell">
    <aside class="brandPanel" aria-label="RAV Toys con Nextfor IA">
      <div class="brand"><div class="brandMark">RAV</div><div><div class="brandName">RAV Toys</div><div class="brandSub">Panel de Control · Nextfor IA</div></div></div>
      <div class="brandStory">
        <div class="storyEyebrow">TU SERVICIO AL CLIENTE, EN PILOTO AUTOMÁTICO</div>
        <h2>En un minuto tienes el control. <span>Nextfor hace el resto.</span></h2>
        <p>Crea tu acceso y empieza a ver cómo tu asistente atiende, califica y agenda por ti 24/7.</p>
        <div class="benefits">
          <div class="benefit"><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>Responde cada mensaje al instante</div>
          <div class="benefit"><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>Detecta oportunidades de venta</div>
          <div class="benefit"><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>Tú solo cierras la venta</div>
        </div>
      </div>
      <div class="progress"><span class="progressBars"><i></i><i></i><i></i></span>Paso 1 de 3 · Crear acceso</div>
    </aside>
    <section class="formPanel"><div class="formInner">${formContent}</div></section>
  </main>
  ${valid ? `<script>
    var invite=${invite};
    var form=document.getElementById("setupForm"),nameInput=document.getElementById("name"),usernameInput=document.getElementById("username"),passwordInput=document.getElementById("password"),confirmationInput=document.getElementById("passwordConfirmation"),submitButton=document.getElementById("submitButton"),matchMessage=document.getElementById("matchMessage"),error=document.getElementById("error"),showButton=document.getElementById("showButton");
    function setRule(id,met){var rule=document.getElementById(id);if(rule)rule.classList.toggle("met",met);}
    function formState(){var value=passwordInput.value||"",length=value.length>=10,letter=/[A-Za-z]/.test(value),number=/[0-9]/.test(value),hasConfirmation=confirmationInput.value.length>0,match=hasConfirmation&&value===confirmationInput.value;setRule("ruleLength",length);setRule("ruleLetter",letter);setRule("ruleNumber",number);matchMessage.textContent=hasConfirmation?(match?"Las contraseñas coinciden":"Las contraseñas no coinciden todavía"):"";matchMessage.className="matchMessage"+(hasConfirmation?(match?" ok":" bad"):"");var ready=!!nameInput.value.trim()&&!!usernameInput.value.trim()&&length&&letter&&number&&match;submitButton.disabled=!ready;return ready;}
    [nameInput,usernameInput,passwordInput,confirmationInput].forEach(function(input){input.addEventListener("input",formState);});
    showButton.addEventListener("click",function(){var show=passwordInput.type==="password";passwordInput.type=show?"text":"password";confirmationInput.type=show?"text":"password";showButton.textContent=show?"Ocultar":"Mostrar";passwordInput.focus();});
    form.addEventListener("submit",function(event){event.preventDefault();if(!formState())return;error.textContent="";submitButton.disabled=true;submitButton.textContent="Creando acceso…";fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invite:invite,name:nameInput.value.trim(),username:usernameInput.value.trim(),password:passwordInput.value,password_confirmation:confirmationInput.value})}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.message||body.error||"No se pudo crear el acceso");return body;});}).then(function(body){submitButton.textContent="Acceso creado ✓";setTimeout(function(){location.href=body.redirect||"/admin/panel";},350);}).catch(function(err){error.textContent=err.message;submitButton.textContent="Crear acceso";formState();});});
    formState();
  </script>` : ""}
</body>
</html>`);
}

module.exports = renderCustomerPasswordSetup;
