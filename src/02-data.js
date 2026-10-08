/* ---------- capa de datos ---------- */
const DEMO_KEY = 'simevi-demo-v7';
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
  if (!r.ok) { const err = new Error(data?.message || data?.error || `Error ${r.status}`); err.data = data; throw err; }
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
    { id: 'c9', nombre: 'INJIBOA, S.A. de C.V.', tipo: 'Empresa', documento: '', contacto: 'Maricela Bonilla (Planillas/RR. HH.)', correo: 'mbonilla@injiboa.com.sv', telefono: '', notas: 'Ingenio Central Azucarero Jiboa. Colectivo de gastos médicos y vida con SISA.', portal: 'injiboa5k2w8', ...by(SD, -500, 9) },
    { id: 'c8', nombre: 'Rosa Amelia Quintanilla', tipo: 'Persona', documento: '01693357-8', contacto: '', correo: 'rosaquintanilla61@yahoo.com', telefono: '7234-8810', notas: 'Paciente crónica, reclamos mensuales de medicamentos.', portal: 'rosa5k7w3h9t', ...by(SD, -620, 10) }
  ];

  const P = [
    { id: 'p12', numero: 'SALC-507549', aseguradora: 'SISA', ramo: 'Gastos médicos', modalidad: 'Colectiva', clienteId: 'c9', vigenciaDesde: D(-200), vigenciaHasta: D(165), prima: 0, frecuencia: 'Mensual', suma: 0, notas: '', asegurados: [{ nombre: 'Eliseo Alexander Portillo Bonilla', documento: '', certificado: '131', plan: '' }, { nombre: 'Augusto Cesar Martinez Bonilla', documento: '', certificado: '117', plan: '' }], ...by(SD, -200, 9) },
    { id: 'p13', numero: 'VICO-503046', aseguradora: 'SISA', ramo: 'Vida', modalidad: 'Colectiva', clienteId: 'c9', vigenciaDesde: D(-200), vigenciaHasta: D(165), prima: 0, frecuencia: 'Mensual', suma: 0, notas: '', asegurados: [], ...by(SD, -200, 9) },
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

  const evA = (n, h, mi, por, a, texto) => ({ fecha: ts(n, h, mi), por, tipo: 'etapa', a, texto });
  Tm.push(
    { id: 't14', codigo: `T-${y}-0025`, tipo: 'Reclamo', clienteId: 'c9', polizaId: 'p12', aseguradora: 'SISA', asunto: 'Reclamo de Eliseo Portillo', asegurado: 'Eliseo Alexander Portillo Bonilla', certificado: '131', descripcion: 'Consulta y exámenes.', canal: 'Portal de la aseguradora', etapa: 'analisis', numeroReclamo: 'SALC-121578-2026', monto: 300, fechaSolicitud: D(-25), fechaIngreso: D(-24), responsable: SD, visibleCliente: true, notaCliente: '', docs: [], eventos: [evA(-25, 9, 0, SD, 'recibido', 'Recibido de Maricela.'), evA(-24, 10, 0, SD, 'ingresado', 'Ingresado en el portal de SISA.'), evA(-20, 11, 0, SD, 'numero', 'Número asignado SALC-121578-2026.')], ...by(SD, -25, 9) },
    { id: 't15', codigo: `T-${y}-0044`, tipo: 'Modificación', clienteId: 'c9', polizaId: 'p13', aseguradora: 'SISA', asunto: 'Cambio de beneficiarios', descripcion: 'Formulario firmado por el empleado.', canal: 'Portal de la aseguradora', etapa: 'ingresado', numeroReclamo: '', monto: 0, fechaSolicitud: D(-1), fechaIngreso: D(0), responsable: SD, visibleCliente: true, notaCliente: '', docs: [], eventos: [evA(-1, 15, 0, SD, 'recibido', 'Recibido de Maricela.'), evA(0, 8, 40, SD, 'ingresado', 'Ingresado en EVA (portal de SISA).')], ...by(SD, -1, 15) },
    { id: 't11', codigo: `T-${y}-0041`, tipo: 'Reclamo', clienteId: 'c8', polizaId: 'p11', aseguradora: 'SISA', asunto: 'Reembolso de medicamentos de octubre', asegurado: 'Rosa Amelia Quintanilla', descripcion: 'Farmacia y consulta de control.', canal: 'Portal de la aseguradora', etapa: 'ingresado', numeroReclamo: '', monto: 96.3, fechaSolicitud: D(0), fechaIngreso: D(0), responsable: SD, visibleCliente: true, notaCliente: '', docs: [{ id: 'd10', name: 'Facturas octubre.pdf', size: 300000 }], eventos: [evA(0, 8, 5, SD, 'recibido', 'Recibido por correo de la clienta.'), evA(0, 9, 12, SD, 'ingresado', 'Ingresado en línea en el portal de SISA.')], ...by(SD, 0, 8), actualizado: ts(0, 9, 12), actualizadoPor: SD },
    { id: 't12', codigo: `T-${y}-0042`, tipo: 'Reclamo', clienteId: 'c5', polizaId: 'p7', aseguradora: 'ASESUISA', asunto: 'Reembolso consulta pediatra', asegurado: 'Ana Lucía Portillo Cañas', paciente: 'Mateo Portillo', parentesco: 'Hijo(a)', descripcion: 'Consulta y receta.', canal: 'Entrega en físico', etapa: 'numero', numeroReclamo: 'GM-AS-2026-77310', monto: 45, fechaSolicitud: D(-1), fechaIngreso: D(0), responsable: R, visibleCliente: true, notaCliente: '', docs: [], eventos: [evA(-1, 11, 20, R, 'recibido', 'Recibido por correo.'), evA(0, 10, 40, R, 'ingresado', 'Entregado en físico en ASESUISA.'), evA(0, 14, 5, R, 'numero', 'Número asignado GM-AS-2026-77310.')], ...by(R, -1, 11), actualizado: ts(0, 14, 5), actualizadoPor: R },
    { id: 't13', codigo: `T-${y}-0043`, tipo: 'Modificación', clienteId: 'c1', polizaId: 'p1', aseguradora: 'ASESUISA', asunto: 'Cambio de plan de Delmy Chicas', descripcion: 'De Operativo a Ejecutivo.', canal: 'Correo a la aseguradora', etapa: 'ingresado', numeroReclamo: '', monto: 0, fechaSolicitud: D(0), fechaIngreso: D(0), responsable: SD, visibleCliente: true, notaCliente: '', docs: [], eventos: [evA(0, 8, 30, SD, 'recibido', 'Recibido de RR. HH.'), evA(0, 11, 55, SD, 'ingresado', 'Enviado por correo a ASESUISA.')], ...by(SD, 0, 8), actualizado: ts(0, 11, 55), actualizadoPor: SD }
  );

  const Pg = [
    { id: 'g1', tramiteId: 't1', clienteId: 'c8', aseguradora: 'SISA', forma: 'Cheque', numero: '00418821', banco: 'Banco Agrícola', monto: 171.25, fechaAviso: D(-3), fechaRecogido: D(-1), fechaEntregado: '', entregadoA: '', folio: '112', estado: 'oficina', notas: 'Aplicaron deducible de $15.15.', ...by(R, -3, 16), actualizado: ts(-1, 12), actualizadoPor: SD },
    { id: 'g2', tramiteId: 't7', clienteId: 'c1', aseguradora: 'Pan-American Life', forma: 'Depósito', numero: 'TRF-77120394', banco: 'Banco Cuscatlán', monto: 3132, fechaAviso: D(-9), fechaRecogido: '', fechaEntregado: D(-8), entregadoA: 'Cuenta de Karla Ventura', folio: '111', estado: 'depositado', notas: '', ...by(R, -9, 15), actualizado: ts(-8, 10), actualizadoPor: R },
    { id: 'g3', tramiteId: '', clienteId: 'c8', aseguradora: 'SISA', forma: 'Cheque', numero: '00417302', banco: 'Banco Agrícola', monto: 94.8, fechaAviso: D(-30), fechaRecogido: D(-28), fechaEntregado: D(-26), entregadoA: 'Rosa Amelia Quintanilla', folio: '108', estado: 'entregado', notas: 'Reembolso de agosto.', ...by(SD, -30, 10), actualizado: ts(-26, 11), actualizadoPor: SD },
    { id: 'g4', tramiteId: '', clienteId: 'c2', aseguradora: 'Seguros del Pacífico', forma: 'Cheque', numero: '0098812', banco: 'Banco Davivienda', monto: 260, fechaAviso: D(0), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: 'disponible', notas: 'Devolución de prima por ajuste de suma asegurada.', ...by(R, 0, 8) }
  ];

  const mail = (id, n, h, from, fromName, subject, snippet, attachments = [], body = '', x = {}) => ({ id, fecha: ts(n, h), from, fromName, subject, snippet, attachments, body, cuenta: R, mid: `<${id}@demo>`, raiz: x.raiz || `<${id}@demo>`, respuesta: !!x.raiz, ...x });
  const inbox = [
    mail('m14', 0, 13, 'notificaciones@sisa.com.sv', 'Notificaciones SISA', 'Reclamos en análisis', 'Póliza: 507549 Contratante: INJIBOA, S.A DE C.V. Asegurado: ADRIANA REBECA MARTINEZ JIMENEZ. Su reclamo SALC-133283-2026 se encuentra en análisis.', [], 'NOTIFICACIÓN\nPóliza: 507549\nContratante: INJIBOA, S.A DE C.V.\nAsegurado: ADRIANA REBECA MARTINEZ JIMENEZ\nEstimado Cliente,\nLe informamos que su reclamo No. SALC-133283-2026 se encuentra en análisis.\nSISA, VIDA, S.A., SEGUROS DE PERSONAS'),
    mail('m13', 0, 12, 'notificaciones@sisa.com.sv', 'Notificaciones SISA', 'Aviso de Reclamo', 'Póliza: 507549 Contratante: INJIBOA, S.A DE C.V. Asegurado: ADRIANA REBECA MARTINEZ JIMENEZ Por este medio le confirmamos el ingreso de su aviso de reclamo, SALC-133283-2026…', [], 'NOTIFICACIÓN\nEstimado Cliente,\nPóliza: 507549\nContratante: INJIBOA, S.A DE C.V.\nAsegurado: ADRIANA REBECA MARTINEZ JIMENEZ\nPor este medio le confirmamos el ingreso de su aviso de reclamo, SALC-133283-2026, en referencia al siniestro ocurrido el día 03/10/2026, a nuestro sistema.\nAsimismo, hacemos de su conocimiento que el aviso del reclamo no constituye una aceptación de cobertura por parte de SISA, VIDA, S.A., SEGUROS DE PERSONAS ya que el pago del siniestro se determinará luego del análisis del mismo en base a las condiciones de la póliza.\nCualquier consulta que tenga, favor no dude en contactarnos a nuestro SISAphone 2241-0000 o por SISA Chat desde www.sisa.com.sv, donde siempre será un placer atenderle.\nSin más que agregar nos suscribimos.\nSISA, VIDA, S.A., SEGUROS DE PERSONAS'),
    mail('m16', 0, 11, 'notificaciones@sisa.com.sv', 'Notificaciones SISA', 'Trámite registrado bajo la referencia: MOD-57.1_511432', 'Estimado Intermediario SILVIA MAGDALENA VEGA DE DIAZ: Su información ha sido recibida satisfactoriamente…', [], 'NOTIFICACIÓN\nEstimado Intermediario SILVIA MAGDALENA VEGA DE DIAZ:\nSu información ha sido recibida satisfactoriamente según la siguiente información:\nCódigo Referencia: MOD-57.1_511432.\nPóliza: VICO-503046.\nCliente: INJIBOA, S.A DE C.V. ..\nTipo de trámite: Modificación CAMBIO DE BENEFICIARIOS.\nObservaciones: Solicitan procesar el cambio de beneficiarios conforme a documentación anexa..\nEl seguimiento a su solicitud podrá realizarlo a través del siguiente link:\nPresione para abrir el tracking\nTambién podrá dar seguimiento a su solicitud ingresando a su portal de EVA en la opción \'Mis Tareas\'.'),
    mail('m17', 0, 9, 'notificaciones@sisa.com.sv', 'Notificaciones SISA', 'Cheque Disponible - SALC-121578-2026', 'Póliza: 507549 Contratante: INJIBOA, S.A DE C.V. Asegurado: ELISEO ALEXANDER PORTILLO BONILLA Estimado Cliente, Con relación a su reclamo No. SALC-121578-2026…', [{ id: 'a17', name: 'Carta Liquidación_GRS-56.1_440358.pdf', size: 210000, mime: 'application/pdf', ocr: 'SISA VIDA, S.A. CARTA DE LIQUIDACIÓN\nReclamo: SALC-121578-2026 Asegurado: ELISEO ALEXANDER PORTILLO BONILLA\nMonto reclamado US$ 300.00\nNo cubierto US$ 42.31\nTOTAL A REEMBOLSAR US$ 257.69' }], 'NOTIFICACIÓN\nPóliza: 507549\nContratante: INJIBOA, S.A DE C.V.\nAsegurado: ELISEO ALEXANDER PORTILLO BONILLA\nEstimado Cliente,\nCon relación a su reclamo No. SALC-121578-2026, por este medio le comunicamos que ya puede acercarse a nuestras oficinas a retirar el cheque correspondiente.\nPuede comunicarse con su Intermediario de Seguros, quien le podrá indicar en cuál de nuestras agencias podrá retirarlo.\nNuestros horarios de atención en agencias y Call Center son de lunes a viernes de 08:30 am a 05:00 pm, sin cerrar al mediodía.\nSin más que agregar nos suscribimos.\nSISA VIDA S.A Seguro de Personas'),
    mail('m15', 0, 8, 'mbonilla@injiboa.com.sv', 'Maricela Bonilla', 'RECLAMOS SEGURO MEDICO HOSP.', 'Buen día Lic. Silvia y Ricardo, adjunto envío nota y documentos por gastos médicos de los asegurados: MILTON ROLANDO GARCIA, ELISEO PORTILLO Y AUGUSTO CESAR MARTINEZ BONILLA', [
      { id: 'a15', name: 'MILTON GARCIA (hosp).pdf', size: 900000, mime: 'application/pdf', ocr: 'CONTRATANTE: INGENIO CENTRAL AZUCARERO JIBOA, S.A. DE C.V.\nPÓLIZA No.: SALC-507549 FECHA: 06 DE OCTUBRE DEL 2026\nAFILIADO:\n(Empleado) MILTON ROLANDO GARCIA PINEDA CERTIFICADO No.: 78\nASEGURADO:\n(Afectado) MILTON ROLANDO GARCIA PINEDA PARENTESCO: TITULAR\nSE REMITEN LOS SIGUIENTES DOCUMENTOS\n1 Factura(s) POR HOSPITALIZACIÓN US$612.40\n1 Factura(s) POR HONORARIOS MÉDICOS US$150.00\nTOTAL DE LA RECLAMACIÓN US$762.40\nINFORME MÉDICO SI NO Dr.: Ricardo Antonio Mena' },
      { id: 'a16', name: 'ELISEO PORTILLO (hosp).pdf', size: 700000, mime: 'application/pdf', ocr: 'CONTRATANTE: INGENIO CENTRAL AZUCARERO JIBOA, S.A. DE C.V.\nPÓLIZA No.: SALC-507549 FECHA: 06 DE OCTUBRE DEL 2026\nAFILIADO:\n(Empleado) ELISEO ALEXANDER PORTILLO BONILLA CERTIFICADO No.: 131\nASEGURADO:\n(Afectado) ELISEO ALEXANDER PORTILLO BONILLA PARENTESCO: TITULAR\nSE REMITEN LOS SIGUIENTES DOCUMENTOS\n1 Factura(s) DE FARMACIA US$88.15\nTOTAL DE LA RECLAMACIÓN US$88.15\nINFORME MÉDICO SI NO Dr.: Karen Lissette Ayala' },
      { id: 'a18', name: 'AUGUSTO MARTINEZ (nota y reclamo).pdf', size: 1100000, mime: 'application/pdf', ocr: 'INJIBOA Ingenio Central Azucarero Jiboa, S.A. de C.V. San Vicente, 06 de octubre de 2026\nLicenciada Silvia Magdalena Vega de Díaz, Asegurador SISA. Presente. Por medio de la presente remitimos reclamos de gastos médicos.\n\nCONTRATANTE: INGENIO CENTRAL AZUCARERO JIBOA, S.A. DE C.V.\nPÓLIZA No.: SALC-507549 FECHA: 06 DE OCTUBRE DEL 2026\nAFILIADO:\n(Empleado) AUGUSTO CESAR MARTINEZ BONILLA CERTIFICADO No.: 117\nASEGURADO:\n(Afectado) AUGUSTO CESAR MARTINEZ BONILLA PARENTESCO: TITULAR\nSE REMITEN LOS SIGUIENTES DOCUMENTOS\n1 Factura(s) POR SERVICIOS DE LABORATORIO US$54.00\nTOTAL DE LA RECLAMACIÓN US$54.00\nINFORME MÉDICO SI NO Dr.: Teresa Ester Cea de Orellana' }
    ], 'Buen día Lic. Silvia y Ricardo, adjunto envío nota y documentos por gastos médicos de los asegurados:\nMILTON ROLANDO GARCIA, ELISEO PORTILLO Y AUGUSTO CESAR MARTINEZ BONILLA\nGracias de antemano'),
    mail('m11', 0, 11, 'mbonilla@injiboa.com.sv', 'Maricela Bonilla (INJIBOA)', 'RE: Reclamos gastos médicos semana 40', 'Buenas, se me olvidó la factura del laboratorio de José Mauricio. Se la adjunto. Saludos.', [{ id: 'a11', name: 'Factura laboratorio JM Landaverde.pdf', size: 120000, mime: 'application/pdf' }], 'Buenas, se me olvidó la factura del laboratorio de José Mauricio. Se la adjunto.\nSaludos.\n\nEl lun, 6 oct 2026 a las 10:02, Silvia de Díaz escribió:\n> Recibido, gracias.', { raiz: '<m9@demo>' }),
    mail('m12', 0, 9, 'mbonilla@injiboa.com.sv', 'Maricela Bonilla (INJIBOA)', 'RE: Consulta sobre deducible', 'Gracias Silvia, entonces el deducible aplica por evento. Saludos.', [], 'Gracias Silvia, entonces el deducible aplica por evento.\nSaludos.\n\nEl vie, 2 oct 2026 a las 15:40, Silvia de Díaz escribió:\n> El deducible es de $50 por evento.', { raiz: '<consulta-deducible@demo>' }),
    mail('m10', 0, 7, 'notificaciones@sisa.com.sv', 'SISA Notificaciones', 'Solicitud de información · Reclamo VI-RC-2026-7731', 'Para continuar con el reclamo VI-RC-2026-7731 necesitamos la constancia de alta médica firmada.', [], 'Estimado corredor:\nPara continuar con el reclamo VI-RC-2026-7731 necesitamos la constancia de alta médica firmada por el médico tratante.\nAtentamente, SISA.'),
    mail('m9', 0, 10, 'mbonilla@injiboa.com.sv', 'Maricela Bonilla (INJIBOA)', 'Reclamos gastos médicos semana 40', 'Buenos días, adjunto reclamos de gastos médicos de empleados para su trámite con la aseguradora. Saludos cordiales.', [{ id: 'a9', name: 'Reclamos semana 40.pdf', size: 1840000, mime: 'application/pdf', ocr: "CONTRATANTE: INGENIO CENTRAL AZUCARERO JIBOA, S.A. DE C.V.\nPÓLIZA No.: SALC-507549 FECHA: 06 DE OCTUBRE DEL 2026\nAFILIADO:\n(Empleado) AUGUSTO CESAR MARTINEZ BONILLA CERTIFICADO No.: 117\nASEGURADO:\n(Afectado) ADRIANA REBECA MARTINEZ JIMENEZ PARENTESCO: HIJA\nSE REMITEN LOS SIGUIENTES DOCUMENTOS\n1 Factura(s) POR HONORARIOS MÉDICOS US$15.00\n1 Factura(s) DE FARMACIA (Adjunto recetas) US$26.25\nTOTAL DE LA RECLAMACIÓN US$41.25\nINFORME MÉDICO SI NO Dr.: Teresa Ester Cea de Orellana\nNOMBRE: JUAN FRANCISCO CARRILLO MENDOZA\nCARGO: Encargado de Planillas/RRHH, INJIBOA, S.A. de C.V.\n\nFARMACIA SAN NICOLAS Factura 0045123 Acetaminofén 500 mg x 20 US$ 4.75 Amoxicilina 500 mg x 21 US$ 21.50\nRECETA MÉDICA Dra. Teresa Cea de Orellana Paciente: Adriana Martínez Indicaciones: tomar cada 8 horas\n\nCONTRATANTE: INGENIO CENTRAL AZUCARERO JIBOA, S.A. DE C.V.\nPÓLIZA No.: SALC-507549 FECHA: 06 DE OCTUBRE DEL 2026\nAFILIADO:\n(Empleado) JOSE MAURICIO LANDAVERDE FLORES CERTIFICADO No.: 203\nASEGURADO:\n(Afectado) JOSE MAURICIO LANDAVERDE FLORES PARENTESCO: TITULAR\nSE REMITEN LOS SIGUIENTES DOCUMENTOS\n1 Factura(s) POR SERVICIOS DE LABORATORIO US$38.00\n1 Factura(s) POR HONORARIOS MÉDICOS US$30.00\nTOTAL DE LA RECLAMACIÓN US$68.00\nINFORME MÉDICO SI NO Dr.: Carlos Ernesto Rivas Alas" }]),
    mail('m7', 0, 9, 'rrhh@lasbrisas.com.sv', 'Mauricio Guardado', 'Reembolsos de gastos médicos de septiembre', 'Buen día Silvia, le envío tres reembolsos del colectivo de gastos médicos para que los ingrese a Pan-American…', [
      { id: 'a6', name: 'Reembolso Karla Ventura.pdf', size: 410000, mime: 'application/pdf' },
      { id: 'a7', name: 'Reembolso Luis Pineda.pdf', size: 655000, mime: 'application/pdf' },
      { id: 'a8', name: 'Reembolso Mauricio Guardado.pdf', size: 302000, mime: 'application/pdf' }
    ], 'Buen día Silvia, le envío tres reembolsos del colectivo de gastos médicos para que los ingrese a Pan-American:\n1. Karla Beatriz Ventura: consulta de control y exámenes de laboratorio, $145.00\n2. Luis Alonso Pineda: terapia física, 6 sesiones, $210.00\n3. Mauricio Guardado Ayala: medicamentos de septiembre, $86.40\nVan los PDF con facturas y recetas. Saludos.'),
    mail('m8', 0, 7, 'reclamos@palig.com', 'Pan-American Life Reclamos', 'Registro de reclamos · Póliza GMC-118734', 'Le confirmamos el registro de los siguientes reclamos de la póliza GMC-118734…', [], 'Estimado corredor, le confirmamos el registro de los siguientes reclamos de la póliza GMC-118734 (Grupo Agroindustrial Las Brisas):\n- Luis Alonso Pineda: reclamo PAL-GM-2026-31902\n- Mauricio Guardado Ayala: reclamo PAL-GM-2026-31903\nTiempo estimado de respuesta: 8 días hábiles.'),
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

  const Aj = [{ id: 'remitentes', valor: 'injiboa.com.sv, hibronsa.com.sv', ...by(R, -1, 9) }, { id: 'aseg-dominios', valor: 'sisa.com.sv = SISA\npalig.com = Pan-American Life\nfedecredito.com.sv = Seguros Fedecrédito\nasesuisa.com = ASESUISA', ...by(R, -1, 9) },
    { id: 'auto-remitentes', valor: 'mbonilla@injiboa.com.sv', ...by(R, -1, 9) }, { id: 'auto-desde', valor: ts(0, 0, 1), ...by(R, -1, 9) }, { id: 'migr-remit-1', valor: '1', ...by(R, -1, 9) }];
  return { clientes: C, polizas: P, tramites: Tm, pagos: Pg, bitacora: bit, correos: Co, ajustes: Aj, inbox };
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
