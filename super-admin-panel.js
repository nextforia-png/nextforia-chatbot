"use strict";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function icon(name, size) {
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    lead: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    spark: '<path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9L12 3Z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 4v4M8 13h.01M16 13h.01M8 17h8"/>',
    building: '<path d="M3 21h18M6 21V5l6-2v18M18 21V9l-6-2M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3ZM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    webhook: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    receipt: '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
  };
  return '<svg aria-hidden="true" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.activity) + '</svg>';
}

// Formato de moneda base de la plataforma: COP.
function money(value, currency) {
  if (value == null || !isFinite(Number(value))) return "—";
  const amount = Number(value);
  const abs = Math.abs(amount);
  const compact = abs >= 1000000
    ? "$" + (amount / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(".", ",") + "M"
    : abs >= 1000
      ? "$" + Math.round(amount / 1000) + "k"
      : "$" + Math.round(amount);
  return compact + " " + (currency || "COP");
}

function num(value) {
  if (value == null || !isFinite(Number(value))) return "—";
  return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function emptyBlock(iconName, title, body) {
  return '<div class="empty"><div class="empty-icon">' + icon(iconName, 23) + '</div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(body) + '</p></div>';
}

function renderSuperAdminPanel(res, options) {
  const auth = options.auth || {};
  const customerAccessV2Enabled = !!options.customerAccessV2Enabled;
  const readiness = options.commercialReadiness || {};
  const accessModel = options.accessModel || {};
  const tenant = options.tenant || { id: "rav-toys", name: "RAV Toys", status: "active" };
  // Fuente económica de la plataforma. Mientras no exista un origen financiero
  // de confianza se deja en null y el panel muestra estados vacíos honestos.
  // Contrato esperado (ver README de handoff):
  //   { currency, totals:{mrr,users,costs}, bots:[{id,name,clients,mrr,users,usersUnit,costs}],
  //     pareto:[{name,revenue,botId}], attention:{webhooks,pendingAppointments,queues,overdue} }
  const finance = options.finance || null;
  // Pipeline comercial. Mismo criterio: null hasta que onboarding persista leads.
  //   { kpis:{active,won,demos,conversion}, sources:[{name,paid,leads,won}], rows:[...] }
  const leadsData = options.leads || null;
  const currency = (finance && finance.currency) || "COP";
  const registeredClients = (options.registeredClients || []).filter(function (client) {
    return client && client.tenant_id && client.tenant_id !== tenant.id;
  }).map(function (client) {
    return Object.assign({}, client, {
      panel_path: client.tenant_id === "grupo-derco" ? "/admin/pilots/derco" : ""
    });
  });
  const platformAccounts = [{
    tenant_id: tenant.id,
    brand_name: tenant.name,
    short_name: "RAV Toys",
    status: tenant.status || "active",
    industry: "ecommerce",
    panel_path: "/admin/panel?tab=summary"
  }].concat(registeredClients);
  const stages = readiness.stages || [];
  const readyCount = stages.filter(function (stage) { return stage.status === "ready"; }).length;
  const waitingCount = stages.filter(function (stage) { return stage.status === "waiting_meta"; }).length;
  const draftCount = stages.filter(function (stage) { return stage.status === "draft"; }).length;
  const tenantFields = readiness.requiredTenantFields || [];
  const targetClients = 340;
  const currentClients = registeredClients.length;
  const firstClient = registeredClients.find(function (client) { return client.customer_number === 1; }) || registeredClients[0] || null;
  const goalPercent = Math.max(1, Math.round(currentClients / targetClients * 100));
  const statusLabels = { ready: "Listo", draft: "Pendiente", waiting_meta: "Esperando Meta" };
  const statusVariants = { ready: "success", draft: "neutral", waiting_meta: "warning" };

  // ---------- Economía consolidada ----------
  const financeBots = (finance && Array.isArray(finance.bots) ? finance.bots : []).map(function (bot) {
    const mrr = Number(bot.mrr) || 0;
    const costs = Number(bot.costs) || 0;
    return Object.assign({}, bot, { mrr: mrr, costs: costs, margin: mrr - costs, marginPct: mrr > 0 ? Math.round((mrr - costs) / mrr * 100) : 0 });
  });
  const totalMrr = finance ? financeBots.reduce(function (sum, bot) { return sum + bot.mrr; }, 0) : null;
  const totalCosts = finance ? financeBots.reduce(function (sum, bot) { return sum + bot.costs; }, 0) : null;
  const totalUsers = finance ? financeBots.reduce(function (sum, bot) { return sum + (Number(bot.users) || 0); }, 0) : null;
  const totalMargin = finance ? totalMrr - totalCosts : null;
  const marginPct = finance && totalMrr > 0 ? Math.round(totalMargin / totalMrr * 100) : null;
  const botIcons = { agendamiento: "calendar", atencion: "headset", voz: "mic" };

  const kpiCards = [
    { label: "Ingresos", value: finance ? money(totalMrr, currency) : "—", sub: finance ? "MRR consolidado" : "sin fuente financiera conectada", ic: "dollar", tone: "cyan" },
    { label: "Usuarios atendidos", value: finance ? num(totalUsers) : "—", sub: finance ? "en el mes" : "sin fuente de uso conectada", ic: "users", tone: "cyan" },
    { label: "Costos operativos", value: finance ? money(totalCosts, currency) : "—", sub: finance ? "infraestructura y modelos" : "sin fuente de costos conectada", ic: "receipt", tone: "amber" },
    { label: "Margen", value: finance && marginPct != null ? money(totalMargin, currency) : "—", sub: finance && marginPct != null ? marginPct + "% sobre ingresos" : "se calcula con ingresos y costos", ic: "percent", tone: "cyan" }
  ].map(function (kpi) {
    return '<article class="stat-card"><div class="stat-top"><span>' + escapeHtml(kpi.label) + '</span><span class="icon-chip ' + kpi.tone + '">' + icon(kpi.ic, 17) + '</span></div><div class="stat-value">' + escapeHtml(kpi.value) + '</div><div class="stat-sub">' + escapeHtml(kpi.sub) + '</div></article>';
  }).join("");

  const botBreakdown = financeBots.length
    ? '<div class="bot-grid">' + financeBots.map(function (bot) {
        const accent = bot.id === "agendamiento" ? "cyan" : "navy";
        return '<article class="card bot-card"><div class="bot-head"><span class="icon-chip ' + accent + '">' + icon(botIcons[bot.id] || "bot", 18) + '</span><div><strong>' + escapeHtml(bot.name) + '</strong><span>' + num(bot.clients) + ' clientes activos</span></div><button class="link-button" type="button" data-go="' + escapeHtml(bot.id) + '">Ver módulo →</button></div>'
          + '<div class="bot-metrics"><div><span>Ingresos</span><strong>' + escapeHtml(money(bot.mrr, currency)) + '</strong><small>MRR</small></div>'
          + '<div><span>Usuarios</span><strong>' + num(bot.users) + '</strong><small>' + escapeHtml(bot.usersUnit || "en el mes") + '</small></div>'
          + '<div><span>Costos</span><strong>' + escapeHtml(money(bot.costs, currency)) + '</strong><small>operativo</small></div></div>'
          + '<div class="bot-margin"><div class="bot-margin-top"><span>Margen</span><strong>' + escapeHtml(money(bot.margin, currency)) + ' · ' + bot.marginPct + '%</strong></div><div class="bar"><span class="' + accent + '" style="width:' + Math.max(0, Math.min(100, bot.marginPct)) + '%"></span></div></div></article>';
      }).join("") + '</div>'
    : '<section class="card">' + emptyBlock("layers", "El desglose por bot se activa con la fuente financiera", "Cada bot mostrará ingresos MRR, usuarios atendidos, costos operativos y margen en cuanto exista un origen de facturación y costos por producto. No se muestran cifras de ejemplo como si fueran producción.") + '</section>';

  const compareRows = financeBots.length
    ? financeBots.map(function (bot) {
        return '<div class="compare-row"><span class="compare-name">' + icon(botIcons[bot.id] || "bot", 16) + escapeHtml(bot.name) + '</span><span class="mono">' + num(bot.clients) + '</span><span class="mono right">' + num(bot.users) + '</span><span class="mono right strong">' + escapeHtml(money(bot.mrr, currency)) + '</span><span class="mono right">' + escapeHtml(money(bot.costs, currency)) + '</span><span class="mono right margin">' + escapeHtml(money(bot.margin, currency)) + '</span></div>';
      }).join("") + '<div class="compare-row total"><span class="compare-name">' + icon("layers", 16) + 'Consolidado</span><span class="mono">' + num(currentClients) + '</span><span class="mono right">' + num(totalUsers) + '</span><span class="mono right strong">' + escapeHtml(money(totalMrr, currency)) + '</span><span class="mono right">' + escapeHtml(money(totalCosts, currency)) + '</span><span class="mono right margin">' + escapeHtml(money(totalMargin, currency)) + '</span></div>'
    : '';

  const compareTable = financeBots.length
    ? '<section class="card table-card"><div class="compare-head"><span>Bot</span><span>Clientes</span><span class="right">Usuarios</span><span class="right">Ingresos</span><span class="right">Costos</span><span class="right">Margen</span></div>' + compareRows + '</section>'
    : '';

  const paretoSource = (finance && Array.isArray(finance.pareto) ? finance.pareto : []).slice().sort(function (a, b) { return (Number(b.revenue) || 0) - (Number(a.revenue) || 0); });
  const paretoTotal = paretoSource.reduce(function (sum, row) { return sum + (Number(row.revenue) || 0); }, 0);
  let paretoAccum = 0;
  const paretoRows = paretoSource.map(function (row, index) {
    const share = paretoTotal > 0 ? (Number(row.revenue) || 0) / paretoTotal * 100 : 0;
    paretoAccum += share;
    return '<div class="pareto-row"><div class="pareto-top"><span class="mono rank">' + (index + 1) + '</span><span class="icon-chip ' + (index === 0 ? "cyan" : "navy") + ' sm">' + icon(botIcons[row.botId] || "bot", 15) + '</span><span class="pareto-name">' + escapeHtml(row.name) + '</span><span class="mono">' + escapeHtml(money(row.revenue, currency)) + '</span><span class="pareto-pct">' + share.toFixed(0) + '%</span></div><div class="bar"><span class="' + (index === 0 ? "cyan" : "navy") + '" style="width:' + share.toFixed(1) + '%"></span></div><div class="pareto-accum">acumulado ' + paretoAccum.toFixed(0) + '%</div></div>';
  }).join("");
  const paretoLeaders = (function () {
    let accum = 0;
    let count = 0;
    for (let i = 0; i < paretoSource.length; i++) {
      accum += paretoTotal > 0 ? (Number(paretoSource[i].revenue) || 0) / paretoTotal * 100 : 0;
      count++;
      if (accum >= 60) break;
    }
    return { count: count, share: Math.round(accum) };
  })();
  const paretoCard = paretoSource.length
    ? '<section class="card pareto-card"><div class="pareto-head"><span class="icon-chip cyan">' + icon("trend", 18) + '</span><div><strong>Pareto de ingresos</strong><span>qué producto pesa más en las ventas</span></div><span class="insight-chip">' + icon("spark", 13) + ' ' + paretoLeaders.count + ' de ' + paretoSource.length + ' productos = ' + paretoLeaders.share + '%</span></div><div class="pareto-body">' + paretoRows + '</div></section>'
    : '<section class="card">' + emptyBlock("trend", "El Pareto de ingresos aparece con ventas reales", "Ordena los productos por participación en las ventas y muestra el porcentaje acumulado. Se habilita cuando la facturación por producto esté conectada.") + '</section>';

  const attentionSource = (finance && finance.attention) || null;
  const attentionItems = [
    { key: "webhooks", label: "Webhooks con fallas", go: "incidents", tone: "red", ic: "webhook" },
    { key: "pendingAppointments", label: "Citas por confirmar", go: "agendamiento", tone: "amber", ic: "calendar" },
    { key: "queues", label: "Colas de atención altas", go: "atencion", tone: "amber", ic: "headset" },
    { key: "overdue", label: "Pagos vencidos", go: "billing", tone: "red", ic: "receipt" }
  ].map(function (item) {
    const value = attentionSource && attentionSource[item.key] != null ? num(attentionSource[item.key]) : "—";
    return '<button class="attention-card" type="button" data-go="' + item.go + '"><span class="attention-icon ' + item.tone + '">' + icon(item.ic, 20) + '</span><div><div class="attention-value">' + escapeHtml(value) + '</div><p>' + escapeHtml(item.label) + '</p></div></button>';
  }).join("");

  // ---------- Bloques heredados (readiness, acceso, clientes) ----------
  const readinessRows = stages.map(function (stage) {
    return '<div class="readiness-row"><div><strong>' + escapeHtml(stage.label) + '</strong><span>' + escapeHtml(stage.owner) + '</span></div><span class="badge ' + (statusVariants[stage.status] || "neutral") + ' dot">' + escapeHtml(statusLabels[stage.status] || stage.status) + '</span></div>';
  }).join("");
  const roleRows = (accessModel.roles || []).map(function (role) {
    return '<article class="role-card"><div class="role-top"><code>' + escapeHtml(role.role) + '</code><span>Nivel ' + escapeHtml(role.level) + '</span></div><strong>' + escapeHtml(role.owner) + ' · ' + escapeHtml(role.scope) + '</strong><p>' + escapeHtml(role.purpose) + '</p></article>';
  }).join("");
  const panelRows = (accessModel.future_panels || []).map(function (panel) {
    return '<article class="split-card"><div class="split-icon">' + icon(panel.id === "platform_super_admin" ? "shield" : "building", 20) + '</div><div><div class="split-title"><strong>' + escapeHtml(panel.label) + '</strong><span>' + escapeHtml(panel.owner) + '</span></div><p>' + escapeHtml(panel.purpose) + '</p><div class="role-pills">' + (panel.roles || []).map(function (role) { return '<code>' + escapeHtml(role) + '</code>'; }).join("") + '</div></div></article>';
  }).join("");
  const fields = tenantFields.map(function (field) { return '<code>' + escapeHtml(field) + '</code>'; }).join("");
  const nextSteps = [
    ["tenant_id default", "Aplicar el tenant inicial a cada registro nuevo."],
    ["tenant config", "Aislar la configuración operativa por comercio."],
    ["users per tenant", "Separar usuarios, roles y sesiones por cliente."],
    ["health per tenant", "Medir integraciones y alertas por comercio."],
    ["WhatsApp/Shopify config per tenant", "Resolver credenciales aisladas sin mostrar sus valores."]
  ].map(function (step, index) {
    return '<li><span class="step-number">' + (index + 1) + '</span><div><strong>' + escapeHtml(step[0]) + '</strong><p>' + escapeHtml(step[1]) + '</p></div><span class="badge neutral">Próxima fase</span></li>';
  }).join("");
  const clientSummaryRows = platformAccounts.map(function (client) {
    const isDefault = client.tenant_id === tenant.id;
    const initials = String(client.short_name || client.brand_name || "CL").split(/\s+/).map(function (word) { return word.charAt(0); }).join("").slice(0, 2).toUpperCase();
    const content = '<span class="avatar sm">' + escapeHtml(initials) + '</span><span class="client-main"><strong>' + escapeHtml(client.brand_name) + '</strong><span>' + escapeHtml(client.tenant_id) + ' · ' + (isDefault ? 'entorno legado' : 'Cliente #' + escapeHtml(client.customer_number || '—')) + '</span></span><span class="badge ' + (isDefault ? 'neutral' : 'info') + ' dot">' + (isDefault ? 'Legado' : 'Piloto') + '</span>' + (isDefault ? '<span class="badge warning dot">Meta pendiente</span>' : '<span class="badge neutral">Voz · citas</span>') + '<span class="chevron">' + icon("chevron", 18) + '</span>';
    return isDefault ? '<button class="client-row" type="button" onclick="openTenant()">' + content + '</button>' : '<a class="client-row" href="' + escapeHtml(client.panel_path || "#") + '">' + content + '</a>';
  }).join("");
  const clientTableRows = registeredClients.map(function (client) {
    const isDefault = client.tenant_id === tenant.id;
    const initials = String(client.short_name || client.brand_name || "CL").split(/\s+/).map(function (word) { return word.charAt(0); }).join("").slice(0, 2).toUpperCase();
    const sector = "Servicios profesionales";
    const plan = "Piloto citas";
    const integrations = "ElevenLabs · Calendar";
    const search = [client.brand_name, client.short_name, client.tenant_id, sector].join(" ").toLowerCase();
    const content = '<span class="tenant-cell"><span class="avatar sm">' + escapeHtml(initials) + '</span><span><strong>' + escapeHtml(client.brand_name) + '</strong><span>' + escapeHtml(client.tenant_id) + '</span></span></span><span class="cell-text">' + escapeHtml(sector) + '</span><span class="badge neutral">' + escapeHtml(plan) + '</span><span class="cell-text">' + escapeHtml(integrations) + '</span><span class="badge ' + (isDefault ? 'success' : 'info') + ' dot">' + (isDefault ? 'Activo' : 'Piloto') + '</span><span>' + icon("chevron", 17) + '</span>';
    return isDefault ? '<button class="tenant-row" data-search="' + escapeHtml(search) + '" type="button" onclick="openTenant()">' + content + '</button>' : '<a class="tenant-row" data-search="' + escapeHtml(search) + '" href="' + escapeHtml(client.panel_path || "#") + '">' + content + '</a>';
  }).join("");

  // ---------- Leads ----------
  const leadKpis = [
    { label: "Leads activos", key: "active", ic: "lead" },
    { label: "Ganados del mes", key: "won", ic: "check" },
    { label: "Demos agendadas", key: "demos", ic: "calendar" },
    { label: "Conversión lead→cliente", key: "conversion", ic: "percent", suffix: "%" }
  ].map(function (kpi) {
    const raw = leadsData && leadsData.kpis ? leadsData.kpis[kpi.key] : null;
    const value = raw == null ? "—" : num(raw) + (kpi.suffix || "");
    return '<article class="stat-card"><div class="stat-top"><span>' + escapeHtml(kpi.label) + '</span><span class="icon-chip cyan">' + icon(kpi.ic, 17) + '</span></div><div class="stat-value">' + escapeHtml(value) + '</div><div class="stat-sub">' + (leadsData ? "pipeline comercial" : "sin pipeline conectado") + '</div></article>';
  }).join("");
  const leadSourceCards = (leadsData && Array.isArray(leadsData.sources) ? leadsData.sources : []).map(function (source) {
    const leads = Number(source.leads) || 0;
    const won = Number(source.won) || 0;
    const rate = leads > 0 ? Math.round(won / leads * 100) : 0;
    return '<article class="card source-card"><div class="source-head"><strong>' + escapeHtml(source.name) + '</strong><span class="badge ' + (source.paid ? "warning" : "success") + ' dot">' + (source.paid ? "Pago" : "Orgánico") + '</span></div><div class="source-metrics"><div><span>Leads</span><strong>' + num(leads) + '</strong></div><div><span>Ganados</span><strong>' + num(won) + '</strong></div><div><span>Conversión</span><strong>' + rate + '%</strong></div></div><div class="bar"><span class="cyan" style="width:' + rate + '%"></span></div></article>';
  }).join("");

  const customerAccessPanel = customerAccessV2Enabled ? `
  <section class="card access-card" aria-labelledby="customerAccessTitle"><div class="card-head"><div><h2 id="customerAccessTitle">Altas e invitaciones</h2><p>Clientes creados por Nextfor IA. El enlace privado se envía únicamente al correo administrador.</p></div><button class="button" type="button" onclick="loadCustomerInvitations()">${icon("refresh", 15)} Actualizar</button></div>
  <div class="invite-head" aria-hidden="true"><span>Cliente</span><span>Plan / bot</span><span>Entrega</span><span>Vencimiento</span><span>Acción</span></div><div id="customerInvitationRows"><div class="invite-loading">Cargando invitaciones…</div></div>
  </section>` : "";

  const customerAccessModal = customerAccessV2Enabled ? `
  <div class="modal-layer" id="customerCreateModal" aria-hidden="true"><button class="modal-scrim" type="button" aria-label="Cerrar alta de cliente" onclick="closeCustomerCreate()"></button><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="customerCreateTitle"><div class="modal-head"><div><span class="eyebrow">ACCESO PRIVADO</span><h2 id="customerCreateTitle">Crear cliente</h2><p>La persona invitada definirá su propia contraseña. No existe registro público.</p></div><button class="close-button" type="button" onclick="closeCustomerCreate()" aria-label="Cerrar">${icon("close", 19)}</button></div><form id="customerCreateForm" class="customer-form" novalidate>
    <label for="companyName">Empresa</label><input id="companyName" name="company_name" maxlength="120" autocomplete="organization" required>
    <label for="adminEmail">Correo administrador</label><input id="adminEmail" name="admin_email" type="email" maxlength="254" autocomplete="email" required>
    <div class="form-grid"><div><label for="planId">Plan</label><select id="planId" name="plan_id" required><option value="">Cargando…</option></select></div><div><label for="assignedBotId">Bot asignado</label><select id="assignedBotId" name="assigned_bot_id" required><option value="">Cargando…</option></select></div></div>
    <div class="form-note">La invitación es aleatoria, vence, funciona una sola vez y puede revocarse. Nextfor IA no recibe la contraseña.</div><div class="form-error" id="customerCreateError" role="alert" aria-live="assertive"></div><div class="modal-actions"><button class="button" type="button" onclick="closeCustomerCreate()">Cancelar</button><button class="button primary" id="customerCreateSubmit" type="submit">Crear y enviar invitación</button></div>
  </form></section></div>` : "";

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel Super Admin · NexforIA</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap');
:root{
--navy-950:#060F22;--navy-900:#0A1836;--navy-800:#0E2148;--navy-700:#122A5C;--navy-600:#1B3A78;--navy-500:#254B95;
--cyan-50:#EDF9FF;--cyan-100:#D7F1FE;--cyan-300:#57C2F3;--cyan-400:#29B1F5;--cyan-500:#00A0F0;--cyan-600:#0587CC;--cyan-700:#0A6BA1;
--slate-50:#F6F8FB;--slate-100:#EDF1F7;--slate-200:#DFE6F0;--slate-300:#C6D1E0;--slate-400:#94A3BC;--slate-500:#647289;--slate-600:#49576E;--slate-700:#313C50;
--green-500:#14A971;--green-50:#E9F8F2;--amber-500:#F5A524;--amber-50:#FFF7E7;--red-500:#EF4E4E;--red-50:#FFF0F0;
--surface-page:#F4F7FB;--surface-card:#FFFFFF;
--text-strong:#0A1836;--text-body:#313C50;--text-muted:#647289;--text-subtle:#94A3BC;
--border-subtle:#DFE6F0;--border-default:#C6D1E0;--border-brand:#00A0F0;
--gradient-cyan:linear-gradient(135deg,#00A0F0,#087FC3);--gradient-brand:linear-gradient(135deg,#122A5C,#00A0F0);--gradient-hero:linear-gradient(145deg,#122A5C,#060F22);
--radius-sm:8px;--radius-md:12px;--radius-lg:16px;--radius-xl:22px;--radius-2xl:32px;
--font-display:"Sora","Avenir Next",sans-serif;--font-body:"Plus Jakarta Sans","Avenir Next",sans-serif;--font-mono:"JetBrains Mono",monospace;
--shadow-xs:0 1px 2px rgba(10,24,54,.05);--shadow-sm:0 3px 12px rgba(10,24,54,.055);--shadow-md:0 12px 30px rgba(10,24,54,.08);--shadow-lg:0 22px 48px rgba(10,24,54,.14);--shadow-glow:0 10px 28px rgba(0,160,240,.28);
--focus-ring:0 0 0 3px rgba(0,160,240,.25);--ease:cubic-bezier(.22,.61,.36,1);
/* alias heredados */
--surface:var(--surface-page);--card:var(--surface-card);--border:var(--border-subtle);--display:var(--font-display);--body:var(--font-body);--mono:var(--font-mono);--green:var(--green-500);--amber:var(--amber-500);--red:var(--red-500);--focus:var(--focus-ring)}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--surface-page);color:var(--text-body);font-family:var(--font-body);font-size:14px}
.app{height:100vh;display:flex;overflow:hidden}
.sidebar{width:242px;flex:0 0 242px;background:var(--navy-950);color:#fff;padding:18px 13px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;border-right:1px solid rgba(255,255,255,.06)}
.brand{display:flex;align-items:center;gap:10px;padding:4px 8px 14px}
.brand-mark{height:28px;width:auto;object-fit:contain}
.brand-lumen{display:none}
.brand-name{font-family:var(--font-display);font-weight:800;font-size:15px;letter-spacing:-.01em;line-height:1}.brand-name span{color:var(--cyan-400)}
.brand-role{margin-top:3px;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.nav-group{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.32);font-weight:700;padding:14px 9px 5px}
.nav-group:first-of-type{padding-top:8px}
.nav-button{width:100%;min-height:40px;padding:0 11px;border:0;border-radius:var(--radius-md);background:transparent;color:rgba(255,255,255,.68);display:flex;align-items:center;gap:10px;font:700 13px var(--font-body);cursor:pointer;transition:160ms var(--ease);text-align:left}
.nav-button:hover:not(:disabled){color:#fff;background:rgba(255,255,255,.06)}
.nav-button.active{color:#fff;background:var(--gradient-cyan);box-shadow:var(--shadow-glow)}
.nav-button:disabled{opacity:.45;cursor:not-allowed}
.nav-button>span:nth-child(2){flex:1}
.nav-badge{min-width:22px;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.12);font:600 10px var(--font-mono);text-align:center}
.nav-button.active .nav-badge{background:rgba(6,15,34,.28);color:#fff}
.nav-soon{font-size:8.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:2px 5px}
.sidebar-bottom{margin-top:auto;display:flex;flex-direction:column;gap:11px;padding-top:14px}
.margin-card{position:relative;padding:13px 13px 13px 15px;background:linear-gradient(150deg,rgba(0,160,240,.16),rgba(255,255,255,.03));border-radius:var(--radius-lg);border:1px solid rgba(255,255,255,.08);overflow:hidden}
.margin-card img{position:absolute;right:-14px;bottom:-10px;height:82px;width:auto;opacity:.92;pointer-events:none}
.margin-card>div{position:relative;max-width:120px}
.margin-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:700;margin-bottom:6px}
.margin-value{font-family:var(--font-display);font-weight:800;font-size:24px;letter-spacing:-.03em;color:var(--cyan-300);line-height:1}
.margin-note{font-size:11px;color:rgba(255,255,255,.6);line-height:1.3;margin-top:3px}
.user-card{display:flex;align-items:center;gap:10px;padding:4px 8px}
.avatar{display:inline-grid;place-items:center;border-radius:50%;background:var(--gradient-cyan);color:#fff;font:800 12px var(--font-display);flex:0 0 auto}
.avatar.sm{width:32px;height:32px}.avatar.lg{width:50px;height:50px;font-size:15px}
.user-card strong{display:block;font-size:12.5px;color:#fff}.user-card span{display:block;font-size:10.5px;color:rgba(255,255,255,.5);margin-top:2px}
.workspace{min-width:0;flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{flex:0 0 auto;padding:16px 24px;background:var(--surface-card);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:16px}
.page-heading{flex:1;min-width:0}
.page-heading h1{font:700 20px var(--font-display);letter-spacing:-.02em;color:var(--text-strong);margin:0}
.page-heading p{font-size:12.5px;color:var(--text-muted);margin:3px 0 0}
.top-actions{display:flex;align-items:center;gap:8px}
.button{min-height:40px;border:1px solid var(--border-default);border-radius:var(--radius-md);padding:0 13px;background:var(--surface-card);color:var(--text-body);font:700 12px var(--font-body);display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;cursor:pointer;transition:150ms var(--ease)}
.button:hover{border-color:var(--border-brand);color:var(--cyan-700);background:var(--cyan-50)}
.button.primary{border-color:transparent;background:var(--gradient-cyan);color:#fff;box-shadow:var(--shadow-glow)}
.button.danger{color:#B73535;border-color:#F5CACA}
.button.icon-only{width:40px;padding:0}.button:disabled{opacity:.55;cursor:wait}
.link-button{border:0;background:none;color:var(--cyan-600);font:700 12.5px var(--font-body);cursor:pointer;white-space:nowrap;padding:0}
.content{flex:1;overflow:auto}
.view{display:none;padding:22px 24px 34px;max-width:1088px;animation:rise .28s var(--ease)}
.view.active{display:block}
.section-title{display:flex;align-items:baseline;gap:9px;margin:22px 0 13px}
.section-title h2{font:700 16px var(--font-display);color:var(--text-strong);margin:0}
.section-title span{font-size:12.5px;color:var(--text-muted)}
.grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.stat-card,.card{background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-md)}
.stat-card{padding:17px 19px}
.stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;color:var(--text-muted);font-size:12px;font-weight:600}
.icon-chip{width:30px;height:30px;flex:0 0 auto;border-radius:9px;background:var(--cyan-50);color:var(--cyan-600);display:grid;place-items:center}
.icon-chip.amber{background:var(--amber-50);color:#B77509}
.icon-chip.navy{background:var(--slate-100);color:var(--navy-600)}
.icon-chip.sm{width:24px;height:24px;border-radius:7px}
.stat-value{font:800 29px var(--font-display);letter-spacing:-.03em;line-height:1;color:var(--text-strong)}
.stat-sub{font-size:11.5px;color:var(--text-subtle);margin-top:6px}
.bot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.bot-card{overflow:hidden;padding:0}
.bot-head{display:flex;align-items:center;gap:11px;padding:15px 18px;border-bottom:1px solid var(--border-subtle)}
.bot-head strong{display:block;font:700 15px var(--font-display);color:var(--text-strong)}
.bot-head span{display:block;font-size:11.5px;color:var(--text-muted)}
.bot-head>div{flex:1;min-width:0}
.bot-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--slate-100)}
.bot-metrics>div{background:var(--surface-card);padding:14px 16px}
.bot-metrics span{font-size:11px;color:var(--text-muted);font-weight:600}
.bot-metrics strong{display:block;font:800 20px var(--font-display);color:var(--text-strong);margin-top:4px}
.bot-metrics small{font-size:10.5px;color:var(--text-subtle)}
.bot-margin{padding:13px 18px}
.bot-margin-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
.bot-margin-top span{color:var(--text-muted);font-weight:600}
.bot-margin-top strong{font-family:var(--font-mono);font-weight:800;color:var(--green-500)}
.bar{height:7px;background:var(--slate-100);border-radius:999px;overflow:hidden}
.bar>span{display:block;height:100%;border-radius:inherit;min-width:4px}
.bar>span.cyan{background:var(--gradient-cyan)}.bar>span.navy{background:var(--navy-500)}
.compare-head,.compare-row{display:grid;grid-template-columns:1.4fr 90px 1fr 1fr 1fr 96px;gap:12px;align-items:center;min-width:760px}
.compare-head{padding:12px 20px;border-bottom:1px solid var(--border-subtle);background:var(--slate-50);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;color:var(--text-subtle)}
.compare-row{padding:14px 20px;border-top:1px solid var(--slate-100)}
.compare-row.total{background:var(--slate-50);font-weight:800}
.compare-name{display:flex;align-items:center;gap:9px;font-weight:700;font-size:13.5px;color:var(--text-strong)}
.compare-name svg{color:var(--cyan-600);flex:0 0 auto}
.mono{font-family:var(--font-mono);font-size:13px;color:var(--text-body);font-weight:600}
.mono.right{text-align:right}.mono.strong{color:var(--text-strong);font-weight:700}.mono.margin{color:var(--green-500);font-weight:800}
.pareto-card{padding:0;overflow:hidden}
.pareto-head{display:flex;align-items:center;gap:11px;padding:16px 20px 14px;border-bottom:1px solid var(--border-subtle)}
.pareto-head>div{flex:1;min-width:0}
.pareto-head strong{display:block;font:700 15px var(--font-display);color:var(--text-strong)}
.pareto-head span{font-size:12px;color:var(--text-muted)}
.insight-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--navy-800);color:#fff;font-size:11.5px;font-weight:700;white-space:nowrap}
.pareto-body{padding:8px 20px 18px}
.pareto-row{padding:12px 0;border-bottom:1px solid var(--slate-100);display:flex;flex-direction:column;gap:8px}
.pareto-row:last-child{border-bottom:0}
.pareto-top{display:flex;align-items:center;gap:10px}
.rank{width:16px;flex:0 0 auto;color:var(--text-subtle);font-weight:700}
.pareto-name{flex:1;font-weight:700;font-size:13.5px;color:var(--text-strong)}
.pareto-pct{font:800 16px var(--font-display);color:var(--text-strong);min-width:44px;text-align:right}
.pareto-accum{font-size:11px;color:var(--text-subtle)}
.attention{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.attention-card{border:1px solid var(--border-subtle);border-radius:var(--radius-lg);background:var(--surface-card);padding:16px;text-align:left;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);cursor:pointer;font:inherit;transition:160ms var(--ease)}
.attention-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}
.attention-icon{width:42px;height:42px;flex:0 0 auto;border-radius:var(--radius-md);display:grid;place-items:center}
.attention-icon.red{background:var(--red-50);color:#C83F3F}
.attention-icon.amber{background:var(--amber-50);color:#B77509}
.attention-icon.warning{background:var(--amber-50);color:#B77509}
.attention-icon.neutral{background:var(--slate-100);color:var(--slate-600)}
.attention-icon.info{background:var(--cyan-50);color:var(--cyan-600)}
.attention-value{font:800 25px var(--font-display);letter-spacing:-.02em;color:var(--text-strong);line-height:1}
.attention-card p{font-size:11.5px;color:var(--text-muted);margin:4px 0 0}
.attention-card strong{display:block;color:var(--text-strong);font-size:13px}
.source-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.source-card{padding:16px 18px}
.source-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.source-head strong{font:700 14px var(--font-display);color:var(--text-strong)}
.source-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:11px}
.source-metrics span{display:block;font-size:10.5px;color:var(--text-muted)}
.source-metrics strong{display:block;font:800 17px var(--font-display);color:var(--text-strong);margin-top:2px}
.two-col{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:18px}
.stack{display:flex;flex-direction:column;gap:20px}
.card{padding:20px}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:15px}
.card-head h2{font:700 15px var(--font-display);color:var(--text-strong);margin:0}
.card-head p{font-size:11px;color:var(--text-muted);margin:4px 0 0}
.badge{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800}
.badge.dot:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.success{background:var(--green-50);color:#087E54}
.badge.warning{background:var(--amber-50);color:#9C650C}
.badge.danger{background:var(--red-50);color:#C83F3F}
.badge.info{background:var(--cyan-50);color:var(--cyan-700)}
.badge.neutral{background:var(--slate-100);color:var(--slate-600)}
.readiness-list,.health-list{display:grid}
.readiness-row,.health-row{min-height:45px;border-top:1px solid var(--slate-100);display:flex;align-items:center;justify-content:space-between;gap:12px}
.readiness-row:first-child,.health-row:first-child{border-top:0}
.readiness-row strong{display:block;color:var(--text-body);font-size:12px}
.readiness-row div span{display:block;color:var(--text-muted);font-size:10px;margin-top:2px}
.health-row span:first-child{font-size:12px;color:var(--text-muted)}
.health-value{font-size:11px;font-weight:800}
.health-value.ok{color:#087E54}.health-value.warn{color:#9C650C}.health-value.err{color:#C83F3F}
.callout{margin-top:18px;padding:15px 17px;border:1px solid #F0D29C;border-radius:15px;background:var(--amber-50);display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.callout strong{display:block;color:#80510A;font-size:12px}
.callout p{margin:4px 0 0;color:#9C650C;font-size:11px;line-height:1.55}
.client-list{margin-top:18px;overflow:hidden;padding:0}
.list-head{padding:16px 19px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between}
.list-head h2{font:700 14px var(--font-display);color:var(--text-strong);margin:0}
.client-row{width:100%;border:0;background:var(--surface-card);padding:14px 19px;display:flex;align-items:center;gap:13px;text-align:left;cursor:pointer}
.client-row:hover{background:var(--slate-50)}
.client-main{flex:1;min-width:0}
.client-main strong{display:block;color:var(--text-strong);font-size:13px}
.client-main span{display:block;color:var(--text-muted);font-size:10.5px;margin-top:2px}
.client-row .chevron{color:var(--text-subtle)}
.toolbar{display:flex;align-items:center;gap:12px;margin-bottom:15px}
.search{position:relative;width:min(360px,100%)}
.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-subtle)}
.search input{width:100%;height:40px;border:1.5px solid var(--border-default);border-radius:var(--radius-md);padding:0 14px 0 38px;font:500 13.5px var(--font-body);color:var(--text-strong);background:var(--surface-card);outline:0}
.search input:focus{border-color:var(--border-brand);box-shadow:var(--focus-ring)}
.filter-chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--border-subtle);border-radius:999px;background:var(--surface-card);padding:7px 11px;color:var(--text-muted);font:700 11px var(--font-body)}
.chip.active{background:var(--navy-900);border-color:var(--navy-900);color:#fff}
.chip span{font:600 9px var(--font-mono);margin-left:5px;color:var(--cyan-500)}
.table-card{overflow:hidden;padding:0}
.table-head,.tenant-row{min-width:820px;display:grid;grid-template-columns:2fr 1.1fr .75fr 1.1fr .9fr 24px;gap:14px;align-items:center}
.table-head{padding:12px 18px;background:var(--slate-50);border-bottom:1px solid var(--border-subtle);font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle)}
.table-scroll{overflow:auto}
.tenant-row{width:100%;padding:15px 18px;border:0;background:var(--surface-card);text-align:left;font:inherit;cursor:pointer}
.tenant-row:hover{background:var(--slate-50)}
.tenant-cell{display:flex;align-items:center;gap:10px}
.tenant-cell strong{display:block;font-size:12px;color:var(--text-strong)}
.tenant-cell span{font-size:10px;color:var(--text-muted)}
.cell-text{font-size:11px;color:var(--text-muted)}
.empty{padding:48px 24px;text-align:center}
.empty-icon{width:54px;height:54px;border-radius:17px;background:var(--cyan-50);color:var(--cyan-600);display:grid;place-items:center;margin:0 auto 15px}
.empty h2{font:700 16px var(--font-display);color:var(--text-strong);margin:0}
.empty p{max-width:520px;margin:7px auto 0;font-size:12px;line-height:1.6;color:var(--text-muted)}
.empty-lumen{height:74px;width:auto;margin:0 auto 12px;display:block;opacity:.95}
.role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.role-card{border:1px solid var(--border-subtle);border-radius:13px;padding:13px;background:var(--slate-50)}
.role-top,.split-title{display:flex;align-items:center;justify-content:space-between;gap:8px}
.role-card code,.role-pills code,.fields code{font:600 10px var(--font-mono);color:var(--cyan-700);background:var(--cyan-50);border:1px solid var(--cyan-100);padding:4px 7px;border-radius:7px}
.role-top span,.split-title span{font-size:9.5px;color:var(--text-muted)}
.role-card>strong{display:block;font-size:11px;margin-top:9px;color:var(--text-strong)}
.role-card p,.split-card p{font-size:10.5px;line-height:1.55;color:var(--text-muted);margin:4px 0 0}
.split-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.split-card{display:grid;grid-template-columns:auto 1fr;gap:11px;border:1px solid var(--border-subtle);border-radius:14px;padding:14px}
.split-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:var(--cyan-50);color:var(--cyan-600)}
.split-title strong{font:700 13px var(--font-display);color:var(--text-strong)}
.role-pills,.fields{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.steps{list-style:none;padding:0;margin:0}
.steps li{min-height:62px;border-top:1px solid var(--slate-100);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px}
.steps li:first-child{border-top:0}
.step-number{width:28px;height:28px;border-radius:9px;background:var(--slate-100);display:grid;place-items:center;font:700 10px var(--font-mono);color:var(--text-muted)}
.steps strong{font-size:11.5px;color:var(--text-strong)}
.steps p{font-size:10px;color:var(--text-muted);margin:3px 0 0}
.drawer-layer{position:fixed;inset:0;z-index:30;display:none}
.drawer-layer.open{display:block}
.scrim{position:absolute;inset:0;background:rgba(6,15,34,.55);backdrop-filter:blur(3px);animation:fade .2s var(--ease);border:0;width:100%}
.drawer{position:absolute;right:0;top:0;height:100%;width:min(468px,94vw);background:var(--surface-card);box-shadow:-24px 0 60px rgba(10,24,54,.28);display:flex;flex-direction:column;animation:drawer .28s var(--ease)}
.drawer-head{padding:21px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:flex-start;gap:12px}
.drawer-title{flex:1}
.drawer-title h2{font:700 17px var(--font-display);color:var(--text-strong);margin:2px 0 4px}
.drawer-title p{font-size:11px;color:var(--text-muted);margin:0}
.drawer-badges{display:flex;gap:6px;margin-top:9px}
.close-button{width:38px;height:38px;border:0;border-radius:11px;background:var(--slate-50);color:var(--text-muted);display:grid;place-items:center;cursor:pointer}
.drawer-body{padding:20px;overflow:auto;display:grid;gap:15px}
.next-card{padding:15px;border:1px solid var(--cyan-100);border-radius:14px;background:var(--cyan-50);display:grid;grid-template-columns:auto 1fr;gap:10px}
.next-card svg{color:var(--cyan-600)}
.next-card strong{font-size:11px;color:var(--text-strong)}
.next-card p{font-size:10.5px;line-height:1.55;color:var(--text-muted);margin:4px 0 0}
.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mini-card{padding:13px;border:1px solid var(--border-subtle);border-radius:12px}
.mini-card span{display:block;font-size:9.5px;color:var(--text-muted)}
.mini-card strong{display:block;font:700 14px var(--font-display);color:var(--text-strong);margin-top:4px}
.drawer-section{padding:15px;border:1px solid var(--border-subtle);border-radius:14px}
.drawer-section h3{font:700 12px var(--font-display);color:var(--text-strong);margin:0 0 11px}
.integration{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid var(--slate-100);font-size:11px}
.integration:first-of-type{border-top:0}
.drawer-foot{padding:16px 20px;border-top:1px solid var(--border-subtle);display:grid;grid-template-columns:1fr 1fr;gap:9px}
.toast{position:fixed;right:22px;bottom:22px;z-index:60;max-width:330px;padding:12px 15px;border-radius:12px;background:var(--navy-900);color:#fff;font-size:11px;box-shadow:var(--shadow-lg);opacity:0;pointer-events:none;transform:translateY(8px);transition:.2s var(--ease)}
.toast.show{opacity:1;transform:none}
.access-card{padding:0;overflow:hidden}.invite-head,.invite-row{display:grid;grid-template-columns:1.45fr 1fr .85fr .9fr auto;gap:12px;align-items:center}.invite-head{padding:10px 18px;background:var(--slate-50);border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);color:var(--text-subtle);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.invite-row{min-height:65px;padding:12px 18px;border-top:1px solid var(--slate-100)}.invite-row:first-child{border-top:0}.invite-row strong{display:block;color:var(--text-strong);font-size:11.5px}.invite-row small{display:block;margin-top:3px;color:var(--text-muted);font-size:9.5px}.invite-loading{padding:28px;text-align:center;color:var(--text-muted);font-size:11px}.modal-layer{position:fixed;inset:0;z-index:70;display:none;place-items:center;padding:20px}.modal-layer.open{display:grid}.modal-scrim{position:absolute;inset:0;width:100%;border:0;background:rgba(6,15,34,.62);backdrop-filter:blur(4px)}.modal-card{position:relative;width:min(590px,96vw);max-height:94vh;overflow:auto;border:1px solid var(--border-subtle);border-radius:20px;background:var(--surface-card);box-shadow:var(--shadow-lg);animation:rise .2s var(--ease)}.modal-head{display:flex;align-items:flex-start;gap:15px;padding:22px 24px 17px;border-bottom:1px solid var(--border-subtle)}.modal-head>div{flex:1}.modal-head h2{font:800 20px var(--font-display);margin:2px 0 5px;color:var(--text-strong)}.modal-head p{margin:0;color:var(--text-muted);font-size:11px;line-height:1.55}.eyebrow{color:var(--cyan-700);font-size:9px;font-weight:800;letter-spacing:.13em}.customer-form{padding:21px 24px}.customer-form label{display:block;margin:13px 0 6px;color:var(--text-strong);font-size:10.5px;font-weight:800}.customer-form>label:first-child{margin-top:0}.customer-form input,.customer-form select{width:100%;height:43px;border:1.5px solid var(--border-default);border-radius:10px;padding:0 11px;background:#fff;color:var(--text-strong);font:600 12px var(--font-body);outline:0}.customer-form input:focus,.customer-form select:focus{border-color:var(--border-brand);box-shadow:var(--focus-ring)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.form-note{margin-top:16px;padding:11px 12px;border-radius:10px;background:var(--cyan-50);color:var(--cyan-700);font-size:10px;line-height:1.5}.form-error{min-height:17px;margin-top:9px;color:#C83F3F;font-size:10.5px}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:9px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
:focus-visible{outline:0;box-shadow:var(--focus-ring)}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
@keyframes fade{from{opacity:0}}
@keyframes drawer{from{opacity:.5;transform:translateX(28px)}}
@media(max-width:1080px){.grid-4{grid-template-columns:repeat(2,1fr)}.attention{grid-template-columns:repeat(2,1fr)}.bot-grid,.two-col,.source-grid{grid-template-columns:1fr}.top-actions .optional{display:none}}
@media(max-width:820px){.app{height:auto;min-height:100%;display:block;overflow:visible}.sidebar{width:100%;height:auto;position:sticky;top:0;z-index:20;padding:12px 14px;flex-direction:row;align-items:center;gap:6px;overflow-x:auto}.brand{padding:0 8px 0 0}.brand-role,.sidebar-bottom,.nav-group,.nav-badge{display:none}.brand-lumen{display:block;height:34px;width:auto;margin-left:6px}.nav-button{width:auto;min-width:max-content;height:38px}.workspace{overflow:visible}.topbar{position:sticky;top:62px;z-index:15}.content{overflow:visible}.view{padding:18px}.split-grid,.role-grid{grid-template-columns:1fr}}
@media(max-width:560px){.topbar{align-items:flex-start;flex-wrap:wrap}.top-actions{width:100%}.top-actions .button{flex:1}.top-actions .button.icon-only{flex:0 0 40px}.page-heading h1{font-size:18px}.grid-4,.attention{grid-template-columns:1fr 1fr;gap:10px}.stat-card{padding:14px}.stat-value{font-size:22px}.toolbar{display:block}.filter-chips{margin-top:10px}.steps li{grid-template-columns:auto 1fr}.steps li>.badge{grid-column:2;justify-self:start;margin-bottom:9px}.mini-grid,.drawer-foot,.form-grid{grid-template-columns:1fr}.callout{display:block}.callout>.badge{margin-top:10px}.invite-head{display:none}.invite-row{grid-template-columns:1fr 1fr}.invite-row>div:first-child{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:0ms!important;transition-duration:0ms!important;scroll-behavior:auto!important}}
</style></head>
<body><div class="app">
<aside class="sidebar" aria-label="Navegación Super Admin">
<div class="brand"><img class="brand-mark" src="/admin/assets/nexfor-mark-light.png" alt="Nextfor IA"><div><div class="brand-name">Nextfor <span>IA</span></div><div class="brand-role">Super Admin</div></div><img class="brand-lumen" src="/admin/assets/lumen.png" alt="" aria-hidden="true"></div>
<div class="nav-group">Consolidado</div>
<nav aria-label="Consolidado"><button class="nav-button active" data-view="overview" aria-current="page">${icon("overview", 18)}<span>Resumen</span></button><button class="nav-button" data-view="leads">${icon("lead", 18)}<span>Leads</span><span class="nav-badge">${leadsData && leadsData.kpis ? num(leadsData.kpis.active) : 0}</span></button><button class="nav-button" data-view="clients">${icon("users", 18)}<span>Clientes</span><span class="nav-badge">${currentClients}</span></button></nav>
<div class="nav-group">Bots</div>
<nav aria-label="Bots"><button class="nav-button" data-view="agendamiento">${icon("calendar", 18)}<span>Agendamiento</span></button><button class="nav-button" data-view="atencion">${icon("headset", 18)}<span>Atención al cliente</span></button><button class="nav-button" type="button" disabled aria-disabled="true">${icon("mic", 18)}<span>Voz saliente</span><span class="nav-soon">Pronto</span></button></nav>
<div class="nav-group">Operación</div>
<nav aria-label="Operación"><button class="nav-button" data-view="incidents">${icon("inbox", 18)}<span>Bandeja de operación</span><span class="nav-badge" id="incidentNavCount">…</span></button><button class="nav-button" data-view="billing">${icon("card", 18)}<span>Facturación</span><span class="nav-badge">0</span></button></nav>
<div class="sidebar-bottom">
<div class="margin-card"><img src="/admin/assets/lumen.png" alt="" aria-hidden="true"><div><div class="margin-label">Margen del mes</div><div class="margin-value">${marginPct == null ? "—" : marginPct + "%"}</div><div class="margin-note">${marginPct == null ? "sin fuente conectada" : "ingresos vs. costos"}</div></div></div>
<div class="user-card"><span class="avatar sm">SA</span><div><strong>${escapeHtml(auth.name || auth.username || "Super Admin")}</strong><span>Nextfor IA · interno</span></div></div>
</div></aside>
<main class="workspace"><header class="topbar"><div class="page-heading"><h1 id="pageTitle">Resumen</h1><p id="pageSubtitle">La operación completa de Nextfor IA de un vistazo</p></div><div class="top-actions"><button class="button optional" id="customerInviteButton" type="button" onclick="createCustomerInvite()">${customerAccessV2Enabled ? "Crear cliente" : "Crear acceso RAV"}</button><a class="button optional" href="/admin/client-onboarding">Onboarding</a><a class="button optional" href="/admin/panel?tab=summary">Admin RAV</a><button class="button icon-only" type="button" onclick="loadHealth()" aria-label="Actualizar salud" title="Actualizar salud">${icon("refresh", 18)}</button><button class="button icon-only danger" type="button" onclick="logoutSuperAdmin()" aria-label="Cerrar sesión" title="Cerrar sesión">${icon("logout", 18)}</button></div></header>
<div class="content">

<section class="view active" data-panel="overview"><div class="stack">
  <div class="grid-4" aria-label="Indicadores económicos consolidados">${kpiCards}</div>
  <div><div class="section-title"><h2>Desglose por bot</h2><span>cuánto aporta y cuánto cuesta cada uno</span></div>${botBreakdown}</div>
  ${compareTable}
  ${paretoCard}
  <div><div class="section-title"><h2>Requiere atención</h2><span>señales operativas de toda la flota</span></div><div class="attention">${attentionItems}</div></div>
  <div><div class="section-title"><h2>Estado de la plataforma</h2><span>meta comercial y salud técnica</span></div>
  <div class="grid-4"><article class="stat-card"><div class="stat-top"><span>Clientes registrados</span><span class="icon-chip">${icon("users", 17)}</span></div><div class="stat-value">${currentClients}</div><div class="stat-sub">${firstClient ? 'Cliente #1 · ' + escapeHtml(firstClient.brand_name) : 'Registro comercial vacío'}</div></article><article class="stat-card"><div class="stat-top"><span>Meta del año</span><span class="icon-chip">${icon("trend", 17)}</span></div><div class="stat-value">${goalPercent}%</div><div class="stat-sub">${currentClients} de ${targetClients} clientes</div></article><article class="stat-card"><div class="stat-top"><span>Readiness comercial</span><span class="icon-chip">${icon("check", 17)}</span></div><div class="stat-value">${readyCount}/${stages.length}</div><div class="stat-sub">etapas listas · ${draftCount} pendientes</div></article><article class="stat-card"><div class="stat-top"><span>Infraestructura</span><span class="icon-chip">${icon("activity", 17)}</span></div><div class="stat-value" id="infraValue" style="font-size:20px">Verificando</div><div class="stat-sub" id="infraSubtitle">Consultando salud global</div></article></div></div>
  <div class="callout" style="margin-top:0"><div><strong>Bloqueador externo actual</strong><p>La infraestructura puede estar operativa, pero la aprobación de permisos de WhatsApp continúa siendo requisito antes de operar clientes reales a escala.</p></div><span class="badge warning dot">Esperando Meta</span></div>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Salud de infraestructura</h2><p>Estados normalizados; nunca muestra tokens ni identificadores.</p></div><span class="badge neutral" id="healthBadge">Verificando</span></div><div class="health-list"><div class="health-row"><span>Uptime</span><span class="health-value" id="healthUptime">—</span></div><div class="health-row"><span>Shopify storefront</span><span class="health-value" id="healthShopify">—</span></div><div class="health-row"><span>Meta WhatsApp API</span><span class="health-value" id="healthMeta">—</span></div><div class="health-row"><span>Supabase</span><span class="health-value" id="healthSupabase">—</span></div><div class="health-row"><span>Anthropic</span><span class="health-value" id="healthAnthropic">—</span></div></div></section><section class="card"><div class="card-head"><div><h2>Readiness comercial</h2><p>Resumen de COMMERCIAL_READINESS.</p></div><span class="badge warning">${waitingCount} esperando Meta</span></div><div class="readiness-list">${readinessRows}</div></section></div>
  <section class="card client-list" style="margin-top:0"><div class="list-head"><h2>Cuentas de la plataforma</h2><button class="button" type="button" data-go="clients">Ver clientes ${icon("arrow", 15)}</button></div>${clientSummaryRows}</section>
  <div><div class="section-title"><h2>Preparación de plataforma</h2><span>responsabilidades y acceso</span></div><div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>División de paneles</h2><p>Cliente y plataforma conservan alcances separados.</p></div></div><div class="split-grid">${panelRows}</div></section><section class="card"><div class="card-head"><div><h2>Modelo de acceso</h2><p>Modelo ${escapeHtml(accessModel.version || "actual")}</p></div></div><div class="role-grid">${roleRows}</div></section></div></div>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Campos requeridos para onboarding</h2><p>Solo nombres de campos; los valores sensibles viven en almacenamiento seguro.</p></div><span class="badge neutral">${tenantFields.length} campos</span></div><div class="fields">${fields}</div></section><section class="card"><div class="card-head"><div><h2>Siguientes pasos multi-cliente</h2><p>Checklist técnico para activar nuevos clientes.</p></div></div><ol class="steps">${nextSteps}</ol></section></div>
</div></section>

<section class="view" data-panel="leads"><div class="stack">
  <div class="grid-4" aria-label="Indicadores de pipeline">${leadKpis}</div>
  ${leadSourceCards
    ? '<div><div class="section-title"><h2>Por vendedor / canal</h2><span>de dónde vienen los prospectos</span></div><div class="source-grid">' + leadSourceCards + '</div></div>'
    : '<section class="card">' + emptyBlock("lead", "Aún no se registran leads en la plataforma", "Esta vista se activará cuando onboarding almacene registros incompletos, fuente de adquisición, CAC y valor potencial. No se muestran datos de ejemplo como si fueran producción.") + '</section>'}
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Embudo previsto</h2><p>Estados para la siguiente fase.</p></div></div><ol class="steps"><li><span class="step-number">1</span><div><strong>Registro iniciado</strong><p>Datos básicos del comercio.</p></div></li><li><span class="step-number">2</span><div><strong>Datos de empresa</strong><p>Operación, políticas y contactos.</p></div></li><li><span class="step-number">3</span><div><strong>Conectó WhatsApp</strong><p>Cuenta y número autorizados.</p></div></li><li><span class="step-number">4</span><div><strong>Configuró primer bot</strong><p>Listo para validación técnica.</p></div></li></ol></section><section class="card"><div class="card-head"><div><h2>Datos de adquisición</h2><p>Requeridos para CAC y atribución.</p></div></div><div class="fields"><code>source_type</code><code>source_name</code><code>cac</code><code>expected_plan</code><code>potential_mrr</code><code>last_activity_at</code></div></section></div>
</div></section>

<section class="view" data-panel="clients"><div class="stack"><div><div class="toolbar"><div class="search">${icon("search", 18)}<label class="sr-only" for="clientSearch">Buscar cliente</label><input id="clientSearch" placeholder="Buscar cliente o vertical…" autocomplete="off"></div><div class="filter-chips"><button class="chip active" type="button">Todos <span>${currentClients}</span></button><button class="chip" type="button">Nuevos <span>0</span></button><button class="chip" type="button">Pilotos <span>${registeredClients.length}</span></button></div></div><section class="card table-card"><div class="table-scroll"><div class="table-head"><span>Cliente</span><span>Sector</span><span>Plan</span><span>Integraciones</span><span>Estado</span><span></span></div>${clientTableRows}<div class="empty" id="clientEmpty" hidden><div class="empty-icon">${icon("search", 23)}</div><h2>Sin resultados</h2><p>No hay clientes que coincidan con esta búsqueda.</p></div></div></section></div>${customerAccessPanel}<div class="callout"><div><strong>Vista preparada para crecer</strong><p>La búsqueda y los segmentos ya operan sobre el registro actual. La ficha completa por cliente (deep-dive con pestañas y facturas) se conecta cuando exista la fuente de tenants completa.</p></div><span class="badge info">${currentClients} de ${currentClients}</span></div></div></section>

<section class="view" data-panel="agendamiento"><div class="stack">
  <section class="card"><div class="empty"><img class="empty-lumen" src="/admin/assets/lumen.png" alt="" aria-hidden="true"><h2>El módulo de Agendamiento se activa con datos del bot</h2><p>Mostrará citas del mes, tasa de confirmación, calendarios conectados, consentimientos y clientes con el bot activo. Hoy el piloto de citas vive en el panel del cliente; aquí se consolidará toda la flota.</p></div></section>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Métricas previstas</h2><p>Por cliente con el bot activo.</p></div></div><div class="fields"><code>citas_mes</code><code>por_confirmar</code><code>tasa_confirmacion</code><code>calendario_conectado</code><code>consentimientos</code><code>costo_operativo</code></div></section><section class="card"><div class="card-head"><div><h2>Acceso al piloto actual</h2><p>DERCO opera hoy en su panel dedicado.</p></div></div><p style="font-size:12px;line-height:1.7;color:var(--text-muted);margin:0 0 12px">Mientras se consolida la vista de flota, la operación diaria de citas permanece en el panel del cliente.</p><a class="button" href="/admin/pilots/derco">Abrir piloto DERCO ${icon("arrow", 15)}</a></section></div>
</div></section>

<section class="view" data-panel="atencion"><div class="stack">
  <section class="card"><div class="empty"><img class="empty-lumen" src="/admin/assets/lumen.png" alt="" aria-hidden="true"><h2>El módulo de Atención al cliente se activa con datos del bot</h2><p>Mostrará conversaciones del mes, tasa de resolución automática, tiempo de respuesta, CSAT y conversaciones abiertas por cliente. La operación individual sigue en el panel de cada comercio.</p></div></section>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Métricas previstas</h2><p>Por cliente con el bot activo.</p></div></div><div class="fields"><code>conversaciones_mes</code><code>tasa_resolucion</code><code>tiempo_respuesta</code><code>csat</code><code>conversaciones_abiertas</code><code>costo_operativo</code></div></section><section class="card"><div class="card-head"><div><h2>Separación de alcance</h2><p>Una sola fuente de verdad.</p></div></div><p style="font-size:12px;line-height:1.7;color:var(--text-muted);margin:0">El Super Admin consolida y compara. La intervención humana, las conversaciones y la operación diaria permanecen exclusivamente en el panel Admin de cada comercio.</p></section></div>
</div></section>

<section class="view" data-panel="incidents"><div class="stack">
  <div class="callout" style="margin-top:0"><div><strong>Meta App Review pendiente</strong><p>Bloqueador externo conocido. No equivale a una caída de infraestructura, pero impide escalar el canal WhatsApp.</p></div><span class="badge warning dot">Abierto</span></div>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Servicios globales</h2><p>Último estado obtenido desde /admin/health.</p></div><button class="button" type="button" onclick="loadHealth()">${icon("refresh", 16)} Actualizar</button></div><div class="health-list"><div class="health-row"><span>Shopify storefront</span><span class="health-value" id="incidentShopify">Verificando</span></div><div class="health-row"><span>Meta WhatsApp API</span><span class="health-value" id="incidentMeta">Verificando</span></div><div class="health-row"><span>Supabase</span><span class="health-value" id="incidentSupabase">Verificando</span></div><div class="health-row"><span>Anthropic</span><span class="health-value" id="incidentAnthropic">Verificando</span></div></div></section><section class="card"><div class="empty" style="padding:30px 18px"><img class="empty-lumen" src="/admin/assets/lumen.png" alt="" aria-hidden="true"><h2>Sin incidencias internas registradas</h2><p>La bandeja consolidará webhooks caídos, errores de sincronización, consentimientos, colas altas y pagos vencidos de todos los bots, ordenados por prioridad.</p></div></section></div>
</div></section>

<section class="view" data-panel="billing"><div class="stack">
  <section class="card">${emptyBlock("card", "Facturación aún no está conectada", "DERCO figura como cliente piloto #1. Los planes, MRR, estado de pago e historial de facturas se habilitarán cuando exista una fuente financiera de confianza. Es la misma fuente que alimenta Ingresos, Costos, Margen y Pareto del Resumen.")}</section>
  <div class="two-col" style="margin-top:0"><section class="card"><div class="card-head"><div><h2>Modelo previsto</h2><p>Información necesaria por tenant.</p></div></div><div class="fields"><code>plan</code><code>monthly_price</code><code>billing_status</code><code>next_charge_at</code><code>invoice_id</code><code>currency</code></div></section><section class="card"><div class="card-head"><div><h2>Principio operativo</h2><p>Una sola fuente de verdad.</p></div></div><p style="font-size:12px;line-height:1.7;color:var(--text-muted);margin:0">El panel no inferirá ingresos ni pagos desde actividad de chat. Los indicadores comerciales aparecerán únicamente cuando provengan del sistema de facturación. Moneda base: COP.</p></section></div>
</div></section>

</div></main></div>
${customerAccessModal}
<div class="drawer-layer" id="tenantDrawer" aria-hidden="true"><button class="scrim" type="button" aria-label="Cerrar detalle" onclick="closeTenant()"></button><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="tenantTitle"><div class="drawer-head"><span class="avatar lg">RT</span><div class="drawer-title"><h2 id="tenantTitle">${escapeHtml(tenant.name)}</h2><p>Comercio electrónico · Entorno legado</p><div class="drawer-badges"><span class="badge neutral dot">Legado operativo</span><span class="badge warning dot">Meta pendiente</span></div></div><button class="close-button" id="drawerClose" type="button" onclick="closeTenant()" aria-label="Cerrar">${icon("close", 19)}</button></div><div class="drawer-body"><div class="next-card">${icon("spark", 20)}<div><strong>Siguiente paso</strong><p>Completar la revisión de Meta sin incluir este entorno en el registro comercial.</p></div></div><div class="mini-grid"><div class="mini-card"><span>Tenant ID</span><strong style="font-size:12px">${escapeHtml(tenant.id)}</strong></div><div class="mini-card"><span>Etapas listas</span><strong>${readyCount}/${stages.length}</strong></div><div class="mini-card"><span>Rol operativo</span><strong style="font-size:12px">Admin</strong></div><div class="mini-card"><span>Estado</span><strong style="font-size:12px">Legado activo</strong></div></div><section class="drawer-section"><h3>Integraciones</h3><div class="integration"><span>WhatsApp Cloud API</span><span class="badge warning">Revisión Meta</span></div><div class="integration"><span>Shopify Storefront</span><span class="badge neutral" id="drawerShopify">Verificando</span></div><div class="integration"><span>Supabase</span><span class="badge neutral" id="drawerSupabase">Verificando</span></div></section><section class="drawer-section"><h3>Operación permitida</h3><p style="font-size:10.5px;line-height:1.6;color:var(--text-muted);margin:0">La operación diaria, conversaciones e intervención humana permanecen exclusivamente en el panel Admin del comercio.</p></section></div><div class="drawer-foot"><a class="button" href="/admin/client-onboarding">Ver onboarding</a><a class="button primary" href="/admin/panel?tab=summary">Abrir Admin RAV</a></div></aside></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
var customerAccessV2Enabled=${customerAccessV2Enabled ? "true" : "false"},titles={overview:["Resumen","La operación completa de Nextfor IA de un vistazo"],leads:["Leads","Prospectos por vendedor y canal antes de volverse clientes"],clients:["Clientes","Cuentas y tenants administrados por Nextfor IA"],agendamiento:["Agendamiento","Módulo de citas consolidado de toda la flota"],atencion:["Atención al cliente","Módulo de conversaciones consolidado de toda la flota"],incidents:["Bandeja de operación","Incidencias de todos los bots ordenadas por prioridad"],billing:["Facturación","Planes y pagos de los clientes de la plataforma"]};
var currentView="overview",lastFocus=null,toastTimer;
function showView(name){if(!titles[name])return;currentView=name;document.querySelectorAll(".nav-button").forEach(function(el){var active=el.dataset.view===name;el.classList.toggle("active",active);el.setAttribute("aria-current",active?"page":"false");});document.querySelectorAll(".view").forEach(function(el){el.classList.toggle("active",el.dataset.panel===name);});document.getElementById("pageTitle").textContent=titles[name][0];document.getElementById("pageSubtitle").textContent=titles[name][1];try{history.replaceState(null,"","/admin/super-admin"+(name==="overview"?"":"?view="+encodeURIComponent(name)));}catch(e){}document.querySelector(".content").scrollTop=0;}
document.querySelectorAll("[data-view]").forEach(function(el){el.addEventListener("click",function(){showView(el.dataset.view);});});document.querySelectorAll("[data-go]").forEach(function(el){el.addEventListener("click",function(){showView(el.dataset.go);});});
function showToast(message){var el=document.getElementById("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove("show");},3200);}
function openTenant(){lastFocus=document.activeElement;var layer=document.getElementById("tenantDrawer");layer.classList.add("open");layer.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";document.getElementById("drawerClose").focus();}
function closeTenant(){var layer=document.getElementById("tenantDrawer");layer.classList.remove("open");layer.setAttribute("aria-hidden","true");document.body.style.overflow="";if(lastFocus&&lastFocus.focus)lastFocus.focus();}
document.addEventListener("keydown",function(event){if(event.key==="Escape"){closeTenant();if(customerAccessV2Enabled)closeCustomerCreate();}});
function healthKind(value){value=String(value||"");if(value==="ok"||value.indexOf("key_present")===0)return "ok";if(value==="missing_env"||value==="missing_key"||value==="not_configured")return "warn";return "err";}
function healthLabel(value){var kind=healthKind(value);if(kind==="ok")return value==="ok"?"Operativo":"Configurado";if(kind==="warn")return "No configurado";return "Revisar";}
function paintHealth(ids,value){ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;el.textContent=healthLabel(value);el.className=el.className.indexOf("badge")>=0?"badge "+(healthKind(value)==="ok"?"success":healthKind(value)==="warn"?"warning":"danger"):"health-value "+healthKind(value);});}
function uptimeLabel(seconds){seconds=Math.max(0,Number(seconds)||0);var days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60);return(days?days+"d ":"")+hours+"h "+minutes+"m";}
function loadHealth(){document.getElementById("infraValue").textContent="Verificando";fetch("/admin/health",{headers:{accept:"application/json"}}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error("health_unavailable");return body;});}).then(function(health){var ready=!!(health.production_readiness&&health.production_readiness.infrastructure_ready),blockers=health.production_readiness&&health.production_readiness.blockers||[],badge=document.getElementById("healthBadge");document.getElementById("infraValue").textContent=ready?"Operativa":"Revisar";document.getElementById("infraSubtitle").textContent=ready?"Servicios base disponibles":blockers.length+" bloqueo"+(blockers.length===1?"":"s")+" técnico"+(blockers.length===1?"":"s");badge.textContent=ready?"Infra OK":"Requiere revisión";badge.className="badge "+(ready?"success":"danger");document.getElementById("healthUptime").textContent=uptimeLabel(health.bot&&health.bot.uptime_seconds);paintHealth(["healthShopify","incidentShopify","drawerShopify"],health.checks&&health.checks.shopify_storefront);paintHealth(["healthMeta","incidentMeta"],health.checks&&health.checks.meta_whatsapp);paintHealth(["healthSupabase","incidentSupabase","drawerSupabase"],health.checks&&health.checks.supabase_conversation_logs);paintHealth(["healthAnthropic","incidentAnthropic"],health.checks&&health.checks.anthropic_api);document.getElementById("incidentNavCount").textContent=String(blockers.length);}).catch(function(){document.getElementById("infraValue").textContent="Sin respuesta";document.getElementById("infraSubtitle").textContent="No se pudo consultar salud";document.getElementById("healthBadge").textContent="Sin respuesta";document.getElementById("healthBadge").className="badge danger";["healthShopify","healthMeta","healthSupabase","healthAnthropic","incidentShopify","incidentMeta","incidentSupabase","incidentAnthropic"].forEach(function(id){var el=document.getElementById(id);if(el){el.textContent="Sin respuesta";el.className="health-value err";}});showToast("No se pudo actualizar la salud de plataforma.");});}
function logoutSuperAdmin(){try{localStorage.removeItem("rav_dashboard_key");}catch(e){}fetch("/admin/logout",{method:"POST"}).finally(function(){location.href="/admin";});}
function createCustomerInvite(){if(customerAccessV2Enabled){openCustomerCreate();return;}createLegacyCustomerInvite();}
function createLegacyCustomerInvite(){var button=document.getElementById("customerInviteButton");button.disabled=true;button.textContent="Generando…";fetch("/admin/customer-invite",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.error||"invite_failed");return body;});}).then(function(body){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(body.setup_url).then(function(){showToast("Enlace de acceso copiado · vence en 24 horas.");});showToast("Enlace generado. Ábrelo desde un navegador compatible para copiarlo.");}).catch(function(error){showToast(error.message==="customer_admin_already_configured"?"La cuenta administradora de RAV ya está configurada.":"No se pudo generar el acceso de RAV.");}).finally(function(){button.disabled=false;button.textContent="Crear acceso RAV";});}
function customerErrorLabel(code){return({invalid_request:"Completa exactamente los cuatro campos.",invalid_company_name:"Revisa el nombre de la empresa.",invalid_email:"Ingresa un correo válido.",invalid_plan:"Selecciona un plan vigente.",invalid_assigned_bot:"Selecciona un bot vigente.",customer_already_exists:"La empresa o el correo ya están registrados.",email_delivery_failed:"El cliente se creó, pero el correo no pudo entregarse. Revisa el estado y reintenta de forma controlada.",customer_access_unavailable:"El servicio de acceso no está disponible."})[code]||"No se pudo completar el alta.";}
function fillCatalog(selectId,rows,placeholder){var select=document.getElementById(selectId);if(!select)return;select.textContent="";var empty=document.createElement("option");empty.value="";empty.textContent=placeholder;select.appendChild(empty);rows.forEach(function(row){var option=document.createElement("option");option.value=row.id;option.textContent=row.name||row.id;select.appendChild(option);});}
function loadCustomerCatalogs(){return fetch("/admin/customer-access/catalogs",{headers:{accept:"application/json"}}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.error||"customer_access_unavailable");return body;});}).then(function(body){fillCatalog("planId",body.plans||[],"Selecciona un plan");fillCatalog("assignedBotId",body.bots||[],"Selecciona un bot");});}
function openCustomerCreate(){var modal=document.getElementById("customerCreateModal");if(!modal)return;lastFocus=document.activeElement;modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";document.getElementById("customerCreateError").textContent="";loadCustomerCatalogs().catch(function(error){document.getElementById("customerCreateError").textContent=customerErrorLabel(error.message);});document.getElementById("companyName").focus();}
function closeCustomerCreate(){var modal=document.getElementById("customerCreateModal");if(!modal)return;modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.style.overflow="";if(lastFocus&&lastFocus.focus)lastFocus.focus();}
function invitationBadge(status){var labels={sent:"Enviada",pending_delivery:"Pendiente",delivery_failed:"Error de entrega",expired:"Vencida",used:"Consumida",revoked:"Revocada"},tones={sent:"success",pending_delivery:"neutral",delivery_failed:"danger",expired:"warning",used:"info",revoked:"neutral"};var badge=document.createElement("span");badge.className="badge "+(tones[status]||"neutral");badge.textContent=labels[status]||status;return badge;}
function renderCustomerInvitations(rows){var root=document.getElementById("customerInvitationRows");if(!root)return;root.textContent="";if(!rows.length){var empty=document.createElement("div");empty.className="invite-loading";empty.textContent="Aún no hay invitaciones de clientes.";root.appendChild(empty);return;}rows.forEach(function(row){var line=document.createElement("div");line.className="invite-row";var client=document.createElement("div"),name=document.createElement("strong"),email=document.createElement("small");name.textContent=row.company_name;email.textContent=row.admin_email;client.append(name,email);var config=document.createElement("div"),plan=document.createElement("strong"),bot=document.createElement("small");plan.textContent=row.plan_id;bot.textContent=row.assigned_bot_id;config.append(plan,bot);var delivery=document.createElement("div");delivery.appendChild(invitationBadge(row.status));if(row.delivery_error){var deliveryError=document.createElement("small");deliveryError.textContent=row.delivery_error;delivery.appendChild(deliveryError);}var expires=document.createElement("div"),date=document.createElement("strong");date.textContent=new Date(row.expires_at).toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"});expires.appendChild(date);var action=document.createElement("div");if(["sent","pending_delivery","delivery_failed"].includes(row.status)){var revoke=document.createElement("button");revoke.type="button";revoke.className="button";revoke.textContent="Revocar";revoke.addEventListener("click",function(){revokeInvitation(row.id,revoke);});action.appendChild(revoke);}else{action.textContent="—";}line.append(client,config,delivery,expires,action);root.appendChild(line);});}
function loadCustomerInvitations(){if(!customerAccessV2Enabled)return Promise.resolve();var root=document.getElementById("customerInvitationRows");if(root)root.innerHTML='<div class="invite-loading">Actualizando…</div>';return fetch("/admin/customer-invitations",{headers:{accept:"application/json"}}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.error||"customer_access_unavailable");return body;});}).then(function(body){renderCustomerInvitations(body.invitations||[]);}).catch(function(error){if(root){root.textContent="";var message=document.createElement("div");message.className="invite-loading";message.textContent=customerErrorLabel(error.message);root.appendChild(message);}});}
function revokeInvitation(id,button){button.disabled=true;fetch("/admin/customer-invitations/"+encodeURIComponent(id)+"/revoke",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.error||"customer_access_unavailable");return body;});}).then(function(){showToast("Invitación revocada.");return loadCustomerInvitations();}).catch(function(error){button.disabled=false;showToast(customerErrorLabel(error.message));});}
var customerCreateForm=document.getElementById("customerCreateForm");if(customerCreateForm)customerCreateForm.addEventListener("submit",function(event){event.preventDefault();var submit=document.getElementById("customerCreateSubmit"),error=document.getElementById("customerCreateError"),payload={company_name:document.getElementById("companyName").value,admin_email:document.getElementById("adminEmail").value,plan_id:document.getElementById("planId").value,assigned_bot_id:document.getElementById("assignedBotId").value};error.textContent="";submit.disabled=true;submit.textContent="Creando…";fetch("/admin/customer-invite",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}).then(function(response){return response.json().then(function(body){if(!response.ok)throw new Error(body.error||"customer_access_unavailable");return body;});}).then(function(){customerCreateForm.reset();closeCustomerCreate();showView("clients");showToast("Cliente creado e invitación enviada al correo administrador.");return loadCustomerInvitations();}).catch(function(problem){error.textContent=customerErrorLabel(problem.message);if(problem.message==="email_delivery_failed")loadCustomerInvitations();}).finally(function(){submit.disabled=false;submit.textContent="Crear y enviar invitación";});});
var search=document.getElementById("clientSearch");search.addEventListener("input",function(){var query=search.value.trim().toLowerCase(),shown=0;document.querySelectorAll(".tenant-row[data-search]").forEach(function(row){var match=row.dataset.search.indexOf(query)>=0;row.hidden=!match;if(match)shown++;});document.getElementById("clientEmpty").hidden=shown>0;});
try{var url=new URL(location.href),requested=url.searchParams.get("view");if(requested&&titles[requested])showView(requested);if(url.searchParams.has("key")){url.searchParams.delete("key");history.replaceState(null,"",url.pathname+url.search+url.hash);}}catch(e){}loadHealth();if(customerAccessV2Enabled)loadCustomerInvitations();
</script></body></html>`);
}

module.exports = renderSuperAdminPanel;
