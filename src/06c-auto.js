/* ---------- Lectura automática de correos ----------
   1. Correos de aseguradoras (Aviso de reclamo, En análisis, Solicitud de información,
      Cheque disponible, Pago por transferencia): mueven el trámite que les corresponde.
   2. Correos NUEVOS de remitentes que solo mandan reclamos o modificaciones (Maricela):
      se vuelven trámites; si es un reclamo con formularios en PDF, uno por formulario.
   3. Respuestas dentro de una conversación: se anotan en el trámite de esa conversación.
      Si la conversación no es de ningún trámite, no se crea nada.
   Lo que no entiende con seguridad se queda en la Bandeja como "Por revisar".
   Solo toca correos que llegaron desde que se activó (ajuste "auto-desde"), para no
   duplicar lo que ya se había registrado a mano. */

// Quita lo citado de una respuesta ("El lun, … escribió:", "De: …", líneas con ">")
function sinCita(txt) {
  const t = String(txt || '');
  const cortes = [/\n\s*(El|On)\s[^\n]{5,200}(escribi[oó]|wrote)\s*:/i, /\n\s*-{2,}\s*(Mensaje original|Original Message|Mensaje reenviado|Forwarded message)/i, /\n\s*(De|From)\s*:\s[^\n]+\n\s*(Enviado|Sent|Fecha|Date)\s*:/i, /\n\s*_{8,}/];
  let fin = t.length;
  for (const r of cortes) { const m = t.match(r); if (m && m.index < fin) fin = m.index; }
  return t.slice(0, fin).split('\n').filter(l => !/^\s*>/.test(l)).join('\n').trim();
}
const resumenCuerpo = (m, n = 280) => { const s = sinCita(m.body || m.snippet || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const ESTADOS_CORREO = [
  { etapa: 'rechazado', n: 'Reclamo rechazado', re: /reclamos?.{0,25}(rechazad|declinad|no\s+procede)|rechazo\s+de(l)?\s+reclamo/, soloAsunto: true },
  { etapa: 'requerido', n: 'Solicitud de información', re: /solicitud\s+de\s+(informacion|documenta|documentos)|requerimiento\s+de\s+(informacion|documentos)|informacion\s+(adicional|pendiente|faltante)|documentos?\s+(pendientes?|faltantes?|adicionales?)/ },
  { etapa: 'pago', forma: 'Cheque', n: 'Cheque disponible', re: /cheques?\s+(esta[n]?\s+|se\s+encuentra[n]?\s+)?disponibles?|disponibles?.{0,40}cheques?/ },
  { etapa: 'pago', forma: 'Transferencia', n: 'Pago por transferencia', re: /notificacion\s+de\s+pago|pago.{0,40}transferencia|transferencia.{0,40}(realizada|aplicada|efectuada|a\s+la\s+cuenta)|abono\s+(a|en)\s+(su\s+)?cuenta|aviso\s+de\s+(deposito|transferencia)/ },
  { etapa: 'analisis', n: 'Reclamo en análisis', re: /reclamos?\s+en\s+(analisis|revision)|en\s+(proceso\s+de\s+)?analisis/ },
  { etapa: 'numero', n: 'Aviso de reclamo', re: /aviso\s+de\s+reclamo|registro\s+de(l)?\s+(su\s+)?reclamos?|reclamos?\s+(ha\s+sido\s+|fue\s+)?registrad|confirm\w*\s+(el\s+)?registro/ }
];

// ¿Qué dice la aseguradora? Primero el asunto; si no, el inicio del cuerpo.
function estadoDeCorreo(m, aseg) {
  if (!aseg) return null;
  const asunto = norm(m.subject), cuerpo = norm(sinCita(m.body || m.snippet || '')).slice(0, 1500);
  return ESTADOS_CORREO.find(e => e.re.test(asunto)) || ESTADOS_CORREO.find(e => !e.soloAsunto && e.re.test(cuerpo)) || null;
}

// Todos los códigos que podrían ser números de reclamo
const codigosEn = txt => [...new Set((String(txt).match(/[A-Z0-9][A-Z0-9-]{4,}/gi) || []).filter(x => /\d/.test(x)).map(x => norm(x).replace(/-+$/, '')))];

// ¿Aparece este nombre en el texto? (al menos 2 palabras y 2/3 del nombre)
function nombreEn(nombre, set) {
  const tk = tokens(nombre).filter(w => w.length > 2);
  if (tk.length < 2) return 0;
  const hits = tk.filter(w => set.has(w)).length;
  return hits >= 2 && hits / tk.length >= 0.66 ? hits / tk.length : 0;
}

// La conversación (Message-ID raíz) de un trámite
function tramitePorHilo(raiz) {
  if (!raiz) return null;
  const t = DB.tramites.find(t => t.hilo === raiz);
  if (t) return t;
  const c = DB.correos.find(c => c.hilo === raiz && c.tramiteId && tramite(c.tramiteId));
  if (c) return tramite(c.tramiteId);
  const orig = (S.inbox || []).find(m => m.mid === raiz);
  return orig ? DB.tramites.find(t => t.gmailId && t.gmailId === orig.id) || null : null;
}

/* El trámite al que se refiere un aviso de la aseguradora.
   Devuelve { t, por } si hay uno solo claro; { dudas: [...] } si hay varios. */
function tramiteParaEstado(m, k) {
  const txt = `${m.subject || ''}\n${sinCita(m.body || m.snippet || '')}`;
  const cods = codigosEn(txt);
  const porNum = DB.tramites.filter(t => t.numeroReclamo && cods.includes(norm(t.numeroReclamo)));
  if (porNum.length === 1) return { t: porNum[0], por: 'número' };
  const h = tramitePorHilo(m.raiz);
  if (h) return { t: h, por: 'conversación' };
  const set = new Set(tokens(txt));
  const deAseg = t => !k.aseguradora || !t.aseguradora || norm(t.aseguradora) === norm(k.aseguradora) || norm(t.aseguradora).includes(norm(k.aseguradora)) || norm(k.aseguradora).includes(norm(t.aseguradora));
  const soloReclamos = k.estado?.etapa !== 'requerido';
  const cands = DB.tramites.filter(t => tramiteAbierto(t) && deAseg(t) && (!soloReclamos || t.tipo === 'Reclamo') && (k.estado?.etapa !== 'numero' || !t.numeroReclamo) && (k.estado?.etapa !== 'pago' || t.etapa !== 'recibido'));
  const puntos = cands.map(t => {
    let s = Math.max(nombreEn(t.paciente, set), nombreEn(t.asegurado, set), nombreEn(clienteNombre(t.clienteId), set) * 0.8);
    if (s && k.monto && +t.monto === +k.monto) s += 0.5;
    const p = poliza(t.polizaId);
    if (s && p && cods.includes(norm(p.numero))) s += 0.3;
    return { t, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!puntos.length) return null;
  if (puntos.length === 1 || puntos[0].s - puntos[1].s >= 0.3) return { t: puntos[0].t, por: 'nombre' };
  return { dudas: puntos.slice(0, 6).map(x => x.t) };
}

/* Aplica un aviso de la aseguradora a un trámite. auto = lo hizo la app sola. */
async function aplicarEstado(m, k, t0, auto = false) {
  const e = k.estado, aseg = k.aseguradora || t0.aseguradora || 'La aseguradora';
  const pref = auto ? 'Automático · ' : '';
  if (e.etapa === 'pago') {
    if (!(+k.monto > 0)) return null; // sin monto, se registra a mano
    const ya = DB.pagos.find(p => p.tramiteId === t0.id && Math.abs(+p.monto - +k.monto) < 0.01);
    if (ya) { await markMail(m.id, `${pref}${t0.codigo}: pago ya estaba registrado`, t0.id, auto ? 'auto' : 'procesado'); return t0; }
    const pg = { id: '', tramiteId: t0.id, clienteId: t0.clienteId, aseguradora: t0.aseguradora || k.aseguradora, forma: e.forma, numero: k.numero || '', banco: '', monto: +k.monto, fechaAviso: (m.fecha || nowISO()).slice(0, 10), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: e.forma === 'Cheque' ? 'disponible' : 'depositado', notas: `${m.subject || ''}${auto ? ' (registrado solo desde el correo)' : ''}` };
    if (pg.estado === 'depositado') { pg.fechaEntregado = pg.fechaAviso; pg.entregadoA = 'Transferencia de ' + aseg; }
    await save('pagos', pg, `${pg.forma} ${pg.numero} por ${fmtMoney(pg.monto)} · ${t0.codigo}${auto ? ' (automático)' : ''}`.replace(/\s+/g, ' '));
    const t = tramite(t0.id), antes = t.etapa;
    t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'correo', auto, texto: `${aseg}: ${e.n} por ${fmtMoney(pg.monto)}${pg.numero ? ' (n.º ' + pg.numero + ')' : ''}.` }];
    await linkPagoTramite(pg, true); // mueve el trámite a Pago disponible (o lo cierra si fue transferencia)
    if (t.etapa === antes) await save('tramites', t, `${t.codigo}: ${e.n}`).catch(() => { });
    await markMail(m.id, `${pref}${t0.codigo} → ${e.n} ${fmtMoney(pg.monto)}`, t0.id, auto ? 'auto' : 'procesado');
    return tramite(t0.id);
  }
  const t = structuredClone(t0);
  const cambios = [];
  if (k.reclamo && !t.numeroReclamo && e.etapa !== 'rechazado' && !DB.tramites.some(x => x.id !== t.id && norm(x.numeroReclamo) === norm(k.reclamo))) { t.numeroReclamo = k.reclamo; cambios.push('número ' + k.reclamo); }
  const destino = e.etapa === 'numero' ? (t.numeroReclamo ? 'numero' : 'ingresado') : e.etapa;
  const puede = !tramiteAbierto(t) ? false
    : destino === 'requerido' ? rangoEtapa(t.etapa) < 5
    : destino === 'rechazado' ? true
    : rangoEtapa(destino) > rangoEtapa(t.etapa) || (t.etapa === 'requerido' && destino === 'analisis');
  const ev = { fecha: nowISO(), por: S.me.email, tipo: 'correo', auto, texto: `${aseg}: ${e.n}${k.reclamo ? ' · ' + k.reclamo : ''} («${m.subject || 'sin asunto'}»).` };
  if (e.etapa === 'requerido') { const r = resumenCuerpo(m, 260); if (r) ev.texto += ` Piden: ${r}`; }
  if (puede && destino !== t.etapa) {
    t.etapa = destino; ev.tipo = 'etapa'; ev.a = destino; ev.correo = true;
    if (rangoEtapa(destino) >= 1 && !t.fechaIngreso) t.fechaIngreso = (m.fecha || nowISO()).slice(0, 10);
    cambios.push(destino === 'rechazado' ? 'Rechazado' : ETAPA[destino].n);
  }
  t.eventos = [...(t.eventos || []), ev];
  await save('tramites', t, `${t.codigo}: ${cambios.join(', ') || e.n}${auto ? ` (automático, correo de ${aseg})` : ''}`, puede ? 'movió' : undefined);
  await markMail(m.id, `${pref}${t.codigo} → ${cambios.join(', ') || e.n}`, t.id, auto ? 'auto' : 'procesado');
  return t;
}

/* Respuesta en la conversación de un trámite: se anota (y se guardan sus adjuntos). */
async function agregarNovedad(m, t0, auto = false) {
  const t = structuredClone(t0);
  let docs = [];
  if ((m.attachments || []).length) docs = await importAttachments(m, clienteNombre(t.clienteId)).catch(() => []);
  if (docs.length) t.docs = [...(t.docs || []), ...docs];
  const quien = m.fromName || m.from;
  t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'correo', auto, texto: `${quien} escribió en la conversación: ${resumenCuerpo(m) || m.subject}${docs.length ? ` (${docs.length} adjunto${docs.length > 1 ? 's' : ''} guardado${docs.length > 1 ? 's' : ''})` : ''}` }];
  await save('tramites', t, `${t.codigo}: correo de ${shortName(quien)}${auto ? ' (automático)' : ''}`);
  await markMail(m.id, `${auto ? 'Automático · ' : ''}Novedad en ${t.codigo}`, t.id, auto ? 'auto' : 'procesado');
  return t;
}

