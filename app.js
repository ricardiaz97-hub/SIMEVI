/* SIMEVI · app de trámites, reclamos, pólizas y pagos
   Datos: Google Sheets (vía /api) o modo demostración en este navegador. */
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nowISO = () => new Date().toISOString();
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lite');

const fmtMoney = n => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(+n || 0);
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
};
const fmtShort = iso => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' }).replace('.', '');
};
const fmtAgo = iso => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return fmtDate(iso);
};
const fmtTime = iso => new Date(iso).toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' });

/* ---------- catálogos ---------- */
const TIPOS = ['Reclamo', 'Modificación', 'Renovación', 'Emisión', 'Inclusión', 'Exclusión', 'Cancelación', 'Otro'];
const ETAPAS = [
  { k: 'recibido', n: 'Recibido', d: 'La solicitud llegó al correo', c: 'Llegó tu solicitud' },
  { k: 'ingresado', n: 'Ingresado', d: 'En el portal o entregado en físico', c: 'Presentado a la aseguradora' },
  { k: 'numero', n: 'Número asignado', d: 'La aseguradora dio número', c: 'La aseguradora lo registró' },
  { k: 'analisis', n: 'En análisis', d: 'La aseguradora lo revisa', c: 'En revisión' },
  { k: 'pago', n: 'Pago disponible', d: 'Cheque o depósito listo', c: 'Tu pago está listo' },
  { k: 'cerrado', n: 'Cerrado', d: 'Terminado', c: 'Terminado' }
];
const ETAPA = Object.fromEntries(ETAPAS.map(e => [e.k, e]));
const etapasDe = tipo => tipo === 'Reclamo' ? ETAPAS : ETAPAS.filter(e => e.k !== 'pago');
const CANALES = ['Portal de la aseguradora', 'Entrega en físico', 'Correo a la aseguradora'];
const RAMOS = ['Vida', 'Gastos médicos', 'Accidentes personales', 'Automotor', 'Incendio', 'Daños', 'Responsabilidad civil', 'Fianzas', 'Transporte', 'Otro'];
const ASEGURADORAS = ['ASESUISA', 'SISA', 'Seguros del Pacífico', 'MAPFRE La Centro Americana', 'Seguros Fedecrédito', 'Pan-American Life', 'Seguros Azul', 'Davivienda Seguros', 'ASSA', 'Seguros Futuro', 'Aseguradora Agrícola Comercial', 'Atlántida Vida', 'Quálitas'];
const FRECUENCIAS = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];
const FORMAS = ['Cheque', 'Depósito', 'Transferencia'];
const PAGO_ESTADOS = [
  { k: 'disponible', n: 'Por recoger', cls: 'warn' },
  { k: 'oficina', n: 'En oficina', cls: 'gold' },
  { k: 'entregado', n: 'Entregado', cls: 'ok' },
  { k: 'depositado', n: 'Depositado al cliente', cls: 'ok' }
];
const PAGO_E = Object.fromEntries(PAGO_ESTADOS.map(e => [e.k, e]));
const pagoAbierto = p => p.estado === 'disponible' || p.estado === 'oficina';
const TABLAS = { clientes: 'Clientes', polizas: 'Pólizas', tramites: 'Trámites', pagos: 'Pagos', correos: 'Correos' };

/* ---------- estado ---------- */
const DB = { clientes: [], polizas: [], tramites: [], pagos: [], bitacora: [], correos: [] };
const S = {
  mode: 'demo', me: null, users: [], route: 'inicio', arg: '',
  q: '', f: { tTipo: 'todos', tResp: '', tVista: 'tablero', tCerrados: false, pEstado: 'pend', polMod: 'todas', polRamo: '', polEst: '', cliQ: '', bandeja: 'pend', bitUser: '' },
  sess: null, inbox: null, inboxErr: '', inboxLoading: false
};
try { Object.assign(S.f, JSON.parse(localStorage.getItem('simevi-filtros') || '{}')); } catch (e) { }
const saveFilters = () => { try { localStorage.setItem('simevi-filtros', JSON.stringify(S.f)); } catch (e) { } };

/* ---------- personas ---------- */
const userKey = u => norm((u?.nombre || u?.email || '').split(/\s+/)[0]).replace(/[^a-z]/g, '');
const userBy = email => S.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase()) || (email ? { email, nombre: email.split('@')[0], ini: email.slice(0, 2).toUpperCase() } : null);
const initials = n => String(n || '?').split(/\s+/).filter(w => w && w[0] === w[0].toUpperCase() && !/^(de|del|la)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const av = (email, size = '') => {
  const u = userBy(email);
  if (!u) return '';
  return `<span class="av ${size} u-${userKey(u)}" title="${esc(u.nombre)}" aria-label="${esc(u.nombre)}">${esc(u.ini || initials(u.nombre))}</span>`;
};
const firstName = u => (u?.nombre || '').split(/\s+/)[0];

/* ---------- búsquedas ---------- */
const byId = (t, id) => DB[t].find(x => x.id === id);
const cliente = id => byId('clientes', id);
const poliza = id => byId('polizas', id);
const tramite = id => byId('tramites', id);
const clienteNombre = id => cliente(id)?.nombre || 'Sin cliente';
const tramiteAbierto = t => t.etapa !== 'cerrado' && t.etapa !== 'rechazado';
const diasPoliza = p => p.vigenciaHasta ? daysBetween(todayISO(), p.vigenciaHasta) : null;
const polizaEstado = p => {
  if (p.cancelada) return { n: 'Cancelada', cls: '' };
  const d = diasPoliza(p);
  if (d === null) return { n: 'Sin vigencia', cls: '' };
  if (d < 0) return { n: 'Vencida', cls: 'bad' };
  if (d <= 45) return { n: `Vence en ${d} d`, cls: 'warn' };
  return { n: 'Vigente', cls: 'ok' };
};
const etapaPill = t => {
  if (t.etapa === 'rechazado') return `<span class="pill bad">Rechazado</span>`;
  const e = ETAPA[t.etapa] || ETAPAS[0];
  const cls = { recibido: 'info', ingresado: '', numero: 'gold', analisis: 'gold', pago: 'ok', cerrado: 'ok' }[e.k];
  return `<span class="pill ${cls}">${esc(e.n)}</span>`;
};
const nextCodigo = () => {
  const y = new Date().getFullYear();
  const n = DB.tramites.map(t => +(String(t.codigo || '').match(new RegExp(`^T-${y}-(\\d+)`)) || [])[1] || 0).reduce((a, b) => Math.max(a, b), 0);
  return `T-${y}-${String(n + 1).padStart(4, '0')}`;
};

/* ---------- capa de datos ---------- */
const DEMO_KEY = 'simevi-demo-v2';
const DEMO_USERS = [
  { email: 'ricardovegaprod@gmail.com', nombre: 'Ricardo Vega', ini: 'RV' },
  { email: 'silvia.diaz@simevi.demo', nombre: 'Silvia de Díaz', ini: 'SD' }
];

async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', cache: 'no-store', ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) { init.method = init.method || 'POST'; init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const r = await fetch(path, init);
  let data = null;
  try { data = await r.json(); } catch (e) { }
  if (r.status === 401 && S.mode === 'live') { renderGate('Tu sesión terminó. Vuelve a entrar.'); throw new Error('Sesión terminada'); }
  if (!r.ok) throw new Error(data?.message || data?.error || `Error ${r.status}`);
  return data;
}

function persistDemo() {
  if (S.mode !== 'demo') return;
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ v: 1, me: S.me.email, db: DB })); } catch (e) { }
}

function stamp(row, isNew) {
  const t = nowISO();
  if (isNew) { row.creado = row.creado || t; row.creadoPor = row.creadoPor || S.me.email; }
  row.actualizado = t; row.actualizadoPor = S.me.email;
  return row;
}

function logLocal(accion, tabla, ref, resumen) {
  const e = { id: uid(), fecha: nowISO(), por: S.me.email, accion, tabla, ref, resumen };
  DB.bitacora.unshift(e);
  return e;
}

/* Guarda una fila. En modo real va a la Hoja de Google; el servidor pone autor y bitácora. */
async function save(tabla, row, resumen, accion) {
  const isNew = !row.id || !byId(tabla, row.id);
  if (!row.id) row.id = uid();
  stamp(row, isNew);
  const list = DB[tabla];
  const i = list.findIndex(x => x.id === row.id);
  const prev = i >= 0 ? list[i] : null;
  if (i >= 0) list[i] = row; else list.unshift(row);
  const acc = accion || (isNew ? 'creó' : 'actualizó');
  const log = logLocal(acc, tabla, row.id, resumen);
  if (S.mode === 'demo') { persistDemo(); return row; }
  try {
    const r = await api('api/db', { json: { op: 'upsert', table: tabla, row, log: { accion: acc, resumen } } });
    if (r?.row) Object.assign(row, r.row);
    if (r?.log) Object.assign(log, r.log);
    return row;
  } catch (e) {
    if (prev) list[list.indexOf(row)] = prev; else list.splice(list.indexOf(row), 1);
    DB.bitacora.splice(DB.bitacora.indexOf(log), 1);
    toast('No se guardó: ' + e.message, 'err');
    render();
    throw e;
  }
}

async function remove(tabla, id, resumen) {
  const list = DB[tabla];
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  const [row] = list.splice(i, 1);
  const log = logLocal('eliminó', tabla, id, resumen);
  if (S.mode === 'demo') { persistDemo(); return; }
  try { await api('api/db', { json: { op: 'delete', table: tabla, id, log: { accion: 'eliminó', resumen } } }); }
  catch (e) { list.splice(i, 0, row); DB.bitacora.splice(DB.bitacora.indexOf(log), 1); toast('No se eliminó: ' + e.message, 'err'); render(); }
}

