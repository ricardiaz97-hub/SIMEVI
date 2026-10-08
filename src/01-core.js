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
