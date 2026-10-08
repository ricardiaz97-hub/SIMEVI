/* ---------- Bandeja de Gmail ---------- */
const DOMINIOS = { sisa: 'SISA', asesuisa: 'ASESUISA', pacifico: 'Seguros del Pacífico', mapfre: 'MAPFRE La Centro Americana', fedecredito: 'Seguros Fedecrédito', palig: 'Pan-American Life', panamerican: 'Pan-American Life', segurosazul: 'Seguros Azul', azul: 'Seguros Azul', davivienda: 'Davivienda Seguros', assa: 'ASSA', futuro: 'Seguros Futuro', acsa: 'Aseguradora Agrícola Comercial', atlantida: 'Atlántida Vida', qualitas: 'Quálitas' };
const DEFAULT_GMAIL_Q = 'newer_than:30d -category:promotions -category:social -category:updates';

/* Remitentes de confianza: la Bandeja solo trae correos de estos dominios o direcciones
   (más las aseguradoras y los correos de los clientes registrados), para no revisar todo Gmail. */
const REMITENTES_BASE = 'injiboa.com.sv, hibronsa.com.sv';
// Dominios de aseguradoras: sus correos mueven los trámites solos (aviso de reclamo, análisis, cheque…)
const ASEG_DOMINIOS_BASE = 'sisa.com.sv = SISA\npalig.com = Pan-American Life\nasesuisa.com = ASESUISA\nmapfre.com.sv = MAPFRE La Centro Americana';
// Remitentes que solo mandan reclamos o modificaciones: sus correos nuevos se vuelven trámites solos
const AUTO_BASE = 'mbonilla@injiboa.com.sv';
const ajuste = (id, def) => DB.ajustes.find(a => a.id === id)?.valor ?? def;
const listaCorreos = v => [...new Set(String(v || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
const coincide = (from, l) => { const f = String(from || '').toLowerCase(); return l.some(x => x.includes('@') ? f === x : (f.endsWith('@' + x) || f.endsWith('.' + x))); };
const remitentes = () => listaCorreos(ajuste('remitentes', REMITENTES_BASE));
const autoRemitentes = () => listaCorreos(ajuste('auto-remitentes', AUTO_BASE));
const conClientes = () => ajuste('remitentes-clientes', 'si') !== 'no';
function asegDominios() {
  return String(ajuste('aseg-dominios', ASEG_DOMINIOS_BASE)).split(/\n|;/).map(l => l.split(/=|:/)).map(([d, n]) => ({ dom: listaCorreos(d)[0] || '', nombre: (n || '').trim() })).filter(x => x.dom);
}
function filtroCorreos() {
  const l = [...remitentes(), ...autoRemitentes(), ...asegDominios().map(x => x.dom)];
  if (conClientes()) DB.clientes.forEach(c => { if (c.correo) l.push(c.correo.toLowerCase().trim()); });
  return [...new Set(l)];
}
const deConfianza = from => coincide(from, filtroCorreos());
function gmailQuery() {
  if (S.f.bandejaTodos) return S.f.gmailQ || DEFAULT_GMAIL_Q;
  const l = filtroCorreos();
  return l.length ? `newer_than:30d from:(${l.join(' OR ')})` : DEFAULT_GMAIL_Q;
}
// Respuestas dentro de una conversación anterior: no crean trámites nuevos
const esRespuesta = m => !!m.respuesta || /^\s*(re|rv|fw|fwd|res)\s*:/i.test(m.subject || '');
const correosVisibles = () => (S.inbox || []).filter(m => S.f.bandejaTodos || deConfianza(m.from));
const buzonNombre = c => firstName(S.users.find(u => u.email === c)) || c.split('@')[0];
// El mismo correo llega a Silvia y a Ricardo con distinto id; el Message-ID los une.
const mailKey = m => m.mid ? 'm:' + m.mid.replace(/[<>\s]/g, '') : m.id;
const mailRow = m => DB.correos.find(c => c.id === m.id || c.id === mailKey(m));
const mailDone = m => !!mailRow(m);

function aseguradoraDeCorreo(from) {
  const f = String(from || '').toLowerCase();
  const x = asegDominios().find(x => coincide(f, [x.dom]));
  if (x) return x.nombre || x.dom;
  const dom = norm(f.split('@')[1] || '');
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
  const cv = camposAviso(txt);
  if (pol) r.polizaNum = pol.toUpperCase();
  const cheque = txt.match(/cheque\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*(\d{5,})/i);
  const ref = txt.match(/referencia\s*:?\s*([A-Z0-9-]{5,})/i);
  // Número de reclamo: se prefiere "número de reclamo X" y se descartan números de póliza conocidos.
  const polizas = new Set(DB.polizas.map(p => norm(p.numero)).concat(r.polizaNum ? [norm(r.polizaNum)] : []));
  const cands = [...txt.matchAll(/(n[uú]mero\s+de\s+)?(?:reclamo|siniestro|caso|gesti[oó]n)\s*(?:n[°oº.]*|#|n[uú]mero)?\s*[:,]?\s*([A-Z]{1,6}-[A-Z0-9-]*\d[A-Z0-9-]*|\d{5,})/gi)]
    .filter(x => !polizas.has(norm(x[2])))
    .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0));
  let num = cands[0] ? [cands[0][0], cands[0][2]] : null;
  // Referencia de trámite (MOD-57.1_511432) o código suelto tipo SALC-133283-2026
  if (cv.referencia) num = [cv.referencia, cv.referencia];
  if (!num) { const c = (txt.match(/\b[A-Z]{2,6}-\d{3,8}-\d{2,4}\b/g) || []).find(x => !polizas.has(norm(x))); if (c) num = [c, c]; }
  if (/cheques?\b.*disponibles?|disponibles?\b.*cheques?|dep[oó]sito|transferencia|abono\s+en\s+cuenta/i.test(txt) && r.aseguradora) {
    r.kind = 'pago';
    r.forma = /cheque/i.test(txt) ? 'Cheque' : /transferencia/i.test(txt) ? 'Transferencia' : 'Depósito';
    r.numero = cheque?.[1] || ref?.[1] || '';
  } else if (r.aseguradora && num) {
    r.kind = 'numero';
  }
  if (num) r.reclamo = num[1].toUpperCase();
  // ¿De quién es?
  const p = polizaPorNumero(cv.poliza || r.polizaNum);
  if (p) { r.polizaId = p.id; r.clienteId = p.clienteId; r.aseguradora = r.aseguradora || p.aseguradora; }
  if (!r.clienteId) { const c = DB.clientes.find(c => c.correo && norm(c.correo) === norm(m.from)); if (c) r.clienteId = c.id; }
  if (!r.clienteId && cv.cliente) { const c = clientePorNombre(cv.cliente, txt); if (c) r.clienteId = c.id; }
  if (!r.clienteId) { const c = DB.clientes.find(c => norm(txt).includes(norm(c.nombre.split(',')[0]))); if (c) r.clienteId = c.id; }
  r.campos = cv;
  // ¿Qué trámite?
  let t = r.reclamo && DB.tramites.find(t => t.numeroReclamo && norm(t.numeroReclamo) === norm(r.reclamo));
  if (!t && r.polizaId) t = DB.tramites.filter(t => t.polizaId === r.polizaId && tramiteAbierto(t)).sort((a, b) => ETAPAS.findIndex(e => e.k === a.etapa) - ETAPAS.findIndex(e => e.k === b.etapa))[0];
  if (!t && r.kind !== 'solicitud' && r.clienteId) t = DB.tramites.find(t => t.clienteId === r.clienteId && tramiteAbierto(t) && (!r.aseguradora || t.aseguradora === r.aseguradora));
  if (t) { r.tramiteId = t.id; r.clienteId = r.clienteId || t.clienteId; if (r.reclamo === t.numeroReclamo && r.kind === 'numero') r.kind = 'info'; }
  // Avisos de la aseguradora (Aviso de reclamo, En análisis, Solicitud de información, Cheque, Transferencia)
  r.estado = estadoDeCorreo(m, r.aseguradora);
  if (r.estado) {
    r.kind = r.estado.etapa === 'pago' ? 'pago' : r.estado.etapa === 'numero' ? 'numero' : 'estado';
    if (r.estado.forma) r.forma = r.estado.forma;
    r.numero = r.numero || cheque?.[1] || ref?.[1] || '';
    const x = tramiteParaEstado(m, r);
    r.tramiteId = x?.t?.id || ''; r.dudas = x?.dudas || []; r.por = x?.por || '';
    const tt = x?.t;
    if (tt) { r.clienteId = tt.clienteId; r.polizaId = r.polizaId || tt.polizaId; }
    if (tt && r.estado.etapa === 'numero' && tt.numeroReclamo && (!r.reclamo || norm(tt.numeroReclamo) === norm(r.reclamo)) && rangoEtapa(tt.etapa) >= 2) r.kind = 'info';
  } else if (esRespuesta(m)) r.conversacion = true;
  return r;
}

async function loadInbox(force) {
  if (S.mode === 'demo') { S.inbox = S.demoInbox; return; }
  if (S.inboxLoading || (S.inbox && !force)) return;
  S.inboxLoading = true; S.inboxErr = ''; S.inboxCode = '';
  if (S.route === 'bandeja') render(false);
  try {
    const d = await api('api/gmail?q=' + encodeURIComponent(gmailQuery()));
    // El mismo correo en los dos buzones se muestra una sola vez
    const vistos = new Map();
    for (const m of d.messages || []) {
      const k = mailKey(m), prev = vistos.get(k);
      if (prev) { if (!prev.cuentas.includes(m.cuenta)) prev.cuentas.push(m.cuenta); }
      else { m.cuentas = [m.cuenta]; vistos.set(k, m); }
    }
    S.inbox = [...vistos.values()];
    S.inboxAt = Date.now();
    S.buzones = d.buzones || [];
    if (d.errores?.length) S.inboxErr = d.errores.map(x => `${x.cuenta}: ${x.message}`).join(' · ');
  } catch (e) { S.inboxErr = e.message; S.inboxCode = e.data?.code || ''; S.inbox = S.inbox || []; }
  S.inboxLoading = false;
  render(false);
  if (S.inbox?.length && !S.inboxErr) procesarAuto();
}

VIEWS.bandeja = () => {
  if (!S.inbox && !S.inboxLoading) setTimeout(() => loadInbox());
  const f = S.f;
  const todos = correosVisibles().map(m => ({ m, k: classify(m), done: mailRow(m) }));
  const enPend = x => !x.done && !x.k.conversacion;
  const enConv = x => !x.done && x.k.conversacion;
  const list = todos.filter(f.bandeja === 'hechos' ? x => x.done : f.bandeja === 'conv' ? enConv : enPend);
  const btn = (act, id, label, cls = '', icon = '', extra = '') => `<button class="btn ${cls} sm" type="button" data-act="${act}" data-id="${esc(id)}" ${extra}>${icon ? ic(icon) : ''}${label}</button>`;
  const rows = list.map(({ m, k, done }) => {
    const t = done ? tramite(done.tramiteId) : tramite(k.tramiteId);
    const c = cliente(t?.clienteId || k.clienteId);
    if (done) k.por = '';
    let acts = '';
    const x = !done && !k.conversacion ? extraer(m) : null;
    const varios = x && x.rows.length > 1;
    const pdfs = !done && !k.estado && (m.attachments || []).some(esPdf);
    const auto = coincide(m.from, autoRemitentes());
    let pill;
    if (done) {
      acts = `<span class="tag">${av(done.creadoPor, 'sm')}${esc(done.nota || 'Procesado')}</span>`;
      const td = tramite(done.tramiteId);
      if (td) acts += btn('open-tramite', td.id, 'Abrir ' + esc(td.codigo), 'ghost', 'folder-open');
      acts += btn('mail-volver', m.id, 'Devolver a revisar', 'ghost');
    } else if (k.estado) {
      const dest = k.estado.etapa === 'numero' ? 'el número' : k.estado.etapa === 'pago' ? 'el pago' : `“${k.estado.etapa === 'rechazado' ? 'Rechazado' : ETAPA[k.estado.etapa].n}”`;
      if (varios) acts += btn('mail-varios', m.id, `Revisar los ${x.rows.length}`, 'primary', 'list-bullets');
      else if (k.kind === 'info') acts += `<span class="tag">${ic('check')}${t ? esc(t.codigo) + ' ya lo tiene' : 'Ya registrado'}</span>`;
      else if (t) acts += btn('mail-estado', m.id, `${k.kind === 'pago' ? 'Registrar pago en' : 'Poner ' + dest + ' en'} ${esc(t.codigo)}`, 'primary', k.kind === 'pago' ? 'hand-coins' : 'seal-check');
      else acts += btn('mail-estado', m.id, k.dudas?.length ? `¿Cuál de ${k.dudas.length}? Elegir trámite` : 'Elegir trámite', 'primary', 'folder-open', 'data-pick="1"');
      if (t && k.kind !== 'info' && !varios) acts += btn('mail-estado', m.id, 'Otro trámite', 'ghost', '', 'data-pick="1"');
      if (!t && !varios && k.kind !== 'info') acts += btn('mail-tramite', m.id, 'No estaba: crear trámite', '', 'plus');
      if (!t && !varios && k.kind === 'pago') acts += btn('mail-pago', m.id, 'Registrar pago suelto');
      acts += btn('mail-skip', m.id, 'Archivar', 'ghost');
      pill = `<span class="pill ${{ requerido: 'warn', rechazado: 'bad', pago: 'ok' }[k.estado.etapa] || 'gold'}">${esc(k.estado.n)}${varios ? ` · ${x.rows.length}` : ''}</span>`;
    } else if (k.conversacion) {
      const th = tramitePorHilo(m.raiz);
      if (th) acts += btn('mail-novedad', m.id, 'Agregar a ' + esc(th.codigo), 'primary', 'plus');
      acts += btn('mail-novedad', m.id, th ? 'Otro trámite' : 'Agregar a un trámite', th ? 'ghost' : '', th ? '' : 'folder-open', 'data-pick="1"');
      acts += btn('mail-tramite', m.id, 'Es nuevo: crear trámite', 'ghost');
      acts += btn('mail-skip', m.id, 'Archivar', 'ghost');
      pill = `<span class="pill">Conversación</span>`;
    } else {
      if (pdfs) acts += btn('mail-leer', m.id, 'Leer reclamos del PDF', 'primary', 'sparkle');
      if (varios) {
        acts += btn('mail-varios', m.id, `Revisar los ${x.rows.length}`, pdfs ? '' : 'primary', 'list-bullets');
      } else {
        if (k.kind === 'pago') acts += btn('mail-pago', m.id, 'Registrar pago', 'primary', 'hand-coins');
        else if (k.kind === 'numero') acts += btn('mail-numero', m.id, t ? 'Poner número en ' + esc(t.codigo) : 'Asignar a un trámite', 'primary', 'seal-check');
        else acts += btn('mail-tramite', m.id, 'Crear trámite', pdfs ? '' : 'primary', 'plus');
        if (k.kind !== 'solicitud') acts += btn('mail-tramite', m.id, 'Crear trámite');
        if (k.kind === 'solicitud' && (m.attachments || []).length >= 2) acts += btn('mail-varios', m.id, 'Separar en varios');
      }
      acts += btn('mail-skip', m.id, 'Archivar', 'ghost');
      // Alguien de un remitente clave que manda reclamos o modificaciones: ofrecer que sus correos creen trámites solos
      if (!auto && k.kind === 'solicitud' && coincide(m.from, remitentes()) && tipoDeCorreo(m)) acts += btn('auto-sumar', m.id, `Que sus correos creen trámites solos`, 'ghost', 'sparkle', `data-v="${esc(m.from)}"`);
      pill = varios ? `<span class="pill gold">${x.rows.length} ${x.mode === 'pagos' ? 'pagos' : 'reclamos'}</span>`
        : k.kind === 'solicitud' ? `<span class="pill ${auto ? 'warn' : 'info'}">${auto ? 'Para revisar' : 'Nueva solicitud'}</span>`
        : `<span class="pill ${{ numero: 'gold', pago: 'ok', info: '' }[k.kind]}">${{ numero: 'Número de reclamo', pago: 'Pago disponible', info: 'Ya registrado' }[k.kind]}</span>`;
    }
    if (done) pill = done.estado === 'auto' ? `<span class="pill gold">${ic('sparkle')}Automático</span>` : '';
    if (S.mode === 'live') acts += `<a class="btn ghost sm" href="https://mail.google.com/mail/?authuser=${encodeURIComponent(m.cuenta || '')}#all/${esc(m.threadId || m.id)}" target="_blank" rel="noopener">${ic('arrow-square-out')}Gmail</a>`;
    const para = (S.buzones || []).length > 1 && (m.cuentas || [m.cuenta]).filter(Boolean);
    return `<article class="mail ${done ? 'done' : ''}">
      <div class="from">${ic('envelope-simple')}<b>${esc(m.fromName || m.from)}</b>${para && para.length ? `<span class="pill">Para ${esc(para.map(buzonNombre).join(' y '))}</span>` : ''}<span class="faint">${fmtAgo(m.fecha)}</span>${pill || ''}</div>
      <h3>${esc(m.subject || '(sin asunto)')}</h3>
      <p>${esc(k.conversacion ? resumenCuerpo(m, 220) : m.snippet || '')}</p>
      <div class="found">
        ${varios ? x.rows.map(r => `<span class="tag">${ic('user')}${esc(shortName(r.asegurado || 'Sin nombre'))}${r.numero ? ' · ' + esc(r.numero) : ''}${r.cheque ? ' · ch. ' + esc(r.cheque) : ''}${r.monto ? ' · ' + fmtMoney(r.monto) : ''}</span>`).join('') : c ? `<span class="tag">${ic('user')}${esc(c.nombre.split(',')[0])}</span>` : `<span class="tag faint">${ic('user')}Cliente no reconocido</span>`}
        ${k.polizaNum ? `<span class="tag">${ic('shield-check')}${esc(k.polizaNum)}</span>` : ''}
        ${k.reclamo && !varios ? `<span class="tag">${ic('seal-check')}${esc(k.reclamo)}</span>` : ''}
        ${k.monto && !varios ? `<span class="tag">${ic('money-wavy')}${fmtMoney(k.monto)}</span>` : ''}
        ${t && !varios ? `<span class="tag">${ic('folder-open')}${esc(t.codigo)}${t.paciente || t.asegurado ? ' · ' + esc(shortName(t.paciente || t.asegurado)) : ''}${k.por ? ` <span class="faint">(por ${esc(k.por)})</span>` : ''}</span>` : ''}
        ${!t && k.dudas?.length ? `<span class="tag faint">Puede ser ${k.dudas.map(d => esc(d.codigo)).join(', ')}</span>` : ''}
        ${(m.attachments || []).map(a => `<span class="attach">${ic('paperclip')}${esc(a.name)}</span>`).join('')}
      </div>
      <div class="acts">${acts}</div>
    </article>`;
  }).join('');
  const pendN = todos.filter(enPend).length, convN = todos.filter(enConv).length;
  const autoN = todos.filter(x => x.done?.estado === 'auto' && String(x.done.creado || '').slice(0, 10) === todayISO()).length;
  return head('Bandeja', 'Los avisos de las aseguradoras mueven los trámites solos, y los correos nuevos de remitentes automáticos se vuelven trámites. Lo que no queda claro se queda aquí para revisar.',
    `<button class="btn" type="button" data-act="inbox-refresh" ${S.inboxLoading ? 'disabled' : ''}>${ic('arrows-clockwise')}${S.inboxLoading ? 'Leyendo…' : 'Actualizar'}</button>`) + `
  ${autoN ? `<div class="banner auto-banner">${ic('sparkle')}<span>Hoy SIMEVI procesó <b>${autoN}</b> ${autoN === 1 ? 'correo' : 'correos'} solo. Están en <b>Procesados</b>, con su trámite.</span></div>` : ''}
  <div class="toolbar"><div class="seg" role="group" aria-label="Correos">
    <button type="button" data-act="filter" data-k="bandeja" data-v="pend" aria-pressed="${f.bandeja === 'pend'}">Por revisar${pendN ? ` · ${pendN}` : ''}</button>
    <button type="button" data-act="filter" data-k="bandeja" data-v="conv" aria-pressed="${f.bandeja === 'conv'}" title="Respuestas a correos anteriores. No crean trámites nuevos.">Conversaciones${convN ? ` · ${convN}` : ''}</button>
    <button type="button" data-act="filter" data-k="bandeja" data-v="hechos" aria-pressed="${f.bandeja === 'hechos'}">Procesados</button></div>
    <div class="seg" role="group" aria-label="Remitentes">
    <button type="button" data-act="bandeja-todos" data-v="" aria-pressed="${!f.bandejaTodos}">${ic('funnel')}Remitentes clave</button>
    <button type="button" data-act="bandeja-todos" data-v="1" aria-pressed="${!!f.bandejaTodos}">Todos</button></div>
    ${!f.bandejaTodos ? `<span class="muted" style="font-size:.8rem">${asegDominios().length} aseguradoras, ${remitentes().length + autoRemitentes().length} remitentes${conClientes() ? ` y ${DB.clientes.filter(c => c.correo).length} clientes` : ''} · <a href="#/ajustes">Editar</a></span>` : ''}</div>
  ${S.inboxCode === 'sin_gmail' ? `<div class="banner">${ic('envelope-simple')}<span>Para ver correos aquí, conecta tu Gmail de trabajo. Silvia conecta el suyo desde su sesión.</span><a class="btn primary sm" href="api/google/connect?para=gmail">${ic('google-logo')}Conectar mi Gmail</a></div>`
  : S.inboxErr ? `<div class="banner" style="background:var(--bad-soft);box-shadow:inset 0 0 0 1px var(--bad)">${ic('warning')}<span>No se pudo leer Gmail: ${esc(S.inboxErr)}</span><a class="btn sm" href="api/diagnose" target="_blank">Diagnóstico</a></div>` : ''}
  ${S.inboxCode === 'sin_gmail' ? '' : `<div class="panel">${S.inboxLoading && !S.inbox ? `<div class="panel-b">${'<div class="skel" style="margin:14px 0;width:70%"></div><div class="skel" style="margin:14px 0 26px;width:90%"></div>'.repeat(3)}</div>` : rows || `<div class="panel-b">${f.bandeja === 'pend' ? emptyState('tray', 'Bandeja al día', 'No hay correos por revisar.') : f.bandeja === 'conv' ? emptyState('envelope-simple', 'Sin conversaciones pendientes', 'Las respuestas a correos anteriores aparecen aquí. Si son de un trámite, se anotan solas.') : emptyState('tray', 'Nada procesado todavía', 'Los correos que conviertas aparecerán aquí.')}</div>`}</div>`}`;
};

async function markMail(id, nota, tramiteId, estado = 'procesado') {
  const m = (S.inbox || []).find(x => x.id === id) || { id };
  if (mailDone(m)) return;
  await save('correos', { id: mailKey(m), estado, nota, tramiteId: tramiteId || '', hilo: m.raiz || '', mid: m.mid || '' }, nota, 'procesó').catch(() => { });
}

async function importAttachments(m, carpeta) {
  if (!m.attachments?.length) return [];
  if (S.mode === 'demo') return m.attachments.map(a => ({ id: 'demo-' + a.id, name: a.name, size: a.size }));
  toast('Guardando adjuntos en Drive…');
  const d = await api('api/gmail', { json: { id: m.id, cuenta: m.cuenta, attachments: m.attachments.map(a => a.id), folder: carpeta } });
  return d.docs || [];
}

async function mailAction(act, id, el) {
  const m = (S.inbox || []).find(x => x.id === id); if (!m) return;
  const k = classify(m);
  if (act === 'mail-skip') { await markMail(id, 'Archivado'); render(false); toast('Correo archivado', '', { label: 'Deshacer', run: async () => { const c = mailRow(m); if (c) await remove('correos', c.id, 'Correo devuelto a la bandeja'); render(false); } }); return; }
  if (act === 'mail-volver') { const c = mailRow(m); if (c) { await remove('correos', c.id, 'Correo devuelto a la bandeja'); render(false); toast('De vuelta en Por revisar'); } return; }
  if (act === 'mail-estado' || act === 'mail-novedad') {
    const aplicar = async tid => {
      const t = tramite(tid); if (!t) return;
      if (act === 'mail-novedad') await agregarNovedad(m, t);
      else if (k.kind === 'pago') { // el pago necesita monto: se abre para revisar
        openPago(null, { forma: k.forma || 'Cheque', numero: k.numero || '', monto: k.monto || '', aseguradora: k.aseguradora || t.aseguradora || '', clienteId: t.clienteId, tramiteId: t.id, fechaAviso: (m.fecha || nowISO()).slice(0, 10), notas: m.subject || '' });
        cur.afterSave = async p => { await markMail(id, `Pago ${fmtMoney(p.monto)} · ${t.codigo}`, t.id); };
        return;
      } else await aplicarEstado(m, k, t);
      render(false); toast(`${t.codigo} actualizado`, '', { label: 'Abrir', run: () => openTramite(t.id) });
    };
    if (k.tramiteId && !el?.dataset.pick) return aplicar(k.tramiteId);
    const base = k.dudas?.length ? k.dudas : DB.tramites.filter(t => tramiteAbierto(t) && (!k.clienteId || t.clienteId === k.clienteId) && (!k.aseguradora || !t.aseguradora || t.aseguradora === k.aseguradora));
    const cands = base.slice(0, 10);
    if (!cands.length) return toast('No hay trámites abiertos que coincidan. Crea uno primero.', 'err');
    return popMenu(el, cands.map(t => [t.id, `${t.codigo} · ${shortName(t.paciente || t.asegurado || clienteNombre(t.clienteId))}${t.numeroReclamo ? ' · ' + t.numeroReclamo : ''}`, 'folder-open']), aplicar);
  }
  if (act === 'mail-tramite') {
    let docs = [];
    try { docs = await importAttachments(m, clienteNombre(k.clienteId)); } catch (e) { toast('No se copiaron los adjuntos: ' + e.message, 'err'); }
    if (k.estado) { // aviso de la aseguradora de algo que no estaba registrado: se crea con sus datos
      const cv = k.campos || {};
      const tt = norm(cv.tipo);
      const tipoE = !k.estado.otros ? 'Reclamo' : /inclu/.test(tt) ? 'Inclusión' : /exclu/.test(tt) ? 'Exclusión' : /renov/.test(tt) ? 'Renovación' : /emisi/.test(tt) ? 'Emisión' : 'Modificación';
      const pid = k.polizaId || '';
      openTramite(null, { clienteId: k.clienteId || poliza(pid)?.clienteId || '', polizaId: pid, aseguradora: k.aseguradora || '', tipo: tipoE, asunto: cv.tipo ? nombrePropio(cv.tipo).replace(/^(\S+)/, w => w) : m.subject || '', descripcion: resumenCuerpo(m, 400), asegurado: cv.asegurado ? nombrePropio(cv.asegurado) : '', numeroReclamo: k.reclamo || '', etapa: k.reclamo ? 'numero' : 'ingresado', fechaSolicitud: (m.fecha || nowISO()).slice(0, 10), fechaIngreso: (m.fecha || nowISO()).slice(0, 10), canal: CANALES[0], gmailId: m.id, hilo: m.raiz || '' });
      cur.afterSave = async t => { await markMail(id, `Trámite ${t.codigo} (desde aviso de ${k.aseguradora})`, t.id); };
      return;
    }
    const tipo = /renova/i.test(m.subject + m.snippet) ? 'Renovación' : /exclu/i.test(m.subject + m.snippet) ? 'Exclusión' : /inclu/i.test(m.subject + m.snippet) ? 'Inclusión' : /modific|cambio/i.test(m.subject + m.snippet) ? 'Modificación' : 'Reclamo';
    openTramite(null, { clienteId: k.clienteId || '', polizaId: k.polizaId || '', aseguradora: k.aseguradora || poliza(k.polizaId)?.aseguradora || '', tipo, asunto: m.subject || '', descripcion: m.snippet || '', docs, hilo: m.raiz || '', fechaSolicitud: (m.fecha || nowISO()).slice(0, 10), gmailId: m.id, monto: k.kind === 'solicitud' ? '' : '' });
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
        <div class="kv"><div><dt>Cuenta de datos</dt><dd>${esc(s.google?.account || 'Sin conectar')}</dd></div>
        <div><dt>Base de datos</dt><dd>${s.google?.sheetUrl ? `<a href="${esc(s.google.sheetUrl)}" target="_blank" rel="noopener">Hoja “SIMEVI · Base de datos”</a>` : 'Se crea al conectar'}</dd></div>
        <div><dt>Documentos</dt><dd>${s.google?.folderUrl ? `<a href="${esc(s.google.folderUrl)}" target="_blank" rel="noopener">Carpeta SIMEVI en Drive</a>` : '-'}</dd></div></div>
        <div class="sec"><div class="label">Correos que lee la Bandeja</div>
          ${(s.google?.gmails || []).length ? `<div class="docs">${s.google.gmails.map(g => `<div class="doc">${ic('envelope-simple')}<span>${esc(g.cuenta)}</span><small>conectó ${esc(firstName(userBy(g.por)))}</small>${S.me.admin || g.por === S.me.email || g.cuenta === S.me.email ? `<button class="btn ghost icon sm" type="button" data-act="gmail-off" data-v="${esc(g.cuenta)}" aria-label="Quitar ${esc(g.cuenta)}">${ic('x')}</button>` : ''}</div>`).join('')}</div>` : '<p class="muted" style="margin:0;font-size:.86rem">Ninguno todavía.</p>'}
          <p class="faint" style="font-size:.8rem;margin:10px 0">Cada persona conecta su propio Gmail de trabajo entrando con su sesión. La app solo lee; no envía ni borra correos.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${s.google?.connected ? `<a class="btn primary" href="api/google/connect?para=gmail">${ic('google-logo')}Conectar mi Gmail</a>` : ''}${s.user?.admin ? `<a class="btn" href="api/google/connect?para=datos">${ic('google-drive-logo')}${s.google?.connected ? 'Volver a conectar datos' : 'Conectar cuenta de datos'}</a>` : ''}<a class="btn ghost" href="api/diagnose" target="_blank">${ic('seal-check')}Diagnóstico</a></div>`
      : `<p class="muted" style="margin:0 0 12px;font-size:.88rem">En la versión publicada, los datos se guardan en una cuenta de Google (la Hoja y los PDFs) y la Bandeja lee el Gmail de trabajo de cada persona.</p>
         <p class="muted" style="margin:0;font-size:.88rem">Los pasos están en el archivo LEEME.md del proyecto.</p>`}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>PERSONA</h2></div><div class="panel-b">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${av(S.me.email, 'lg')}<div><b>${esc(S.me.nombre)}</b><div class="faint" style="font-size:.8rem">${esc(S.me.email)}</div></div></div>
      ${S.mode === 'demo' ? `<div class="seg" role="group" aria-label="Persona">${S.users.map(u => `<button type="button" data-act="set-user" data-v="${esc(u.email)}" aria-pressed="${u.email === S.me.email}">${esc(u.nombre)}</button>`).join('')}</div>` : `<button class="btn" type="button" data-act="logout">${ic('sign-out')}Cerrar sesión</button>`}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>BANDEJA</h2></div><div class="panel-b">
      ${fld('Aseguradoras', `<textarea id="aseg-dom" rows="5" placeholder="sisa.com.sv = SISA">${esc(asegDominios().map(x => `${x.dom} = ${x.nombre}`).join('\n'))}</textarea>`, '', 'Una por línea: <code>dominio = nombre</code>. Sus avisos (aviso de reclamo, en análisis, solicitud de información, cheque disponible, transferencia) mueven el trámite solos.')}
      <div style="margin-top:12px">${fld('Crean trámites solos', `<textarea id="auto-remit" rows="2" placeholder="mbonilla@injiboa.com.sv">${esc(autoRemitentes().join(', '))}</textarea>`, '', 'Personas que solo mandan reclamos o modificaciones. Cada correo <b>nuevo</b> suyo se vuelve trámite; las respuestas a correos anteriores no. Si no queda claro, queda en la Bandeja como <b>Para revisar</b>.')}</div>
      <div style="margin-top:12px">${fld('Otros remitentes clave', `<textarea id="remitentes" rows="2" placeholder="injiboa.com.sv, hibronsa.com.sv">${esc(remitentes().join(', '))}</textarea>`, '', 'Clientes o empresas cuyos correos quieres ver en la Bandeja. Un dominio incluye a todas sus personas.')}</div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="remit-cli" ${conClientes() ? 'checked' : ''}>Incluir también los correos de los clientes registrados</label>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="auto-on" ${ajuste('auto-activo', 'si') !== 'no' ? 'checked' : ''}>Procesar correos automáticamente${ajuste('auto-desde', '') ? ` <span class="faint">(desde el ${fmtDate(ajuste('auto-desde', ''))})</span>` : ''}</label>
      <button class="btn sm primary" type="button" data-act="remitentes-save" style="margin-top:12px">Guardar</button>
      <div class="sec">${fld('Búsqueda cuando eliges “Todos”', `<input type="text" id="gmailq" value="${esc(S.f.gmailQ || DEFAULT_GMAIL_Q)}">`, '', 'Avanzado: la misma búsqueda que en Gmail.')}
      <button class="btn sm" type="button" data-act="gmailq-save" style="margin-top:10px">Guardar búsqueda</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>PANTALLA Y DATOS</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:14px;align-items:flex-start">
      <label class="check"><input type="checkbox" data-act-change="lite" ${lite ? 'checked' : ''}>Modo ligero (sin vidrio ni animaciones, para teléfonos lentos)</label>
      <button class="btn" type="button" data-act="export-all">${ic('download-simple')}Descargar copia de todo (JSON)</button>
      ${S.mode === 'demo' ? `<button class="btn ghost" type="button" data-act="demo-reset">${ic('arrows-clockwise')}Volver a los datos de ejemplo</button>` : ''}
    </div></div>
  </div>`;
};