// ¿Reclamo o modificación? null si no queda claro.
function tipoDeCorreo(m) {
  const x = norm(`${m.subject || ''}\n${sinCita(m.body || m.snippet || '')}`);
  const rec = /reclam|reembols|gastos\s+medicos|formulario|factura|siniestro|hospital|consulta|medicament|receta|incapacidad/.test(x);
  const inc = /inclusi|incluir|\balta(s)?\b|ingreso\s+de\s+(personal|emplead)|nuevos?\s+emplead/.test(x);
  const exc = /exclusi|excluir|\bbajas?\b|retiro\s+de|renuncia|despido/.test(x);
  const mod = /modific|cambio\s+de|actualiz|endoso|correcci|beneficiari/.test(x);
  const otros = [inc, exc, mod].filter(Boolean).length;
  const t2 = () => inc && !exc ? 'Inclusión' : exc && !inc ? 'Exclusión' : 'Modificación';
  if (rec && !otros) return 'Reclamo';
  if (!rec && otros) return t2();
  const a = norm(m.subject);
  if (/reclam|reembols/.test(a)) return 'Reclamo';
  if (/inclu|exclu|modific|cambio|alta|baja/.test(a)) return /inclu|alta/.test(a) ? 'Inclusión' : /exclu|baja/.test(a) ? 'Exclusión' : 'Modificación';
  return null;
}