async function loadLive() {
  const d = await api('api/db');
  for (const k of Object.keys(DB)) DB[k] = Array.isArray(d[k]) ? d[k] : [];
  DB.bitacora.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/* Subir un archivo (PDF, foto). En la demo solo queda en esta pestaña. */
async function uploadFile(file, carpeta) {
  if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} pesa más de 4 MB. Comprímelo o súbelo directo a Drive.`);
  if (S.mode === 'demo') return { id: 'local-' + uid(), name: file.name, mime: file.type, size: file.size, url: URL.createObjectURL(file), demo: true };
  const r = await fetch('api/upload', {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-Folder': encodeURIComponent(carpeta || 'General') }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'No se pudo subir');
  return d;
}
const docUrl = d => d.url || (S.mode === 'live' && d.id ? `api/file?id=${encodeURIComponent(d.id)}` : '#');

/* ---------- datos de ejemplo ---------- */
function seedDemo() {
  const T = todayISO();
  const D = n => addDays(T, n);
  const ts = (n, h = 10, m = 0) => { const d = new Date(D(n) + 'T00:00:00'); d.setHours(h, m); return d.toISOString(); };
  const R = DEMO_USERS[0].email, SD = DEMO_USERS[1].email;
  const by = (who, n, h) => ({ creado: ts(n, h), creadoPor: who, actualizado: ts(n, h), actualizadoPor: who });

  const C = [
    { id: 'c1', nombre: 'Grupo Agroindustrial Las Brisas, S.A. de C.V.', tipo: 'Empresa', documento: '0614-150398-102-4', contacto: 'Lic. Mauricio Guardado (RR. HH.)', correo: 'rrhh@lasbrisas.com.sv', telefono: '2264-1187', notas: 'Colectivo de vida y gastos médicos. Cierre de planilla el 25 de cada mes.', portal: 'brisas7k2m9q', ...by(SD, -400, 9) },
    { id: 'c2', nombre: 'Marta Elena Rivas de Henríquez', tipo: 'Persona', documento: '03918274-6', contacto: '', correo: 'martaerivas@gmail.com', telefono: '7745-2093', notas: 'Prefiere WhatsApp por la tarde.', portal: 'marta4hx8w2p', ...by(SD, -900, 11) },
    { id: 'c3', nombre: 'José Roberto Alfaro Menjívar', tipo: 'Persona', documento: '04572119-3', contacto: '', correo: 'jralfaro.m@hotmail.com', telefono: '7012-6648', notas: '', portal: 'jose9tq3n6v', ...by(R, -320, 15) },
    { id: 'c4', nombre: 'Colegio Bilingüe San Gabriel', tipo: 'Empresa', documento: '0614-030805-104-9', contacto: 'Sra. Patricia Lemus (Administración)', correo: 'administracion@csangabriel.edu.sv', telefono: '2243-5510', notas: 'Accidentes personales para alumnos. Renueva cada enero.', portal: 'gabriel2w8r5x', ...by(SD, -700, 10) },
    { id: 'c5', nombre: 'Ana Lucía Portillo Cañas', tipo: 'Persona', documento: '05236671-0', contacto: '', correo: 'analucia.portillo@outlook.com', telefono: '7890-3321', notas: '', portal: 'ana6m3k8t4z', ...by(R, -210, 16) },
    { id: 'c6', nombre: 'Distribuidora El Faro, S.A. de C.V.', tipo: 'Empresa', documento: '0511-120712-101-2', contacto: 'Ing. Óscar Villalta (Gerencia)', correo: 'ovillalta@elfaro.com.sv', telefono: '2338-9002', notas: 'Incendio de bodega en Soyapango y flotilla de 6 vehículos.', portal: 'faro3p9x2k7m', ...by(SD, -500, 9) },
    { id: 'c7', nombre: 'Carlos Ernesto Mejía Flores', tipo: 'Persona', documento: '02781934-5', contacto: '', correo: 'cmejiaflores@gmail.com', telefono: '7601-4475', notas: '', portal: 'carlos8v4n2q', ...by(R, -150, 14) },
    { id: 'c8', nombre: 'Rosa Amelia Quintanilla', tipo: 'Persona', documento: '01693357-8', contacto: '', correo: 'rosaquintanilla61@yahoo.com', telefono: '7234-8810', notas: 'Paciente crónica, reclamos mensuales de medicamentos.', portal: 'rosa5k7w3h9t', ...by(SD, -620, 10) }
  ];

  const P = [
    { id: 'p1', numero: 'VC-2025-004517', aseguradora: 'ASESUISA', ramo: 'Vida', modalidad: 'Colectiva', clienteId: 'c1', vigenciaDesde: D(-280), vigenciaHasta: D(85), prima: 1840.5, frecuencia: 'Mensual', suma: 15000, notas: 'Suma asegurada: 24 salarios por empleado.', asegurados: [
      { nombre: 'Mauricio Guardado Ayala', documento: '02219834-1', certificado: '001', plan: 'Ejecutivo' },
      { nombre: 'Karla Beatriz Ventura', documento: '04411902-7', certificado: '002', plan: 'Ejecutivo' },
      { nombre: 'Luis Alonso Pineda', documento: '03358821-4', certificado: '003', plan: 'Operativo' },
      { nombre: 'Delmy Esperanza Chicas', documento: '05120046-9', certificado: '004', plan: 'Operativo' },
      { nombre: 'Fredy Antonio Mancía', documento: '01978823-0', certificado: '005', plan: 'Operativo' }
    ], ...by(SD, -280, 9) },
    { id: 'p2', numero: 'GMC-118734', aseguradora: 'Pan-American Life', ramo: 'Gastos médicos', modalidad: 'Colectiva', clienteId: 'c1', vigenciaDesde: D(-280), vigenciaHasta: D(85), prima: 6210, frecuencia: 'Mensual', suma: 50000, notas: 'Deducible $150 por evento.', asegurados: [
      { nombre: 'Mauricio Guardado Ayala', documento: '02219834-1', certificado: 'GM-01', plan: 'Titular + 2' },
      { nombre: 'Karla Beatriz Ventura', documento: '04411902-7', certificado: 'GM-02', plan: 'Titular' },
      { nombre: 'Luis Alonso Pineda', documento: '03358821-4', certificado: 'GM-03', plan: 'Titular + 1' }
    ], ...by(SD, -280, 10) },
    { id: 'p3', numero: 'VI-77-209381', aseguradora: 'SISA', ramo: 'Vida', modalidad: 'Individual', clienteId: 'c2', vigenciaDesde: D(-340), vigenciaHasta: D(25), prima: 42.75, frecuencia: 'Mensual', suma: 60000, notas: 'Beneficiarios: hijos (50/50).', asegurados: [], ...by(SD, -340, 11) },
    { id: 'p4', numero: 'AU-2025-551028', aseguradora: 'Seguros del Pacífico', ramo: 'Automotor', modalidad: 'Individual', clienteId: 'c2', vigenciaDesde: D(-120), vigenciaHasta: D(245), prima: 486, frecuencia: 'Anual', suma: 21500, notas: 'Toyota RAV4 2022, placa P 512-874.', asegurados: [], ...by(R, -120, 12) },
    { id: 'p5', numero: 'AU-2025-602917', aseguradora: 'MAPFRE La Centro Americana', ramo: 'Automotor', modalidad: 'Individual', clienteId: 'c3', vigenciaDesde: D(-200), vigenciaHasta: D(165), prima: 398.6, frecuencia: 'Semestral', suma: 16800, notas: 'Nissan Kicks 2021, placa P 774-019.', asegurados: [], ...by(R, -200, 15) },
    { id: 'p6', numero: 'APC-2026-0091', aseguradora: 'Seguros Fedecrédito', ramo: 'Accidentes personales', modalidad: 'Colectiva', clienteId: 'c4', vigenciaDesde: D(-270), vigenciaHasta: D(95), prima: 3120, frecuencia: 'Anual', suma: 5000, notas: '412 alumnos inscritos, gastos médicos por accidente hasta $1,500.', asegurados: [
      { nombre: 'Planilla de alumnos 2026 (412)', documento: '', certificado: 'Anexo 1', plan: 'Escolar' }
    ], ...by(SD, -270, 10) },
    { id: 'p7', numero: 'GM-I-334019', aseguradora: 'ASESUISA', ramo: 'Gastos médicos', modalidad: 'Individual', clienteId: 'c5', vigenciaDesde: D(-30), vigenciaHasta: D(335), prima: 156.3, frecuencia: 'Mensual', suma: 250000, notas: '', asegurados: [], ...by(R, -30, 16) },
    { id: 'p8', numero: 'INC-2025-10443', aseguradora: 'Seguros del Pacífico', ramo: 'Incendio', modalidad: 'Individual', clienteId: 'c6', vigenciaDesde: D(-352), vigenciaHasta: D(13), prima: 2745, frecuencia: 'Anual', suma: 480000, notas: 'Bodega en Soyapango, contenidos e inventario.', asegurados: [], ...by(SD, -352, 9) },
    { id: 'p9', numero: 'FLT-2025-0778', aseguradora: 'Quálitas', ramo: 'Automotor', modalidad: 'Colectiva', clienteId: 'c6', vigenciaDesde: D(-90), vigenciaHasta: D(275), prima: 3980, frecuencia: 'Trimestral', suma: 132000, notas: 'Flotilla de reparto.', asegurados: [
      { nombre: 'Isuzu NPR 2020 · C 118-302', documento: '', certificado: 'V-01', plan: 'Cobertura amplia' },
      { nombre: 'Isuzu NPR 2020 · C 118-303', documento: '', certificado: 'V-02', plan: 'Cobertura amplia' },
      { nombre: 'Hyundai H100 2019 · C 097-451', documento: '', certificado: 'V-03', plan: 'Cobertura amplia' },
      { nombre: 'Toyota Hilux 2023 · P 908-226', documento: '', certificado: 'V-04', plan: 'Cobertura amplia' }
    ], ...by(SD, -90, 11) },
    { id: 'p10', numero: 'VI-88-117402', aseguradora: 'Atlántida Vida', ramo: 'Vida', modalidad: 'Individual', clienteId: 'c7', vigenciaDesde: D(-150), vigenciaHasta: D(215), prima: 58.4, frecuencia: 'Mensual', suma: 75000, notas: '', asegurados: [], ...by(R, -150, 14) },
    { id: 'p11', numero: 'GM-I-298845', aseguradora: 'SISA', ramo: 'Gastos médicos', modalidad: 'Individual', clienteId: 'c8', vigenciaDesde: D(-380), vigenciaHasta: D(-15), prima: 212.9, frecuencia: 'Mensual', suma: 100000, notas: 'Renovación pendiente de aceptar por la clienta.', asegurados: [], ...by(SD, -380, 10) }
  ];

  const ev = (n, h, por, tipo, texto) => ({ fecha: ts(n, h), por, tipo, texto });
  const y = new Date().getFullYear();
  const Tm = [
    { id: 't1', codigo: `T-${y}-0031`, tipo: 'Reclamo', clienteId: 'c8', polizaId: 'p11', aseguradora: 'SISA', asunto: 'Reembolso de medicamentos de septiembre', descripcion: 'Facturas de farmacia y receta del Dr. Melara.', canal: 'Portal de la aseguradora', etapa: 'pago', numeroReclamo: 'GM-RE-2026-48817', monto: 186.4, fechaSolicitud: D(-21), fechaIngreso: D(-20), responsable: SD, visibleCliente: true, notaCliente: 'Tu reembolso fue aprobado. El cheque está en nuestra oficina.', docs: [{ id: 'd1', name: 'Facturas farmacia septiembre.pdf', size: 412000 }, { id: 'd2', name: 'Receta Dr Melara.pdf', size: 188000 }], eventos: [
      ev(-21, 9, SD, 'etapa', 'Recibido por correo de la clienta.'), ev(-20, 11, SD, 'etapa', 'Ingresado en el portal de SISA.'), ev(-17, 15, SD, 'etapa', 'SISA asignó el número GM-RE-2026-48817.'), ev(-16, 10, SD, 'etapa', 'En análisis.'), ev(-3, 16, R, 'etapa', 'Cheque disponible en SISA por $171.25 (aplicaron deducible).')
    ], ...by(SD, -21, 9), actualizado: ts(-3, 16), actualizadoPor: R },
    { id: 't2', codigo: `T-${y}-0034`, tipo: 'Reclamo', clienteId: 'c3', polizaId: 'p5', aseguradora: 'MAPFRE La Centro Americana', asunto: 'Choque en Bulevar Los Próceres', descripcion: 'Daños en defensa trasera y luz. Hay parte policial.', canal: 'Entrega en físico', etapa: 'analisis', numeroReclamo: 'AU-SIN-2026-11094', monto: 1320, fechaSolicitud: D(-12), fechaIngreso: D(-11), responsable: R, visibleCliente: true, notaCliente: 'El ajustador ya revisó el vehículo. Esperamos la orden de taller.', docs: [{ id: 'd3', name: 'Parte policial PNC.pdf', size: 920000 }, { id: 'd4', name: 'Fotos del vehículo.pdf', size: 2400000 }], eventos: [
      ev(-12, 8, R, 'etapa', 'Recibido por correo con fotos.'), ev(-11, 14, R, 'etapa', 'Entregado en físico en MAPFRE (Torre Futura).'), ev(-8, 10, R, 'etapa', 'Número asignado AU-SIN-2026-11094.'), ev(-6, 9, SD, 'etapa', 'Inspección del ajustador realizada.'), ev(-2, 17, R, 'nota', 'Llamé a MAPFRE: orden de taller sale esta semana.')
    ], ...by(R, -12, 8), actualizado: ts(-2, 17), actualizadoPor: R },
    { id: 't3', codigo: `T-${y}-0036`, tipo: 'Inclusión', clienteId: 'c1', polizaId: 'p2', aseguradora: 'Pan-American Life', asunto: 'Inclusión de 3 empleados nuevos', descripcion: 'Ingresos de octubre en planta de Santa Ana.', canal: 'Portal de la aseguradora', etapa: 'ingresado', numeroReclamo: '', monto: 0, fechaSolicitud: D(-6), fechaIngreso: D(-5), responsable: SD, visibleCliente: true, notaCliente: '', docs: [{ id: 'd5', name: 'Solicitudes de inclusion firmadas.pdf', size: 1300000 }], eventos: [
      ev(-6, 10, SD, 'etapa', 'RR. HH. envió solicitudes firmadas.'), ev(-5, 15, SD, 'etapa', 'Ingresado en el portal de Pan-American Life.')
    ], ...by(SD, -6, 10), actualizado: ts(-5, 15), actualizadoPor: SD },
    { id: 't4', codigo: `T-${y}-0037`, tipo: 'Reclamo', clienteId: 'c2', polizaId: 'p3', aseguradora: 'SISA', asunto: 'Indemnización por hospitalización', descripcion: 'Beneficio diario por 4 días en Hospital de Diagnóstico.', canal: 'Entrega en físico', etapa: 'numero', numeroReclamo: 'VI-RC-2026-7731', monto: 400, fechaSolicitud: D(-9), fechaIngreso: D(-7), responsable: SD, visibleCliente: true, notaCliente: '', docs: [{ id: 'd6', name: 'Epicrisis hospital.pdf', size: 640000 }], eventos: [
      ev(-9, 11, SD, 'etapa', 'Recibido por correo.'), ev(-7, 9, R, 'etapa', 'Entregado en físico en SISA Colonia Escalón.'), ev(-4, 13, SD, 'etapa', 'Número asignado VI-RC-2026-7731.')
    ], ...by(SD, -9, 11), actualizado: ts(-4, 13), actualizadoPor: SD },
    { id: 't5', codigo: `T-${y}-0038`, tipo: 'Renovación', clienteId: 'c6', polizaId: 'p8', aseguradora: 'Seguros del Pacífico', asunto: 'Renovación incendio bodega Soyapango', descripcion: 'Actualizar valor de inventario a $520,000.', canal: 'Correo a la aseguradora', etapa: 'recibido', numeroReclamo: '', monto: 0, fechaSolicitud: D(-2), fechaIngreso: '', responsable: R, visibleCliente: false, notaCliente: '', docs: [], eventos: [ev(-2, 16, R, 'etapa', 'El Ing. Villalta pidió renovar con nuevo valor de inventario.')], ...by(R, -2, 16) },
    { id: 't6', codigo: `T-${y}-0039`, tipo: 'Modificación', clienteId: 'c7', polizaId: 'p10', aseguradora: 'Atlántida Vida', asunto: 'Cambio de beneficiarios', descripcion: 'Agregar a su esposa como beneficiaria al 60%.', canal: 'Portal de la aseguradora', etapa: 'recibido', numeroReclamo: '', monto: 0, fechaSolicitud: D(-1), fechaIngreso: '', responsable: SD, visibleCliente: true, notaCliente: '', docs: [{ id: 'd7', name: 'Formulario cambio beneficiarios.pdf', size: 210000 }, { id: 'd8', name: 'DUI esposa.pdf', size: 330000 }], eventos: [ev(-1, 9, SD, 'etapa', 'Recibido por correo con formulario y DUI.')], ...by(SD, -1, 9) },
    { id: 't7', codigo: `T-${y}-0029`, tipo: 'Reclamo', clienteId: 'c1', polizaId: 'p2', aseguradora: 'Pan-American Life', asunto: 'Gastos médicos de Karla Ventura (cirugía)', asegurado: 'Karla Beatriz Ventura', certificado: 'GM-02', descripcion: 'Apendicectomía en Hospital Centro Médico.', canal: 'Portal de la aseguradora', etapa: 'cerrado', numeroReclamo: 'PAL-GM-2026-30418', monto: 3480, fechaSolicitud: D(-40), fechaIngreso: D(-39), responsable: R, visibleCliente: true, notaCliente: 'Pagado por depósito el ' + fmtDate(D(-8)) + '.', docs: [], eventos: [
      ev(-40, 10, R, 'etapa', 'Recibido.'), ev(-39, 12, R, 'etapa', 'Ingresado en portal.'), ev(-36, 9, R, 'etapa', 'Número PAL-GM-2026-30418.'), ev(-30, 10, SD, 'etapa', 'En análisis.'), ev(-9, 15, R, 'etapa', 'Pago aprobado por $3,132.00.'), ev(-8, 10, R, 'etapa', 'Depositado en cuenta de la asegurada. Cerrado.')
    ], ...by(R, -40, 10), actualizado: ts(-8, 10), actualizadoPor: R },
    { id: 't8', codigo: `T-${y}-0035`, tipo: 'Reclamo', clienteId: 'c4', polizaId: 'p6', aseguradora: 'Seguros Fedecrédito', asunto: 'Accidente de alumno en clase de educación física', asegurado: 'Diego Alejandro Marroquín (4.º grado)', certificado: 'Anexo 1', descripcion: 'Esguince de tobillo, consulta y radiografía.', canal: 'Portal de la aseguradora', etapa: 'ingresado', numeroReclamo: '', monto: 245, fechaSolicitud: D(-8), fechaIngreso: D(-7), responsable: R, visibleCliente: true, notaCliente: '', docs: [{ id: 'd9', name: 'Informe enfermeria y facturas.pdf', size: 780000 }], eventos: [
      ev(-8, 14, R, 'etapa', 'Recibido de Administración.'), ev(-7, 11, R, 'etapa', 'Ingresado en el portal de Fedecrédito.')
    ], ...by(R, -8, 14), actualizado: ts(-7, 11), actualizadoPor: R },
    { id: 't9', codigo: `T-${y}-0040`, tipo: 'Emisión', clienteId: 'c5', polizaId: '', aseguradora: 'Seguros del Pacífico', asunto: 'Seguro de auto nuevo (Mazda CX-30 2026)', descripcion: 'Cotización aceptada, cobertura amplia.', canal: 'Correo a la aseguradora', etapa: 'analisis', numeroReclamo: 'COT-88412', monto: 0, fechaSolicitud: D(-4), fechaIngreso: D(-3), responsable: R, visibleCliente: false, notaCliente: '', docs: [], eventos: [ev(-4, 11, R, 'etapa', 'Clienta aceptó cotización.'), ev(-3, 9, R, 'etapa', 'Enviado a suscripción.'), ev(-3, 16, SD, 'etapa', 'Cotización COT-88412, en análisis.')], ...by(R, -4, 11), actualizado: ts(-3, 16), actualizadoPor: SD },
    { id: 't10', codigo: `T-${y}-0027`, tipo: 'Reclamo', clienteId: 'c6', polizaId: 'p9', aseguradora: 'Quálitas', asunto: 'Rotura de parabrisas Isuzu C 118-302', descripcion: '', canal: 'Portal de la aseguradora', etapa: 'rechazado', numeroReclamo: 'QS-2026-5509', monto: 410, fechaSolicitud: D(-50), fechaIngreso: D(-49), responsable: SD, visibleCliente: true, notaCliente: 'Quálitas lo rechazó porque el deducible es mayor al daño.', docs: [], eventos: [ev(-50, 9, SD, 'etapa', 'Recibido.'), ev(-49, 10, SD, 'etapa', 'Ingresado.'), ev(-47, 10, SD, 'etapa', 'Número QS-2026-5509.'), ev(-41, 15, SD, 'etapa', 'Rechazado: deducible mayor al daño.')], ...by(SD, -50, 9), actualizado: ts(-41, 15), actualizadoPor: SD }
  ];

  const Pg = [
    { id: 'g1', tramiteId: 't1', clienteId: 'c8', aseguradora: 'SISA', forma: 'Cheque', numero: '00418821', banco: 'Banco Agrícola', monto: 171.25, fechaAviso: D(-3), fechaRecogido: D(-1), fechaEntregado: '', entregadoA: '', folio: '112', estado: 'oficina', notas: 'Aplicaron deducible de $15.15.', ...by(R, -3, 16), actualizado: ts(-1, 12), actualizadoPor: SD },
    { id: 'g2', tramiteId: 't7', clienteId: 'c1', aseguradora: 'Pan-American Life', forma: 'Depósito', numero: 'TRF-77120394', banco: 'Banco Cuscatlán', monto: 3132, fechaAviso: D(-9), fechaRecogido: '', fechaEntregado: D(-8), entregadoA: 'Cuenta de Karla Ventura', folio: '111', estado: 'depositado', notas: '', ...by(R, -9, 15), actualizado: ts(-8, 10), actualizadoPor: R },
    { id: 'g3', tramiteId: '', clienteId: 'c8', aseguradora: 'SISA', forma: 'Cheque', numero: '00417302', banco: 'Banco Agrícola', monto: 94.8, fechaAviso: D(-30), fechaRecogido: D(-28), fechaEntregado: D(-26), entregadoA: 'Rosa Amelia Quintanilla', folio: '108', estado: 'entregado', notas: 'Reembolso de agosto.', ...by(SD, -30, 10), actualizado: ts(-26, 11), actualizadoPor: SD },
    { id: 'g4', tramiteId: '', clienteId: 'c2', aseguradora: 'Seguros del Pacífico', forma: 'Cheque', numero: '0098812', banco: 'Banco Davivienda', monto: 260, fechaAviso: D(0), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: 'disponible', notas: 'Devolución de prima por ajuste de suma asegurada.', ...by(R, 0, 8) }
  ];

  const mail = (id, n, h, from, fromName, subject, snippet, attachments = []) => ({ id, fecha: ts(n, h), from, fromName, subject, snippet, attachments });
  const inbox = [
    mail('m1', 0, 8, 'reclamos@sisa.com.sv', 'SISA Reclamos', 'Cheque disponible · Reclamo VI-RC-2026-7731', 'Estimado corredor: le informamos que el cheque No. 00421190 por $400.00 a favor de Marta Elena Rivas de Henríquez se encuentra disponible en caja, Colonia Escalón.', []),
    mail('m2', 0, 7, 'notificaciones@fedecredito.com.sv', 'Seguros Fedecrédito', 'Registro de reclamo APC-2026-0091', 'Su reclamo ha sido registrado con el número de reclamo APC-R-26-00387 para la póliza APC-2026-0091 (Colegio Bilingüe San Gabriel). Tiempo estimado de respuesta: 10 días hábiles.', []),
    mail('m3', -1, 17, 'jralfaro.m@hotmail.com', 'José Roberto Alfaro', 'Facturas de taller para mi reclamo', 'Buenas tardes, les adjunto la factura del taller y la proforma de repuestos que me pidió MAPFRE. Póliza AU-2025-602917.', [{ id: 'a1', name: 'Factura taller Autofix.pdf', size: 380000, mime: 'application/pdf' }, { id: 'a2', name: 'Proforma repuestos.pdf', size: 214000, mime: 'application/pdf' }]),
    mail('m4', -1, 11, 'analucia.portillo@outlook.com', 'Ana Lucía Portillo', 'Reembolso consulta pediatra', 'Hola Silvia, te mando la factura de la consulta de mi hijo y la receta. ¿Me ayudas a meter el reembolso? Póliza GM-I-334019. Gracias.', [{ id: 'a3', name: 'Factura consulta pediatra.pdf', size: 160000, mime: 'application/pdf' }, { id: 'a4', name: 'Receta.jpg', size: 920000, mime: 'image/jpeg' }]),
    mail('m5', -2, 15, 'pagos@palig.com', 'Pan-American Life Pagos', 'Aviso de depósito PAL-GM-2026-30418', 'Se realizó transferencia por $3,132.00 a la cuenta del asegurado. Referencia TRF-77120394.', []),
    mail('m6', -3, 10, 'rrhh@lasbrisas.com.sv', 'Mauricio Guardado', 'Exclusión de empleado por renuncia', 'Buen día, favor excluir a Fredy Antonio Mancía de la póliza de vida colectiva VC-2025-004517 a partir del 30 de septiembre. Adjunto carta de renuncia.', [{ id: 'a5', name: 'Carta renuncia Fredy Mancia.pdf', size: 98000, mime: 'application/pdf' }])
  ];
  const Co = [{ id: 'm5', estado: 'procesado', tramiteId: 't7', nota: 'Pago registrado', ...by(R, -2, 16) }];

  const bit = [
    ['ricardo', -0.05, 'creó', 'pagos', 'g4', 'Cheque 0098812 por $260.00 de Seguros del Pacífico (Marta Elena Rivas)'],
    ['silvia', -1, 'actualizó', 'pagos', 'g1', 'Cheque 00418821 recogido en SISA, queda en oficina'],
    ['silvia', -1, 'creó', 'tramites', 't6', `T-${y}-0039 Modificación · Carlos Ernesto Mejía Flores`],
    ['ricardo', -2, 'creó', 'tramites', 't5', `T-${y}-0038 Renovación · Distribuidora El Faro`],
    ['ricardo', -2, 'actualizó', 'tramites', 't2', `T-${y}-0034 nota: orden de taller sale esta semana`],
    ['ricardo', -3, 'movió', 'tramites', 't1', `T-${y}-0031 a Pago disponible`],
    ['silvia', -3, 'movió', 'tramites', 't9', `T-${y}-0040 a En análisis`],
    ['silvia', -4, 'movió', 'tramites', 't4', `T-${y}-0037 a Número asignado (VI-RC-2026-7731)`],
    ['silvia', -5, 'movió', 'tramites', 't3', `T-${y}-0036 a Ingresado`],
    ['ricardo', -8, 'movió', 'tramites', 't7', `T-${y}-0029 a Cerrado`]
  ].map(([w, n, accion, tabla, ref, resumen], i) => ({ id: 'b' + i, fecha: ts(Math.floor(n), n % 1 ? 11 : 9 + i % 8, (i * 13) % 60), por: w === 'ricardo' ? R : SD, accion, tabla, ref, resumen }));

  return { clientes: C, polizas: P, tramites: Tm, pagos: Pg, bitacora: bit, correos: Co, inbox };
}

function bootDemoData(reset) {
  S.mode = 'demo';
  S.users = DEMO_USERS;
  let saved = null;
  if (!reset) try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { }
  const seed = seedDemo();
  const db = saved?.db || seed;
  for (const k of Object.keys(DB)) DB[k] = db[k] || [];
  S.demoInbox = seed.inbox;
  S.me = DEMO_USERS.find(u => u.email === saved?.me) || DEMO_USERS[0];
  persistDemo();
}

/* ---------- avisos y celebración ---------- */
function toast(msg, kind = '', action) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `${ic(kind === 'err' ? 'warning' : 'check-circle')}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.run(); close(); };
  box.appendChild(el);
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  const arm = () => { timer = setTimeout(close, kind === 'err' ? 6000 : 3600); };
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', arm);
  arm();
}

const SPARK = 'M12 0C12.6 7.6 16.4 11.4 24 12 16.4 12.6 12.6 16.4 12 24 11.4 16.4 7.6 12.6 0 12 7.6 11.4 11.4 7.6 12 0Z';
function celebrate() {
  if (reduceMotion()) return;
  const c = document.createElement('div');
  c.className = 'celebrate'; c.setAttribute('aria-hidden', 'true');
  let h = '<i class="dm"></i><i class="dm b"></i>';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 110 + (i % 3) * 40;
    h += `<svg viewBox="0 0 24 24" style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;animation-delay:${(i % 4) * 30}ms"><path d="${SPARK}"/></svg>`;
  }
  c.innerHTML = h;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1200);
}

/* Destellos: cuántas pólizas vigentes tiene el cliente (1, 2, 3, 5, 8+) */
function sparkles(n) {
  const th = [1, 2, 3, 5, 8];
  const on = th.filter(t => n >= t).length;
  return `<span class="stars5" role="img" aria-label="${n} ${n === 1 ? 'póliza vigente' : 'pólizas vigentes'}">${th.map((t, i) => `<svg viewBox="0 0 24 24" class="${i < on ? 'on' : ''}"><path d="${SPARK}"/></svg>`).join('')}</span>`;
}

