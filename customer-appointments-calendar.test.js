"use strict";

// Vistas Mes y Ano del modulo Citas.
// Lo que mas importa aca: los conteos salen de las citas reales del tenant,
// nunca de un dataset de ejemplo. El prototipo de diseno traia MONTHEXTRA y
// YEARMONTHS inventados; si alguno de esos vuelve al panel autenticado, el
// cliente ve numeros que no son suyos.

const assert = require("assert");
const vm = require("vm");
const { clientScript, markup, styles } = require("./customer-appointments");

// ─── Markup y estilos ─────────────────────────────────────────────────────

["week", "month", "year", "inbox"].forEach(function (mode) {
  assert(markup.includes('data-appt-mode="' + mode + '"'), "falta el boton de vista " + mode);
});
assert(markup.includes('id="apptMonthView"') && markup.includes('id="apptMonthGrid"'), "falta la vista Mes");
assert(markup.includes('id="apptYearView"') && markup.includes('id="apptYearGrid"'), "falta la vista Ano");
assert(markup.includes('id="apptHeroEyebrow"'), "el eyebrow necesita id para cambiar segun la vista");

// Las flechas ya no son solo de semana: mueven el periodo activo.
assert(markup.includes("shiftAppointmentPeriod(-1)") && markup.includes("shiftAppointmentPeriod(1)"),
  "la navegacion de periodo debe ser contextual");
assert(!markup.includes('onclick="shiftAppointmentWeek(-1)"'),
  "la barra ya no debe llamar directo a shiftAppointmentWeek");

assert(styles.includes(".apptMonthGrid{") && styles.includes(".apptMonthCell{"), "faltan estilos de la cuadricula del mes");
assert(styles.includes(".apptYearGrid{") && styles.includes(".apptYearCard{"), "faltan estilos de las tarjetas del ano");

// ─── Sin datos inventados ─────────────────────────────────────────────────

assert(!/MONTHEXTRA|YEARMONTHS/.test(clientScript),
  "los datasets de ejemplo del prototipo no pueden llegar al panel autenticado");

new vm.Script(clientScript);

