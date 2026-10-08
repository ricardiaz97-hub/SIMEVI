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
