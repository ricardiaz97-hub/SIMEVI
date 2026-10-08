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

// Campos que SISA pone en sus notificaciones (Póliza:, Cliente:/Contratante:, Asegurado:, Tipo de trámite:, Código Referencia:)
function camposAviso(txt) {
  const t = String(txt || '');
  const g = re => { const x = t.match(re); return x ? limpiar(x[1]).slice(0, 90) : ''; };
  return {
    poliza: g(/P[oó]liza\s*(?:No\.?|N[°º])?\s*:\s*([A-Z0-9][A-Z0-9._-]*[A-Z0-9])/i),
    cliente: g(/(?:Cliente|Contratante)\s*:\s*([^\n]+?)(?=\s{2,}|\s+Asegurado\s*:|\s+Tipo de|\n|$)/i).replace(/[\s.]+$/, ''),
    asegurado: g(/Asegurado\s*(?:\(\s*afectado\s*\))?\s*:\s*([^\n]+?)(?=\s{2,}|\s+Estimad|\s+P[oó]liza|\n|$)/i),
    tipo: g(/Tipo\s+de\s+tr[aá]mite\s*:\s*([^\n]+?)(?=\s+Observaci|\n|$)/i),
    referencia: ((t.match(/C[oó]digo\s+(?:de\s+)?Referencia\s*:\s*([A-Z0-9][A-Z0-9._-]*[A-Z0-9])/i) || t.match(/bajo\s+la\s+referencia\s*:?\s*([A-Z0-9][A-Z0-9._-]*[A-Z0-9])/i) || [])[1] || '').toUpperCase()
  };
}

const ESTADOS_CORREO = [
  { etapa: 'rechazado', n: 'Reclamo rechazado', re: /reclamos?.{0,25}(rechazad|declinad|no\s+procede)|rechazo\s+de(l)?\s+reclamo/, soloAsunto: true },
  { etapa: 'requerido', n: 'Solicitud de información', re: /solicitud\s+de\s+(informacion|documenta|documentos)|requerimiento\s+de\s+(informacion|documentos)|informacion\s+(adicional|pendiente|faltante)|documentos?\s+(pendientes?|faltantes?|adicionales?)/ },
  { etapa: 'pago', forma: 'Cheque', n: 'Cheque disponible', re: /cheques?\s+(esta[n]?\s+|se\s+encuentra[n]?\s+)?disponibles?|disponibles?.{0,40}cheques?/ },
  { etapa: 'pago', forma: 'Transferencia', n: 'Pago por transferencia', re: /notificacion\s+de\s+pago|pago.{0,40}transferencia|transferencia.{0,40}(realizada|aplicada|efectuada|a\s+la\s+cuenta)|abono\s+(a|en)\s+(su\s+)?cuenta|aviso\s+de\s+(deposito|transferencia)/ },
  { etapa: 'analisis', n: 'Reclamo en análisis', re: /reclamos?\s+en\s+(analisis|revision)|en\s+(proceso\s+de\s+)?analisis/ },
  { etapa: 'numero', n: 'Trámite registrado', otros: true, re: /tramite\s+registrado|registrado\s+bajo\s+la\s+referencia|su\s+informacion\s+ha\s+sido\s+recibida/ },
  { etapa: 'numero', n: 'Aviso de reclamo', re: /aviso\s+de\s+reclamo|registro\s+de(l)?\s+(su\s+)?reclamos?|reclamos?\s+(ha\s+sido\s+|fue\s+)?registrad|confirm\w*\s+(el\s+)?registro/ }
];

// ¿Qué dice la aseguradora? Primero el asunto; si no, el inicio del cuerpo.
function estadoDeCorreo(m, aseg) {
  if (!aseg) return null;
  const asunto = norm(m.subject), cuerpo = norm(sinCita(m.body || m.snippet || '')).slice(0, 1500);
  return ESTADOS_CORREO.find(e => e.re.test(asunto)) || ESTADOS_CORREO.find(e => !e.soloAsunto && e.re.test(cuerpo)) || null;
}