// El banner cuenta sobre el alcance activo, asi que cambiar de vista tiene que
// recalcularlo. Antes solo lo hacia el render completo y el titular se quedaba
// diciendo "11 citas" (la semana) mientras mirabas el mes.
assert(/function setAppointmentMode\([\s\S]*?renderAppointmentHero\(\)/.test(clientScript),
  "cambiar de vista debe recalcular el banner");

// Track y fill del ano son <span>: sin display:block el ancho no aplica y la
// barra se ve vacia.
assert(/\.apptYearTrack\{display:block/.test(styles) && /\.apptYearFill\{display:block/.test(styles),
  "las barras del ano necesitan ser cajas para que el ancho aplique");

// ─── Logica de alcance y agregacion ───────────────────────────────────────

function loadCalendarLogic(rows, mode, offsets) {
  const grid = { innerHTML: "" };
  const yearGrid = { innerHTML: "" };
  const texts = {};
  const sandbox = {
    state: Object.assign({ appointments: { appointments: rows }, appointmentMode: mode }, offsets || {}),
    document: {
      getElementById: function (id) {
        if (id === "apptMonthGrid") return grid;
        if (id === "apptYearGrid") return yearGrid;
        return null;
      }
    },
    text: function (id, value) { texts[id] = String(value); },
    esc: function (v) { return String(v == null ? "" : v); },
    attr: function (v) { return String(v == null ? "" : v); },
    Date: Date, Number: Number, Math: Math, Array: Array, String: String,
    isNaN: isNaN, JSON: JSON, console: console
  };
  vm.createContext(sandbox);

  const needed = [
    "APPT_MONTHS_FULL", "appointmentRows", "apptDate", "apptStatus", "apptLiveRows",
    "appointmentMonthAnchor", "appointmentYearValue", "appointmentRowsInSelectedMonth",
    "appointmentRowsInSelectedYear", "appointmentWeekStart", "appointmentRowsInSelectedWeek",
    "appointmentScopeRows", "appointmentScopeWord", "appointmentWeekOffsetForDate",
    "apptDominantStatus", "renderAppointmentMonth", "renderAppointmentYear"
  ];
  needed.forEach(function (name) {
    const isVar = name === "APPT_MONTHS_FULL";
    const re = isVar
      ? new RegExp("^var " + name + "=[\\s\\S]*?;$", "m")
      : new RegExp("^function " + name + "\\([\\s\\S]*?\\n(?=function |var )", "m");
    const match = re.exec(clientScript + "\nfunction ");
    assert(match, "no encontre " + name + " en el script de cliente");
    vm.runInContext(match[0], sandbox);
  });
  return { sandbox, grid, yearGrid, texts };
}

function appointmentAt(iso, status) {
  return { id: iso + status, starts_at: iso, status: status, customer_name: "Cliente" };
}

// Fechas ancladas al mes en curso para que el test no caduque.
const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();
function isoInMonth(day, hour) {
  return new Date(y, m, day, hour || 10, 0, 0).toISOString();
}

const rows = [
  appointmentAt(isoInMonth(3), "booked"),
  appointmentAt(isoInMonth(3), "booked"),
  appointmentAt(isoInMonth(9), "failed"),
  appointmentAt(isoInMonth(9), "booked"),
  appointmentAt(isoInMonth(17), "requested"),
  appointmentAt(new Date(y, m, 20).toISOString(), "cancelled"),
  appointmentAt(new Date(y, (m + 11) % 12, 5).toISOString(), "booked")
];

// -- Vista Mes ------------------------------------------------------------

const month = loadCalendarLogic(rows, "month", { appointmentMonthOffset: 0 });
month.sandbox.renderAppointmentMonth();
const monthHtml = month.grid.innerHTML;

assert.strictEqual((monthHtml.match(/apptMonthCell/g) || []).length, 42,
  "la cuadricula del mes son 6 semanas completas");

// Las canceladas no cuentan: el dia 20 no debe mostrar chip.
assert(!/data-day="[^"]*"[^>]*>\s*<span class="apptMonthNum">20<\/span><span class="apptMonthChip/.test(monthHtml),
  "una cita cancelada no debe contarse en el dia");

assert(monthHtml.includes("2 citas"), "el dia 3 tiene dos citas");
assert(monthHtml.includes("1 cita<"), "un dia con una sola cita usa singular");

// El estado dominante manda: dia 9 tiene una fallida y una confirmada -> necesita de ti.
assert(/apptMonthChip needs_you/.test(monthHtml), "el estado dominante del dia debe ser 'necesita de ti'");
assert(/apptMonthCell[^"]*needs/.test(monthHtml), "el dia con 'necesita de ti' se resalta");

// Solo los dias con citas son clicables.
assert(monthHtml.includes("openAppointmentWeekFromDate"), "un dia con citas navega a su semana");
assert(monthHtml.includes("disabled"), "los dias sin citas no son clicables");

// El mes solo cuenta lo suyo: 5 citas vivas este mes (la cancelada y la de otro mes quedan fuera).
assert.strictEqual(month.sandbox.appointmentRowsInSelectedMonth().length, 5,
  "el alcance del mes excluye canceladas y otros meses");
assert(month.texts.apptMonthHint.indexOf("5 citas") === 0, "el pie del mes refleja el total real");

// -- Vista Ano ------------------------------------------------------------

const year = loadCalendarLogic(rows, "year", { appointmentYearOffset: 0 });
year.sandbox.renderAppointmentYear();
const yearHtml = year.yearGrid.innerHTML;

assert.strictEqual((yearHtml.match(/apptYearCard/g) || []).length, 12, "el ano son 12 tarjetas");
assert(yearHtml.includes("apptYearCard current"), "el mes en curso va destacado");
assert(yearHtml.includes("openAppointmentMonthFromIndex"), "una tarjeta de mes abre la vista Mes");
assert(/width:100%/.test(yearHtml), "el mes con mas citas llena la barra");

// -- Alcance vacio: estado honesto, no numeros inventados ------------------

const empty = loadCalendarLogic([], "month", { appointmentMonthOffset: 0 });
empty.sandbox.renderAppointmentMonth();
assert.strictEqual(empty.texts.apptMonthHint, "Todavía no hay citas en este mes.",
  "sin citas se dice, no se rellena con datos de ejemplo");
assert(!/apptMonthChip/.test(empty.grid.innerHTML), "un mes vacio no muestra chips");

const emptyYear = loadCalendarLogic([], "year", { appointmentYearOffset: 0 });
emptyYear.sandbox.renderAppointmentYear();
assert(/Todavía no hay citas registradas en \d{4}\./.test(emptyYear.texts.apptYearHint),
  "un ano vacio lo dice explicitamente");
assert.strictEqual((emptyYear.yearGrid.innerHTML.match(/>0<span>citas/g) || []).length, 12,
  "los 12 meses vacios muestran cero, no un placeholder");

// -- La palabra de alcance alimenta el titular ----------------------------

assert.strictEqual(loadCalendarLogic(rows, "week", {}).sandbox.appointmentScopeWord(), "semana");
assert.strictEqual(loadCalendarLogic(rows, "month", {}).sandbox.appointmentScopeWord(), "mes");
assert.strictEqual(loadCalendarLogic(rows, "year", {}).sandbox.appointmentScopeWord(), "año");
assert.strictEqual(loadCalendarLogic(rows, "inbox", {}).sandbox.appointmentScopeWord(), "semana",
  "la bandeja mantiene el alcance de la semana");

console.log("customer-appointments-calendar.test.js: ok");