/* ---------- hoja lateral ---------- */
let drawerOnClose = null;
function openDrawer(html, onClose) {
  closeDrawer(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.act = 'drawer-close';
  const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = html;
  document.body.append(scrim, d);
  drawerOnClose = onClose || null;
  requestAnimationFrame(() => { scrim.classList.add('on'); d.classList.add('on'); });
  try { history.pushState({ drawer: 1 }, ''); } catch (e) { }
  setTimeout(() => { const f = d.querySelector('[autofocus]'); if (f) f.focus(); else d.querySelector('.drawer-h button')?.focus({ preventScroll: true }); }, 60);
  return d;
}
function closeDrawer(silent) {
  const d = $('.drawer'), s = $('.scrim');
  if (!d) return;
  if (drawerOnClose) { const fn = drawerOnClose; drawerOnClose = null; fn(); }
  d.classList.remove('on'); s?.classList.remove('on');
  d.classList.add('closing');
  const kill = () => { d.remove(); s?.remove(); };
  if (silent || reduceMotion()) kill(); else setTimeout(kill, 300);
  try { if (!silent && history.state?.drawer) history.back(); } catch (e) { }
}
const drawerEl = () => $('.drawer:not(.closing)');
addEventListener('popstate', () => { if (drawerEl()) closeDrawer(true); });

/* ---------- navegación ---------- */
const ROUTES = [
  { k: 'inicio', n: 'Inicio', i: 'house' },
  { k: 'reclamos', n: 'Reclamos', i: 'first-aid' },
  { k: 'tramites', n: 'Trámites', i: 'folder-open' },
  { k: 'pagos', n: 'Pagos', i: 'money-wavy' },
  { k: 'polizas', n: 'Pólizas', i: 'shield-check' },
  { k: 'clientes', n: 'Clientes', i: 'users', desk: true },
  { k: 'bandeja', n: 'Bandeja', i: 'tray', desk: true, sep: true },
  { k: 'bitacora', n: 'Bitácora', i: 'clock-counter-clockwise', desk: true },
  { k: 'ajustes', n: 'Ajustes', i: 'gear-six', desk: true }
];

function go(route, arg = '') { location.hash = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : ''); }
function parseHash() {
  const [, r = 'inicio', a = ''] = (location.hash || '').match(/^#\/([^/?]*)\/?([^?]*)/) || [];
  S.route = ROUTES.some(x => x.k === r) || r === 'buscar' || r === 'c' ? r : 'inicio';
  S.arg = decodeURIComponent(a || '');
}
addEventListener('hashchange', () => { parseHash(); $('.more-sheet')?.remove(); render(true); });

function counts() {
  return {
    tramites: DB.tramites.filter(t => t.etapa === 'recibido').length,
    pagos: DB.pagos.filter(pagoAbierto).length,
    bandeja: S.inbox ? S.inbox.filter(m => !mailDone(m)).length : 0
  };
}

function shell(content) {
  const c = counts();
  const navItem = r => `<a class="nav ${r.desk ? 'desk' : ''}" href="#/${r.k}" ${S.route === r.k ? 'aria-current="page"' : ''}>${ic(r.i)}<span>${r.n}</span>${c[r.k] ? `<span class="count" aria-label="${c[r.k]} pendientes">${c[r.k]}</span>` : ''}</a>`;
  return `
  <div class="app">
    <nav class="rail" aria-label="Secciones">
      <a class="brand" href="#/inicio" aria-label="SIMEVI, inicio"><img src="img/sv.webp" alt=""><span><b>SIMEVI</b><small>CORREDORES DE SEGUROS</small></span></a>
      ${ROUTES.slice(0, 6).map(navItem).join('')}
      <button class="nav mob-more" type="button" data-act="more" style="display:none">${ic('dots-three')}<span>Más</span></button>
      <div class="sep"></div>
      ${ROUTES.slice(6).map(navItem).join('')}
      <div class="rail-foot">
        ${av(S.me.email)}
        <div class="who"><b>${esc(S.me.nombre)}</b><small>${S.mode === 'demo' ? 'Demostración' : 'Conectado a Google'}</small></div>
        <button class="btn ghost icon sm" type="button" data-act="switch-user" title="${S.mode === 'demo' ? 'Cambiar de persona' : 'Cerrar sesión'}" aria-label="${S.mode === 'demo' ? 'Cambiar de persona' : 'Cerrar sesión'}">${ic(S.mode === 'demo' ? 'arrows-clockwise' : 'sign-out')}</button>
      </div>
    </nav>
    <div class="col-main">
      <header class="mbar">
        <img src="img/sv.webp" alt=""><b>SIMEVI</b><span class="spacer"></span>
        <button class="btn icon sm" type="button" data-act="search-m" aria-label="Buscar">${ic('magnifying-glass')}</button>
        <button class="btn primary icon sm" type="button" data-act="new-tramite" aria-label="Nuevo trámite">${ic('plus')}</button>
        <button class="btn ghost icon sm" type="button" data-act="switch-user" aria-label="Persona">${av(S.me.email, 'sm')}</button>
      </header>
      <main class="main" id="main">
        <div class="top">
          <label class="search"><span class="sr">Buscar</span>${ic('magnifying-glass')}<input type="search" id="gsearch" placeholder="Buscar cliente, póliza, número de reclamo o cheque" value="${esc(S.q)}" autocomplete="off"></label>
          <span class="spacer"></span>
          ${S.route === 'tramites' ? '' : `<button class="btn primary" type="button" data-act="new-tramite">${ic('plus')}Nuevo trámite</button>`}
        </div>
        ${S.mode === 'demo' ? `<div class="banner">${ic('sparkle')}<span class="long">Modo demostración: los datos son de ejemplo y se guardan solo en este navegador. Estás como <b>${esc(S.me.nombre)}</b>.</span><span class="short">Demo · estás como <b>${esc(firstName(S.me))}</b></span><button class="btn sm" type="button" data-act="switch-user">Cambiar a ${esc(firstName(S.users.find(u => u.email !== S.me.email)))}</button></div>` : ''}
        <div id="view">${content}</div>
      </main>
    </div>
  </div>`;
}

const VIEWS = {};
let lastRoute = '';
function render(animate) {
  if (S.route === 'c') return renderPortal(S.arg);
  if (!S.me) return;
  const html = (VIEWS[S.route] || VIEWS.inicio)();
  const root = $('#root');
  const keepFocus = document.activeElement?.id;
  const sel = document.activeElement?.selectionStart;
  if (!$('.app', root)) root.innerHTML = shell(html);
  else {
    const tmp = document.createElement('div'); tmp.innerHTML = shell('');
    $('.rail', root).replaceWith($('.rail', tmp));
    $('.banner', root)?.replaceWith($('.banner', tmp) || '');
    $('.top', root).replaceWith($('.top', tmp));
    $('#view').innerHTML = html;
  }
  const v = $('#view');
  if (animate !== false && S.route !== lastRoute) {
    v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    Array.from(v.children).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 6)));
    window.scrollTo(0, 0);
  } else v.classList.remove('enter');
  lastRoute = S.route;
  if (S.route === 'reclamos') syncEntry();
  if (keepFocus) { const el = document.getElementById(keepFocus); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) { } } }
  document.title = (ROUTES.find(r => r.k === S.route)?.n || 'Buscar') + ' · SIMEVI';
  const more = $('.mob-more'); if (more) more.style.display = matchMedia('(max-width:760px)').matches ? '' : 'none';
}
addEventListener('resize', () => { const more = $('.mob-more'); if (more) more.style.display = matchMedia('(max-width:760px)').matches ? '' : 'none'; });

function head(title, sub, actions = '') {
  return `<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function emptyState(icon, title, text, btn = '') {
  return `<div class="empty"><span class="ico">${ic(icon)}</span><b>${title}</b><span>${text}</span>${btn}</div>`;
}

/* ---------- Inicio ---------- */
function pendientes() {
  const T = todayISO();
  const out = [];
  DB.tramites.filter(t => t.etapa === 'recibido').forEach(t => out.push({ p: 1, icon: 'upload-simple', t: `Ingresar ${t.codigo} en ${t.aseguradora || 'la aseguradora'}`, s: `${t.tipo} · ${clienteNombre(t.clienteId)} · llegó ${fmtAgo(t.fechaSolicitud + 'T12:00:00')}`, act: `data-act="open-tramite" data-id="${t.id}"` }));
  DB.pagos.filter(p => p.estado === 'disponible').forEach(p => out.push({ p: 2, icon: 'hand-coins', t: `Recoger ${p.forma.toLowerCase()} de ${fmtMoney(p.monto)} en ${p.aseguradora}`, s: `${clienteNombre(p.clienteId)} · aviso ${fmtShort(p.fechaAviso)}`, act: `data-act="open-pago" data-id="${p.id}"` }));
  DB.pagos.filter(p => p.estado === 'oficina').forEach(p => out.push({ p: 2, icon: 'money-wavy', t: `Entregar cheque ${p.numero} a ${clienteNombre(p.clienteId).split(',')[0]}`, s: `${fmtMoney(p.monto)} · en oficina desde ${fmtShort(p.fechaRecogido || p.fechaAviso)}`, act: `data-act="open-pago" data-id="${p.id}"` }));
  DB.tramites.filter(t => t.etapa === 'ingresado' && t.fechaIngreso && daysBetween(t.fechaIngreso, T) >= 3).forEach(t => out.push({ p: 3, icon: 'phone', t: `Pedir número a ${t.aseguradora} para ${t.codigo}`, s: `Ingresado hace ${daysBetween(t.fechaIngreso, T)} días · ${clienteNombre(t.clienteId)}`, act: `data-act="open-tramite" data-id="${t.id}"` }));
  DB.polizas.filter(p => !p.cancelada).forEach(p => {
    const d = diasPoliza(p);
    if (d === null || d > 30) return;
    const ya = DB.tramites.some(t => t.polizaId === p.id && t.tipo === 'Renovación' && tramiteAbierto(t));
    if (ya) return;
    out.push({ p: d < 0 ? 1 : 4, icon: 'arrows-clockwise', t: d < 0 ? `Póliza ${p.numero} venció hace ${-d} días` : `Renovar ${p.numero} (vence en ${d} días)`, s: `${p.ramo} · ${clienteNombre(p.clienteId)}`, act: `data-act="open-poliza" data-id="${p.id}"` });
  });
  return out.sort((a, b) => a.p - b.p);
}

VIEWS.inicio = () => {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const abiertos = DB.tramites.filter(tramiteAbierto);
  const enAseg = abiertos.filter(t => t.tipo === 'Reclamo' && ['ingresado', 'numero', 'analisis'].includes(t.etapa));
  const porEntregar = DB.pagos.filter(pagoAbierto);
  const sumaPend = porEntregar.reduce((a, p) => a + (+p.monto || 0), 0);
  const renov = DB.polizas.filter(p => !p.cancelada && diasPoliza(p) !== null && diasPoliza(p) <= 30);
  const todo = pendientes();
  const hoy = new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
  const mine = todo.length;
  return `
  <section class="hello">
    <div class="panel hello-main flash">
      <span class="greek" aria-hidden="true">ΑΣΦΑΛΕΙΑ</span>
      <span class="when">${esc(hoy)}</span>
      <h1>${saludo}, <span>${esc(firstName(S.me))}</span></h1>
      <p>${mine ? `Hay ${mine} ${mine === 1 ? 'cosa pendiente' : 'cosas pendientes'} entre los dos. Lo más urgente está arriba.` : 'Todo al día. No hay trámites por ingresar ni pagos por entregar.'}</p>
      <img class="mono" src="img/sv.webp" alt="" aria-hidden="true">
    </div>
    <div class="kpis">
      <button class="card kpi" type="button" data-act="go" data-r="tramites"><span class="label">${ic('folder-open')}Trámites abiertos</span><b class="tnum">${abiertos.length}</b></button>
      <button class="card kpi" type="button" data-act="go" data-r="tramites"><span class="label">${ic('hourglass-medium')}Reclamos en aseguradora</span><b class="tnum">${enAseg.length}</b></button>
      <button class="card kpi ${porEntregar.length ? 'alert' : ''}" type="button" data-act="go" data-r="pagos"><span class="label">${ic('hand-coins')}Pagos por entregar</span><b class="tnum">${fmtMoney(sumaPend).replace('US', '')}<small>· ${porEntregar.length}</small></b></button>
      <button class="card kpi ${renov.length ? 'alert' : ''}" type="button" data-act="go" data-r="polizas" data-f="por-vencer"><span class="label">${ic('arrows-clockwise')}Vencen en 30 días</span><b class="tnum">${renov.length}</b></button>
    </div>
  </section>
  <section class="home-grid">
    <div class="panel">
      <div class="panel-h"><h2>LO QUE SIGUE</h2><span class="label">${todo.length}</span></div>
      ${todo.length ? `<ul class="next">${todo.slice(0, 8).map(x => `<li><span class="ico">${ic(x.icon)}</span><div class="txt"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></div><button class="btn sm" type="button" ${x.act}>Abrir</button></li>`).join('')}</ul>` : emptyState('check-circle', 'Nada pendiente', 'Cuando llegue una solicitud o un cheque, aparecerá aquí.')}
    </div>
    <div class="panel">
      <div class="panel-h"><h2>QUIÉN HIZO QUÉ</h2><a class="btn ghost sm" href="#/bitacora">Ver todo</a></div>
      ${feed(DB.bitacora.slice(0, 7))}
    </div>
  </section>`;
};

function feed(list, timeOnly) {
  if (!list.length) return emptyState('clock-counter-clockwise', 'Sin movimientos', 'Cada cambio quedará registrado con el nombre de quien lo hizo.');
  return `<ul class="feed">${list.map(e => {
    const u = userBy(e.por);
    return `<li>${av(e.por, 'sm')}<div class="txt"><b>${esc(firstName(u))}</b> ${esc(e.accion)} ${esc(articulo(e.tabla))} <span class="muted">${esc(e.resumen || '')}</span><small>${timeOnly ? fmtTime(e.fecha) : fmtAgo(e.fecha)}${e.ref && e.tabla !== 'correos' ? ` · <a href="#" data-act="open-ref" data-t="${esc(e.tabla)}" data-id="${esc(e.ref)}">abrir</a>` : ''}</small></div></li>`;
  }).join('')}</ul>`;
}
const articulo = t => ({ tramites: 'el trámite', pagos: 'el pago', polizas: 'la póliza', clientes: 'el cliente', correos: 'el correo' }[t] || '');

/* Confirmaciones y preguntas dentro de la página (el visor de artifacts y algunos teléfonos bloquean confirm/prompt). */
function ask(msg, { value, ok = 'Aceptar', danger = false, cancel = 'Cancelar' } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask-wrap';
    const hasInput = value !== undefined;
    wrap.innerHTML = `<form class="panel ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-msg">
      <p id="ask-msg">${esc(msg)}</p>
      ${hasInput ? `<input type="text" id="ask-in" value="${esc(value)}">` : ''}
      <div class="ask-b"><button class="btn ghost" type="button" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(ok)}</button></div>
    </form>`;
    document.body.appendChild(wrap);
    const f = wrap.querySelector('form'), inp = wrap.querySelector('#ask-in');
    const done = v => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(hasInput ? null : false); } };
    document.addEventListener('keydown', key, true);
    f.addEventListener('submit', e => { e.preventDefault(); done(hasInput ? inp.value.trim() : true); });
    wrap.querySelector('[data-r="0"]').onclick = () => done(hasInput ? null : false);
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) done(hasInput ? null : false); });
    setTimeout(() => (inp ? (inp.focus(), inp.select()) : f.querySelector('[type=submit]').focus()), 30);
  });
}

/* ---------- Trámites ---------- */
function filtrarTramites() {
  const f = S.f, q = norm(S.q);
  return DB.tramites.filter(t => {
    if (!f.tCerrados && !tramiteAbierto(t)) return false;
    if (f.tTipo === 'reclamos' && t.tipo !== 'Reclamo') return false;
    if (f.tTipo === 'modif' && !['Modificación', 'Inclusión', 'Exclusión'].includes(t.tipo)) return false;
    if (f.tTipo === 'renov' && t.tipo !== 'Renovación') return false;
    if (f.tTipo === 'otros' && ['Reclamo', 'Modificación', 'Inclusión', 'Exclusión', 'Renovación'].includes(t.tipo)) return false;
    if (f.tResp && t.responsable !== f.tResp) return false;
    if (q) {
      const hay = norm([t.codigo, t.asunto, t.asegurado, t.certificado, t.numeroReclamo, t.aseguradora, clienteNombre(t.clienteId), poliza(t.polizaId)?.numero].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));
}

function tkCard(t) {
  const p = poliza(t.polizaId);
  const dias = daysBetween(t.fechaSolicitud || todayISO(), todayISO());
  return `<button class="card tk" type="button" data-act="open-tramite" data-id="${t.id}">
    <span class="tk-top"><span class="tk-code">${esc(t.codigo)}</span><span class="pill ${t.tipo === 'Reclamo' ? 'gold' : ''}">${esc(t.tipo)}</span>${t.etapa === 'rechazado' ? '<span class="pill bad">Rechazado</span>' : ''}</span>
    <b>${esc(clienteNombre(t.clienteId))}</b>
    <span class="muted" style="font-size:.82rem">${esc(t.asunto || '')}</span>
    ${t.numeroReclamo ? `<span class="num">N.º ${esc(t.numeroReclamo)}</span>` : ''}
    <span class="meta">${esc(t.aseguradora || p?.aseguradora || '')}<span class="faint">· ${dias === 0 ? 'hoy' : dias + ' d'}</span>${av(t.responsable, 'sm')}</span>
  </button>`;
}

VIEWS.tramites = () => {
  const f = S.f;
  const list = filtrarTramites();
  const segT = [['todos', 'Todos'], ['reclamos', 'Reclamos'], ['modif', 'Modificaciones'], ['renov', 'Renovaciones'], ['otros', 'Otros']];
  const tools = `
  <div class="toolbar">
    <label class="search"><span class="sr">Buscar trámites</span>${ic('magnifying-glass')}<input type="search" id="tsearch" data-bind="q" placeholder="Código, cliente, número…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Tipo">${segT.map(([k, n]) => `<button type="button" data-act="filter" data-k="tTipo" data-v="${k}" aria-pressed="${f.tTipo === k}">${n}</button>`).join('')}</div>
    <select data-filter="tResp" aria-label="Responsable"><option value="">Los dos</option>${S.users.map(u => `<option value="${esc(u.email)}" ${f.tResp === u.email ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>
    <div class="seg" role="group" aria-label="Vista"><button type="button" data-act="filter" data-k="tVista" data-v="tablero" aria-pressed="${f.tVista === 'tablero'}">${ic('kanban')}<span class="sr">Tablero</span></button><button type="button" data-act="filter" data-k="tVista" data-v="lista" aria-pressed="${f.tVista === 'lista'}">${ic('list-bullets')}<span class="sr">Lista</span></button></div>
    <label class="check"><input type="checkbox" data-filter-check="tCerrados" ${f.tCerrados ? 'checked' : ''}>Ver cerrados</label>
  </div>`;
  let body;
  if (!DB.tramites.length) body = emptyState('folder-open', 'Aún no hay trámites', 'Crea el primero o conviértelo desde un correo en la Bandeja.', `<button class="btn primary" type="button" data-act="new-tramite">${ic('plus')}Nuevo trámite</button>`);
  else if (f.tVista === 'lista') body = tramitesTabla(list);
  else {
    const cols = ETAPAS.filter(e => e.k !== 'cerrado' || f.tCerrados);
    const colors = { recibido: 'var(--info)', ingresado: 'var(--muted)', numero: 'var(--acc)', analisis: 'var(--acc-hi)', pago: 'var(--ok)', cerrado: 'var(--ok)' };
    body = `<div class="board">${cols.map(e => {
      const items = list.filter(t => t.etapa === e.k || (e.k === 'cerrado' && t.etapa === 'rechazado'));
      return `<section class="col" aria-label="${e.n}"><div class="col-h"><span class="dot" style="--c:${colors[e.k]}"></span><h3>${e.n}</h3><span class="n">${items.length}</span></div>
        <div class="col-b">${items.length ? items.map(tkCard).join('') : `<div class="col-empty">${e.k === 'recibido' ? 'Las solicitudes nuevas llegan aquí' : 'Nada en esta etapa'}</div>`}</div></section>`;
    }).join('')}</div>`;
  }
  return head('Trámites', 'Reclamos, modificaciones y renovaciones, desde que llega el correo hasta que el cliente recibe su pago.', `<button class="btn primary" type="button" data-act="new-tramite">${ic('plus')}Nuevo trámite</button>`) + tools + body;
};

function tramitesTabla(list) {
  if (!list.length) return emptyState('funnel', 'Nada con estos filtros', 'Prueba con “Todos” o marca “Ver cerrados”.');
  return `<div class="panel"><div class="table-wrap"><table class="resp"><thead><tr><th>Código</th><th>Cliente</th><th>Tipo</th><th>Aseguradora</th><th>N.º aseguradora</th><th>Etapa</th><th class="r">Días</th><th>Resp.</th></tr></thead><tbody>
  ${list.map(t => `<tr data-act="open-tramite" data-id="${t.id}"><td data-l="Código"><span class="tk-code">${esc(t.codigo)}</span></td><td data-l="Cliente">${esc(clienteNombre(t.clienteId))}<span class="sub">${esc(t.asunto || '')}</span></td><td data-l="Tipo">${esc(t.tipo)}</td><td data-l="Aseguradora">${esc(t.aseguradora || '')}</td><td data-l="N.º">${esc(t.numeroReclamo || '')}</td><td data-l="Etapa">${etapaPill(t)}</td><td class="r tnum" data-l="Días">${daysBetween(t.fechaSolicitud || todayISO(), todayISO())}</td><td data-l="Resp.">${av(t.responsable, 'sm')}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* --- formulario reutilizable --- */
const opt = (list, val, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') + list.map(o => {
  const [v, n] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(n)}</option>`;
}).join('');
const fld = (label, inner, cls = '', hint = '') => `<label class="field ${cls}"><span>${label}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
const inp = (name, val, type = 'text', extra = '') => `<input type="${type}" name="${name}" value="${esc(val ?? '')}" ${extra}>`;
const aseguradoraList = () => `<datalist id="dl-aseg">${[...new Set([...ASEGURADORAS, ...DB.polizas.map(p => p.aseguradora).filter(Boolean)])].map(a => `<option value="${esc(a)}">`).join('')}</datalist>`;
const clienteOpts = sel => opt(DB.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => [c.id, c.nombre]), sel, 'Elige un cliente');
const polizaOpts = (cid, sel) => opt(DB.polizas.filter(p => !cid || p.clienteId === cid).map(p => [p.id, `${p.numero} · ${p.ramo} · ${p.aseguradora}`]), sel, cid ? 'Sin póliza' : 'Elige primero el cliente');
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : +el.value;
    else o[el.name] = el.value.trim();
  }
  return o;
}
function authors(r) {
  if (!r?.creado) return '';
  return `<div class="authors"><span>${av(r.creadoPor, 'sm')}Creó ${esc(firstName(userBy(r.creadoPor)))} · ${fmtDate(r.creado)}</span>${r.actualizadoPor ? `<span>${av(r.actualizadoPor, 'sm')}Último cambio ${esc(firstName(userBy(r.actualizadoPor)))} · ${fmtAgo(r.actualizado)}</span>` : ''}</div>`;
}
function docsBlock(docs, ctx) {
  return `<div class="docs" data-docs="${ctx}">${(docs || []).map((d, i) => `<div class="doc">${ic(/\.(jpe?g|png|webp|heic)$/i.test(d.name) ? 'file' : 'file-pdf')}<span>${esc(d.name)}</span>${d.size ? `<small>${Math.max(1, Math.round(d.size / 1024))} KB</small>` : ''}
    ${d.url || S.mode === 'live' ? `<a class="btn ghost icon sm" href="${esc(docUrl(d))}" target="_blank" rel="noopener" aria-label="Abrir ${esc(d.name)}">${ic('arrow-square-out')}</a>` : ''}
    <button class="btn ghost icon sm" type="button" data-act="doc-del" data-i="${i}" aria-label="Quitar ${esc(d.name)}">${ic('x')}</button></div>`).join('')}
    <label class="drop" data-drop="${ctx}">${ic('upload-simple')}<span>Arrastra PDFs aquí o <u>elige archivos</u></span><input type="file" multiple accept="application/pdf,image/*" hidden data-upload="${ctx}"></label>
  </div>`;
}

/* --- hoja del trámite --- */
let cur = null; // registro que se está editando en la hoja abierta

function openTramite(id, prefill = {}) {
  const t0 = id ? tramite(id) : null;
  const t = t0 ? structuredClone(t0) : {
    id: '', codigo: nextCodigo(), tipo: 'Reclamo', clienteId: '', polizaId: '', aseguradora: '', asunto: '', descripcion: '',
    canal: CANALES[0], etapa: 'recibido', numeroReclamo: '', monto: '', fechaSolicitud: todayISO(), fechaIngreso: '',
    responsable: S.me.email, visibleCliente: true, notaCliente: '', docs: [], eventos: [], ...prefill
  };
  cur = { tabla: 'tramites', row: t, isNew: !t0 };
  const d = openDrawer(tramiteHTML(t, !t0));
  wireTramite(d);
}