// Todos los códigos que podrían ser números de reclamo
const codigosEn = txt => [...new Set((String(txt).match(/[A-Z0-9][A-Z0-9._-]{4,}/gi) || []).filter(x => /\d/.test(x)).map(x => norm(x).replace(/[-.]+$/, '')))];

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
  const cv = k.campos || camposAviso(txt);
  // Nombre: el campo "Asegurado:" si viene; si no, todo el texto
  const set = new Set(tokens(cv.asegurado || txt));
  const pol = polizaPorNumero(cv.poliza);
  const cli = cv.cliente ? clientePorNombre(cv.cliente, txt) : null;
  const deAseg = t => !k.aseguradora || !t.aseguradora || norm(t.aseguradora) === norm(k.aseguradora) || norm(t.aseguradora).includes(norm(k.aseguradora)) || norm(k.aseguradora).includes(norm(t.aseguradora));
  const e = k.estado || {};
  // Aviso de reclamo, análisis, cheque → reclamos; "Trámite registrado" → modificaciones, inclusiones…
  const tipoOk = t => e.otros ? t.tipo !== 'Reclamo' : e.etapa === 'requerido' ? true : t.tipo === 'Reclamo';
  const cands = DB.tramites.filter(t => tramiteAbierto(t) && deAseg(t) && tipoOk(t) && (e.etapa !== 'numero' || !t.numeroReclamo) && (e.etapa !== 'pago' || t.etapa !== 'recibido'));
  const puntos = cands.map(t => {
    const nom = Math.max(nombreEn(t.paciente, set), nombreEn(t.asegurado, set), nombreEn(clienteNombre(t.clienteId), set) * 0.8);
    const dePol = pol && t.polizaId === pol.id, deCli = cli && t.clienteId === cli.id;
    let s = nom;
    if (e.otros) { // trámites que no son reclamo: por cliente o póliza, y el tipo de trámite para desempatar
      if (!dePol && !deCli) return { t, s: 0 };
      s = (dePol ? 0.6 : 0) + (deCli ? 0.4 : 0) + (cv.tipo ? parecido(cv.tipo, `${t.tipo} ${t.asunto} ${t.descripcion}`) * 0.5 : 0);
    } else if (nom) {
      if (dePol) s += 0.4; else if (deCli) s += 0.2;
      if (k.monto && +t.monto === +k.monto) s += 0.5;
      if (pol && t.polizaId && !dePol) s -= 0.6; // otra póliza: casi seguro no es
    }
    return { t, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!puntos.length) return null;
  if (puntos.length === 1 || puntos[0].s - puntos[1].s >= 0.3) return { t: puntos[0].t, por: e.otros ? 'cliente y póliza' : 'nombre' };
  return { dudas: puntos.slice(0, 6).map(x => x.t) };
}

/* Aplica un aviso de la aseguradora a un trámite. auto = lo hizo la app sola. */
async function aplicarEstado(m, k, t0, auto = false) {
  const e = k.estado, aseg = k.aseguradora || t0.aseguradora || 'La aseguradora';
  const pref = auto ? 'Automático · ' : '';
  if (e.etapa === 'pago' && !(+k.monto > 0) && (m.attachments || []).some(esPdf)) {
    // SISA no pone el monto en el correo; viene en la carta de liquidación adjunta
    const mm = await montoDeAdjuntos(m).catch(() => 0);
    if (mm) k.monto = mm;
  }
  if (e.etapa === 'pago' && !(+k.monto > 0)) {
    // Sin monto: el trámite pasa a Pago disponible y en Inicio queda "Registra el cheque"
    const t = structuredClone(t0);
    if (!tramiteAbierto(t)) return null;
    if (!t.numeroReclamo && k.reclamo) t.numeroReclamo = k.reclamo;
    const mueve = t.etapa !== 'pago';
    if (mueve) t.etapa = 'pago';
    t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: mueve ? 'etapa' : 'correo', ...(mueve ? { a: 'pago', correo: true } : {}), auto, texto: `${aseg}: ${e.n}${k.reclamo ? ' · ' + k.reclamo : ''}. El correo no trae el monto: registra el ${e.forma === 'Cheque' ? 'cheque' : 'pago'} cuando lo tengas.` }];
    await save('tramites', t, `${t.codigo}: ${e.n} (falta el monto)`, mueve ? 'movió' : undefined);
    await markMail(m.id, `${pref}${t.codigo} → ${e.n} (falta el monto)`, t.id, auto ? 'auto' : 'procesado');
    return t;
  }
  if (e.etapa === 'pago') {
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
  if (!t.aseguradora && k.aseguradora) t.aseguradora = k.aseguradora;
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
async function textosAdj(m, soloPdf = false) {
  const lista = (m.attachments || []).filter(soloPdf ? esPdf : leible).slice(0, 8);
  if (!lista.length) return [];
  if (S.mode === 'demo') return lista.map(a => ({ ref: a.id, name: a.name, texto: a.ocr || '' }));
  return (await api('api/leer', { json: { mail: { id: m.id, cuenta: m.cuenta, partIds: lista.map(a => a.id) } } })).textos || [];
}
const textosPdf = m => textosAdj(m, true);
// Copia a Drive un adjunto cuando hace falta (en la carpeta del cliente); se recuerda para no copiarlo dos veces
function docDeCorreo(m) {
  const cache = {};
  return async (ref, cid) => {
    const key = (cid || '') + '|' + ref;
    if (cache[key]) return cache[key];
    const a = (m.attachments || []).find(x => x.id === ref); if (!a) return null;
    if (S.mode === 'demo') return (cache[key] = { id: 'demo-' + ref, name: a.name, size: a.size });
    const d = await api('api/gmail', { json: { id: m.id, cuenta: m.cuenta, attachments: [ref], folder: clienteNombre(cid) || 'Sin cliente' } }).catch(() => null);
    return (cache[key] = d?.docs?.[0] || null);
  };
}

// El monto a pagar en una carta de liquidación
async function montoDeAdjuntos(m) {
  const textos = await textosPdf(m);
  for (const re of [/(a\s+pagar|reembolso|liquid|neto|total\s+pagado|valor\s+del\s+cheque)/i, /total/i]) {
    for (const x of textos) {
      const l = String(x.texto || '').split('\n').find(l => re.test(l) && montoDe(l));
      if (l) return montoDe(l);
    }
  }
  return 0;
}
// La aseguradora que se nombra en el formulario ("SISA VIDA, S.A.")
function aseguradoraEnTexto(txt) {
  const t = norm(txt);
  const x = asegDominios().find(a => a.nombre && new RegExp(`(^|[^a-z])${norm(a.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t));
  return x?.nombre || '';
}
const responsableDe = m => { const c = (m.cuentas || [m.cuenta]).find(x => S.users.some(u => u.email === x)); return c || S.me.email; };

/* Correo nuevo de un remitente automático → trámite(s) */
async function crearAuto(m, k) {
  const tipo = tipoDeCorreo(m);
  const clienteId = clienteDeRemitente(m, k);
  const quien = m.fromName || m.from;
  const fecha = (m.fecha || nowISO()).slice(0, 10);
  // Se leen todos los adjuntos: formularios de reclamo, inclusiones, exclusiones, beneficiarios…
  const leidos = (m.attachments || []).some(leible) ? (await textosAdj(m).catch(() => [])).map(x => ({ ...x, ...analizarDoc(x.texto, x.name) })) : [];
  const forms = leidos.flatMap(d => d.forms.map(f => ({ f, ref: d.ref })));
  const props = propuestasDeDocs(leidos, { clienteId, polizaId: k.polizaId }).filter(p => p.kind === 'tramite' && (p.clienteId || p.clienteTxt));
  if (!tipo && !forms.length && !props.length) return null;
  if (!clienteId && !forms.some(x => x.f.contratante) && !props.length) return null;
  const docBy = docDeCorreo(m);
  const hechos = [];
  for (const x of forms) {
    const st = filaDeFormulario(x.f, null);
    if (st.tramiteId) continue; // ese reclamo ya estaba registrado
    if (!st.clienteId && clienteId) { st.clienteId = clienteId; st.clienteTxt = clienteNombre(clienteId); }
    if (!st.clienteId && st.clienteTxt) st.clienteTxt = nombreEmpresa(st.clienteTxt);
    const asegF = poliza(st.polizaId)?.aseguradora || aseguradoraEnTexto(x.f.texto) || '';
    await asegurarEntidades(st, asegF);
    // Su PDF y los de apoyo (facturas sueltas, recetas)
    const refs = [x.ref, ...leidos.filter(d => d.tipo.apoyo).map(d => d.ref)];
    const docs = (await Promise.all([...new Set(refs)].map(r => docBy(r, st.clienteId)))).filter(Boolean);
    const nt = nuevoReclamo(st, { etapa: 'recibido', fecha, gmailId: m.id, docs, aseguradora: poliza(st.polizaId)?.aseguradora || asegF, origen: `Recibido por correo de ${quien}. SIMEVI lo creó solo leyendo el formulario del PDF.` });
    nt.hilo = m.raiz || ''; nt.responsable = responsableDe(m); nt.eventos[0].auto = true;
    await save('tramites', nt, `${nt.codigo} Reclamo · ${shortName(clienteNombre(nt.clienteId))} › ${nt.asegurado} (automático)`);
    hechos.push(nt);
  }
  if (props.length) hechos.push(...await guardarPropuestas(props, { mail: m, auto: true, docBy }));
  if (!hechos.length && (forms.length || props.length)) { await markMail(m.id, 'Automático · lo de los adjuntos ya estaba registrado', '', 'auto'); return []; }
  if (!hechos.length) {
    if (!tipo || !clienteId) return null;
    const ps = DB.polizas.filter(p => p.clienteId === clienteId && !p.cancelada);
    const pid = k.polizaId || (ps.length === 1 ? ps[0].id : '');
    const docs = (await Promise.all((m.attachments || []).map(a => docBy(a.id, clienteId)))).filter(Boolean);
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
    if (!k.tramiteId) return null;
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
