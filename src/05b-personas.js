/* ---------- Personas: asegurados, empleados y dependientes ----------
   No hay que darlas de alta: se arma con lo que ya está guardado (los asegurados de las
   pólizas colectivas, sus dependientes, los clientes que son personas y cada reclamo).
   Cada persona nueva que entra en un reclamo queda aquí sola, y al escribir su nombre en
   Reclamos se llenan empresa, póliza, certificado, titular y parentesco. */

const clavePersona = (nombre, clienteId) => `${norm(nombre).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()}|${clienteId || ''}`;

function personasIndex() {
  const map = new Map();
  const add = o => {
    const k = clavePersona(o.nombre, o.clienteId);
    const prev = map.get(k);
    if (prev) {
      for (const f of ['polizaId', 'certificado', 'titular', 'parentesco', 'documento']) if (!prev[f] && o[f]) prev[f] = o[f];
      if (o.rol === 'Asegurado' && prev.rol === 'Dependiente') { prev.rol = 'Asegurado'; prev.titular = ''; prev.parentesco = ''; }
      return prev;
    }
    const p = { key: k, reclamos: [], titular: '', parentesco: '', polizaId: '', certificado: '', documento: '', ...o };
    map.set(k, p);
    return p;
  };
  DB.clientes.filter(c => c.tipo === 'Persona').forEach(c => add({ nombre: c.nombre, rol: 'Cliente', clienteId: c.id, documento: c.documento || '' }));
  DB.polizas.filter(p => !p.cancelada && p.modalidad === 'Colectiva').forEach(p => (p.asegurados || []).forEach(a => {
    if (!a.nombre || /planilla|anexo|·/i.test(a.nombre)) return;
    add({ nombre: a.nombre, rol: 'Asegurado', clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '', documento: a.documento || '' });
    (a.dependientes || []).forEach(d => add({ nombre: d.nombre, rol: 'Dependiente', parentesco: d.parentesco || '', titular: a.nombre, clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '' }));
  }));
  DB.tramites.forEach(t => {
    const cli = clienteNombre(t.clienteId);
    const esTit = t.asegurado && norm(t.asegurado) !== norm(cli);
    const tit = esTit ? add({ nombre: t.asegurado, rol: 'Asegurado', clienteId: t.clienteId, polizaId: t.polizaId, certificado: t.certificado || '' }) : map.get(clavePersona(cli, t.clienteId));
    if (t.paciente && norm(t.paciente) !== norm(t.asegurado || cli)) {
      add({ nombre: t.paciente, rol: 'Dependiente', parentesco: t.parentesco || '', titular: t.asegurado || cli, clienteId: t.clienteId, polizaId: t.polizaId, certificado: t.certificado || '' }).reclamos.push(t);
    } else if (tit) tit.reclamos.push(t);
  });
  for (const p of map.values()) {
    p.reclamos.sort((a, b) => String(b.fechaSolicitud || '').localeCompare(String(a.fechaSolicitud || '')));
    p.ultimo = p.reclamos[0]?.fechaSolicitud || '';
    p.abiertos = p.reclamos.filter(tramiteAbierto).length;
  }
  return [...map.values()];
}
const dependientesDe = (lista, p) => lista.filter(x => x.rol === 'Dependiente' && x.clienteId === p.clienteId && norm(x.titular) === norm(p.nombre));
const subPersona = p => [p.rol === 'Dependiente' ? `${p.parentesco || 'Dependiente'} de ${shortName(p.titular)}` : p.rol === 'Cliente' ? 'Cliente' : 'Asegurado', p.rol !== 'Cliente' ? shortName(clienteNombre(p.clienteId)) : '', poliza(p.polizaId)?.numero || '', p.certificado ? 'cert. ' + p.certificado : ''].filter(Boolean).join(' · ');

