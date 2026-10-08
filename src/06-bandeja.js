/* ---------- Bandeja de Gmail ---------- */
const DOMINIOS = { sisa: 'SISA', asesuisa: 'ASESUISA', pacifico: 'Seguros del Pacífico', mapfre: 'MAPFRE La Centro Americana', fedecredito: 'Seguros Fedecrédito', palig: 'Pan-American Life', panamerican: 'Pan-American Life', segurosazul: 'Seguros Azul', azul: 'Seguros Azul', davivienda: 'Davivienda Seguros', assa: 'ASSA', futuro: 'Seguros Futuro', acsa: 'Aseguradora Agrícola Comercial', atlantida: 'Atlántida Vida', qualitas: 'Quálitas' };
const DEFAULT_GMAIL_Q = 'newer_than:30d -category:promotions -category:social -category:updates';
const buzonNombre = c => firstName(S.users.find(u => u.email === c)) || c.split('@')[0];
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
  if (/cheques?\b.*disponibles?|disponibles?\b.*cheques?|dep[oó]sito|transferencia|abono\s+en\s+cuenta/i.test(txt) && r.aseguradora) {
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
  S.inboxLoading = true; S.inboxErr = ''; S.inboxCode = '';
  if (S.route === 'bandeja') render(false);
  try {
    const d = await api('api/gmail?q=' + encodeURIComponent(S.f.gmailQ || DEFAULT_GMAIL_Q));
    S.inbox = d.messages || [];
    S.buzones = d.buzones || [];
    if (d.errores?.length) S.inboxErr = d.errores.map(x => `${x.cuenta}: ${x.message}`).join(' · ');
  } catch (e) { S.inboxErr = e.message; S.inboxCode = e.data?.code || ''; S.inbox = S.inbox || []; }
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
    const x = !done ? extraer(m) : null;
    const varios = x && x.rows.length > 1;
    if (varios) {
      acts += `<button class="btn primary sm" type="button" data-act="mail-varios" data-id="${esc(m.id)}">${ic('list-bullets')}Revisar los ${x.rows.length}</button>`;
      acts += `<button class="btn ghost sm" type="button" data-act="mail-skip" data-id="${esc(m.id)}">Archivar</button>`;
    } else if (!done) {
      if (k.kind === 'pago') acts += `<button class="btn primary sm" type="button" data-act="mail-pago" data-id="${esc(m.id)}">${ic('hand-coins')}Registrar pago</button>`;
      else if (k.kind === 'numero') acts += `<button class="btn primary sm" type="button" data-act="mail-numero" data-id="${esc(m.id)}">${ic('seal-check')}${t ? 'Poner número en ' + esc(t.codigo) : 'Asignar a un trámite'}</button>`;
      else acts += `<button class="btn primary sm" type="button" data-act="mail-tramite" data-id="${esc(m.id)}">${ic('plus')}Crear trámite</button>`;
      if (k.kind !== 'solicitud') acts += `<button class="btn sm" type="button" data-act="mail-tramite" data-id="${esc(m.id)}">Crear trámite</button>`;
      if (k.kind === 'solicitud' && (m.attachments || []).length >= 2) acts += `<button class="btn sm" type="button" data-act="mail-varios" data-id="${esc(m.id)}">Separar en varios</button>`;
      acts += `<button class="btn ghost sm" type="button" data-act="mail-skip" data-id="${esc(m.id)}">Archivar</button>`;
    } else acts = `<span class="tag">${av(done.creadoPor, 'sm')}${esc(done.nota || 'Procesado')}</span>`;
    if (S.mode === 'live') acts += `<a class="btn ghost sm" href="https://mail.google.com/mail/?authuser=${encodeURIComponent(m.cuenta || '')}#all/${esc(m.threadId || m.id)}" target="_blank" rel="noopener">${ic('arrow-square-out')}Gmail</a>`;
    return `<article class="mail ${done ? 'done' : ''}">
      <div class="from">${ic('envelope-simple')}<b>${esc(m.fromName || m.from)}</b>${(S.buzones || []).length > 1 && m.cuenta ? `<span class="pill">Para ${esc(buzonNombre(m.cuenta))}</span>` : ''}<span class="faint">${fmtAgo(m.fecha)}</span>${varios ? `<span class="pill gold">${x.rows.length} ${x.mode === 'pagos' ? 'pagos' : 'reclamos'}</span>` : `<span class="pill ${kinds[k.kind][1]}">${kinds[k.kind][0]}</span>`}</div>
      <h3>${esc(m.subject || '(sin asunto)')}</h3>
      <p>${esc(m.snippet || '')}</p>
      <div class="found">
        ${varios ? x.rows.map(r => `<span class="tag">${ic('user')}${esc(shortName(r.asegurado || 'Sin nombre'))}${r.numero ? ' · ' + esc(r.numero) : ''}${r.cheque ? ' · ch. ' + esc(r.cheque) : ''}${r.monto ? ' · ' + fmtMoney(r.monto) : ''}</span>`).join('') : c ? `<span class="tag">${ic('user')}${esc(c.nombre.split(',')[0])}</span>` : `<span class="tag faint">${ic('user')}Cliente no reconocido</span>`}
        ${k.polizaNum ? `<span class="tag">${ic('shield-check')}${esc(k.polizaNum)}</span>` : ''}
        ${k.reclamo && !varios ? `<span class="tag">${ic('seal-check')}${esc(k.reclamo)}</span>` : ''}
        ${k.monto && !varios ? `<span class="tag">${ic('money-wavy')}${fmtMoney(k.monto)}</span>` : ''}
        ${t && !varios ? `<span class="tag">${ic('folder-open')}${esc(t.codigo)}</span>` : ''}
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
  ${S.inboxCode === 'sin_gmail' ? `<div class="banner">${ic('envelope-simple')}<span>Para ver correos aquí, conecta tu Gmail de trabajo. Silvia conecta el suyo desde su sesión.</span><a class="btn primary sm" href="api/google/connect?para=gmail">${ic('google-logo')}Conectar mi Gmail</a></div>`
  : S.inboxErr ? `<div class="banner" style="background:var(--bad-soft);box-shadow:inset 0 0 0 1px var(--bad)">${ic('warning')}<span>No se pudo leer Gmail: ${esc(S.inboxErr)}</span><a class="btn sm" href="api/diagnose" target="_blank">Diagnóstico</a></div>` : ''}
  ${S.inboxCode === 'sin_gmail' ? '' : `<div class="panel">${S.inboxLoading && !S.inbox ? `<div class="panel-b">${'<div class="skel" style="margin:14px 0;width:70%"></div><div class="skel" style="margin:14px 0 26px;width:90%"></div>'.repeat(3)}</div>` : rows || `<div class="panel-b">${emptyState('tray', f.bandeja === 'pend' ? 'Bandeja al día' : 'Nada procesado todavía', f.bandeja === 'pend' ? 'No hay correos nuevos por revisar.' : 'Los correos que conviertas aparecerán aquí.')}</div>`}</div>`}`;
};

async function markMail(id, nota, tramiteId) {
  if (mailDone({ id })) return;
  await save('correos', { id, estado: 'procesado', nota, tramiteId: tramiteId || '' }, nota, 'procesó').catch(() => { });
}

async function importAttachments(m, carpeta) {
  if (!m.attachments?.length) return [];
  if (S.mode === 'demo') return m.attachments.map(a => ({ id: 'demo-' + a.id, name: a.name, size: a.size }));
  toast('Guardando adjuntos en Drive…');
  const d = await api('api/gmail', { json: { id: m.id, cuenta: m.cuenta, attachments: m.attachments.map(a => a.id), folder: carpeta } });
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