// El cliente de quien manda: por la póliza, por su correo o por su dominio (mbonilla@injiboa… → INJIBOA)
function clienteDeRemitente(m, k) {
  if (k.polizaId) return poliza(k.polizaId).clienteId;
  const from = String(m.from || '').toLowerCase(), dom = from.split('@')[1] || '';
  let c = DB.clientes.find(c => c.correo && c.correo.toLowerCase().trim() === from) || (dom && DB.clientes.find(c => c.correo && c.correo.toLowerCase().trim().endsWith('@' + dom)));
  if (!c && dom) { const marca = norm(dom.split('.')[0]); c = DB.clientes.find(c => tokens(c.nombre).includes(marca)) || (marca.length >= 5 ? clientePorNombre(marca, marca) : null); }
  return c?.id || k.clienteId || '';
}

const esPdf = a => /pdf|image/i.test(a.mime || '') || /\.(pdf|jpe?g|png)$/i.test(a.name || '');
async function textosPdf(m) {
  const pdfs = (m.attachments || []).filter(esPdf);
  if (!pdfs.length) return [];
  if (S.mode === 'demo') return pdfs.map(a => ({ ref: a.id, name: a.name, texto: a.ocr || '' }));
  return (await api('api/leer', { json: { mail: { id: m.id, cuenta: m.cuenta, partIds: pdfs.map(a => a.id) } } })).textos || [];
}
const responsableDe = m => { const c = (m.cuentas || [m.cuenta]).find(x => S.users.some(u => u.email === x)); return c || S.me.email; };