function tramiteHTML(t, isNew) {
  const etapas = etapasDe(t.tipo);
  const idx = etapas.findIndex(e => e.k === t.etapa);
  const rech = t.etapa === 'rechazado';
  const nowIdx = rech ? etapas.length - 1 : idx;
  const pagos = DB.pagos.filter(p => p.tramiteId === t.id);
  const next = !rech && idx >= 0 && idx < etapas.length - 1 ? etapas[idx + 1] : null;
  return `
  <div class="drawer-h"><div class="t"><span class="label">${isNew ? 'Nuevo trámite' : esc(t.tipo)} · <span style="color:var(--acc-hi)">${esc(t.codigo)}</span></span>
    <h2>${isNew ? 'Registrar solicitud' : esc(clienteNombre(t.clienteId))}</h2>${!isNew ? `<div class="muted" style="font-size:.86rem;margin-top:4px">${esc(t.asunto || '')}</div>` : ''}</div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b">
    ${!isNew ? `<ol class="steps ${rech ? 'bad' : ''}" aria-label="Etapas">${etapas.map((e, i) => `<li class="${i < nowIdx ? 'done' : i === nowIdx ? 'now' : ''}"><div class="bar"></div><span>${rech && i === nowIdx ? 'Rechazado' : e.n}</span></li>`).join('')}</ol>` : ''}
    <form id="frm" autocomplete="off">
      <div class="sec"><div class="label">Solicitud</div>
        <div class="grid2">
          ${fld('Cliente', `<select name="clienteId" required ${isNew ? 'autofocus' : ''}>${clienteOpts(t.clienteId)}</select>`)}
          ${fld('Póliza', `<select name="polizaId">${polizaOpts(t.clienteId, t.polizaId)}</select>`)}
          ${fld('Tipo', `<select name="tipo">${opt(TIPOS, t.tipo)}</select>`)}
          ${fld('Aseguradora', inp('aseguradora', t.aseguradora, 'text', 'list="dl-aseg"'))}
          ${fld('Asegurado', inp('asegurado', t.asegurado, 'text', 'placeholder="Si es distinto del cliente"'))}
          ${fld('N.º de certificado', inp('certificado', t.certificado))}
          ${fld('Asunto', inp('asunto', t.asunto, 'text', 'placeholder="Ej.: Reembolso de medicamentos de octubre"'), 'full')}
          ${fld('Detalle', `<textarea name="descripcion" placeholder="Lo que pidió el cliente">${esc(t.descripcion)}</textarea>`, 'full')}
        </div>
      </div>
      <div class="sec"><div class="label">Con la aseguradora</div>
        <div class="grid2">
          ${fld('Llegó el', inp('fechaSolicitud', t.fechaSolicitud, 'date'))}
          ${fld('Ingresado el', inp('fechaIngreso', t.fechaIngreso, 'date'))}
          ${fld('Cómo se ingresó', `<select name="canal">${opt(CANALES, t.canal)}</select>`)}
          ${fld('N.º de reclamo o gestión', inp('numeroReclamo', t.numeroReclamo, 'text', 'placeholder="Lo da la aseguradora por correo"'))}
          ${fld('Monto reclamado (US$)', inp('monto', t.monto, 'number', 'step="0.01" min="0" inputmode="decimal"'))}
          ${fld('Responsable', `<select name="responsable">${opt(S.users.map(u => [u.email, u.nombre]), t.responsable)}</select>`)}
          ${isNew ? fld('Etapa inicial', `<select name="etapa">${opt(etapasDe(t.tipo).map(e => [e.k, e.n]), t.etapa)}</select>`) : ''}
        </div>
      </div>
      <div class="sec"><div class="label">Portal del cliente</div>
        <label class="check"><input type="checkbox" name="visibleCliente" ${t.visibleCliente ? 'checked' : ''}>El cliente puede ver este trámite en su enlace</label>
        <div style="margin-top:10px">${fld('Mensaje para el cliente', inp('notaCliente', t.notaCliente, 'text', 'placeholder="Ej.: Tu cheque ya está en nuestra oficina"'), '', 'Lo verá tal cual en su portal.')}</div>
      </div>
    </form>
    <div class="sec"><div class="label">Documentos</div>${docsBlock(t.docs, 'tramite')}</div>
    ${!isNew ? `
    ${pagos.length || t.tipo === 'Reclamo' ? `<div class="sec"><div class="label">Pagos</div>${pagos.length ? `<div class="docs">${pagos.map(p => `<button class="doc" type="button" data-act="open-pago" data-id="${p.id}">${ic('money-wavy')}<span>${esc(p.forma)} ${esc(p.numero || '')} · ${fmtMoney(p.monto)}</span><span class="pill ${PAGO_E[p.estado]?.cls}">${esc(PAGO_E[p.estado]?.n)}</span></button>`).join('')}</div>` : ''}
      <button class="btn sm" type="button" data-act="pago-from-tramite" style="margin-top:8px">${ic('plus')}Registrar cheque o depósito</button></div>` : ''}
    <div class="sec"><div class="label">Seguimiento</div>
      <ol class="tl">${(t.eventos || []).slice().reverse().map(e => `<li class="${e.tipo === 'etapa' ? 'stage' : ''}"><div class="when2">${av(e.por, 'sm')}${esc(firstName(userBy(e.por)))} · ${fmtDate(e.fecha)}, ${fmtTime(e.fecha)}</div><p>${esc(e.texto)}</p></li>`).join('') || '<li><p class="muted">Sin movimientos todavía.</p></li>'}</ol>
      <div class="note-add"><label class="sr" for="note">Nota</label><input type="text" id="note" placeholder="Agregar nota: llamada, visita, lo que dijo la aseguradora…"><button class="btn" type="button" data-act="add-note">Anotar</button></div>
    </div>
    ${authors(t)}` : ''}
    ${aseguradoraList()}
  </div>
  <div class="drawer-f">
    ${!isNew ? `<button class="btn ghost icon" type="button" data-act="tramite-more" aria-label="Más acciones">${ic('dots-three')}</button>` : ''}
    <span class="spacer"></span>
    ${isNew ? `<button class="btn primary" type="button" data-act="tramite-save">${ic('check')}Crear trámite</button>`
      : `<button class="btn" type="button" data-act="tramite-save">Guardar</button>${next ? `<button class="btn primary" type="button" data-act="tramite-advance" data-to="${next.k}">${ic('arrow-right')}${esc(next.n)}</button>` : rech ? `<button class="btn" type="button" data-act="tramite-advance" data-to="analisis">Reabrir</button>` : ''}`}
  </div>`;
}

function wireTramite(d) {
  const f = $('#frm', d);
  f.clienteId.addEventListener('change', () => {
    f.polizaId.innerHTML = polizaOpts(f.clienteId.value, '');
  });
  f.polizaId.addEventListener('change', () => {
    const p = poliza(f.polizaId.value);
    if (p && !f.aseguradora.value) f.aseguradora.value = p.aseguradora;
    if (p) f.aseguradora.value = p.aseguradora;
  });
  f.tipo.addEventListener('change', () => {
    if (f.etapa) f.etapa.innerHTML = opt(etapasDe(f.tipo.value).map(e => [e.k, e.n]), f.etapa.value);
  });
}

function readTramiteForm() {
  const d = drawerEl(); if (!d || !cur) return null;
  const v = formData($('#frm', d));
  Object.assign(cur.row, v);
  return cur.row;
}

async function saveTramite(advanceTo) {
  const t = readTramiteForm();
  if (!t) return;
  if (!t.clienteId) { toast('Elige el cliente', 'err'); $('#frm [name=clienteId]').focus(); return; }
  if (!t.asunto) t.asunto = t.tipo + (poliza(t.polizaId) ? ' ' + poliza(t.polizaId).ramo.toLowerCase() : '');
  const isNew = cur.isNew;
  let resumen = `${t.codigo} ${t.tipo} · ${clienteNombre(t.clienteId)}`;
  let accion;
  t.eventos = t.eventos || [];
  if (isNew) t.eventos.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `${ETAPA[t.etapa]?.n || 'Recibido'}: ${t.asunto}` });
  if (advanceTo) {
    if (advanceTo === 'numero' && !t.numeroReclamo) { toast('Escribe primero el número que dio la aseguradora', 'err'); $('#frm [name=numeroReclamo]').focus(); return; }
    if (advanceTo === 'ingresado' && !t.fechaIngreso) t.fechaIngreso = todayISO();
    const txt = advanceTo === 'numero' ? `Número asignado ${t.numeroReclamo}.` : advanceTo === 'ingresado' ? `Ingresado (${t.canal.toLowerCase()}).` : advanceTo === 'rechazado' ? 'Rechazado por la aseguradora.' : `${ETAPA[advanceTo]?.n}.`;
    t.etapa = advanceTo;
    t.eventos.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: txt });
    resumen = `${t.codigo} a ${advanceTo === 'rechazado' ? 'Rechazado' : ETAPA[advanceTo].n}${advanceTo === 'numero' ? ` (${t.numeroReclamo})` : ''}`;
    accion = 'movió';
  }
  try { await save('tramites', t, resumen, accion); } catch (e) { return; }
  cur.isNew = false;
  if (advanceTo === 'cerrado') celebrate();
  toast(isNew ? `Trámite ${t.codigo} creado` : advanceTo ? `${t.codigo}: ${advanceTo === 'rechazado' ? 'Rechazado' : ETAPA[advanceTo].n}` : 'Cambios guardados');
  if (cur.afterSave) { const fn = cur.afterSave; cur.afterSave = null; await fn(t); }
  render(false);
  const d = drawerEl();
  if (d) { d.innerHTML = tramiteHTML(t, false); wireTramite(d); }
  if (advanceTo === 'pago') { toast('Registra el cheque o depósito', '', { label: 'Registrar', run: () => newPagoFromTramite(t) }); }
}

function newPagoFromTramite(t) {
  openPago(null, { tramiteId: t.id, clienteId: t.clienteId, aseguradora: t.aseguradora, monto: t.monto || '' });
}

function tramiteMoreMenu(btn) {
  const t = cur.row;
  const items = [
    ['rechazado', 'Marcar como rechazado', 'warning'],
    ['copy-link', 'Copiar enlace del cliente', 'link-simple'],
    ['delete', 'Eliminar trámite', 'trash']
  ];
  popMenu(btn, items, async k => {
    if (k === 'rechazado') return saveTramite('rechazado');
    if (k === 'copy-link') return copyPortal(t.clienteId);
    if (k === 'delete') {
      if (!await ask(`¿Eliminar ${t.codigo}? Queda anotado en la bitácora.`, { danger: true, ok: 'Eliminar' })) return;
      await remove('tramites', t.id, `${t.codigo} ${t.tipo} · ${clienteNombre(t.clienteId)}`);
      closeDrawer(); render(false); toast('Trámite eliminado');
    }
  });
}

function popMenu(anchor, items, onPick) {
  $('.popmenu')?.remove();
  const m = document.createElement('div');
  m.className = 'popmenu card';
  m.innerHTML = items.map(([k, n, i]) => `<button type="button" data-k="${k}">${ic(i)}${esc(n)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, r.top - m.offsetHeight - 8) + 'px';
  const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
  m.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; m.remove(); document.removeEventListener('pointerdown', off, true); onPick(b.dataset.k); });
  m.querySelector('button')?.focus();
}

/* ---------- Reclamos: tabla rápida de ingreso ----------
   Una fila arriba para escribir el reclamo nuevo. Nombre, póliza y certificado son listas
   en las que se puede escribir: buscan mientras escribes y llenan lo demás solas. */

const RX_BLANK = () => ({ asegurado: '', clienteId: '', polizaId: '', certificado: '', numero: '', notas: '', docs: [], etapa: 'ingresado', picked: '' });
let RX = RX_BLANK();
try { const d = JSON.parse(sessionStorage.getItem('simevi-rx') || 'null'); if (d) RX = { ...RX_BLANK(), ...d }; } catch (e) { }
const rxKeep = () => { try { sessionStorage.setItem('simevi-rx', JSON.stringify(RX)); } catch (e) { } };

const shortName = n => String(n || '').split(',')[0];
const words = q => norm(q).split(/\s+/).filter(Boolean);
function score(text, q) {
  const t = norm(text), ws = words(q);
  if (!ws.length) return 1;
  if (!ws.every(w => t.includes(w))) return 0;
  return (t.startsWith(ws[0]) ? 3 : 0) + (new RegExp('\\b' + ws[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t) ? 2 : 0) + 1;
}
function mark(label, q) {
  const ws = words(q);
  if (!ws.length) return esc(label);
  const n = norm(label);
  const hits = new Array(label.length).fill(false);
  ws.forEach(w => { let i = n.indexOf(w); while (i >= 0) { for (let j = i; j < i + w.length; j++) hits[j] = true; i = n.indexOf(w, i + 1); } });
  let out = '', open = false;
  [...label].forEach((ch, i) => { if (hits[i] && !open) { out += '<mark>'; open = true; } if (!hits[i] && open) { out += '</mark>'; open = false; } out += esc(ch); });
  return out + (open ? '</mark>' : '');
}

/* Opciones de cada lista */
const CB = {
  nombre(q) {
    const opts = [];
    DB.polizas.filter(p => p.modalidad === 'Colectiva' && !p.cancelada).forEach(p => (p.asegurados || []).forEach(a => {
      if (!a.nombre) return;
      opts.push({ kind: 'aseg', label: a.nombre, sub: `Cert. ${a.certificado || '-'} · ${p.numero} · ${shortName(clienteNombre(p.clienteId))}`, find: `${a.nombre} ${a.documento} ${a.certificado}`, clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '', bonus: p.ramo === 'Gastos médicos' ? 0.5 : 0 });
    }));
    DB.clientes.forEach(c => {
      const n = DB.polizas.filter(p => p.clienteId === c.id && !p.cancelada).length;
      opts.push({ kind: 'cli', label: c.nombre, sub: `${c.tipo} · ${n} ${n === 1 ? 'póliza' : 'pólizas'}`, find: `${c.nombre} ${c.documento}`, clienteId: c.id });
    });
    if (!q) {
      const recent = [...new Set(DB.tramites.filter(t => t.tipo === 'Reclamo').map(t => t.asegurado || clienteNombre(t.clienteId)))].slice(0, 6);
      return recent.map(n => opts.find(o => o.label === n)).filter(Boolean);
    }
    return opts.map(o => ({ ...o, s: score(o.find, q) && score(o.find, q) + (o.bonus || 0) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  },
  poliza(q) {
    return DB.polizas.filter(p => !p.cancelada && (!RX.clienteId || p.clienteId === RX.clienteId))
      .map(p => ({ kind: 'pol', label: p.numero, sub: `${p.ramo} · ${p.aseguradora} · ${shortName(clienteNombre(p.clienteId))}`, find: `${p.numero} ${p.ramo} ${p.aseguradora} ${clienteNombre(p.clienteId)}`, polizaId: p.id, clienteId: p.clienteId }))
      .map(o => ({ ...o, s: score(o.find, q) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  },
  cert(q) {
    const p = poliza(RX.polizaId);
    return (p?.asegurados || []).filter(a => a.certificado || a.nombre)
      .map(a => ({ kind: 'cert', label: a.certificado || '-', sub: a.nombre, find: `${a.certificado} ${a.nombre} ${a.documento}`, nombre: a.nombre }))
      .map(o => ({ ...o, s: score(o.find, q) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  }
};

function pick(name, o) {
  if (name === 'nombre') {
    RX.asegurado = o.label; RX.picked = o.label; RX.clienteId = o.clienteId;
    if (o.kind === 'aseg') { RX.polizaId = o.polizaId; RX.certificado = o.certificado; }
    else {
      const ps = DB.polizas.filter(p => p.clienteId === o.clienteId && !p.cancelada);
      if (!ps.some(p => p.id === RX.polizaId)) RX.polizaId = ps.length === 1 ? ps[0].id : '';
    }
  }
  if (name === 'poliza') {
    RX.polizaId = o.polizaId;
    if (RX.clienteId !== o.clienteId) { RX.clienteId = o.clienteId; if (!RX.asegurado || RX.picked !== RX.asegurado) { RX.asegurado = clienteNombre(o.clienteId); RX.picked = RX.asegurado; } }
  }
  if (name === 'cert') { RX.certificado = o.label; if (!RX.asegurado || RX.asegurado === clienteNombre(RX.clienteId)) { RX.asegurado = o.nombre; RX.picked = o.nombre; } }
  rxKeep();
  syncEntry();
}

/* Pinta en la fila de ingreso lo que ya se sabe */
function syncEntry() {
  const row = $('#rx-new'); if (!row) return;
  const p = poliza(RX.polizaId);
  const set = (id, v) => { const el = $('#' + id, row); if (el && document.activeElement !== el) el.value = v; };
  set('rx-nombre', RX.asegurado);
  set('rx-poliza', p ? p.numero : (RX.polizaTxt || ''));
  set('rx-cert', RX.certificado);
  $('#rx-hint', row).innerHTML = RX.clienteId
    ? `${ic('check-circle')}<span>${esc(shortName(clienteNombre(RX.clienteId)))}${p ? ` · ${esc(p.ramo)} · ${esc(p.aseguradora)}` : ''}</span>`
    : `<span class="faint">Escribe un nombre, DUI o número de póliza</span>`;
  $('#rx-hint', row).classList.toggle('ok', !!RX.clienteId);
  $('#rx-docs-n', row).textContent = RX.docs.length ? RX.docs.length : '';
  $('#rx-pdf', row).classList.toggle('has', RX.docs.length > 0);
  $('#rx-pdf', row).title = RX.docs.map(d => d.name).join('\n') || 'Adjuntar PDF';
}

const comboHTML = (name, id, label, val, ph) => `
  <div class="cb" data-cb="${name}">
    <label class="sr" for="${id}">${label}</label>
    <input id="${id}" type="text" value="${esc(val)}" placeholder="${esc(ph)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false">
    ${ic('caret-up-down', 'cb-caret')}
    <ul class="cb-list card" id="${id}-list" role="listbox" hidden></ul>
  </div>`;

VIEWS.reclamos = () => {
  const f = S.f, q = norm(S.q);
  f.rxVer = f.rxVer || 'abiertos';
  const all = DB.tramites.filter(t => t.tipo === 'Reclamo');
  const list = all.filter(t => {
    if (f.rxVer === 'abiertos' && !tramiteAbierto(t)) return false;
    if (f.rxVer === 'sinnum' && (t.numeroReclamo || !tramiteAbierto(t))) return false;
    if (q && !norm([t.codigo, t.asegurado, clienteNombre(t.clienteId), poliza(t.polizaId)?.numero, t.certificado, t.numeroReclamo, t.descripcion].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
  const sinNum = all.filter(t => tramiteAbierto(t) && !t.numeroReclamo).length;
  const p = poliza(RX.polizaId);
  const seg = [['abiertos', 'Abiertos'], ['sinnum', `Sin número${sinNum ? ' · ' + sinNum : ''}`], ['todos', 'Todos']];

  return head('Reclamos', 'Escribe en la primera fila y pulsa Enter. Nombre, póliza y certificado buscan mientras escribes y se llenan entre sí.') + `
  <div class="rx-entry">
    <span class="rx-title"><span class="greek" aria-hidden="true">ΑΙΤΗΜΑ</span>Nuevo reclamo</span>
    <div class="rx-grid rx-head" aria-hidden="true"><span>Nombre</span><span>Póliza</span><span>Cert.</span><span>PDF</span><span>N.º de reclamo</span><span>Notas</span><span></span></div>
    <form class="rx-grid rx-new" id="rx-new" autocomplete="off">
      <div class="rx-cell" data-l="Nombre">${comboHTML('nombre', 'rx-nombre', 'Nombre del asegurado', RX.asegurado, 'Asegurado o cliente')}</div>
      <div class="rx-cell" data-l="Póliza">${comboHTML('poliza', 'rx-poliza', 'Póliza', p ? p.numero : '', 'Póliza')}</div>
      <div class="rx-cell" data-l="Certificado">${comboHTML('cert', 'rx-cert', 'Número de certificado', RX.certificado, 'Cert.')}</div>
      <div class="rx-cell" data-l="PDF"><label class="btn icon rx-pdf" id="rx-pdf" title="Adjuntar PDF">${ic('paperclip')}<span id="rx-docs-n" class="rx-n"></span><input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="new"></label></div>
      <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="rx-num">Número de reclamo</label><input id="rx-num" type="text" value="${esc(RX.numero)}" placeholder="Opcional" data-rx="numero"></div>
      <div class="rx-cell" data-l="Notas"><label class="sr" for="rx-notas">Notas</label><input id="rx-notas" type="text" value="${esc(RX.notas)}" placeholder="Qué se reclama" data-rx="notas"></div>
      <div class="rx-cell rx-go"><button class="btn primary" type="submit" title="Agregar (Enter)">${ic('plus')}Agregar</button></div>
      <div class="rx-under">
        <span class="rx-hint" id="rx-hint"></span>
        <label class="rx-stage"><span>Queda como</span><select id="rx-etapa" data-rx="etapa">${opt([['recibido', 'Recibido (falta ingresar)'], ['ingresado', 'Ingresado a la aseguradora']], RX.etapa)}</select></label>
        <button class="btn ghost sm" type="button" data-act="rx-clear">Limpiar</button>
      </div>
    </form>
  </div>

  <div class="toolbar" style="margin-top:18px">
    <label class="search"><span class="sr">Buscar reclamos</span>${ic('magnifying-glass')}<input type="search" id="rxsearch" data-bind="q" placeholder="Nombre, póliza, certificado, número…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Ver">${seg.map(([k, n]) => `<button type="button" data-act="filter" data-k="rxVer" data-v="${k}" aria-pressed="${f.rxVer === k}">${n}</button>`).join('')}</div>
  </div>

  <div class="panel rx">
    ${list.length ? `<div class="rx-grid rx-head" aria-hidden="true"><span>Nombre</span><span>Póliza</span><span>Cert.</span><span>PDF</span><span>N.º de reclamo</span><span>Notas</span><span>Etapa</span></div>
    ${list.map(t => {
      const pp = poliza(t.polizaId);
      const nombre = t.asegurado || clienteNombre(t.clienteId);
      return `<div class="rx-grid rx-row" data-id="${t.id}">
        <div class="rx-cell" data-l="Nombre"><b>${esc(nombre)}</b>${nombre !== clienteNombre(t.clienteId) ? `<small>${esc(shortName(clienteNombre(t.clienteId)))}</small>` : `<small>${esc(t.codigo)} · ${fmtShort(t.fechaSolicitud)}</small>`}</div>
        <div class="rx-cell" data-l="Póliza"><b class="tnum" style="font-weight:500">${esc(pp?.numero || '-')}</b><small>${esc(t.aseguradora || '')}</small></div>
        <div class="rx-cell tnum" data-l="Certificado">${esc(t.certificado || '-')}</div>
        <div class="rx-cell rx-docs" data-l="PDF">${(t.docs || []).length ? `<a class="rx-doc" href="${esc(docUrl(t.docs[0]))}" target="_blank" rel="noopener" title="${esc(t.docs.map(d => d.name).join('\n'))}" aria-label="Abrir ${esc(t.docs[0].name)}">${ic('file-pdf')}${t.docs.length > 1 ? `<sup>${t.docs.length}</sup>` : ''}</a>` : ''}<label class="rx-doc add" title="Agregar PDF" aria-label="Agregar PDF">${ic('plus')}<input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="${t.id}"></label></div>
        <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="rn-${t.id}">Número de reclamo de ${esc(nombre)}</label><input id="rn-${t.id}" type="text" class="rx-inline tnum" value="${esc(t.numeroReclamo || '')}" placeholder="Pendiente" data-rinline="numeroReclamo"></div>
        <div class="rx-cell" data-l="Notas"><label class="sr" for="rt-${t.id}">Notas de ${esc(nombre)}</label><input id="rt-${t.id}" type="text" class="rx-inline" value="${esc(t.descripcion || '')}" placeholder="Agregar nota" data-rinline="descripcion"></div>
        <div class="rx-cell rx-end" data-l="Etapa"><button type="button" class="rx-stagebtn" data-act="open-tramite" data-id="${t.id}" title="Abrir ${esc(t.codigo)}">${etapaPill(t)}</button></div>
      </div>`;
    }).join('')}` : `<div class="panel-b">${emptyState('first-aid', all.length ? 'Nada con estos filtros' : 'Aún no hay reclamos', all.length ? 'Prueba con “Todos”.' : 'Escribe el primero en la fila de arriba.')}</div>`}
  </div>`;
};

/* --- comportamiento de las listas (el estado vive en cada caja) --- */
const finePointer = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
function cbOpen(input) {
  const box = input.closest('.cb'); const name = box.dataset.cb; const list = $('.cb-list', box);
  const v = input.value.trim();
  box._opts = CB[name](v); box._active = box._opts.length && v ? 0 : -1;
  if (!box._opts.length) {
    list.innerHTML = v ? `<li class="cb-empty">Sin coincidencias${name === 'nombre' ? `. <button type="button" data-act="rx-new-cliente">Crear cliente “${esc(v)}”</button>` : ''}</li>` : `<li class="cb-empty">${name === 'cert' ? (RX.polizaId ? 'Esta póliza no tiene certificados registrados' : 'Elige primero la póliza') : 'Escribe para buscar'}</li>`;
  } else list.innerHTML = box._opts.map((o, i) => `<li role="option" id="${input.id}-o${i}" data-i="${i}" aria-selected="${i === box._active}"><span class="cb-l">${mark(o.label, v)}</span><span class="cb-s">${mark(o.sub, v)}</span></li>`).join('');
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', box._active >= 0 ? `${input.id}-o${box._active}` : '');
}
function cbClose(box) { if (!box) return; const l = $('.cb-list', box); if (l) l.hidden = true; $('input', box)?.setAttribute('aria-expanded', 'false'); box._active = -1; }
function cbMove(input, d) {
  const box = input.closest('.cb'), list = $('.cb-list', box);
  if (list.hidden) return cbOpen(input);
  const n = box._opts?.length || 0; if (!n) return;
  box._active = ((box._active ?? -1) + d + n) % n;
  $$('li[role=option]', list).forEach((li, i) => li.setAttribute('aria-selected', i === box._active));
  input.setAttribute('aria-activedescendant', `${input.id}-o${box._active}`);
  $(`#${input.id}-o${box._active}`)?.scrollIntoView({ block: 'nearest' });
}
function cbChoose(input, i) {
  const box = input.closest('.cb'); const o = box._opts?.[i]; if (!o) return false;
  pick(box.dataset.cb, o);
  input.value = o.label;
  cbClose(box);
  return true;
}
// Al salir sin elegir: si lo escrito coincide con una sola opción exacta, se toma esa.
function cbAutoMatch(input) {
  const box = input.closest('.cb'); if (!box) return;
  const name = box.dataset.cb, v = input.value.trim();
  if (!v) return;
  if (name === 'nombre' && RX.picked && norm(RX.picked) === norm(v)) return;
  const opts = CB[name](v);
  const exact = opts.filter(o => norm(o.label) === norm(v) || (name === 'nombre' && o.find && norm(o.find).split(' ').includes(norm(v))));
  const only = exact.length === 1 ? exact[0] : (opts.length === 1 && opts[0].s >= 4 ? opts[0] : null);
  if (only) { pick(name, only); input.value = only.label; }
}

document.addEventListener('focusin', e => { const i = e.target.closest?.('.cb input'); if (i && S.route === 'reclamos' && (i.value || finePointer())) cbOpen(i); });
document.addEventListener('focusout', e => {
  const i = e.target.closest?.('.cb input'); if (!i) return;
  setTimeout(() => { const box = i.closest('.cb'); if (box && !box.contains(document.activeElement)) { cbAutoMatch(i); cbClose(box); } }, 120);
});
document.addEventListener('input', e => {
  const i = e.target.closest?.('.cb input');
  if (i) {
    const name = i.closest('.cb').dataset.cb, v = i.value;
    if (name === 'nombre') { RX.asegurado = v; if (norm(v) !== norm(RX.picked)) { RX.picked = ''; if (!v) { RX.clienteId = ''; RX.polizaId = ''; RX.certificado = ''; } } }
    if (name === 'poliza') { RX.polizaTxt = v; if (!v) RX.polizaId = ''; }
    if (name === 'cert') RX.certificado = v;
    rxKeep(); cbOpen(i);
    if (!v && name === 'nombre') syncEntry();
    return;
  }
  const r = e.target.dataset?.rx; if (r) { RX[r] = e.target.value; rxKeep(); }
});
document.addEventListener('keydown', e => {
  const i = e.target.closest?.('.cb input');
  if (!i) return;
  const box = i.closest('.cb'), list = $('.cb-list', box);
  if (e.key === 'ArrowDown') { e.preventDefault(); cbMove(i, 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cbMove(i, -1); }
  else if (e.key === 'Enter' && !list.hidden && box._active >= 0) { e.preventDefault(); cbChoose(i, box._active); focusNext(i); }
  else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); cbClose(box); }
  else if (e.key === 'Tab' && !list.hidden && box._active >= 0 && i.value.trim()) { cbChoose(i, box._active); }
}, true);
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.('.cb-list')) e.preventDefault(); // no perder el foco al tocar la lista
  const li = e.target.closest?.('.cb-list li[role=option]'); if (!li) return;
  const input = $('input', li.closest('.cb'));
  cbChoose(input, +li.dataset.i); focusNext(input);
});
function focusNext(input) {
  // Salta a la siguiente casilla vacía de la fila
  const order = ['rx-nombre', 'rx-poliza', 'rx-cert', 'rx-num', 'rx-notas'];
  const k = order.indexOf(input.id);
  for (const id of order.slice(k + 1)) { const el = $('#' + id); if (el && !el.value) return el.focus(); }
  $('#rx-notas')?.focus();
}