VIEWS.personas = () => {
  const f = S.f, q = S.q;
  const todas = personasIndex();
  const list = todas.filter(p => (!f.perRol || p.rol === f.perRol) && (!q || score(`${p.nombre} ${p.titular} ${clienteNombre(p.clienteId)} ${p.certificado} ${p.documento} ${poliza(p.polizaId)?.numero || ''}`, q)))
    .sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)) || a.nombre.localeCompare(b.nombre));
  const n = r => todas.filter(p => p.rol === r).length;
  const seg = [['', `Todas · ${todas.length}`], ['Asegurado', `Asegurados · ${n('Asegurado')}`], ['Dependiente', `Dependientes · ${n('Dependiente')}`], ['Cliente', `Clientes · ${n('Cliente')}`]];
  return head('Personas', 'Asegurados, empleados y dependientes. Cada persona nueva que entra en un reclamo se guarda sola, y al escribir su nombre en Reclamos se llena lo demás.') + `
  <div class="toolbar">
    <label class="search"><span class="sr">Buscar personas</span>${ic('magnifying-glass')}<input type="search" id="persearch" data-bind="q" placeholder="Nombre, empresa, certificado…" value="${esc(q)}"></label>
    <div class="seg" role="group" aria-label="Tipo">${seg.map(([k, t]) => `<button type="button" data-act="filter" data-k="perRol" data-v="${k}" aria-pressed="${(f.perRol || '') === k}">${t}</button>`).join('')}</div>
  </div>
  ${list.length ? `<div class="panel"><div class="table-wrap"><table class="resp"><thead><tr><th>Nombre</th><th>Empresa o cliente</th><th>Póliza</th><th class="r">Reclamos</th><th>Último</th></tr></thead><tbody>
    ${list.slice(0, 300).map(p => `<tr data-act="open-persona" data-id="${esc(p.key)}"><td data-l="Nombre"><b style="font-weight:600">${q ? mark(p.nombre, q) : esc(p.nombre)}</b><span class="sub">${p.rol === 'Dependiente' ? `${esc(p.parentesco || 'Dependiente')} de ${esc(shortName(p.titular))}` : esc(p.rol)}</span></td>
      <td data-l="Empresa">${esc(shortName(clienteNombre(p.clienteId)))}</td>
      <td data-l="Póliza" class="tnum">${esc(poliza(p.polizaId)?.numero || '')}${p.certificado ? `<span class="sub">cert. ${esc(p.certificado)}</span>` : ''}</td>
      <td data-l="Reclamos" class="r tnum">${p.reclamos.length || ''}${p.abiertos ? ` <span class="pill gold">${p.abiertos} abierto${p.abiertos > 1 ? 's' : ''}</span>` : ''}</td>
      <td data-l="Último" class="tnum">${p.ultimo ? fmtShort(p.ultimo) : ''}</td></tr>`).join('')}
  </tbody></table></div></div>` : emptyState('users-three', q ? 'Nadie con ese nombre' : 'Aún no hay personas', 'Se agregan solas al guardar reclamos, o al cargar los asegurados de una póliza colectiva.')}`;
};

function openPersona(key) {
  const todas = personasIndex();
  const p = todas.find(x => x.key === key); if (!p) return;
  const deps = dependientesDe(todas, p);
  const pol = poliza(p.polizaId);
  openDrawer(`
  <div class="drawer-h"><div class="t"><span class="label">${esc(p.rol)}</span><h2>${esc(p.nombre)}</h2><div class="muted" style="font-size:.86rem;margin-top:4px">${esc(subPersona(p))}</div></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b">
    <div class="kv">
      <div><dt>Empresa o cliente</dt><dd><button class="linkish" type="button" data-act="open-cliente" data-id="${esc(p.clienteId)}">${esc(clienteNombre(p.clienteId))}</button></dd></div>
      <div><dt>Póliza</dt><dd>${pol ? `<button class="linkish" type="button" data-act="open-poliza" data-id="${pol.id}">${esc(pol.numero)} · ${esc(pol.ramo)} · ${esc(pol.aseguradora)}</button>` : '-'}</dd></div>
      ${p.certificado ? `<div><dt>Certificado</dt><dd class="tnum">${esc(p.certificado)}</dd></div>` : ''}
      ${p.rol === 'Dependiente' ? `<div><dt>Titular</dt><dd>${esc(p.titular)}${p.parentesco ? ` (${esc(p.parentesco.toLowerCase())})` : ''}</dd></div>` : ''}
    </div>
    ${deps.length ? `<div class="sec"><div class="label">Dependientes <span class="faint">${deps.length}</span></div><div class="docs">${deps.map(d => `<button class="doc" type="button" data-act="open-persona" data-id="${esc(d.key)}">${ic('user')}<span>${esc(d.nombre)}</span><small>${esc(d.parentesco || '')}${d.reclamos.length ? ` · ${d.reclamos.length} reclamo${d.reclamos.length > 1 ? 's' : ''}` : ''}</small></button>`).join('')}</div></div>` : ''}
    <div class="sec"><div class="label">Reclamos y trámites <span class="faint">${p.reclamos.length}</span></div>
      ${p.reclamos.length ? `<div class="docs">${p.reclamos.map(t => `<button class="doc" type="button" data-act="open-tramite" data-id="${t.id}">${ic('folder-open')}<span>${esc(t.codigo)} · ${fmtShort(t.fechaSolicitud)}${t.numeroReclamo ? ' · ' + esc(t.numeroReclamo) : ''}${+t.monto ? ' · ' + fmtMoney(t.monto) : ''}</span>${etapaPill(t)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0;font-size:.86rem">Todavía sin reclamos.</p>'}
    </div>
  </div>
  <div class="drawer-f"><span class="spacer"></span><button class="btn primary" type="button" data-act="persona-reclamo" data-id="${esc(p.key)}">${ic('plus')}Nuevo reclamo para ${esc(p.nombre.split(' ')[0])}</button></div>`);
}

// Una fila de Reclamos ya llena con los datos de la persona
function filaDePersona(p) {
  const dep = p.rol === 'Dependiente';
  return filaNueva({
    clienteId: p.clienteId, clienteTxt: clienteNombre(p.clienteId), polizaId: p.polizaId || (polizasActivas(p.clienteId).length === 1 ? polizasActivas(p.clienteId)[0].id : ''),
    asegurado: dep ? p.titular : p.rol === 'Cliente' ? clienteNombre(p.clienteId) : p.nombre, picked: dep ? p.titular : p.nombre, certificado: p.certificado || '',
    paciente: dep ? p.nombre : '', parentesco: dep ? p.parentesco : ''
  });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="open-persona"], [data-act="persona-reclamo"]'); if (!b) return;
  if (b.dataset.act === 'open-persona') return openPersona(b.dataset.id);
  const p = personasIndex().find(x => x.key === b.dataset.id); if (!p) return;
  RX = filaDePersona(p); rxKeep();
  closeDrawer();
  // closeDrawer regresa en el historial; se navega cuando ya terminó
  setTimeout(() => { go('reclamos'); setTimeout(() => { syncRow(RX); $('#rx-new [data-f=monto]')?.focus(); }, 80); }, 60);
  toast(`Fila lista para ${p.nombre.split(' ')[0]}: escribe el monto y las notas`);
});