/* Correo nuevo de un remitente automático → trámite(s) */
async function crearAuto(m, k) {
  const tipo = tipoDeCorreo(m);
  if (!tipo) return null;
  const clienteId = clienteDeRemitente(m, k);
  const quien = m.fromName || m.from;
  const fecha = (m.fecha || nowISO()).slice(0, 10);
  const forms = tipo === 'Reclamo' ? (await textosPdf(m).catch(() => [])).flatMap(x => leerFormularios(x.texto).map(f => ({ f, ref: x.ref }))) : [];
  // Sin cliente reconocido solo se sigue si el formulario dice quién es el contratante (se crea al guardar)
  if (!clienteId && !forms.some(x => x.f.contratante)) return null;
  const carpeta = clienteId ? clienteNombre(clienteId) : shortName(nombrePropio(forms.find(x => x.f.contratante).f.contratante));
  const docs = (m.attachments || []).length ? await importAttachments(m, carpeta).catch(() => []) : [];
  const hechos = [];
  if (forms.length) {
    for (const x of forms) {
      const st = filaDeFormulario(x.f, null);
      if (st.tramiteId) continue; // ese reclamo ya estaba registrado
      if (!st.clienteId && clienteId) { st.clienteId = clienteId; st.clienteTxt = clienteNombre(clienteId); }
      if (!st.clienteId && st.clienteTxt) st.clienteTxt = nombrePropio(st.clienteTxt).replace(/\bS\.?\s*a\.?\s+de\s+c\.?\s*v\.?/i, 'S.A. de C.V.');
      await asegurarEntidades(st, poliza(st.polizaId)?.aseguradora || '');
      const suyos = docs.filter(d => d.partId === x.ref || d.id === 'demo-' + x.ref);
      const nt = nuevoReclamo(st, { etapa: 'recibido', fecha, gmailId: m.id, docs: suyos.length ? suyos : docs, aseguradora: poliza(st.polizaId)?.aseguradora || '', origen: `Recibido por correo de ${quien}. SIMEVI lo creó solo leyendo el formulario del PDF.` });
      nt.hilo = m.raiz || ''; nt.responsable = responsableDe(m); nt.eventos[0].auto = true;
      await save('tramites', nt, `${nt.codigo} Reclamo · ${shortName(clienteNombre(nt.clienteId))} › ${nt.asegurado} (automático)`);
      hechos.push(nt);
    }
    if (!hechos.length) { await markMail(m.id, 'Automático · los reclamos del PDF ya estaban registrados', '', 'auto'); return []; }
  } else {
    const ps = DB.polizas.filter(p => p.clienteId === clienteId && !p.cancelada);
    const pid = k.polizaId || (ps.length === 1 ? ps[0].id : '');
    const t = {
      id: '', codigo: nextCodigo(), tipo, clienteId, polizaId: pid, aseguradora: poliza(pid)?.aseguradora || k.aseguradora || '', asunto: m.subject || tipo,
      descripcion: resumenCuerpo(m, 500), canal: CANALES[0], etapa: 'recibido', numeroReclamo: '', monto: tipo === 'Reclamo' && k.monto ? k.monto : '',
      fechaSolicitud: fecha, fechaIngreso: '', responsable: responsableDe(m), visibleCliente: true, notaCliente: '', docs,
      eventos: [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'recibido', auto: true, texto: `Recibido por correo de ${quien}. SIMEVI lo creó solo.` }], gmailId: m.id, hilo: m.raiz || ''
    };
    await save('tramites', t, `${t.codigo} ${tipo} · ${shortName(clienteNombre(clienteId))} (automático)`);
    hechos.push(t);
  }
  await markMail(m.id, `Automático · ${hechos.map(h => h.codigo).join(', ')}`, hechos[0].id, 'auto');
  return hechos;
}

