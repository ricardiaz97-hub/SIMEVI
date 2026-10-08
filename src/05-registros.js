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
  await linkPagoTramite(p, isNew);
  if (!pagoAbierto(p) && (to || isNew)) celebrate();
  closeDrawer(); render(false);
  toast(isNew ? 'Pago registrado' : to ? `Pago: ${PAGO_E[p.estado].n}` : 'Cambios guardados');
}

// El trámite ligado avanza solo: pago registrado → Pago disponible; pago entregado → Cerrado.
async function linkPagoTramite(p, isNew) {
  const t = tramite(p.tramiteId);
  if (t && isNew && tramiteAbierto(t) && t.etapa !== 'pago') {
    t.etapa = 'pago'; t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'pago', texto: `${p.forma} disponible por ${fmtMoney(p.monto)}.` }];
    await save('tramites', t, `${t.codigo} a Pago disponible`, 'movió').catch(() => { });
  }
  if (t && !pagoAbierto(p) && tramiteAbierto(t)) {
    t.etapa = 'cerrado'; t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'cerrado', texto: `${p.estado === 'depositado' ? 'Depositado' : 'Entregado a ' + p.entregadoA}. Cerrado.` }];
    await save('tramites', t, `${t.codigo} a Cerrado`, 'movió').catch(() => { });
  }
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
    const et = etapasDe(t.tipo).filter(e => e.k !== 'requerido' || t.etapa === 'requerido'); const rech = t.etapa === 'rechazado';
    const idx = rech ? et.length - 1 : et.findIndex(e => e.k === t.etapa);
    return `<article class="panel ptk"><div class="row"><div><span class="label">${esc(t.tipo)}${t.numeroReclamo ? ` · N.º ${esc(t.numeroReclamo)}` : ''}</span><h3>${esc(t.asunto || t.tipo)}</h3></div><span class="pill ${rech ? 'bad' : t.etapa === 'cerrado' || t.etapa === 'pago' ? 'ok' : 'gold'}">${rech ? 'No aprobado' : esc(ETAPA[t.etapa]?.c || '')}</span></div>
      <ol class="steps ${rech ? 'bad' : ''}" style="margin-top:14px">${et.map((e, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><div class="bar"></div><span>${esc(e.c)}</span></li>`).join('')}</ol>
      ${t.notaCliente ? `<p style="margin:4px 0 8px">${esc(t.notaCliente)}</p>` : ''}
      <div class="muted" style="font-size:.8rem">${esc(t.aseguradora || '')}${t.poliza ? ` · Póliza ${esc(t.poliza)}` : ''} · Actualizado ${fmtDate(t.actualizado)}</div></article>`;
  };
  root.innerHTML = `<div class="portal enter">
    <div class="portal-top"><img src="img/logo-full.webp" alt="SIMEVI Corredores de Seguros">${staff ? `<button class="btn sm" type="button" data-act="portal-back">${ic('caret-left')}Volver a la app</button>` : ''}</div>
    <h1 style="margin:8px 0 6px">Hola, ${esc(String(data.cliente.nombre).split(/,| S\.A\./)[0])}</h1>
    <p class="muted" style="margin:0 0 24px">Aquí puedes ver en qué va cada gestión que hacemos por ti con tu aseguradora.</p>
    ${(data.pagos || []).map(p => `<div class="banner">${ic('hand-coins')}<span>${p.forma === 'Cheque' ? `Tu cheque de ${esc(p.aseguradora)} por <b>${fmtMoney(p.monto)}</b> ${p.estado === 'oficina' ? 'ya está en nuestra oficina. Te avisamos para coordinar la entrega.' : 'está listo; vamos a recogerlo por ti.'}` : `${esc(p.aseguradora)} depositó <b>${fmtMoney(p.monto)}</b>.`}</span></div>`).join('')}
    ${abiertos.length ? abiertos.map(card).join('') : `<div class="panel panel-b">${emptyState('check-circle', 'Sin gestiones en curso', 'Cuando tengamos algo en trámite por ti, lo verás aquí.')}</div>`}
    ${cerrados.length ? `<h2 style="margin:28px 0 12px">TERMINADOS</h2>${cerrados.map(card).join('')}` : ''}
    <p class="faint" style="margin-top:30px;font-size:.8rem">SIMEVI Corredores de Seguros · Silvia de Díaz y Ricardo Vega. ¿Dudas? Escríbenos al correo o WhatsApp de siempre.</p>
  </div>`;
}