/* --- autocompletar en Reclamos ---
   Asegurado: además de los asegurados de las pólizas, salen las personas de reclamos anteriores
   y los dependientes (al elegir un dependiente se llenan titular, paciente y parentesco). */
const opcPersona = p => ({
  kind: p.rol === 'Dependiente' ? 'dep' : 'per', label: p.nombre, sub: subPersona(p),
  find: `${p.nombre} ${p.certificado} ${p.documento} ${p.titular}`, clienteId: p.clienteId, polizaId: p.polizaId, certificado: p.certificado, titular: p.titular, parentesco: p.parentesco
});
const cbAseguradoBase = CB.asegurado;
CB.asegurado = (q, st = RX) => {
  const base = cbAseguradoBase(q, st);
  const ya = new Set(base.map(o => clavePersona(o.label, o.clienteId)));
  const p = poliza(st.polizaId);
  const extra = personasIndex().filter(x => x.rol !== 'Cliente' && !ya.has(x.key) && (!st.clienteId || x.clienteId === st.clienteId) && (!p || !x.polizaId || x.polizaId === p.id)).map(opcPersona);
  return q ? rank([...base, ...extra], q) : base.concat(extra).slice(0, 8);
};
CB.paciente = (q, st = RX) => {
  const deps = personasIndex().filter(x => x.rol === 'Dependiente' && (!st.clienteId || x.clienteId === st.clienteId));
  const suyos = st.asegurado ? deps.filter(d => norm(d.titular) === norm(st.asegurado)) : [];
  const opts = (q ? deps : (suyos.length ? suyos : deps)).map(opcPersona).map(o => ({ ...o, bonus: suyos.some(s => s.nombre === o.label) ? 2 : 0 }));
  return q ? rank(opts, q) : opts.slice(0, 8);
};
const pickBase = pick;
pick = function (name, o, st = RX) {
  if (name === 'asegurado' && (o.kind === 'dep' || o.kind === 'per')) {
    if (st.clienteId !== o.clienteId) setCliente(st, o.clienteId);
    if (o.polizaId) { st.polizaId = o.polizaId; st.polizaTxt = ''; }
    if (o.kind === 'dep') { st.asegurado = o.titular; st.paciente = o.label; st.parentesco = o.parentesco || st.parentesco; }
    else st.asegurado = o.label;
    st.certificado = o.certificado || st.certificado; st.picked = st.asegurado;
    if (st === RX) rxKeep();
    return syncRow(st);
  }
  if (name === 'paciente') {
    if (!st.clienteId && o.clienteId) setCliente(st, o.clienteId);
    if (!st.polizaId && o.polizaId) st.polizaId = o.polizaId;
    if (!st.asegurado && o.titular) { st.asegurado = o.titular; st.picked = o.titular; st.certificado = st.certificado || o.certificado; }
    st.paciente = o.label; st.parentesco = o.parentesco || st.parentesco;
    if (st === RX) rxKeep();
    return syncRow(st);
  }
  return pickBase(name, o, st);
};