/* Decide qué hacer con un correo. Devuelve lo que hizo o null si lo deja para revisar. */
async function autoCorreo(m) {
  const k = classify(m);
  if (k.estado) {
    if (!k.tramiteId || (k.estado.etapa === 'pago' && !(+k.monto > 0))) return null;
    if (extraer(m).rows.length > 1) return null; // varios reclamos en un aviso: mejor revisarlo
    return aplicarEstado(m, k, tramite(k.tramiteId), true);
  }
  if (esRespuesta(m)) { const t = tramitePorHilo(m.raiz); return t ? agregarNovedad(m, t, true) : null; }
  if (coincide(m.from, autoRemitentes())) return crearAuto(m, k);
  return null;
}

async function procesarAuto() {
  if (S.autoCorriendo || ajuste('auto-activo', 'si') === 'no') return;
  S.autoCorriendo = true;
  try {
    if (S.mode === 'live') await loadLive().catch(() => { }); // ver lo que hizo la otra persona antes de crear nada
    // Una sola vez: se suma hibronsa.com.sv a los remitentes ya guardados
    const rem = DB.ajustes.find(a => a.id === 'remitentes');
    if (rem && !ajuste('migr-remit-1', '') && !/hibronsa/.test(rem.valor)) { await save('ajustes', { ...rem, valor: rem.valor + ', hibronsa.com.sv' }, 'Remitentes: hibronsa.com.sv').catch(() => { }); }
    if (!ajuste('migr-remit-1', '')) await save('ajustes', { id: 'migr-remit-1', valor: '1' }, 'Ajuste interno').catch(() => { });
    let desde = ajuste('auto-desde', '');
    if (!desde) { desde = nowISO(); await save('ajustes', { id: 'auto-desde', valor: desde }, 'Lectura automática de correos activada').catch(() => { }); }
    const cola = (S.inbox || []).filter(m => !mailDone(m) && String(m.fecha) >= desde).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    let n = 0;
    for (const m of cola) {
      if (mailDone(m)) continue;
      try { const r = await autoCorreo(m); if (r) n++; } catch (e) { console.warn('auto', m.subject, e); }
    }
    if (n) {
      render(false);
      toast(`SIMEVI procesó ${n} ${n === 1 ? 'correo' : 'correos'} solo`, '', { label: 'Ver', run: () => { S.f.bandeja = 'hechos'; saveFilters(); go('bandeja'); } });
    }
  } finally { S.autoCorriendo = false; }
}
