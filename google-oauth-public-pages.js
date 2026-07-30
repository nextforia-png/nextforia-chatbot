"use strict";

const EFFECTIVE_DATE = "30 de julio de 2026";
const SUPPORT_EMAIL = "nextforia@gmail.com";
const PUBLIC_ORIGIN = "https://api.nextforia.com";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title, description, content) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light;--navy:#071832;--blue:#006fc4;--cyan:#08aeea;--ink:#15253d;--muted:#5f7087;--line:#dce6f1;--bg:#f6f9fc;--card:#fff}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
    a{color:var(--blue)}a:hover{color:#004f91}.top{background:linear-gradient(135deg,#06162f,#0d3f75);color:#fff}.nav{max-width:1040px;margin:auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:flex;align-items:center;gap:11px;color:#fff;text-decoration:none;font-weight:850}.brand img{width:42px;height:28px;object-fit:contain}.navlinks{display:flex;gap:18px;flex-wrap:wrap}.navlinks a{color:#dceeff;text-decoration:none;font-size:14px;font-weight:700}
    .hero{max-width:1040px;margin:auto;padding:66px 24px 72px}.eyebrow{color:#54d4ff;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.hero h1{max-width:760px;margin:10px 0 16px;font-size:clamp(34px,6vw,60px);line-height:1.08;letter-spacing:-.035em}.hero p{max-width:720px;margin:0;color:#c9d8ea;font-size:18px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border-radius:12px;background:linear-gradient(135deg,#15c5ff,#008bd4);color:#fff;text-decoration:none;font-weight:850}.button.secondary{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.24)}
    main{max-width:900px;margin:0 auto;padding:44px 24px 70px}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:clamp(22px,5vw,42px);box-shadow:0 16px 48px rgba(7,24,50,.07)}h1,h2,h3{color:var(--navy)}main h1{font-size:clamp(30px,5vw,46px);line-height:1.15;margin:0 0 10px}h2{font-size:22px;margin:34px 0 10px}h3{font-size:17px;margin:24px 0 8px}p,li{font-size:15px}ul{padding-left:22px}.meta{color:var(--muted);font-size:14px}.notice{margin:24px 0;padding:18px;border:1px solid #bde9f9;border-radius:15px;background:#f0fbff}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-top:28px}.feature{padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.feature strong{display:block;color:var(--navy);margin-bottom:6px}.feature p{margin:0;color:var(--muted);font-size:14px}.legal-nav{display:flex;gap:12px;flex-wrap:wrap;margin-top:34px;padding-top:22px;border-top:1px solid var(--line)}footer{padding:25px 24px;background:var(--navy);color:#b8c7d9;text-align:center;font-size:13px}footer a{color:#75dcff}
    @media(max-width:720px){.nav{align-items:flex-start}.navlinks{justify-content:flex-end}.hero{padding-top:46px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header class="top">
    <nav class="nav" aria-label="Principal">
      <a class="brand" href="/nextfor-appointment-bot"><img src="/admin/assets/nexfor-mark-light.png" alt="">Nextfor Appointment Bot</a>
      <div class="navlinks"><a href="/nextfor-appointment-bot">Producto</a><a href="/privacy">Privacidad</a><a href="/terms">Términos</a></div>
    </nav>
  </header>
  ${content}
  <footer>Nextfor IA · Colombia · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
</body>
</html>`;
}

function renderGoogleOAuthHomepage() {
  return layout(
    "Nextfor Appointment Bot",
    "Asistente de Nextfor IA para gestionar disponibilidad, citas y recordatorios con Google Calendar.",
    `<section class="top"><div class="hero">
      <div class="eyebrow">Integración oficial de Nextfor IA</div>
      <h1>Nextfor Appointment Bot</h1>
      <p>Nextfor Appointment Bot es una aplicación de gestión de citas para empresas. Su propósito es consultar disponibilidad y crear, reprogramar o cancelar citas autorizadas por el usuario mediante Google Calendar.</p>
      <div class="actions"><a class="button" href="https://nextforia.com/admin/panel">Abrir Customer Panel</a><a class="button secondary" href="/privacy">Cómo protegemos tus datos</a></div>
    </div></section>
    <main><section class="card">
      <h2>Propósito de Nextfor Appointment Bot</h2>
      <p>Nextfor Appointment Bot permite que los administradores de empresas conecten voluntariamente Google Calendar para consultar espacios disponibles, evitar cruces y sincronizar las citas que sus clientes solicitan.</p>
      <p lang="en">Nextfor Appointment Bot is a business appointment management application. Its purpose is to check availability and create, reschedule or cancel user-authorized appointments through Google Calendar.</p>
      <h2>Qué hace la integración</h2>
      <div class="grid">
        <article class="feature"><strong>Consulta disponibilidad</strong><p>Revisa espacios ocupados para evitar cruces al ofrecer una cita.</p></article>
        <article class="feature"><strong>Sincroniza citas</strong><p>Crea, actualiza o cancela eventos únicamente como parte del flujo de agendamiento.</p></article>
        <article class="feature"><strong>Control del cliente</strong><p>La conexión puede desconectarse desde el Customer Panel en cualquier momento.</p></article>
      </div>
      <div class="notice"><strong>Uso limitado de datos de Google</strong><br>Nextfor IA utiliza los datos autorizados de Google Calendar exclusivamente para prestar las funciones de agenda solicitadas. No vendemos estos datos, no los usamos para publicidad y no los utilizamos para entrenar modelos generales de inteligencia artificial.</div>
      <h2>Cómo funciona</h2>
      <ol>
        <li>Un administrador autenticado del negocio elige conectar Google Calendar.</li>
        <li>Google muestra los permisos exactos solicitados y el usuario decide si los autoriza.</li>
        <li>Nextfor usa esos permisos para consultar disponibilidad y gestionar las citas del negocio.</li>
        <li>El administrador puede desconectar Google Calendar y eliminar las credenciales almacenadas.</li>
      </ol>
      <div class="legal-nav"><a href="/privacy">Política de Privacidad</a><a href="/terms">Condiciones del Servicio</a><a href="mailto:${SUPPORT_EMAIL}">Soporte</a></div>
    </section></main>`
  );
}

function renderPrivacyPolicy() {
  return layout(
    "Política de Privacidad",
    "Política de Privacidad de Nextfor IA y su integración con Google Calendar.",
    `<main><article class="card">
      <h1>Política de Privacidad</h1>
      <p class="meta">Vigente desde el ${EFFECTIVE_DATE}</p>
      <p>Esta Política explica cómo <strong>Nextfor IA</strong> (“Nextfor”, “nosotros”) trata información al prestar su plataforma de agentes de inteligencia artificial y el producto <strong>Nextfor Appointment Bot</strong>. Operamos desde Colombia y puedes contactarnos en <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

      <h2>1. Roles y alcance</h2>
      <p>Nextfor actúa como responsable de los datos necesarios para administrar cuentas, seguridad, facturación y soporte. Cuando una empresa cliente utiliza Nextfor para atender a sus propios usuarios o pacientes, esa empresa determina los fines del tratamiento de dichos datos y Nextfor actúa como encargado o proveedor de tecnología conforme a sus instrucciones.</p>

      <h2>2. Información que tratamos</h2>
      <ul>
        <li><strong>Cuenta y empresa:</strong> nombre, correo, teléfono, credenciales de acceso, plan y configuración del agente.</li>
        <li><strong>Agenda y citas:</strong> disponibilidad, fecha, hora, duración, servicio, identificadores de eventos y datos de contacto facilitados para agendar.</li>
        <li><strong>Conversaciones:</strong> mensajes, transcripciones, resúmenes y acciones necesarias para atender o gestionar citas.</li>
        <li><strong>Integraciones:</strong> identificadores técnicos, permisos autorizados y credenciales OAuth cifradas.</li>
        <li><strong>Seguridad y funcionamiento:</strong> dirección IP, registros de acceso, errores, auditoría y métricas técnicas.</li>
      </ul>

      <h2>3. Datos de Google Calendar</h2>
      <p>Cuando un administrador conecta Google Calendar, Nextfor solicita únicamente permisos relacionados con eventos, disponibilidad y la identificación del calendario autorizado. Utilizamos estos datos para:</p>
      <ul>
        <li>comprobar disponibilidad y evitar cruces;</li>
        <li>crear, actualizar y cancelar eventos de citas;</li>
        <li>mostrar el estado de sincronización en el Customer Panel; y</li>
        <li>resolver fallos y mantener la seguridad de la integración.</li>
      </ul>
      <div class="notice">El uso y transferencia de información recibida de las API de Google cumple la <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">Política de Datos de Usuario de los Servicios de API de Google</a>, incluidos sus requisitos de Uso Limitado. No vendemos datos de Google, no los utilizamos para publicidad y no los usamos para entrenar modelos generales de IA.</div>

      <h2>4. Finalidades y bases</h2>
      <p>Tratamos información para ejecutar el servicio contratado, atender solicitudes, mantener la seguridad, cumplir obligaciones legales y mejorar confiabilidad y rendimiento. Cuando corresponda, el tratamiento se basa en la autorización del usuario, la ejecución del contrato o intereses legítimos compatibles con las expectativas del usuario.</p>

      <h2>5. Proveedores y transferencias</h2>
      <p>Podemos utilizar proveedores de infraestructura, almacenamiento, correo, mensajería, voz y analítica operativa. Solo reciben la información necesaria para prestar su función y están sujetos a obligaciones de confidencialidad y seguridad. También podremos revelar información cuando una autoridad competente lo exija o para proteger derechos y seguridad. Algunos proveedores pueden tratar datos fuera de Colombia, aplicando las salvaguardas contractuales y técnicas correspondientes.</p>

      <h2>6. Seguridad</h2>
      <p>Aplicamos cifrado en tránsito, control de acceso por empresa, registros de auditoría y cifrado de credenciales OAuth almacenadas. Ningún sistema es infalible; evaluamos y corregimos riesgos de forma continua.</p>

      <h2>7. Conservación y eliminación</h2>
      <p>Conservamos los datos mientras la cuenta esté activa y durante el tiempo necesario para prestar el servicio, cumplir obligaciones o resolver controversias. Al desconectar Google Calendar desde el Customer Panel, eliminamos las credenciales OAuth almacenadas para esa conexión. El usuario también puede revocar el acceso desde su <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">Cuenta de Google</a>. Las solicitudes de eliminación de otros datos se atienden teniendo en cuenta obligaciones legales y derechos de terceros.</p>

      <h2>8. Derechos y controles</h2>
      <p>Según la ley aplicable, puedes solicitar acceso, corrección, actualización, eliminación, portabilidad u oposición, y retirar una autorización cuando proceda. Para ejercer estos derechos escribe a <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Verificaremos tu identidad antes de ejecutar solicitudes sensibles.</p>

      <h2>9. Datos de terceros y menores</h2>
      <p>Los clientes deben contar con una base legal para ingresar o recopilar información de sus usuarios. Nextfor no está dirigido directamente a menores de edad. Si un cliente presta servicios a menores, es responsable de obtener las autorizaciones exigidas y configurar el agente de forma apropiada.</p>

      <h2>10. Cambios</h2>
      <p>Podemos actualizar esta Política para reflejar cambios legales, técnicos o del servicio. Publicaremos la fecha de vigencia y, cuando el cambio sea material, lo comunicaremos por medios razonables.</p>

      <div class="legal-nav"><a href="/nextfor-appointment-bot">Volver al producto</a><a href="/terms">Condiciones del Servicio</a><a href="mailto:${SUPPORT_EMAIL}">Contactar a Nextfor</a></div>
    </article></main>`
  );
}

function renderTermsOfService() {
  return layout(
    "Condiciones del Servicio",
    "Condiciones del Servicio de Nextfor IA y Nextfor Appointment Bot.",
    `<main><article class="card">
      <h1>Condiciones del Servicio</h1>
      <p class="meta">Vigentes desde el ${EFFECTIVE_DATE}</p>
      <p>Estas Condiciones regulan el acceso y uso de los servicios de <strong>Nextfor IA</strong>, incluido <strong>Nextfor Appointment Bot</strong>. Al crear una cuenta, conectar una integración o utilizar el servicio, el cliente acepta estas Condiciones por medio de un representante autorizado.</p>

      <h2>1. Servicio</h2>
      <p>Nextfor proporciona herramientas de inteligencia artificial para atención, automatización y gestión de citas. Las funciones disponibles dependen del plan, la configuración, los canales autorizados y la disponibilidad de proveedores externos.</p>

      <h2>2. Cuenta y usuarios</h2>
      <p>El cliente debe proporcionar información correcta, proteger sus credenciales y limitar el acceso a usuarios autorizados. Es responsable de la actividad realizada desde su cuenta y de notificarnos accesos no autorizados.</p>

      <h2>3. Integración con Google Calendar</h2>
      <p>La conexión es opcional y requiere autorización expresa en Google. Cuando se activa, Nextfor puede consultar disponibilidad y crear, modificar o cancelar eventos según las acciones del cliente y los flujos configurados. El cliente puede desconectarla desde su panel o revocar el acceso en Google.</p>

      <h2>4. Uso permitido</h2>
      <p>El cliente utilizará el servicio de forma lícita y no intentará vulnerar su seguridad, acceder a otros clientes, enviar contenido ilícito, engañoso o abusivo, ni utilizarlo para decisiones prohibidas o actividades que vulneren derechos de terceros.</p>

      <h2>5. Responsabilidades del cliente</h2>
      <p>El cliente es responsable de sus políticas comerciales, horarios, disponibilidad, personal, servicios, contenidos y de contar con autorizaciones para tratar datos de sus usuarios. Debe revisar la configuración antes de activar el agente y mantener una alternativa humana para situaciones que requieran criterio profesional.</p>

      <h2>6. Inteligencia artificial</h2>
      <p>Las respuestas automatizadas pueden contener errores. Nextfor ofrece controles, pruebas y escalamiento humano, pero el cliente debe revisar los flujos de alto impacto. El servicio no sustituye asesoría médica, legal, financiera ni otras decisiones profesionales reguladas.</p>

      <h2>7. Proveedores externos</h2>
      <p>Google Calendar, Meta, ElevenLabs y otros servicios conectados se rigen también por sus propias condiciones. Nextfor no controla sus interrupciones, cambios o decisiones de cuenta, aunque tomará medidas razonables para mantener y recuperar la integración.</p>

      <h2>8. Pagos y cambios</h2>
      <p>Los precios, periodicidad y límites se informan en el plan contratado. Podremos modificar funciones o tarifas con aviso razonable cuando corresponda. La falta de pago puede limitar o suspender el servicio.</p>

      <h2>9. Propiedad intelectual</h2>
      <p>Nextfor conserva los derechos sobre su plataforma, diseños, software y tecnología. El cliente conserva los derechos sobre su información y contenidos y concede a Nextfor una autorización limitada para tratarlos únicamente con el fin de prestar y proteger el servicio.</p>

      <h2>10. Confidencialidad y datos</h2>
      <p>Cada parte protegerá la información confidencial de la otra. El tratamiento de datos se rige por nuestra <a href="/privacy">Política de Privacidad</a> y, cuando aplique, por acuerdos adicionales con el cliente.</p>

      <h2>11. Disponibilidad y garantías</h2>
      <p>Prestamos el servicio con diligencia razonable, pero no garantizamos operación ininterrumpida ni resultados comerciales específicos. En la medida permitida por la ley, el servicio se ofrece según su disponibilidad y configuración vigente.</p>

      <h2>12. Suspensión y terminación</h2>
      <p>El cliente puede dejar de utilizar integraciones o solicitar el cierre de su cuenta. Nextfor puede suspender accesos por riesgo de seguridad, incumplimiento, fraude, falta de pago o exigencia legal. Cuando sea razonable, informaremos la causa y la forma de corregirla.</p>

      <h2>13. Responsabilidad</h2>
      <p>Cada parte responde por los daños que le sean legalmente imputables. En la máxima medida permitida por la ley, Nextfor no responde por pérdidas indirectas, decisiones tomadas sin revisión humana ni fallos atribuibles a información incorrecta del cliente o a proveedores externos.</p>

      <h2>14. Ley aplicable y contacto</h2>
      <p>Estas Condiciones se interpretan conforme a las leyes de Colombia, sin perjuicio de normas imperativas aplicables al usuario. Las partes procurarán resolver cualquier diferencia de buena fe. Para consultas escribe a <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

      <h2>15. Cambios</h2>
      <p>Podemos actualizar estas Condiciones para reflejar cambios del servicio o de la ley. Publicaremos la versión vigente y comunicaremos los cambios materiales cuando corresponda.</p>

      <div class="legal-nav"><a href="/nextfor-appointment-bot">Volver al producto</a><a href="/privacy">Política de Privacidad</a><a href="mailto:${SUPPORT_EMAIL}">Contactar a Nextfor</a></div>
    </article></main>`
  );
}

module.exports = {
  EFFECTIVE_DATE,
  PUBLIC_ORIGIN,
  SUPPORT_EMAIL,
  renderGoogleOAuthHomepage,
  renderPrivacyPolicy,
  renderTermsOfService
};