/* --- guardar --- */
document.addEventListener('submit', async e => {
  if (e.target.id !== 'rx-new') return;
  e.preventDefault();
  if (document.activeElement?.closest('.cb')) cbAutoMatch(document.activeElement);
  // Si escribieron una póliza que existe, tomarla
  if (!RX.polizaId && $('#rx-poliza').value.trim()) { const p = DB.polizas.find(x => norm(x.numero) === norm($('#rx-poliza').value)); if (p) pick('poliza', { polizaId: p.id, clienteId: p.clienteId }); }
  RX.numero = $('#rx-num').value.trim(); RX.notas = $('#rx-notas').value.trim(); RX.etapa = $('#rx-etapa').value;
  RX.asegurado = $('#rx-nombre').value.trim(); RX.certificado = $('#rx-cert').value.trim();
  if (!RX.clienteId) { toast('Elige el nombre o la póliza de la lista para saber de qué cliente es', 'err'); $('#rx-nombre').focus(); return; }
  const p = poliza(RX.polizaId);
  const etapa = RX.numero ? 'numero' : RX.etapa;
  const ev = [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: etapa === 'recibido' ? 'Recibido.' : `Ingresado a ${p?.aseguradora || 'la aseguradora'}.` }];
  if (RX.numero) ev.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Número asignado ${RX.numero}.` });
  const t = {
    id: '', codigo: nextCodigo(), tipo: 'Reclamo', clienteId: RX.clienteId, polizaId: RX.polizaId, aseguradora: p?.aseguradora || '',
    asegurado: RX.asegurado || clienteNombre(RX.clienteId), certificado: RX.certificado,
    asunto: `Reclamo de ${RX.asegurado || shortName(clienteNombre(RX.clienteId))}`, descripcion: RX.notas,
    canal: CANALES[0], etapa, numeroReclamo: RX.numero, monto: '', fechaSolicitud: todayISO(), fechaIngreso: etapa === 'recibido' ? '' : todayISO(),
    responsable: S.me.email, visibleCliente: true, notaCliente: '', docs: RX.docs, eventos: ev
  };
  const btn = $('#rx-new [type=submit]'); btn.disabled = true;
  try { await save('tramites', t, `${t.codigo} Reclamo · ${t.asegurado}${t.numeroReclamo ? ' · ' + t.numeroReclamo : ''}`); }
  catch (err) { btn.disabled = false; return; }
  const keepEtapa = RX.etapa;
  RX = RX_BLANK(); RX.etapa = keepEtapa; rxKeep();
  render(false);
  $(`.rx-row[data-id="${t.id}"]`)?.classList.add('rx-flash');
  $('#rx-nombre')?.focus();
  toast(`Reclamo ${t.codigo} agregado`);
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.rinline) {
    const t = tramite(el.closest('.rx-row').dataset.id); if (!t) return;
    const k = el.dataset.rinline, v = el.value.trim();
    if ((t[k] || '') === v) return;
    t[k] = v;
    let accion, resumen = `${t.codigo} ${k === 'numeroReclamo' ? 'número ' + (v || '(borrado)') : 'nota: ' + v.slice(0, 60)}`;
    if (k === 'numeroReclamo' && v && ['recibido', 'ingresado'].includes(t.etapa)) {
      t.etapa = 'numero'; t.fechaIngreso = t.fechaIngreso || todayISO();
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Número asignado ${v}.` }];
      accion = 'movió'; resumen = `${t.codigo} a Número asignado (${v})`;
    }
    try { await save('tramites', t, resumen, accion); el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); toast(accion ? `${t.codigo}: Número asignado` : 'Guardado'); if (accion) render(false); } catch (err) { }
  }
  if (el.dataset.rxUpload) {
    const files = [...el.files]; if (!files.length) return;
    const id = el.dataset.rxUpload;
    const target = id === 'new' ? null : tramite(id);
    const carpeta = clienteNombre(target ? target.clienteId : RX.clienteId) || 'General';
    for (const f of files) {
      try { toast(`Subiendo ${f.name}…`); const d = await uploadFile(f, carpeta); (target ? (target.docs = target.docs || []) : RX.docs).push({ id: d.id, name: d.name || f.name, size: d.size || f.size, url: d.url || '' }); }
      catch (err) { toast(err.message, 'err'); }
    }
    el.value = '';
    if (target) { try { await save('tramites', target, `${target.codigo}: ${files.length} PDF agregado${files.length > 1 ? 's' : ''}`); render(false); toast('PDF agregado'); } catch (err) { } }
    else { rxKeep(); syncEntry(); toast(`${RX.docs.length} PDF listo${RX.docs.length > 1 ? 's' : ''} para el reclamo`); }
  }
});

// Enter en una casilla de la tabla guarda y baja a la siguiente fila
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList?.contains('rx-inline')) return;
  e.preventDefault();
  const k = e.target.dataset.rinline;
  e.target.blur();
  const next = e.target.closest('.rx-row')?.nextElementSibling?.querySelector(`[data-rinline="${k}"]`);
  next?.focus();
});

