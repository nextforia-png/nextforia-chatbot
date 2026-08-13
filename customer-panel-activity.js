"use strict";

const CUSTOMER_PANEL_ACTIVITY_CHANNELS = ["whatsapp", "instagram", "messenger"];

function localDayKey(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const fields = {};
  parts.forEach(function (part) {
    if (part.type !== "literal") fields[part.type] = part.value;
  });
  return fields.year + "-" + fields.month + "-" + fields.day;
}

function activityDayKeys(now, days, timeZone) {
  const anchor = now instanceof Date ? now : new Date(now || Date.now());
  const count = Math.max(1, Math.min(Number(days) || 7, 31));
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    keys.push(localDayKey(new Date(anchor.getTime() - offset * 24 * 60 * 60 * 1000), timeZone));
  }
  return Array.from(new Set(keys));
}

function rowChannel(row) {
  const explicit = String(row && row.channel || "").toLowerCase();
  if (CUSTOMER_PANEL_ACTIVITY_CHANNELS.includes(explicit)) return explicit;
  const userId = String(row && (row.userId || row.user_id) || "");
  if (/^ig:/i.test(userId)) return "instagram";
  if (/^ms:/i.test(userId)) return "messenger";
  return "whatsapp";
}

function buildDailyClientActivity(rows, options) {
  options = options || {};
  const timeZone = options.timeZone || "America/Bogota";
  const days = activityDayKeys(options.now || new Date(), options.days || 7, timeZone);
  const allowedDays = new Set(days);
  const clients = {};
  CUSTOMER_PANEL_ACTIVITY_CHANNELS.forEach(function (channel) {
    clients[channel] = {};
    days.forEach(function (day) { clients[channel][day] = new Set(); });
  });
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const customerText = String(row && (row.userMessage !== undefined ? row.userMessage : row.user_message) || "").trim();
    const userId = String(row && (row.userId || row.user_id) || "").trim();
    if (!customerText || !userId) return;
    const day = localDayKey(row.ts, timeZone);
    if (!allowedDays.has(day)) return;
    const channel = rowChannel(row);
    clients[channel][day].add(userId);
  });
  const byChannel = {};
  CUSTOMER_PANEL_ACTIVITY_CHANNELS.forEach(function (channel) {
    byChannel[channel] = days.map(function (day) {
      return { day, clients: clients[channel][day].size };
    });
  });
  return {
    days,
    by_channel: byChannel,
    time_zone: timeZone,
    metric: "unique_clients_per_day"
  };
}

module.exports = {
  CUSTOMER_PANEL_ACTIVITY_CHANNELS,
  localDayKey,
  activityDayKeys,
  buildDailyClientActivity
};