/* ---------- Pagos (libro de cheques y depósitos) ---------- */
VIEWS.pagos = () => {
  const f = S.f, q = norm(S.q);
  const list = DB.pagos.filter(p => {
    if (f.pEstado === 'pend' && !pagoAbierto(p)) return false;
    if (f.pEstado === 'hechos' && pagoAbierto(p)) return false;
    if (q && !norm([p.numero, p.aseguradora, clienteNombre(p.clienteId), p.folio, tramite(p.tramiteId)?.codigo].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.fechaAviso).localeCompare(String(a.fechaAviso)));
  const pend = DB.pagos.filter(pagoAbierto);
  const mes = todayISO().slice(0, 7);
  const entregMes = DB.pagos.filter(p => !pagoAbierto(p) && String(p.fechaEntregado || '').startsWith(mes));
  const total = list.reduce((a, p) => a + (+p.monto || 0), 0);
  const seg = [['pend', 'Por entregar'], ['hechos', 'Entregados'], ['todos', 'Todos']];
  return head('Pagos', 'El libro de cheques y depósitos en digital. Anota el folio del libro físico para cruzarlos.',
    `<button class="btn" type="button" data-act="export-pagos">${ic('download-simple')}Exportar</button><button class="btn primary" type="button" data-act="new-pago">${ic('plus')}Registrar pago</button>`) + `
  <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:16px">
    <div class="card kpi ${pend.length ? 'alert' : ''}"><span class="label">${ic('hand-coins')}Por entregar</span><b class="tnum">${fmtMoney(pend.reduce((a, p) => a + (+p.monto || 0), 0)).replace('US', '')}<small>· ${pend.length}</small></b></div>
    <div class="card kpi"><span class="label">${ic('check-circle')}Entregado este mes</span><b class="tnum">${fmtMoney(entregMes.reduce((a, p) => a + (+p.monto || 0), 0)).replace('US', '')}<small>· ${entregMes.length}</small></b></div>
  </div>
  <div class="toolbar">
    <label class="search"><span class="sr">Buscar pagos</span>${ic('magnifying-glass')}<input type="search" id="psearch" data-bind="q" placeholder="Cheque, cliente, folio…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Estado">${seg.map(([k, n]) => `<button type="button" data-act="filter" data-k="pEstado" data-v="${k}" aria-pressed="${f.pEstado === k}">${n}</button>`).join('')}</div>
  </div>
  ${list.length ? `<div class="panel"><div class="table-wrap"><table class="resp"><thead><tr><th>Aviso</th><th>Cliente</th><th>Aseguradora</th><th>Forma</th><th class="r">Monto</th><th>Estado</th><th>Folio</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr data-act="open-pago" data-id="${p.id}"><td data-l="Aviso" class="tnum">${fmtShort(p.fechaAviso)}</td><td data-l="Cliente">${esc(clienteNombre(p.clienteId))}${tramite(p.tramiteId) ? `<span class="sub">${esc(tramite(p.tramiteId).codigo)} · ${esc(tramite(p.tramiteId).numeroReclamo || tramite(p.tramiteId).tipo)}</span>` : ''}</td><td data-l="Aseguradora">${esc(p.aseguradora)}</td><td data-l="Forma">${esc(p.forma)}<span class="sub">${esc(p.numero || '')}${p.banco ? ' · ' + esc(p.banco) : ''}</span></td><td class="r" data-l="Monto"><span class="money">${fmtMoney(p.monto)}</span></td><td data-l="Estado"><span class="pill ${PAGO_E[p.estado]?.cls}">${esc(PAGO_E[p.estado]?.n || p.estado)}</span></td><td data-l="Folio" class="tnum">${esc(p.folio || '')}</td><td data-l="">${av(p.actualizadoPor || p.creadoPor, 'sm')}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4" class="hide-m">${list.length} ${list.length === 1 ? 'pago' : 'pagos'}</td><td class="r"><span class="money">${fmtMoney(total)}</span></td><td colspan="3" class="hide-m"></td></tr></tfoot></table></div></div>`
      : emptyState('money-wavy', f.pEstado === 'pend' ? 'No hay pagos por entregar' : 'Sin pagos', 'Cuando llegue un aviso de cheque disponible o de depósito, regístralo aquí o desde la Bandeja.')}`;
};

function openPago(id, prefill = {}) {
  const p0 = id ? byId('pagos', id) : null;
  const p = p0 ? structuredClone(p0) : { id: '', tramiteId: '', clienteId: '', aseguradora: '', forma: 'Cheque', numero: '', banco: '', monto: '', fechaAviso: todayISO(), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: 'disponible', notas: '', ...prefill };
  if (!p0 && p.forma === 'Depósito' && !prefill.estado) p.estado = 'depositado';
  cur = { tabla: 'pagos', row: p, isNew: !p0 };
  const d = openDrawer(pagoHTML(p, !p0));
  const f = $('#frm', d);
  f.clienteId.addEventListener('change', () => { f.tramiteId.innerHTML = tramOpts(f.clienteId.value, ''); });
  f.tramiteId.addEventListener('change', () => { const t = tramite(f.tramiteId.value); if (t) { f.aseguradora.value = t.aseguradora || f.aseguradora.value; if (!f.clienteId.value) f.clienteId.value = t.clienteId; } });
  f.forma.addEventListener('change', () => { if (f.forma.value !== 'Cheque' && f.estado.value === 'disponible') f.estado.value = 'depositado'; });
}
const tramOpts = (cid, sel) => opt(DB.tramites.filter(t => !cid || t.clienteId === cid).map(t => [t.id, `${t.codigo} · ${t.tipo}${t.numeroReclamo ? ' · ' + t.numeroReclamo : ''}`]), sel, 'Sin trámite');

function pagoHTML(p, isNew) {
  const nextE = p.estado === 'disponible' ? 'oficina' : p.estado === 'oficina' ? 'entregado' : null;
  return `
  <div class="drawer-h"><div class="t"><span class="label">${isNew ? 'Nuevo pago' : esc(p.forma)}${p.folio ? ` · folio ${esc(p.folio)}` : ''}</span><h2>${isNew ? 'Registrar cheque o depósito' : `${fmtMoney(p.monto)} · ${esc(clienteNombre(p.clienteId))}`}</h2></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b"><form id="frm" autocomplete="off">
    <div class="sec"><div class="label">Aviso</div><div class="grid2">
      ${fld('Forma', `<select name="forma">${opt(FORMAS, p.forma)}</select>`)}
      ${fld('Monto (US$)', inp('monto', p.monto, 'number', `step="0.01" min="0" inputmode="decimal" ${isNew ? 'autofocus' : ''}`))}
      ${fld('Cliente', `<select name="clienteId">${clienteOpts(p.clienteId)}</select>`)}
      ${fld('Trámite', `<select name="tramiteId">${tramOpts(p.clienteId, p.tramiteId)}</select>`)}
      ${fld('Aseguradora', inp('aseguradora', p.aseguradora, 'text', 'list="dl-aseg"'))}
      ${fld('N.º de cheque o referencia', inp('numero', p.numero))}
      ${fld('Banco', inp('banco', p.banco, 'text', 'placeholder="Banco Agrícola, Cuscatlán…"'))}
      ${fld('Fecha del aviso', inp('fechaAviso', p.fechaAviso, 'date'))}
    </div></div>
    <div class="sec"><div class="label">Entrega</div><div class="grid2">
      ${fld('Estado', `<select name="estado">${opt(PAGO_ESTADOS.map(e => [e.k, e.n]), p.estado)}</select>`)}
      ${fld('Folio en el libro', inp('folio', p.folio, 'text', 'inputmode="numeric" placeholder="Página del libro contable"'))}
      ${fld('Recogido el', inp('fechaRecogido', p.fechaRecogido, 'date'))}
      ${fld('Entregado o depositado el', inp('fechaEntregado', p.fechaEntregado, 'date'))}
      ${fld('Recibió', inp('entregadoA', p.entregadoA, 'text', 'placeholder="Nombre de quien recibió o cuenta"'), 'full')}
      ${fld('Notas', `<textarea name="notas">${esc(p.notas)}</textarea>`, 'full')}
    </div></div>
  </form>${authors(p)}${aseguradoraList()}</div>
  <div class="drawer-f">
    ${!isNew ? `<button class="btn ghost icon" type="button" data-act="pago-del" aria-label="Eliminar pago">${ic('trash')}</button>` : ''}
    <span class="spacer"></span>
    <button class="btn ${nextE && !isNew ? '' : 'primary'}" type="button" data-act="pago-save">${isNew ? ic('check') + 'Registrar' : 'Guardar'}</button>
    ${!isNew && nextE ? `<button class="btn primary" type="button" data-act="pago-save" data-to="${nextE}">${ic('arrow-right')}${nextE === 'oficina' ? 'Ya lo recogí' : 'Marcar entregado'}</button>` : ''}
  </div>`;
}

async function savePago(to) {
  const d = drawerEl(); if (!d) return;
  const p = Object.assign(cur.row, formData($('#frm', d)));
  if (!(+p.monto > 0)) { toast('Escribe el monto', 'err'); $('#frm [name=monto]').focus(); return; }
  if (!p.clienteId) { toast('Elige el cliente', 'err'); $('#frm [name=clienteId]').focus(); return; }
  const isNew = cur.isNew;
  if (to === 'oficina') { p.estado = 'oficina'; p.fechaRecogido = p.fechaRecogido || todayISO(); }
  if (to === 'entregado') {
    const quien = await ask('¿Quién recibió el cheque?', { value: p.entregadoA || clienteNombre(p.clienteId), ok: 'Marcar entregado' });
    if (quien === null) return;
    p.estado = 'entregado'; p.fechaEntregado = p.fechaEntregado || todayISO(); p.entregadoA = quien;
  }
  if (p.estado === 'depositado' && !p.fechaEntregado) p.fechaEntregado = p.fechaAviso || todayISO();
  const desc = `${p.forma} ${p.numero || ''} por ${fmtMoney(p.monto)} (${clienteNombre(p.clienteId).split(',')[0]})`.replace(/\s+/g, ' ');
  try { await save('pagos', p, to ? `${desc}: ${PAGO_E[p.estado].n.toLowerCase()}` : desc, to ? 'movió' : undefined); } catch (e) { return; }
  if (cur.afterSave) { const fn = cur.afterSave; cur.afterSave = null; await fn(p); }
  // El trámite ligado avanza solo
  const t = tramite(p.tramiteId);
  if (t && isNew && tramiteAbierto(t) && t.etapa !== 'pago') {
    t.etapa = 'pago'; t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `${p.forma} disponible por ${fmtMoney(p.monto)}.` }];
    await save('tramites', t, `${t.codigo} a Pago disponible`, 'movió').catch(() => { });
  }
  if (t && !pagoAbierto(p) && tramiteAbierto(t)) {
    t.etapa = 'cerrado'; t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `${p.estado === 'depositado' ? 'Depositado' : 'Entregado a ' + p.entregadoA}. Cerrado.` }];
    await save('tramites', t, `${t.codigo} a Cerrado`, 'movió').catch(() => { });
  }
  if (!pagoAbierto(p) && (to || isNew)) celebrate();
  closeDrawer(); render(false);
  toast(isNew ? 'Pago registrado' : to ? `Pago: ${PAGO_E[p.estado].n}` : 'Cambios guardados');
}

function exportPagos() {
  const cols = ['fechaAviso', 'cliente', 'tramite', 'aseguradora', 'forma', 'numero', 'banco', 'monto', 'estado', 'fechaRecogido', 'fechaEntregado', 'entregadoA', 'folio', 'notas'];
  const rows = DB.pagos.map(p => ({ ...p, cliente: clienteNombre(p.clienteId), tramite: tramite(p.tramiteId)?.codigo || '', estado: PAGO_E[p.estado]?.n || p.estado }));
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `SIMEVI pagos ${todayISO()}.csv`; a.click();
}

/* ---------- Pólizas ---------- */
VIEWS.polizas = () => {
  const f = S.f, q = norm(S.q);
  const list = DB.polizas.filter(p => {
    if (f.polMod === 'ind' && p.modalidad !== 'Individual') return false;
    if (f.polMod === 'col' && p.modalidad !== 'Colectiva') return false;
    if (f.polRamo && p.ramo !== f.polRamo) return false;
    const d = diasPoliza(p);
    if (f.polEst === 'vigentes' && (p.cancelada || d === null || d < 0)) return false;
    if (f.polEst === 'por-vencer' && (p.cancelada || d === null || d < 0 || d > 45)) return false;
    if (f.polEst === 'vencidas' && !(d !== null && d < 0)) return false;
    if (q && !norm([p.numero, p.aseguradora, p.ramo, clienteNombre(p.clienteId), ...(p.asegurados || []).map(a => a.nombre + ' ' + a.documento)].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => (diasPoliza(a) ?? 9999) - (diasPoliza(b) ?? 9999));
  const seg = [['todas', 'Todas'], ['ind', 'Individuales'], ['col', 'Colectivas']];
  return head('Pólizas', 'Individuales y colectivas, con vigencia, prima y la lista de asegurados.', `<button class="btn primary" type="button" data-act="new-poliza">${ic('plus')}Nueva póliza</button>`) + `
  <div class="toolbar">
    <label class="search"><span class="sr">Buscar pólizas</span>${ic('magnifying-glass')}<input type="search" id="polsearch" data-bind="q" placeholder="Número, cliente o asegurado…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Modalidad">${seg.map(([k, n]) => `<button type="button" data-act="filter" data-k="polMod" data-v="${k}" aria-pressed="${f.polMod === k}">${n}</button>`).join('')}</div>
    <select data-filter="polRamo" aria-label="Ramo">${opt(RAMOS, f.polRamo, 'Todos los ramos')}</select>
    <select data-filter="polEst" aria-label="Vigencia">${opt([['vigentes', 'Vigentes'], ['por-vencer', 'Vencen en 45 días'], ['vencidas', 'Vencidas']], f.polEst, 'Cualquier vigencia')}</select>
  </div>
  ${list.length ? `<div class="cards">${list.map(p => {
    const e = polizaEstado(p);
    const tot = p.vigenciaDesde && p.vigenciaHasta ? Math.max(1, daysBetween(p.vigenciaDesde, p.vigenciaHasta)) : 0;
    const pas = tot ? Math.min(1, Math.max(0, daysBetween(p.vigenciaDesde, todayISO()) / tot)) : 0;
    return `<button class="card pcard" type="button" data-act="open-poliza" data-id="${p.id}">
      <span class="row"><span class="num">${esc(p.numero)}</span><span class="pill ${e.cls}">${esc(e.n)}</span></span>
      <h3>${esc(clienteNombre(p.clienteId))}</h3>
      <span class="meta"><span>${esc(p.ramo)}</span><span>${esc(p.aseguradora)}</span><span>${esc(p.modalidad)}${p.modalidad === 'Colectiva' ? ` · ${(p.asegurados || []).length} asegurados` : ''}</span></span>
      <span class="vig ${e.cls}" role="img" aria-label="Vigencia ${Math.round(pas * 100)}% transcurrida"><i style="width:${pas * 100}%"></i></span>
      <span class="meta"><span>${fmtDate(p.vigenciaDesde)} al ${fmtDate(p.vigenciaHasta)}</span><span class="money" style="margin-left:auto">${fmtMoney(p.prima)}<span class="faint" style="font:400 .74rem var(--f-body)"> ${esc((p.frecuencia || '').toLowerCase())}</span></span></span>
    </button>`;
  }).join('')}</div>` : emptyState('shield-check', DB.polizas.length ? 'Nada con estos filtros' : 'Aún no hay pólizas', DB.polizas.length ? 'Prueba quitando un filtro.' : 'Registra la primera para ligarle trámites y pagos.', `<button class="btn primary" type="button" data-act="new-poliza">${ic('plus')}Nueva póliza</button>`)}`;
};

function openPoliza(id, prefill = {}) {
  const p0 = id ? poliza(id) : null;
  const p = p0 ? structuredClone(p0) : { id: '', numero: '', aseguradora: '', ramo: 'Vida', modalidad: 'Individual', clienteId: '', vigenciaDesde: todayISO(), vigenciaHasta: addDays(todayISO(), 365), prima: '', frecuencia: 'Mensual', suma: '', notas: '', asegurados: [], docs: [], cancelada: false, ...prefill };
  cur = { tabla: 'polizas', row: p, isNew: !p0 };
  const d = openDrawer(polizaHTML(p, !p0));
  wirePoliza(d);
}
function polizaHTML(p, isNew) {
  const e = polizaEstado(p);
  const tr = DB.tramites.filter(t => t.polizaId === p.id && p.id);
  return `
  <div class="drawer-h"><div class="t"><span class="label">${isNew ? 'Nueva póliza' : `${esc(p.modalidad)} · ${esc(p.ramo)}`}</span><h2>${isNew ? 'Registrar póliza' : esc(p.numero)}</h2>${!isNew ? `<div style="margin-top:6px;display:flex;gap:8px;align-items:center"><span class="pill ${e.cls}">${esc(e.n)}</span><span class="muted" style="font-size:.84rem">${esc(clienteNombre(p.clienteId))}</span></div>` : ''}</div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b"><form id="frm" autocomplete="off">
    <div class="sec"><div class="label">Póliza</div>
      <div class="seg" role="group" aria-label="Modalidad" style="margin-bottom:14px">${['Individual', 'Colectiva'].map(m => `<button type="button" data-act="pol-mod" data-v="${m}" aria-pressed="${p.modalidad === m}">${m}</button>`).join('')}</div>
      <input type="hidden" name="modalidad" value="${esc(p.modalidad)}">
      <div class="grid2">
        ${fld('Número de póliza', inp('numero', p.numero, 'text', isNew ? 'autofocus' : ''))}
        ${fld('Aseguradora', inp('aseguradora', p.aseguradora, 'text', 'list="dl-aseg"'))}
        ${fld('Ramo', `<select name="ramo">${opt(RAMOS, p.ramo)}</select>`)}
        ${fld(p.modalidad === 'Colectiva' ? 'Contratante' : 'Cliente', `<select name="clienteId">${clienteOpts(p.clienteId)}</select>`)}
        ${fld('Vigencia desde', inp('vigenciaDesde', p.vigenciaDesde, 'date'))}
        ${fld('Vigencia hasta', inp('vigenciaHasta', p.vigenciaHasta, 'date'))}
        ${fld('Prima (US$)', inp('prima', p.prima, 'number', 'step="0.01" min="0" inputmode="decimal"'))}
        ${fld('Forma de pago', `<select name="frecuencia">${opt(FRECUENCIAS, p.frecuencia)}</select>`)}
        ${fld('Suma asegurada (US$)', inp('suma', p.suma, 'number', 'step="0.01" min="0" inputmode="decimal"'))}
        <div class="field" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="cancelada" ${p.cancelada ? 'checked' : ''}>Póliza cancelada</label></div>
        ${fld('Notas', `<textarea name="notas" placeholder="Coberturas, deducibles, beneficiarios…">${esc(p.notas)}</textarea>`, 'full')}
      </div>
    </div>
  </form>
  <div class="sec" id="ins-sec" ${p.modalidad === 'Colectiva' ? '' : 'hidden'}><div class="label">Asegurados <span class="faint">${(p.asegurados || []).length}</span></div>
    <div class="table-wrap"><table class="ins-table"><thead><tr><th>Nombre</th><th>DUI / doc.</th><th>Certificado</th><th>Plan</th><th></th></tr></thead><tbody id="ins-body">${insRows(p.asegurados)}</tbody></table></div>
    <button class="btn sm" type="button" data-act="ins-add" style="margin-top:10px">${ic('user-plus')}Agregar asegurado</button>
  </div>
  <div class="sec"><div class="label">Documentos</div>${docsBlock(p.docs, 'poliza')}</div>
  ${!isNew ? `<div class="sec"><div class="label">Trámites de esta póliza</div>${tr.length ? `<div class="docs">${tr.map(t => `<button class="doc" type="button" data-act="open-tramite" data-id="${t.id}">${ic('folder-open')}<span>${esc(t.codigo)} · ${esc(t.tipo)} · ${esc(t.asunto || '')}</span>${etapaPill(t)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0 0 8px;font-size:.86rem">Sin trámites todavía.</p>'}
    <button class="btn sm" type="button" data-act="tramite-from-poliza" style="margin-top:8px">${ic('plus')}Nuevo trámite</button></div>${authors(p)}` : ''}
  ${aseguradoraList()}</div>
  <div class="drawer-f">${!isNew ? `<button class="btn ghost icon" type="button" data-act="poliza-del" aria-label="Eliminar póliza">${ic('trash')}</button>` : ''}<span class="spacer"></span><button class="btn primary" type="button" data-act="poliza-save">${ic('check')}${isNew ? 'Registrar' : 'Guardar'}</button></div>`;
}
const insRows = list => (list || []).map((a, i) => `<tr data-i="${i}">
  <td><input type="text" data-ins="nombre" value="${esc(a.nombre)}" aria-label="Nombre"></td><td><input type="text" data-ins="documento" value="${esc(a.documento)}" aria-label="Documento"></td>
  <td><input type="text" data-ins="certificado" value="${esc(a.certificado)}" aria-label="Certificado" style="width:90px"></td><td><input type="text" data-ins="plan" value="${esc(a.plan)}" aria-label="Plan"></td>
  <td><button class="btn ghost icon sm" type="button" data-act="ins-del" aria-label="Quitar">${ic('x')}</button></td></tr>`).join('');
function readIns() {
  return $$('#ins-body tr').map(tr => Object.fromEntries($$('[data-ins]', tr).map(i => [i.dataset.ins, i.value.trim()]))).filter(a => a.nombre || a.documento);
}
function wirePoliza(d) { }

async function savePoliza() {
  const d = drawerEl(); if (!d) return;
  const p = Object.assign(cur.row, formData($('#frm', d)));
  p.asegurados = p.modalidad === 'Colectiva' ? readIns() : [];
  if (!p.numero) { toast('Escribe el número de póliza', 'err'); $('#frm [name=numero]').focus(); return; }
  if (!p.clienteId) { toast('Elige el cliente', 'err'); $('#frm [name=clienteId]').focus(); return; }
  const dup = DB.polizas.find(x => x.numero === p.numero && x.id !== p.id);
  if (dup && !await ask(`Ya existe la póliza ${p.numero}. ¿Guardar de todos modos?`)) return;
  const isNew = cur.isNew;
  try { await save('polizas', p, `${p.numero} ${p.ramo} · ${clienteNombre(p.clienteId).split(',')[0]}`); } catch (e) { return; }
  closeDrawer(); render(false); toast(isNew ? 'Póliza registrada' : 'Póliza guardada');
}

/* ---------- Clientes ---------- */
VIEWS.clientes = () => {
  const q = norm(S.q);
  const list = DB.clientes.filter(c => !q || norm([c.nombre, c.documento, c.correo, c.telefono, c.contacto].join(' ')).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return head('Clientes', 'Cada cliente tiene un enlace privado para ver cómo van sus trámites.', `<button class="btn primary" type="button" data-act="new-cliente">${ic('user-plus')}Nuevo cliente</button>`) + `
  <div class="toolbar"><label class="search"><span class="sr">Buscar clientes</span>${ic('magnifying-glass')}<input type="search" id="csearch" data-bind="q" placeholder="Nombre, DUI/NIT, correo…" value="${esc(S.q)}"></label></div>
  ${list.length ? `<div class="cards">${list.map(c => {
    const pol = DB.polizas.filter(p => p.clienteId === c.id && !p.cancelada && (diasPoliza(p) ?? 1) >= 0).length;
    const ab = DB.tramites.filter(t => t.clienteId === c.id && tramiteAbierto(t)).length;
    return `<button class="card pcard" type="button" data-act="open-cliente" data-id="${c.id}">
      <span class="row"><span class="pill ${c.tipo === 'Empresa' ? 'info' : ''}">${ic(c.tipo === 'Empresa' ? 'buildings' : 'user')}${esc(c.tipo)}</span>${sparkles(pol)}</span>
      <h3>${esc(c.nombre)}</h3>
      <span class="meta">${c.contacto ? `<span>${esc(c.contacto)}</span>` : ''}<span>${esc(c.telefono || '')}</span><span>${esc(c.correo || '')}</span></span>
      <span class="meta"><span>${pol} ${pol === 1 ? 'póliza vigente' : 'pólizas vigentes'}</span><span>${ab} ${ab === 1 ? 'trámite abierto' : 'trámites abiertos'}</span></span>
    </button>`;
  }).join('')}</div>` : emptyState('users', DB.clientes.length ? 'Sin coincidencias' : 'Aún no hay clientes', DB.clientes.length ? 'Prueba con otra palabra.' : 'Agrega el primero.', `<button class="btn primary" type="button" data-act="new-cliente">${ic('user-plus')}Nuevo cliente</button>`)}`;
};

const portalUrl = c => S.mode === 'live' ? `${location.origin}/c/${c.portal}` : `${location.href.split('#')[0]}#/c/${c.portal}`;
async function copyPortal(cid) {
  const c = cliente(cid); if (!c) return;
  if (!c.portal) { c.portal = token(); await save('clientes', c, `${c.nombre}: enlace del portal creado`); }
  const url = portalUrl(c);
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado. Envíaselo al cliente por WhatsApp o correo.'); }
  catch (e) { await ask('Copia este enlace y envíaselo al cliente:', { value: url, ok: 'Listo', cancel: 'Cerrar' }); }
}

function openCliente(id, prefill = {}) {
  const c0 = id ? cliente(id) : null;
  const c = c0 ? structuredClone(c0) : { id: '', nombre: '', tipo: 'Persona', documento: '', contacto: '', correo: '', telefono: '', notas: '', portal: token(), ...prefill };
  cur = { tabla: 'clientes', row: c, isNew: !c0 };
  const isNew = !c0;
  const pol = DB.polizas.filter(p => p.clienteId === c.id && c.id);
  const tr = DB.tramites.filter(t => t.clienteId === c.id && c.id);
  const pg = DB.pagos.filter(p => p.clienteId === c.id && c.id);
  openDrawer(`
  <div class="drawer-h"><div class="t"><span class="label">${isNew ? 'Nuevo cliente' : esc(c.tipo)}</span><h2>${isNew ? 'Registrar cliente' : esc(c.nombre)}</h2></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b"><form id="frm" autocomplete="off">
    <div class="sec"><div class="label">Datos</div><div class="grid2">
      ${fld('Nombre o razón social', inp('nombre', c.nombre, 'text', isNew ? 'autofocus' : ''), 'full')}
      ${fld('Tipo', `<select name="tipo">${opt(['Persona', 'Empresa'], c.tipo)}</select>`)}
      ${fld('DUI / NIT', inp('documento', c.documento))}
      ${fld('Correo', inp('correo', c.correo, 'email'), '', 'Sirve para reconocer sus correos en la Bandeja.')}
      ${fld('Teléfono', inp('telefono', c.telefono, 'tel'))}
      ${fld('Persona de contacto', inp('contacto', c.contacto, 'text', 'placeholder="Para empresas"'), 'full')}
      ${fld('Notas', `<textarea name="notas">${esc(c.notas)}</textarea>`, 'full')}
    </div></div>
  </form>
  ${!isNew ? `
  <div class="sec"><div class="label">Portal del cliente</div>
    <p class="muted" style="margin:0 0 10px;font-size:.86rem">Con este enlace ve sus trámites marcados como visibles y sus cheques listos. No necesita contraseña, así que compártelo solo con el cliente.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-act="portal-copy" data-id="${c.id}">${ic('copy')}Copiar enlace</button><a class="btn" ${S.mode === 'live' ? `href="/c/${esc(c.portal)}" target="_blank" rel="noopener"` : `href="#/c/${esc(c.portal)}"`}>${ic('eye')}Ver como cliente</a><button class="btn ghost" type="button" data-act="portal-reset">${ic('arrows-clockwise')}Cambiar enlace</button></div>
  </div>
  <div class="sec"><div class="label">Pólizas <span class="faint">${pol.length}</span></div>${pol.length ? `<div class="docs">${pol.map(p => `<button class="doc" type="button" data-act="open-poliza" data-id="${p.id}">${ic('shield-check')}<span>${esc(p.numero)} · ${esc(p.ramo)} · ${esc(p.aseguradora)}</span><span class="pill ${polizaEstado(p).cls}">${esc(polizaEstado(p).n)}</span></button>`).join('')}</div>` : ''}
    <button class="btn sm" type="button" data-act="poliza-from-cliente" style="margin-top:8px">${ic('plus')}Nueva póliza</button></div>
  <div class="sec"><div class="label">Trámites <span class="faint">${tr.length}</span></div>${tr.length ? `<div class="docs">${tr.map(t => `<button class="doc" type="button" data-act="open-tramite" data-id="${t.id}">${ic('folder-open')}<span>${esc(t.codigo)} · ${esc(t.tipo)} · ${esc(t.asunto || '')}</span>${etapaPill(t)}</button>`).join('')}</div>` : ''}
    <button class="btn sm" type="button" data-act="tramite-from-cliente" style="margin-top:8px">${ic('plus')}Nuevo trámite</button></div>
  ${pg.length ? `<div class="sec"><div class="label">Pagos</div><div class="docs">${pg.map(p => `<button class="doc" type="button" data-act="open-pago" data-id="${p.id}">${ic('money-wavy')}<span>${esc(p.forma)} ${esc(p.numero || '')} · ${fmtMoney(p.monto)} · ${fmtShort(p.fechaAviso)}</span><span class="pill ${PAGO_E[p.estado]?.cls}">${esc(PAGO_E[p.estado]?.n)}</span></button>`).join('')}</div></div>` : ''}
  ${authors(c)}` : ''}
  </div>
  <div class="drawer-f">${!isNew ? `<button class="btn ghost icon" type="button" data-act="cliente-del" aria-label="Eliminar cliente">${ic('trash')}</button>` : ''}<span class="spacer"></span><button class="btn primary" type="button" data-act="cliente-save">${ic('check')}${isNew ? 'Registrar' : 'Guardar'}</button></div>`);
}

async function saveCliente() {
  const d = drawerEl(); if (!d) return;
  const c = Object.assign(cur.row, formData($('#frm', d)));
  if (!c.nombre) { toast('Escribe el nombre', 'err'); $('#frm [name=nombre]').focus(); return; }
  const isNew = cur.isNew;
  try { await save('clientes', c, c.nombre); } catch (e) { return; }
  if (cur.afterSave) { const fn = cur.afterSave; cur.afterSave = null; closeDrawer(true); render(false); return fn(c); }
  closeDrawer(); render(false); toast(isNew ? 'Cliente registrado' : 'Cliente guardado');
}

/* ---------- Portal del cliente ---------- */
async function renderPortal(tok) {
  const root = $('#root');
  root.innerHTML = `<div class="portal"><div class="skel" style="width:40%;margin:40px 0 16px"></div><div class="skel" style="width:70%"></div></div>`;
  let data;
  if (S.mode === 'live' || location.pathname.startsWith('/c/')) {
    try { const r = await fetch('/api/portal?t=' + encodeURIComponent(tok)); data = await r.json(); if (!r.ok) throw new Error(data.message); }
    catch (e) { data = { error: e.message || 'Enlace no válido' }; }
  } else {
    const c = DB.clientes.find(x => x.portal === tok);
    data = c ? {
      cliente: { nombre: c.nombre },
      tramites: DB.tramites.filter(t => t.clienteId === c.id && t.visibleCliente).map(t => ({ ...t, poliza: poliza(t.polizaId)?.numero || '' })),
      pagos: DB.pagos.filter(p => p.clienteId === c.id && pagoAbierto(p))
    } : { error: 'Este enlace no existe o fue cambiado.' };
  }
  const staff = S.me && S.mode === 'demo';
  if (data.error) {
    root.innerHTML = `<div class="portal"><div class="portal-top"><img src="img/logo-full.webp" alt="SIMEVI Corredores de Seguros"></div><div class="panel panel-b">${emptyState('link-simple', 'Enlace no disponible', esc(data.error) + ' Pide uno nuevo a SIMEVI.')}</div></div>`;
    return;
  }
  const abiertos = data.tramites.filter(t => t.etapa !== 'cerrado' && t.etapa !== 'rechazado');
  const cerrados = data.tramites.filter(t => !abiertos.includes(t));
  const card = t => {
    const et = etapasDe(t.tipo); const rech = t.etapa === 'rechazado';
    const idx = rech ? et.length - 1 : et.findIndex(e => e.k === t.etapa);
    return `<article class="panel ptk"><div class="row"><div><span class="label">${esc(t.tipo)}${t.numeroReclamo ? ` · N.º ${esc(t.numeroReclamo)}` : ''}</span><h3>${esc(t.asunto || t.tipo)}</h3></div><span class="pill ${rech ? 'bad' : t.etapa === 'cerrado' || t.etapa === 'pago' ? 'ok' : 'gold'}">${rech ? 'No aprobado' : esc(ETAPA[t.etapa]?.c || '')}</span></div>
      <ol class="steps ${rech ? 'bad' : ''}" style="margin-top:14px">${et.map((e, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><div class="bar"></div><span>${esc(e.c)}</span></li>`).join('')}</ol>
      ${t.notaCliente ? `<p style="margin:4px 0 8px">${esc(t.notaCliente)}</p>` : ''}
      <div class="muted" style="font-size:.8rem">${esc(t.aseguradora || '')}${t.poliza ? ` · Póliza ${esc(t.poliza)}` : ''} · Actualizado ${fmtDate(t.actualizado)}</div></article>`;
  };
  root.innerHTML = `<div class="portal enter">
    <div class="portal-top"><img src="img/logo-full.webp" alt="SIMEVI Corredores de Seguros">${staff ? `<button class="btn sm" type="button" data-act="portal-back">${ic('caret-left')}Volver a la app</button>` : ''}</div>
    <span class="greek" aria-hidden="true">ΕΙΡΗΝΗ ΥΜΙΝ</span>
    <h1 style="margin:8px 0 6px">Hola, ${esc(String(data.cliente.nombre).split(/,| S\.A\./)[0])}</h1>
    <p class="muted" style="margin:0 0 24px">Aquí puedes ver en qué va cada gestión que hacemos por ti con tu aseguradora.</p>
    ${(data.pagos || []).map(p => `<div class="banner">${ic('hand-coins')}<span>${p.forma === 'Cheque' ? `Tu cheque de ${esc(p.aseguradora)} por <b>${fmtMoney(p.monto)}</b> ${p.estado === 'oficina' ? 'ya está en nuestra oficina. Te avisamos para coordinar la entrega.' : 'está listo; vamos a recogerlo por ti.'}` : `${esc(p.aseguradora)} depositó <b>${fmtMoney(p.monto)}</b>.`}</span></div>`).join('')}
    ${abiertos.length ? abiertos.map(card).join('') : `<div class="panel panel-b">${emptyState('check-circle', 'Sin gestiones en curso', 'Cuando tengamos algo en trámite por ti, lo verás aquí.')}</div>`}
    ${cerrados.length ? `<h2 style="margin:28px 0 12px">TERMINADOS</h2>${cerrados.map(card).join('')}` : ''}
    <p class="faint" style="margin-top:30px;font-size:.8rem">SIMEVI Corredores de Seguros · Silvia de Díaz y Ricardo Vega. ¿Dudas? Escríbenos al correo o WhatsApp de siempre.</p>
  </div>`;
}

/* ---------- Bandeja de Gmail ---------- */
const DOMINIOS = { sisa: 'SISA', asesuisa: 'ASESUISA', pacifico: 'Seguros del Pacífico', mapfre: 'MAPFRE La Centro Americana', fedecredito: 'Seguros Fedecrédito', palig: 'Pan-American Life', panamerican: 'Pan-American Life', segurosazul: 'Seguros Azul', azul: 'Seguros Azul', davivienda: 'Davivienda Seguros', assa: 'ASSA', futuro: 'Seguros Futuro', acsa: 'Aseguradora Agrícola Comercial', atlantida: 'Atlántida Vida', qualitas: 'Quálitas' };
const DEFAULT_GMAIL_Q = 'newer_than:30d -category:promotions -category:social -category:updates';
const mailDone = m => DB.correos.some(c => c.id === m.id);

function aseguradoraDeCorreo(from) {
  const dom = norm(String(from).split('@')[1] || '');
  for (const k in DOMINIOS) if (dom.includes(k)) return DOMINIOS[k];
  return '';
}

/* Lee el correo y adivina qué es y a quién pertenece. No guarda nada: solo sugiere. */
function classify(m) {
  const txt = `${m.subject || ''} \n ${m.snippet || ''} \n ${m.body || ''}`;
  const r = { kind: 'solicitud', aseguradora: aseguradoraDeCorreo(m.from) };
  const money = txt.match(/(?:US)?\$\s?([\d.,]+\d)/);
  if (money) r.monto = +money[1].replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '');
  const pol = [...txt.matchAll(/p[oó]liza\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*([A-Z]{0,5}[A-Z0-9-]*\d[A-Z0-9-]*)/gi)].map(x => x[1].replace(/-+$/, '')).find(x => x.length >= 4);
  if (pol) r.polizaNum = pol.toUpperCase();
  const cheque = txt.match(/cheque\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*(\d{5,})/i);
  const ref = txt.match(/referencia\s*:?\s*([A-Z0-9-]{5,})/i);
  // Número de reclamo: se prefiere "número de reclamo X" y se descartan números de póliza conocidos.
  const polizas = new Set(DB.polizas.map(p => norm(p.numero)).concat(r.polizaNum ? [norm(r.polizaNum)] : []));
  const cands = [...txt.matchAll(/(n[uú]mero\s+de\s+)?(?:reclamo|siniestro|caso|gesti[oó]n)\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*([A-Z]{1,6}-[A-Z0-9-]*\d[A-Z0-9-]*|\d{5,})/gi)]
    .filter(x => !polizas.has(norm(x[2])))
    .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0));
  const num = cands[0] ? [cands[0][0], cands[0][2]] : null;
  if (/cheque\s+(?:n[°oº.]*\s*\d+\s+)?.*disponible|cheque disponible|dep[oó]sito|transferencia|abono\s+en\s+cuenta/i.test(txt) && r.aseguradora) {
    r.kind = 'pago';
    r.forma = /cheque/i.test(txt) ? 'Cheque' : /transferencia/i.test(txt) ? 'Transferencia' : 'Depósito';
    r.numero = cheque?.[1] || ref?.[1] || '';
  } else if (r.aseguradora && num) {
    r.kind = 'numero';
  }
  if (num) r.reclamo = num[1].toUpperCase();
  // ¿De quién es?
  const p = r.polizaNum && DB.polizas.find(x => norm(x.numero) === norm(r.polizaNum));
  if (p) { r.polizaId = p.id; r.clienteId = p.clienteId; r.aseguradora = r.aseguradora || p.aseguradora; }
  if (!r.clienteId) { const c = DB.clientes.find(c => c.correo && norm(c.correo) === norm(m.from)); if (c) r.clienteId = c.id; }
  if (!r.clienteId) { const c = DB.clientes.find(c => norm(txt).includes(norm(c.nombre.split(',')[0]))); if (c) r.clienteId = c.id; }
  // ¿Qué trámite?
  let t = r.reclamo && DB.tramites.find(t => t.numeroReclamo && norm(t.numeroReclamo) === norm(r.reclamo));
  if (!t && r.polizaId) t = DB.tramites.filter(t => t.polizaId === r.polizaId && tramiteAbierto(t)).sort((a, b) => ETAPAS.findIndex(e => e.k === a.etapa) - ETAPAS.findIndex(e => e.k === b.etapa))[0];
  if (!t && r.kind !== 'solicitud' && r.clienteId) t = DB.tramites.find(t => t.clienteId === r.clienteId && tramiteAbierto(t) && (!r.aseguradora || t.aseguradora === r.aseguradora));
  if (t) { r.tramiteId = t.id; r.clienteId = r.clienteId || t.clienteId; if (r.reclamo === t.numeroReclamo && r.kind === 'numero') r.kind = 'info'; }
  return r;
}

async function loadInbox(force) {
  if (S.mode === 'demo') { S.inbox = S.demoInbox; return; }
  if (S.inboxLoading || (S.inbox && !force)) return;
  S.inboxLoading = true; S.inboxErr = '';
  if (S.route === 'bandeja') render(false);
  try {
    const d = await api('api/gmail?q=' + encodeURIComponent(S.f.gmailQ || DEFAULT_GMAIL_Q));
    S.inbox = d.messages || [];
  } catch (e) { S.inboxErr = e.message; S.inbox = S.inbox || []; }
  S.inboxLoading = false;
  render(false);
}

VIEWS.bandeja = () => {
  if (!S.inbox && !S.inboxLoading) setTimeout(() => loadInbox());
  const f = S.f;
  const all = S.inbox || [];
  const list = all.filter(m => f.bandeja === 'pend' ? !mailDone(m) : mailDone(m));
  const kinds = { solicitud: ['Nueva solicitud', 'info'], numero: ['Número de reclamo', 'gold'], pago: ['Pago disponible', 'ok'], info: ['Ya registrado', ''] };
  const rows = list.map(m => {
    const k = classify(m);
    const t = tramite(k.tramiteId), c = cliente(k.clienteId);
    const done = DB.correos.find(x => x.id === m.id);
    let acts = '';
    if (!done) {
      if (k.kind === 'pago') acts += `<button class="btn primary sm" type="button" data-act="mail-pago" data-id="${esc(m.id)}">${ic('hand-coins')}Registrar pago</button>`;
      else if (k.kind === 'numero') acts += `<button class="btn primary sm" type="button" data-act="mail-numero" data-id="${esc(m.id)}">${ic('seal-check')}${t ? 'Poner número en ' + esc(t.codigo) : 'Asignar a un trámite'}</button>`;
      else acts += `<button class="btn primary sm" type="button" data-act="mail-tramite" data-id="${esc(m.id)}">${ic('plus')}Crear trámite</button>`;
      if (k.kind !== 'solicitud') acts += `<button class="btn sm" type="button" data-act="mail-tramite" data-id="${esc(m.id)}">Crear trámite</button>`;
      acts += `<button class="btn ghost sm" type="button" data-act="mail-skip" data-id="${esc(m.id)}">Archivar</button>`;
    } else acts = `<span class="tag">${av(done.creadoPor, 'sm')}${esc(done.nota || 'Procesado')}</span>`;
    if (S.mode === 'live') acts += `<a class="btn ghost sm" href="https://mail.google.com/mail/u/0/#all/${esc(m.threadId || m.id)}" target="_blank" rel="noopener">${ic('arrow-square-out')}Gmail</a>`;
    return `<article class="mail ${done ? 'done' : ''}">
      <div class="from">${ic('envelope-simple')}<b>${esc(m.fromName || m.from)}</b><span class="faint">${fmtAgo(m.fecha)}</span><span class="pill ${kinds[k.kind][1]}">${kinds[k.kind][0]}</span></div>
      <h3>${esc(m.subject || '(sin asunto)')}</h3>
      <p>${esc(m.snippet || '')}</p>
      <div class="found">
        ${c ? `<span class="tag">${ic('user')}${esc(c.nombre.split(',')[0])}</span>` : `<span class="tag faint">${ic('user')}Cliente no reconocido</span>`}
        ${k.polizaNum ? `<span class="tag">${ic('shield-check')}${esc(k.polizaNum)}</span>` : ''}
        ${k.reclamo ? `<span class="tag">${ic('seal-check')}${esc(k.reclamo)}</span>` : ''}
        ${k.monto ? `<span class="tag">${ic('money-wavy')}${fmtMoney(k.monto)}</span>` : ''}
        ${t ? `<span class="tag">${ic('folder-open')}${esc(t.codigo)}</span>` : ''}
        ${(m.attachments || []).map(a => `<span class="attach">${ic('paperclip')}${esc(a.name)}</span>`).join('')}
      </div>
      <div class="acts">${acts}</div>
    </article>`;
  }).join('');
  const pendN = all.filter(m => !mailDone(m)).length;
  return head('Bandeja', S.mode === 'demo' ? 'Así se verán los correos de tu Gmail. La app reconoce solicitudes, números de reclamo y avisos de pago, y los liga al cliente y al trámite.' : 'Correos recientes de Gmail. Revisa la sugerencia y conviértelos en trámites o pagos con un clic.',
    `<button class="btn" type="button" data-act="inbox-refresh" ${S.inboxLoading ? 'disabled' : ''}>${ic('arrows-clockwise')}${S.inboxLoading ? 'Leyendo…' : 'Actualizar'}</button>`) + `
  <div class="toolbar"><div class="seg" role="group" aria-label="Correos">
    <button type="button" data-act="filter" data-k="bandeja" data-v="pend" aria-pressed="${f.bandeja === 'pend'}">Por revisar${pendN ? ` · ${pendN}` : ''}</button>
    <button type="button" data-act="filter" data-k="bandeja" data-v="hechos" aria-pressed="${f.bandeja === 'hechos'}">Procesados</button></div></div>
  ${S.inboxErr ? `<div class="banner" style="background:var(--bad-soft);box-shadow:inset 0 0 0 1px var(--bad)">${ic('warning')}<span>No se pudo leer Gmail: ${esc(S.inboxErr)}</span><a class="btn sm" href="api/diagnose" target="_blank">Diagnóstico</a></div>` : ''}
  <div class="panel">${S.inboxLoading && !S.inbox ? `<div class="panel-b">${'<div class="skel" style="margin:14px 0;width:70%"></div><div class="skel" style="margin:14px 0 26px;width:90%"></div>'.repeat(3)}</div>` : rows || `<div class="panel-b">${emptyState('tray', f.bandeja === 'pend' ? 'Bandeja al día' : 'Nada procesado todavía', f.bandeja === 'pend' ? 'No hay correos nuevos por revisar.' : 'Los correos que conviertas aparecerán aquí.')}</div>`}</div>`;
};

async function markMail(id, nota, tramiteId) {
  if (mailDone({ id })) return;
  await save('correos', { id, estado: 'procesado', nota, tramiteId: tramiteId || '' }, nota, 'procesó').catch(() => { });
}

async function importAttachments(m, carpeta) {
  if (!m.attachments?.length) return [];
  if (S.mode === 'demo') return m.attachments.map(a => ({ id: 'demo-' + a.id, name: a.name, size: a.size }));
  toast('Guardando adjuntos en Drive…');
  const d = await api('api/gmail', { json: { id: m.id, attachments: m.attachments.map(a => a.id), folder: carpeta } });
  return d.docs || [];
}

async function mailAction(act, id) {
  const m = (S.inbox || []).find(x => x.id === id); if (!m) return;
  const k = classify(m);
  if (act === 'mail-skip') { await markMail(id, 'Archivado'); render(false); toast('Correo archivado', '', { label: 'Deshacer', run: async () => { await remove('correos', id, 'Correo devuelto a la bandeja'); render(false); } }); return; }
  if (act === 'mail-tramite') {
    let docs = [];
    try { docs = await importAttachments(m, clienteNombre(k.clienteId)); } catch (e) { toast('No se copiaron los adjuntos: ' + e.message, 'err'); }
    const tipo = /renova/i.test(m.subject + m.snippet) ? 'Renovación' : /exclu/i.test(m.subject + m.snippet) ? 'Exclusión' : /inclu/i.test(m.subject + m.snippet) ? 'Inclusión' : /modific|cambio/i.test(m.subject + m.snippet) ? 'Modificación' : 'Reclamo';
    openTramite(null, { clienteId: k.clienteId || '', polizaId: k.polizaId || '', aseguradora: k.aseguradora || poliza(k.polizaId)?.aseguradora || '', tipo, asunto: m.subject || '', descripcion: m.snippet || '', docs, fechaSolicitud: (m.fecha || nowISO()).slice(0, 10), gmailId: m.id, monto: k.kind === 'solicitud' ? '' : '' });
    cur.afterSave = async t => { await markMail(id, `Trámite ${t.codigo}`, t.id); };
    return;
  }
  if (act === 'mail-numero') {
    const apply = tid => {
      openTramite(tid);
      const f = $('#frm');
      if (f && k.reclamo) { f.numeroReclamo.value = k.reclamo; f.numeroReclamo.focus(); }
      cur.afterSave = async t => { await markMail(id, `Número en ${t.codigo}`, t.id); };
      toast('Revisa el número y pulsa “Número asignado”');
    };
    if (k.tramiteId) return apply(k.tramiteId);
    const cands = DB.tramites.filter(t => tramiteAbierto(t) && (!k.clienteId || t.clienteId === k.clienteId)).slice(0, 8);
    if (!cands.length) return toast('No hay trámites abiertos de ese cliente. Crea uno primero.', 'err');
    const btn = document.querySelector(`[data-act="mail-numero"][data-id="${CSS.escape(id)}"]`);
    return popMenu(btn, cands.map(t => [t.id, `${t.codigo} · ${clienteNombre(t.clienteId).split(',')[0]} · ${t.tipo}`, 'folder-open']), apply);
  }
  if (act === 'mail-pago') {
    const t = tramite(k.tramiteId);
    openPago(null, { forma: k.forma || 'Cheque', numero: k.numero || '', monto: k.monto || '', aseguradora: k.aseguradora || t?.aseguradora || '', clienteId: k.clienteId || t?.clienteId || '', tramiteId: k.tramiteId || '', fechaAviso: (m.fecha || nowISO()).slice(0, 10), notas: m.subject || '' });
    cur.afterSave = async p => { await markMail(id, `Pago ${fmtMoney(p.monto)}`, p.tramiteId); };
  }
}

/* ---------- Bitácora ---------- */
VIEWS.bitacora = () => {
  const f = S.f;
  const list = DB.bitacora.filter(e => !f.bitUser || e.por === f.bitUser).slice(0, 300);
  const groups = {};
  list.forEach(e => { const d = String(e.fecha).slice(0, 10); (groups[d] = groups[d] || []).push(e); });
  const per = S.users.map(u => ({ u, n: DB.bitacora.filter(e => e.por === u.email && String(e.fecha).slice(0, 7) === todayISO().slice(0, 7)).length }));
  return head('Bitácora', 'Todo lo que se crea, cambia o elimina queda aquí con el nombre de quien lo hizo y la hora. No se puede editar.') + `
  <div class="toolbar"><div class="seg" role="group" aria-label="Persona"><button type="button" data-act="filter" data-k="bitUser" data-v="" aria-pressed="${!f.bitUser}">Los dos</button>${S.users.map(u => `<button type="button" data-act="filter" data-k="bitUser" data-v="${esc(u.email)}" aria-pressed="${f.bitUser === u.email}">${esc(u.nombre)}</button>`).join('')}</div>
    <span class="muted" style="font-size:.84rem">Este mes: ${per.map(x => `${esc(firstName(x.u))} ${x.n}`).join(' · ')}</span></div>
  ${list.length ? Object.entries(groups).map(([d, items]) => `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2 style="font-size:.86rem">${esc(d === todayISO() ? 'HOY' : d === addDays(todayISO(), -1) ? 'AYER' : fmtDate(d).toUpperCase())}</h2><span class="label">${items.length}</span></div>${feed(items, true)}</div>`).join('') : `<div class="panel panel-b">${emptyState('clock-counter-clockwise', 'Sin movimientos', 'Cuando alguien guarde algo, aparecerá aquí.')}</div>`}`;
};

/* ---------- Búsqueda global ---------- */
VIEWS.buscar = () => {
  const q = norm(S.q);
  if (!q) return head('Buscar', 'Escribe arriba un nombre, número de póliza, número de reclamo o de cheque.');
  const has = s => norm(s).includes(q);
  const cl = DB.clientes.filter(c => has([c.nombre, c.documento, c.correo, c.telefono].join(' ')));
  const po = DB.polizas.filter(p => has([p.numero, p.aseguradora, clienteNombre(p.clienteId), ...(p.asegurados || []).map(a => a.nombre + ' ' + a.documento)].join(' ')));
  const tr = DB.tramites.filter(t => has([t.codigo, t.asunto, t.numeroReclamo, clienteNombre(t.clienteId)].join(' ')));
  const pg = DB.pagos.filter(p => has([p.numero, p.folio, clienteNombre(p.clienteId)].join(' ')));
  const block = (title, items, fn) => items.length ? `<div class="sec"><div class="label">${title} <span class="faint">${items.length}</span></div><div class="docs">${items.slice(0, 12).map(fn).join('')}</div></div>` : '';
  const total = cl.length + po.length + tr.length + pg.length;
  return head('Buscar', `${total} ${total === 1 ? 'resultado' : 'resultados'} para “${esc(S.q)}”`) + (total ? `<div class="panel panel-b">
    ${block('Trámites', tr, t => `<button class="doc" type="button" data-act="open-tramite" data-id="${t.id}">${ic('folder-open')}<span>${esc(t.codigo)} · ${esc(clienteNombre(t.clienteId))} · ${esc(t.asunto || t.tipo)}${t.numeroReclamo ? ' · ' + esc(t.numeroReclamo) : ''}</span>${etapaPill(t)}</button>`)}
    ${block('Clientes', cl, c => `<button class="doc" type="button" data-act="open-cliente" data-id="${c.id}">${ic(c.tipo === 'Empresa' ? 'buildings' : 'user')}<span>${esc(c.nombre)}</span><small>${esc(c.telefono || '')}</small></button>`)}
    ${block('Pólizas', po, p => `<button class="doc" type="button" data-act="open-poliza" data-id="${p.id}">${ic('shield-check')}<span>${esc(p.numero)} · ${esc(p.ramo)} · ${esc(clienteNombre(p.clienteId))}</span><span class="pill ${polizaEstado(p).cls}">${esc(polizaEstado(p).n)}</span></button>`)}
    ${block('Pagos', pg, p => `<button class="doc" type="button" data-act="open-pago" data-id="${p.id}">${ic('money-wavy')}<span>${esc(p.forma)} ${esc(p.numero || '')} · ${fmtMoney(p.monto)} · ${esc(clienteNombre(p.clienteId))}</span><span class="pill ${PAGO_E[p.estado]?.cls}">${esc(PAGO_E[p.estado]?.n)}</span></button>`)}
  </div>` : `<div class="panel panel-b">${emptyState('magnifying-glass', 'Sin resultados', 'Revisa cómo está escrito o busca por otro dato.')}</div>`);
};

/* ---------- Ajustes ---------- */
VIEWS.ajustes = () => {
  const s = S.sess || {};
  const lite = document.documentElement.classList.contains('lite');
  return head('Ajustes', 'Conexión con Google, bandeja y pantalla.') + `
  <div class="home-grid">
    <div class="panel"><div class="panel-h"><h2>GOOGLE</h2>${S.mode === 'live' ? `<span class="pill ${s.google?.connected ? 'ok' : 'bad'}">${s.google?.connected ? 'Conectado' : 'Sin conectar'}</span>` : '<span class="pill">Demo</span>'}</div><div class="panel-b">
      ${S.mode === 'live' ? `
        <div class="kv"><div><dt>Base de datos</dt><dd>${s.google?.sheetUrl ? `<a href="${esc(s.google.sheetUrl)}" target="_blank" rel="noopener">Hoja “SIMEVI · Base de datos”</a>` : 'Se crea al conectar'}</dd></div>
        <div><dt>Documentos</dt><dd>${s.google?.folderUrl ? `<a href="${esc(s.google.folderUrl)}" target="_blank" rel="noopener">Carpeta SIMEVI en Drive</a>` : '-'}</dd></div>
        <div><dt>Cuenta de Google</dt><dd>${esc(s.google?.account || '-')}</dd></div><div><dt>Gmail</dt><dd>${s.google?.gmail ? 'Con permiso de lectura' : 'Sin permiso'}</dd></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">${s.user?.admin ? `<a class="btn" href="api/google/connect">${ic('google-logo')}${s.google?.connected ? 'Volver a conectar' : 'Conectar Google'}</a>` : ''}<a class="btn ghost" href="api/diagnose" target="_blank">${ic('seal-check')}Diagnóstico</a></div>`
      : `<p class="muted" style="margin:0 0 12px;font-size:.88rem">En la versión publicada en Vercel, todo se guarda en tu Google: una Hoja de cálculo como base de datos, una carpeta de Drive para los PDFs, y Gmail para la bandeja. Silvia y tú entran con su cuenta de Google y cada cambio queda firmado.</p>
         <p class="muted" style="margin:0;font-size:.88rem">Los pasos están en el archivo LEEME.md del proyecto.</p>`}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>PERSONA</h2></div><div class="panel-b">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${av(S.me.email, 'lg')}<div><b>${esc(S.me.nombre)}</b><div class="faint" style="font-size:.8rem">${esc(S.me.email)}</div></div></div>
      ${S.mode === 'demo' ? `<div class="seg" role="group" aria-label="Persona">${S.users.map(u => `<button type="button" data-act="set-user" data-v="${esc(u.email)}" aria-pressed="${u.email === S.me.email}">${esc(u.nombre)}</button>`).join('')}</div>` : `<button class="btn" type="button" data-act="logout">${ic('sign-out')}Cerrar sesión</button>`}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>BANDEJA</h2></div><div class="panel-b">
      ${fld('Qué correos leer de Gmail', `<input type="text" id="gmailq" value="${esc(S.f.gmailQ || DEFAULT_GMAIL_Q)}">`, '', 'Usa la misma búsqueda que en Gmail. Ej.: <code>label:simevi newer_than:14d</code>')}
      <button class="btn sm" type="button" data-act="gmailq-save" style="margin-top:10px">Guardar</button>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>PANTALLA Y DATOS</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:14px;align-items:flex-start">
      <label class="check"><input type="checkbox" data-act-change="lite" ${lite ? 'checked' : ''}>Modo ligero (sin vidrio ni animaciones, para teléfonos lentos)</label>
      <button class="btn" type="button" data-act="export-all">${ic('download-simple')}Descargar copia de todo (JSON)</button>
      ${S.mode === 'demo' ? `<button class="btn ghost" type="button" data-act="demo-reset">${ic('arrows-clockwise')}Volver a los datos de ejemplo</button>` : ''}
    </div></div>
  </div>`;
};

/* ---------- eventos (delegados) ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'A' && act !== 'open-ref') return; // los enlaces navegan solos
  if (act !== 'open-ref' || el.tagName === 'A') e.preventDefault();
  switch (act) {
    case 'go': if (el.dataset.f === 'por-vencer') { S.f.polEst = 'por-vencer'; saveFilters(); } go(el.dataset.r); break;
    case 'more': {
      if ($('.more-sheet')) { $('.more-sheet').remove(); break; }
      const m = document.createElement('div'); m.className = 'more-sheet';
      m.innerHTML = ROUTES.filter(r => r.desk).map(r => `<a class="nav" href="#/${r.k}">${ic(r.i)}<span>${r.n}</span></a>`).join('');
      document.body.appendChild(m);
      setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !ev.target.closest('[data-act=more]')) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true));
      break;
    }
    case 'search-m': { const q = await ask('Buscar cliente, póliza, número de reclamo o cheque', { value: S.q, ok: 'Buscar' }); if (q !== null) { S.q = q; go('buscar'); render(false); } break; }
    case 'drawer-close': closeDrawer(); break;
    case 'filter': S.f[el.dataset.k] = el.dataset.v; saveFilters(); render(false); break;
    case 'open-tramite': openTramite(id); break;
    case 'open-pago': openPago(id); break;
    case 'open-poliza': openPoliza(id); break;
    case 'open-cliente': openCliente(id); break;
    case 'open-ref': {
      const t = el.dataset.t;
      if (!byId(t, id)) { toast('Ese registro ya no existe', 'err'); break; }
      ({ tramites: openTramite, pagos: openPago, polizas: openPoliza, clientes: openCliente }[t] || (() => { }))(id); break;
    }
    case 'new-tramite': openTramite(null); break;
    case 'new-pago': openPago(null); break;
    case 'new-poliza': openPoliza(null); break;
    case 'new-cliente': openCliente(null); break;
    case 'tramite-save': saveTramite(); break;
    case 'tramite-advance': saveTramite(el.dataset.to); break;
    case 'tramite-more': tramiteMoreMenu(el); break;
    case 'pago-from-tramite': { const t = readTramiteForm(); if (!t?.id || !tramite(t.id)) { toast('Guarda primero el trámite', 'err'); break; } newPagoFromTramite(t); break; }
    case 'add-note': {
      const inpN = $('#note'); const txt = inpN.value.trim(); if (!txt) { inpN.focus(); break; }
      const t = readTramiteForm();
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'nota', texto: txt }];
      try { await save('tramites', t, `${t.codigo} nota: ${txt.slice(0, 80)}`); } catch (err) { break; }
      const d = drawerEl(); d.innerHTML = tramiteHTML(t, false); wireTramite(d); render(false);
      $('#note', d)?.focus();
      break;
    }
    case 'pago-save': savePago(el.dataset.to); break;
    case 'pago-del': {
      const p = cur.row; if (!await ask('¿Eliminar este pago? Queda anotado en la bitácora.', { danger: true, ok: 'Eliminar' })) break;
      await remove('pagos', p.id, `${p.forma} ${p.numero || ''} por ${fmtMoney(p.monto)}`); closeDrawer(); render(false); toast('Pago eliminado'); break;
    }
    case 'export-pagos': exportPagos(); break;
    case 'poliza-save': savePoliza(); break;
    case 'poliza-del': {
      const p = cur.row; if (DB.tramites.some(t => t.polizaId === p.id) && !await ask('Esta póliza tiene trámites. ¿Eliminarla igual?')) break;
      if (!await ask(`¿Eliminar la póliza ${p.numero}?`, { danger: true, ok: 'Eliminar' })) break;
      await remove('polizas', p.id, `${p.numero} ${p.ramo}`); closeDrawer(); render(false); toast('Póliza eliminada'); break;
    }
    case 'pol-mod': {
      const v = el.dataset.v, d = drawerEl();
      $('[name=modalidad]', d).value = v;
      $$('[data-act=pol-mod]', d).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
      $('#ins-sec', d).hidden = v !== 'Colectiva';
      $('[name=clienteId]', d).closest('.field').querySelector('span').textContent = v === 'Colectiva' ? 'Contratante' : 'Cliente';
      break;
    }
    case 'ins-add': {
      const tb = $('#ins-body'); const tmp = document.createElement('tbody'); tmp.innerHTML = insRows([{ nombre: '', documento: '', certificado: String(tb.children.length + 1).padStart(3, '0'), plan: '' }]);
      const tr = tmp.firstElementChild; tb.appendChild(tr); $('input', tr).focus(); break;
    }
    case 'ins-del': el.closest('tr').remove(); break;
    case 'tramite-from-poliza': { const p = cur.row; closeDrawer(true); openTramite(null, { clienteId: p.clienteId, polizaId: p.id, aseguradora: p.aseguradora, tipo: diasPoliza(p) !== null && diasPoliza(p) <= 45 ? 'Renovación' : 'Reclamo' }); break; }
    case 'tramite-from-cliente': { const c = cur.row; closeDrawer(true); openTramite(null, { clienteId: c.id }); break; }
    case 'poliza-from-cliente': { const c = cur.row; closeDrawer(true); openPoliza(null, { clienteId: c.id, modalidad: c.tipo === 'Empresa' ? 'Colectiva' : 'Individual' }); break; }
    case 'cliente-save': saveCliente(); break;
    case 'cliente-del': {
      const c = cur.row;
      if (DB.polizas.some(p => p.clienteId === c.id) || DB.tramites.some(t => t.clienteId === c.id)) { toast('Tiene pólizas o trámites. Elimínalos primero.', 'err'); break; }
      if (!await ask(`¿Eliminar a ${c.nombre}?`, { danger: true, ok: 'Eliminar' })) break;
      await remove('clientes', c.id, c.nombre); closeDrawer(); render(false); toast('Cliente eliminado'); break;
    }
    case 'portal-copy': copyPortal(id); break;
    case 'portal-reset': {
      const c = cliente(cur.row.id); if (!c || !await ask('El enlace anterior dejará de funcionar. ¿Continuar?')) break;
      c.portal = token(); await save('clientes', c, `${c.nombre}: enlace del portal cambiado`); closeDrawer(true); openCliente(c.id); toast('Enlace nuevo creado'); break;
    }
    case 'portal-back': go('clientes'); break;
    case 'rx-clear': RX = RX_BLANK(); rxKeep(); render(false); $('#rx-nombre')?.focus(); break;
    case 'rx-new-cliente': {
      const name = $('#rx-nombre').value.trim(); cbClose($('#rx-nombre').closest('.cb'));
      openCliente(null, { nombre: name });
      cur.afterSave = c => { pick('nombre', { kind: 'cli', label: c.nombre, clienteId: c.id }); render(false); toast('Cliente creado. Ahora agrega su póliza si no está.'); $('#rx-poliza')?.focus(); };
      break;
    }
    case 'doc-del': {
      const i = +el.dataset.i; const doc = cur.row.docs[i];
      if (!await ask(`¿Quitar ${doc.name} de este registro? El archivo sigue en Drive.`, { ok: 'Quitar' })) break;
      cur.row.docs.splice(i, 1); el.closest('.doc').remove();
      $$('[data-act=doc-del]', drawerEl()).forEach((b, j) => b.dataset.i = j);
      toast('Quitado. Pulsa Guardar para confirmar.');
      break;
    }
    case 'mail-tramite': case 'mail-numero': case 'mail-pago': case 'mail-skip': mailAction(act, id); break;
    case 'inbox-refresh': S.inbox = S.mode === 'demo' ? S.inbox : null; loadInbox(true); if (S.mode === 'demo') toast('Bandeja al día'); break;
    case 'switch-user': {
      if (S.mode === 'demo') { S.me = S.users.find(u => u.email !== S.me.email); persistDemo(); render(false); toast(`Ahora estás como ${S.me.nombre}`); }
      else if (await ask('¿Cerrar sesión?')) { await fetch('api/logout', { method: 'POST' }); location.reload(); }
      break;
    }
    case 'set-user': S.me = S.users.find(u => u.email === el.dataset.v); persistDemo(); render(false); break;
    case 'logout': await fetch('api/logout', { method: 'POST' }); location.reload(); break;
    case 'gmailq-save': S.f.gmailQ = $('#gmailq').value.trim(); saveFilters(); S.inbox = null; toast('Búsqueda de Gmail guardada'); break;
    case 'export-all': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportado: nowISO(), por: S.me.email, ...DB }, null, 2)], { type: 'application/json' }));
      a.download = `SIMEVI copia ${todayISO()}.json`; a.click(); break;
    }
    case 'demo-reset': if (await ask('¿Borrar los cambios de la demo y volver a los datos de ejemplo?')) { bootDemoData(true); render(false); toast('Datos de ejemplo restaurados'); } break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.filter) { S.f[el.dataset.filter] = el.value; saveFilters(); render(false); }
  if (el.dataset.filterCheck) { S.f[el.dataset.filterCheck] = el.checked; saveFilters(); render(false); }
  if (el.dataset.actChange === 'lite') { document.documentElement.classList.toggle('lite', el.checked); try { localStorage.setItem('simevi-lite', el.checked ? '1' : '0'); } catch (err) { } }
  if (el.dataset.upload) handleFiles(el.files, el.dataset.upload);
});

let searchT;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'gsearch' || el.dataset.bind === 'q') {
    S.q = el.value;
    clearTimeout(searchT);
    searchT = setTimeout(() => {
      if (el.id === 'gsearch' && !['tramites', 'pagos', 'polizas', 'clientes', 'buscar'].includes(S.route)) { if (S.q) go('buscar'); }
      else render(false);
    }, 140);
  }
});

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if ($('.popmenu')) $('.popmenu').remove(); else if (drawerEl()) closeDrawer(); }
  else if (e.key === '/' && !typing && !drawerEl()) { e.preventDefault(); ($('.toolbar input[type=search]') || $('#gsearch'))?.focus(); }
  else if (e.key === 'Enter' && e.target.id === 'note') { e.preventDefault(); $('[data-act=add-note]')?.click(); }
});

/* Arrastrar y soltar archivos */
document.addEventListener('dragover', e => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest?.('[data-drop]'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.remove('over'); handleFiles(e.dataTransfer.files, z.dataset.drop); } });

async function handleFiles(files, ctx) {
  if (!files?.length || !cur) return;
  const row = cur.row;
  const carpeta = clienteNombre(row.clienteId) || 'General';
  row.docs = row.docs || [];
  for (const f of files) {
    try {
      toast(`Subiendo ${f.name}…`);
      const d = await uploadFile(f, carpeta);
      row.docs.push({ id: d.id, name: d.name || f.name, size: d.size || f.size, url: d.url || '' });
    } catch (err) { toast(err.message, 'err'); }
  }
  const box = $(`[data-docs="${ctx}"]`, drawerEl());
  if (box) box.outerHTML = docsBlock(row.docs, ctx);
  if (!cur.isNew) {
    try { await save(cur.tabla, row, `${row.codigo || row.numero || ''}: ${files.length} documento${files.length > 1 ? 's' : ''} agregado${files.length > 1 ? 's' : ''}`.trim()); toast(S.mode === 'demo' ? 'Agregado (en la demo los archivos no se guardan)' : 'Guardado en Drive'); }
    catch (err) { }
  } else toast('Listo. Se guardará al crear el registro.');
}

/* ---------- inicio de sesión (versión real) ---------- */
function renderGate(msg) {
  const s = S.sess || {};
  $('#root').innerHTML = `<div class="gate"><div class="panel gate-card flash">
    <img src="img/logo-full.webp" alt="SIMEVI Corredores de Seguros">
    <span class="greek" aria-hidden="true">ΑΣΦΑΛΕΙΑ</span>
    ${s.configured === false ? `<p>Falta configurar la app en Vercel: ${esc((s.missing || []).join(', '))}.</p><a class="btn" href="api/diagnose">Ver diagnóstico</a>`
      : `<p>Entra con tu cuenta de Google. Solo Silvia y Ricardo tienen acceso.</p><div id="gsi"></div>${msg ? `<div class="gate-err">${esc(msg)}</div>` : ''}`}
  </div></div>`;
  if (s.configured === false || !s.clientId) return;
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = () => {
    google.accounts.id.initialize({
      client_id: s.clientId, ux_mode: 'popup', auto_select: true,
      callback: async ({ credential }) => {
        try { await api('api/login', { json: { credential } }); location.reload(); }
        catch (err) { renderGate(err.message); }
      }
    });
    google.accounts.id.renderButton($('#gsi'), { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'es' });
    google.accounts.id.prompt();
  };
  document.head.appendChild(sc);
}

/* ---------- arranque ---------- */
async function loadIcons() {
  if (document.getElementById('i-house')) return;
  try { const r = await fetch('icons.svg'); const t = await r.text(); const d = document.createElement('div'); d.innerHTML = t; document.body.prepend(d.firstElementChild); } catch (e) { }
}

async function boot() {
  await loadIcons();
  const portalTok = (location.pathname.match(/^\/c\/([\w-]+)/) || [])[1];
  if (portalTok) { S.mode = 'live'; return renderPortal(portalTok); }
  let sess = null;
  try {
    const r = await fetch('api/session', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) sess = await r.json();
  } catch (e) { }
  if (!sess) {
    bootDemoData();
  } else {
    S.mode = 'live'; S.sess = sess; S.users = sess.users || [];
    if (!sess.user) return renderGate();
    S.me = S.users.find(u => u.email === sess.user.email) || sess.user;
    $('#root').innerHTML = `<div class="gate"><div class="gate-card"><img src="img/sv.webp" alt="" style="width:90px"><div class="skel" style="width:160px"></div></div></div>`;
    try { await loadLive(); }
    catch (e) {
      $('#root').innerHTML = `<div class="gate"><div class="panel gate-card"><img src="img/logo-full.webp" alt="SIMEVI"><p class="gate-err">${esc(e.message)}</p>${sess.user.admin ? `<a class="btn primary" href="api/google/connect">${ic('google-logo')}Conectar Google</a>` : '<p>Pide a Ricardo que conecte la cuenta de Google.</p>'}<a class="btn ghost" href="api/diagnose">Diagnóstico</a></div></div>`;
      return;
    }
    if (new URLSearchParams(location.search).get('google') === 'ok') { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => toast('Google conectado'), 400); }
  }
  parseHash();
  render(true);
  if (S.mode === 'live') {
    try { navigator.serviceWorker?.register('/sw.js'); } catch (e) { }
    loadInbox();
    // Si la otra persona cambia algo, se ve al volver a la pestaña.
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || drawerEl()) return;
      try { await loadLive(); render(false); } catch (e) { }
    });
  } else {
    S.inbox = S.demoInbox;
    render(false);
  }
}
boot();
