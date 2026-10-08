/* ---------- Reclamos: tabla rápida de ingreso ----------
   Orden de trabajo: Cliente (la empresa) → Póliza → Asegurado (empleado) → Paciente si es dependiente.
   En pólizas individuales el asegurado es el mismo cliente.
   Si el cliente, la póliza o el asegurado no existen, se crean al guardar (y queda en la bitácora). */

const filaNueva = (o = {}) => ({ clienteId: '', clienteTxt: '', polizaId: '', polizaTxt: '', asegurado: '', certificado: '', paciente: '', parentesco: '', monto: '', numero: '', notas: '', docs: [], tramiteId: '', cheque: '', etapa: 'ingresado', picked: '', fecha: '', ...o });
let RX = filaNueva();
try { const d = JSON.parse(sessionStorage.getItem('simevi-rx2') || 'null'); if (d) RX = filaNueva(d); } catch (e) { }
const rxKeep = () => { try { sessionStorage.setItem('simevi-rx2', JSON.stringify(RX)); } catch (e) { } };

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
const rank = (opts, q) => opts.map(o => ({ ...o, s: score(o.find, q) && score(o.find, q) + (o.bonus || 0) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
const polizasActivas = cid => DB.polizas.filter(p => p.clienteId === cid && !p.cancelada);
const esColectiva = st => { const p = poliza(st.polizaId); return p ? p.modalidad === 'Colectiva' : !!(st.asegurado && (st.clienteTxt || st.clienteId) && norm(st.asegurado) !== norm(st.clienteTxt || clienteNombre(st.clienteId))); };

/* Opciones de cada lista */
const asegOpc = p => (p.asegurados || []).filter(a => a.nombre && !/planilla|anexo/i.test(a.nombre)).map(a => ({ kind: 'aseg', label: a.nombre, sub: `Cert. ${a.certificado || '-'} · ${p.numero} · ${shortName(clienteNombre(p.clienteId))}`, find: `${a.nombre} ${a.documento} ${a.certificado}`, clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '', bonus: p.ramo === 'Gastos médicos' ? 0.5 : 0 }));
const CB = {
  cliente(q) {
    const opts = DB.clientes.map(c => { const n = polizasActivas(c.id).length; return { kind: 'cli', label: c.nombre, sub: `${c.tipo} · ${n} ${n === 1 ? 'póliza' : 'pólizas'}`, find: `${c.nombre} ${c.documento} ${c.correo}`, clienteId: c.id }; });
    if (!q) { const rec = [...new Set(DB.tramites.filter(t => t.tipo === 'Reclamo').map(t => t.clienteId))].slice(0, 6); return rec.map(id => opts.find(o => o.clienteId === id)).filter(Boolean); }
    return rank(opts, q);
  },
  poliza(q, st = RX) {
    return rank(DB.polizas.filter(p => !p.cancelada && (!st.clienteId || p.clienteId === st.clienteId))
      .map(p => ({ kind: 'pol', label: p.numero, sub: `${p.modalidad} · ${p.ramo} · ${p.aseguradora} · ${shortName(clienteNombre(p.clienteId))}`, find: `${p.numero} ${p.ramo} ${p.aseguradora} ${clienteNombre(p.clienteId)}`, polizaId: p.id, clienteId: p.clienteId })), q);
  },
  asegurado(q, st = RX) {
    const p = poliza(st.polizaId);
    let opts;
    if (p && p.modalidad === 'Colectiva') opts = asegOpc(p);
    else if (st.clienteId) opts = polizasActivas(st.clienteId).filter(x => x.modalidad === 'Colectiva').flatMap(asegOpc).concat([{ kind: 'cli', label: clienteNombre(st.clienteId), sub: 'El mismo cliente', find: clienteNombre(st.clienteId), clienteId: st.clienteId }]);
    else opts = DB.polizas.filter(x => x.modalidad === 'Colectiva' && !x.cancelada).flatMap(asegOpc).concat(DB.clientes.filter(c => c.tipo === 'Persona').map(c => ({ kind: 'cli', label: c.nombre, sub: `Cliente · ${polizasActivas(c.id).length} pólizas`, find: `${c.nombre} ${c.documento}`, clienteId: c.id })));
    if (!q) return opts.slice(0, 8);
    return rank(opts, q);
  },
  cert(q, st = RX) {
    const p = poliza(st.polizaId);
    return rank((p?.asegurados || []).filter(a => a.certificado || a.nombre)
      .map(a => ({ kind: 'cert', label: a.certificado || '-', sub: a.nombre, find: `${a.certificado} ${a.nombre} ${a.documento}`, nombre: a.nombre })), q);
  }
};

function setCliente(st, id) {
  st.clienteId = id; st.clienteTxt = clienteNombre(id);
  const ps = polizasActivas(id);
  if (!ps.some(p => p.id === st.polizaId)) { st.polizaId = ps.length === 1 ? ps[0].id : ''; st.polizaTxt = ''; }
  const p = poliza(st.polizaId);
  if (p && p.modalidad === 'Individual') { st.asegurado = st.clienteTxt; st.certificado = ''; }
  else if (p && st.asegurado && !(p.asegurados || []).some(a => norm(a.nombre) === norm(st.asegurado)) && norm(st.asegurado) === norm(st.picked)) { st.asegurado = ''; st.certificado = ''; }
}
function pick(name, o, st = RX) {
  if (name === 'cliente') setCliente(st, o.clienteId);
  if (name === 'poliza') {
    if (st.clienteId !== o.clienteId) setCliente(st, o.clienteId);
    st.polizaId = o.polizaId; st.polizaTxt = '';
    const p = poliza(o.polizaId);
    if (p?.modalidad === 'Individual') { st.asegurado = clienteNombre(p.clienteId); st.certificado = ''; }
  }
  if (name === 'asegurado') {
    if (o.kind === 'aseg') { if (st.clienteId !== o.clienteId) setCliente(st, o.clienteId); st.polizaId = o.polizaId; st.polizaTxt = ''; st.asegurado = o.label; st.certificado = o.certificado; }
    else { if (st.clienteId !== o.clienteId) setCliente(st, o.clienteId); st.asegurado = o.label; }
    st.picked = st.asegurado;
  }
  if (name === 'cert') { st.certificado = o.label; st.asegurado = o.nombre; st.picked = o.nombre; }
  if (st === RX) rxKeep();
  syncRow(st);
}

/* Qué se sabe de la fila y qué se va a crear */
function hintFila(st) {
  const c = cliente(st.clienteId), p = poliza(st.polizaId);
  const partes = [], nuevos = [];
  if (c) partes.push(shortName(c.nombre)); else if (st.clienteTxt) nuevos.push(`cliente “${shortName(st.clienteTxt)}”`);
  if (p) partes.push(`${p.numero} · ${p.ramo}${p.aseguradora ? ' · ' + p.aseguradora : ''}`); else if (st.polizaTxt) nuevos.push(`póliza ${st.polizaTxt}`);
  if (st.asegurado && esColectiva(st)) {
    partes.push(`${shortName(st.asegurado)}${st.certificado ? ` (cert. ${st.certificado})` : ''}`);
    if (!p || !(p.asegurados || []).some(a => norm(a.nombre) === norm(st.asegurado))) nuevos.push(`asegurado en la póliza`);
  }
  if (st.paciente) partes.push(`paciente ${st.paciente}${st.parentesco ? ` (${st.parentesco.toLowerCase()})` : ''}`);
  const estado = !c && !st.clienteTxt ? 'bad' : nuevos.length ? 'new' : 'ok';
  const html = estado === 'bad' ? `${ic('warning')}<span>Escribe el cliente (la empresa) o la póliza</span>`
    : `${ic(estado === 'ok' ? 'check-circle' : 'sparkle')}<span>${esc(partes.join(' › ') || 'Cliente nuevo')}</span>${nuevos.length ? `<span class="pill gold">Se creará: ${esc(nuevos.join(', '))}</span>` : ''}`;
  return { estado, html };
}

const rowEl = st => st === RX ? $('#rx-new') : (MX && MX.rows.includes(st) ? $(`[data-mx="${MX.rows.indexOf(st)}"]`) : null);
const rowState = el => { const r = el?.closest?.('[data-row]'); if (!r) return null; return r.dataset.row === 'rx' ? RX : MX?.rows[+r.dataset.mx]; };

function syncRow(st) {
  const row = rowEl(st); if (!row) return;
  const p = poliza(st.polizaId);
  const set = (sel, v) => { const el = $(sel, row); if (el && document.activeElement !== el) el.value = v ?? ''; };
  set('[data-cb=cliente] input', st.clienteId ? clienteNombre(st.clienteId) : st.clienteTxt);
  set('[data-cb=poliza] input', p ? p.numero : st.polizaTxt);
  set('[data-cb=asegurado] input', st.asegurado);
  set('[data-cb=cert] input', st.certificado);
  ['paciente', 'parentesco', 'monto', 'numero', 'notas', 'cheque'].forEach(k => set(`[data-f=${k}]`, st[k]));
  const h = hintFila(st), box = $('.row-hint', row);
  if (box) { box.innerHTML = h.html; box.dataset.estado = h.estado; }
  row.classList.toggle('bad', h.estado === 'bad' && row.dataset.row === 'mx');
  const pdf = $('.rx-pdf', row);
  if (pdf && st === RX) { $('.rx-n', pdf).textContent = RX.docs.length || ''; pdf.classList.toggle('has', RX.docs.length > 0); pdf.title = RX.docs.map(d => d.name).join('\n') || 'Adjuntar PDF (se lee solo)'; }
  const aseg = $('[data-cb=asegurado] input', row);
  if (aseg) aseg.placeholder = p?.modalidad === 'Individual' ? 'El mismo cliente' : 'Empleado o asegurado';
}

const comboHTML = (name, id, label, val, ph) => `
  <div class="cb" data-cb="${name}">
    <label class="sr" for="${id}">${label}</label>
    <input id="${id}" type="text" value="${esc(val)}" placeholder="${esc(ph)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false">
    ${ic('caret-up-down', 'cb-caret')}
    <ul class="cb-list card" id="${id}-list" role="listbox" hidden></ul>
  </div>`;

/* Las casillas de una fila de reclamo (se usan en la tabla y en la revisión de correos) */
function campos(st, pre) {
  const p = poliza(st.polizaId);
  const inp2 = (k, ph, extra = '') => `<label class="sr" for="${pre}-${k}">${ph}</label><input id="${pre}-${k}" type="text" value="${esc(st[k] ?? '')}" placeholder="${esc(ph)}" data-f="${k}" ${extra}>`;
  return {
    cliente: `<div class="rx-cell" data-l="Cliente">${comboHTML('cliente', `${pre}-cliente`, 'Cliente o empresa', st.clienteId ? clienteNombre(st.clienteId) : st.clienteTxt, 'Cliente o empresa')}</div>`,
    poliza: `<div class="rx-cell" data-l="Póliza">${comboHTML('poliza', `${pre}-poliza`, 'Póliza', p ? p.numero : st.polizaTxt, 'Póliza')}</div>`,
    asegurado: `<div class="rx-cell" data-l="Asegurado">${comboHTML('asegurado', `${pre}-asegurado`, 'Asegurado o empleado', st.asegurado, p?.modalidad === 'Individual' ? 'El mismo cliente' : 'Empleado o asegurado')}</div>`,
    cert: `<div class="rx-cell" data-l="Cert.">${comboHTML('cert', `${pre}-cert`, 'Número de certificado', st.certificado, 'Cert.')}</div>`,
    paciente: `<div class="rx-cell" data-l="Paciente">${inp2('paciente', 'Paciente si es dependiente')}</div>`,
    parentesco: `<div class="rx-cell" data-l="Parentesco"><label class="sr" for="${pre}-parentesco">Parentesco</label><select id="${pre}-parentesco" data-f="parentesco">${opt(PARENTESCOS, st.parentesco, 'Parentesco')}</select></div>`,
    monto: `<div class="rx-cell" data-l="Monto">${inp2('monto', 'Monto US$', 'inputmode="decimal"')}</div>`,
    numero: `<div class="rx-cell" data-l="N.º de reclamo">${inp2('numero', 'N.º de reclamo (opcional)')}</div>`,
    notas: `<div class="rx-cell rx-notes" data-l="Notas">${inp2('notas', 'Qué se reclama')}</div>`,
    cheque: `<div class="rx-cell" data-l="Cheque o ref.">${inp2('cheque', 'N.º de cheque')}</div>`
  };
}

/* Crea lo que falte (cliente, póliza, asegurado en la colectiva) antes de guardar el reclamo */
async function asegurarEntidades(st, aseguradora = '') {
  if (!st.clienteId) {
    const nombre = limpiar(st.clienteTxt || '').replace(/(c\.\s*v)$/i, '$1.');
    if (!nombre) throw new Error('Falta el cliente');
    const ya = DB.clientes.find(c => norm(c.nombre) === norm(nombre)) || clientePorNombre(nombre);
    if (ya) st.clienteId = ya.id;
    else {
      const empresa = /\b(s\.?\s*a\.?|s\.?a\.? de c\.?v\.?|ingenio|grupo|colegio|distribuidora|compa[nñ]|corporaci|asociaci|fundaci|cooperativa|banco|hospital|universidad)\b/i.test(nombre);
      const c = { id: '', nombre, tipo: empresa ? 'Empresa' : 'Persona', documento: '', contacto: '', correo: '', telefono: '', notas: 'Creado desde un reclamo.', portal: token() };
      await save('clientes', c, `${shortName(nombre)} (creado desde un reclamo)`);
      st.clienteId = c.id;
    }
    st.clienteTxt = clienteNombre(st.clienteId);
  }
  if (!st.polizaId && limpiar(st.polizaTxt || '')) {
    const num = limpiar(st.polizaTxt).toUpperCase();
    const ya = polizaPorNumero(num);
    if (ya) st.polizaId = ya.id;
    else {
      const col = esColectiva(st) || cliente(st.clienteId)?.tipo === 'Empresa';
      const p = { id: '', numero: num, aseguradora, ramo: 'Gastos médicos', modalidad: col ? 'Colectiva' : 'Individual', clienteId: st.clienteId, vigenciaDesde: '', vigenciaHasta: '', prima: '', frecuencia: 'Mensual', suma: '', cancelada: false, notas: 'Creada desde un reclamo. Completa vigencia y prima.', asegurados: [], docs: [] };
      await save('polizas', p, `${num} (creada desde un reclamo)`);
      st.polizaId = p.id;
    }
  }
  const p = poliza(st.polizaId);
  if (p && !p.aseguradora && aseguradora) { p.aseguradora = aseguradora; }
  if (p && p.modalidad === 'Colectiva' && st.asegurado && norm(st.asegurado) !== norm(clienteNombre(st.clienteId))) {
    const lista = p.asegurados || [];
    const a = lista.find(a => norm(a.nombre) === norm(st.asegurado) || (st.certificado && a.certificado && String(a.certificado) === String(st.certificado)));
    if (!a) { p.asegurados = [...lista, { nombre: st.asegurado, documento: '', certificado: st.certificado || '', plan: '' }]; await save('polizas', p, `${p.numero}: asegurado ${st.asegurado} agregado`); }
    else if (st.certificado && !a.certificado) { a.certificado = st.certificado; await save('polizas', p, `${p.numero}: certificado ${st.certificado} de ${a.nombre}`); }
  } else if (p && !p.aseguradora && aseguradora) await save('polizas', p, `${p.numero}: aseguradora ${aseguradora}`);
  if (p?.modalidad === 'Individual' && !st.asegurado) st.asegurado = clienteNombre(st.clienteId);
}

function nuevoReclamo(st, { etapa = 'ingresado', fecha, gmailId = '', docs = [], aseguradora = '', origen = '' } = {}) {
  const p = poliza(st.polizaId);
  const e = st.numero ? 'numero' : etapa;
  const quien = st.paciente || st.asegurado || shortName(clienteNombre(st.clienteId));
  const ev = [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: e, texto: origen || (e === 'recibido' ? 'Recibido.' : `Ingresado a ${p?.aseguradora || aseguradora || 'la aseguradora'}.`) }];
  if (st.numero) ev.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'numero', texto: `Número asignado ${st.numero}.` });
  return {
    id: '', codigo: nextCodigo(), tipo: 'Reclamo', clienteId: st.clienteId, polizaId: st.polizaId, aseguradora: p?.aseguradora || aseguradora || '',
    asegurado: st.asegurado || clienteNombre(st.clienteId), certificado: st.certificado, paciente: st.paciente, parentesco: st.paciente ? st.parentesco : '',
    asunto: `Reclamo de ${shortName(quien)}`, descripcion: st.notas, canal: CANALES[0], etapa: e, numeroReclamo: st.numero, monto: toNum(st.monto) || '',
    fechaSolicitud: fecha || todayISO(), fechaIngreso: e === 'recibido' ? '' : todayISO(), responsable: S.me.email, visibleCliente: true, notaCliente: '', docs, eventos: ev, gmailId
  };
}
const toNum = s => +String(s ?? '').replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.') || 0;

VIEWS.reclamos = () => {
  const f = S.f, q = norm(S.q);
  f.rxVer = f.rxVer || 'abiertos';
  const all = DB.tramites.filter(t => t.tipo === 'Reclamo');
  const list = all.filter(t => {
    if (f.rxVer === 'abiertos' && !tramiteAbierto(t)) return false;
    if (f.rxVer === 'sinnum' && (t.numeroReclamo || !tramiteAbierto(t))) return false;
    if (q && !norm([t.codigo, t.asegurado, t.paciente, clienteNombre(t.clienteId), poliza(t.polizaId)?.numero, t.certificado, t.numeroReclamo, t.descripcion].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
  const sinNum = all.filter(t => tramiteAbierto(t) && !t.numeroReclamo).length;
  const seg = [['abiertos', 'Abiertos'], ['sinnum', `Sin número${sinNum ? ' · ' + sinNum : ''}`], ['todos', 'Todos']];
  const c = campos(RX, 'rx');

  return head('Reclamos', 'Cliente, póliza, asegurado y, si es un dependiente, el paciente. Las listas buscan mientras escribes; lo que no exista se crea al guardar. Si adjuntas el formulario en PDF, se llena solo.', `<button class="btn" type="button" data-act="rep-open" data-v="reclamos">${ic('clipboard-text')}Reporte de ingresados</button>`) + `
  <div class="rx-entry">
    <span class="rx-title">Nuevo reclamo</span>
    <form class="rx-new" id="rx-new" data-row="rx" autocomplete="off">
      <div class="rx-l1">${c.cliente}${c.poliza}${c.asegurado}${c.cert}${c.paciente}${c.parentesco}</div>
      <div class="rx-l2">${c.monto}${c.numero}${c.notas}
        <div class="rx-cell" data-l="PDF"><label class="btn rx-pdf" title="Adjuntar PDF (se lee solo)">${ic('paperclip')}<span>PDF</span><span class="rx-n"></span><input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="new"></label></div>
        <div class="rx-cell rx-go"><button class="btn primary" type="submit" title="Agregar (Enter)">${ic('plus')}Agregar</button></div>
      </div>
      <div class="rx-under">
        <span class="row-hint"></span>
        <label class="rx-stage"><span>Queda como</span><select id="rx-etapa">${opt([['recibido', 'Recibido (falta ingresar)'], ['ingresado', 'Ingresado a la aseguradora']], RX.etapa)}</select></label>
        <button class="btn ghost sm" type="button" data-act="rx-clear">Limpiar</button>
      </div>
    </form>
  </div>

  <div class="toolbar" style="margin-top:18px">
    <label class="search"><span class="sr">Buscar reclamos</span>${ic('magnifying-glass')}<input type="search" id="rxsearch" data-bind="q" placeholder="Empresa, asegurado, paciente, póliza, número…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Ver">${seg.map(([k, n]) => `<button type="button" data-act="filter" data-k="rxVer" data-v="${k}" aria-pressed="${f.rxVer === k}">${n}</button>`).join('')}</div>
  </div>

  <div class="panel rx">
    ${list.length ? `<div class="rx-grid rx-head" aria-hidden="true"><span>Cliente › Asegurado</span><span>Póliza</span><span>Cert.</span><span>PDF</span><span>N.º de reclamo</span><span>Notas</span><span>Etapa</span></div>
    ${list.map(t => {
      const pp = poliza(t.polizaId);
      const cli = clienteNombre(t.clienteId);
      const col = t.asegurado && norm(t.asegurado) !== norm(cli);
      const pt = portalDe(t.aseguradora || pp?.aseguradora);
      return `<div class="rx-grid rx-row" data-id="${t.id}">
        <div class="rx-cell" data-l="Cliente">${col ? `<small class="rx-co">${esc(shortName(cli))}</small><b>${esc(t.asegurado)}</b>` : `<b>${esc(cli)}</b>`}<small>${t.paciente ? `Paciente: ${esc(t.paciente)}${t.parentesco ? ' (' + esc(t.parentesco.toLowerCase()) + ')' : ''}` : `${esc(t.codigo)} · ${fmtShort(t.fechaSolicitud)}`}</small></div>
        <div class="rx-cell" data-l="Póliza"><b class="tnum" style="font-weight:500">${esc(pp?.numero || '-')}</b><small>${esc([t.aseguradora, t.monto ? fmtMoney(t.monto) : ''].filter(Boolean).join(' · '))}</small></div>
        <div class="rx-cell tnum" data-l="Cert.">${esc(t.certificado || '-')}</div>
        <div class="rx-cell rx-docs" data-l="PDF">${(t.docs || []).length ? `<a class="rx-doc" href="${esc(docUrl(t.docs[0]))}" target="_blank" rel="noopener" title="${esc(t.docs.map(d => d.name).join('\n'))}" aria-label="Abrir ${esc(t.docs[0].name)}">${ic('file-pdf')}${t.docs.length > 1 ? `<sup>${t.docs.length}</sup>` : ''}</a>` : ''}<label class="rx-doc add" title="Agregar PDF" aria-label="Agregar PDF">${ic('plus')}<input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="${t.id}"></label></div>
        <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="rn-${t.id}">Número de reclamo</label><input id="rn-${t.id}" type="text" class="rx-inline tnum" value="${esc(t.numeroReclamo || '')}" placeholder="Pendiente" data-rinline="numeroReclamo"></div>
        <div class="rx-cell" data-l="Notas"><label class="sr" for="rt-${t.id}">Notas</label><input id="rt-${t.id}" type="text" class="rx-inline" value="${esc(t.descripcion || '')}" placeholder="Agregar nota" data-rinline="descripcion"></div>
        <div class="rx-cell rx-end" data-l="Etapa"><button type="button" class="rx-stagebtn" data-act="open-tramite" data-id="${t.id}" title="Abrir ${esc(t.codigo)}">${etapaPill(t)}</button>${pt ? `<a class="rx-online" href="${pt.url}" target="_blank" rel="noopener" data-act="portal-abrir" data-id="${t.id}" title="Abrir el portal de ${pt.nombre}">${ic('arrow-square-out')}<span>Ingresar en línea</span></a>${PORTAL_ABIERTO.has(t.id) && t.etapa === 'recibido' ? `<button type="button" class="rx-online ok" data-act="portal-ok" data-id="${t.id}">${ic('check')}<span>Ya lo ingresé</span></button>` : ''}` : ''}</div>
      </div>`;
    }).join('')}` : `<div class="panel-b">${emptyState('first-aid', all.length ? 'Nada con estos filtros' : 'Aún no hay reclamos', all.length ? 'Prueba con “Todos”.' : 'Escribe el primero arriba o adjunta el formulario en PDF.')}</div>`}
  </div>`;
};

/* --- comportamiento de las listas (el estado vive en cada caja) --- */
const finePointer = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
const cbState = box => rowState(box) || RX;
function cbOpen(input) {
  const box = input.closest('.cb'); const name = box.dataset.cb; const list = $('.cb-list', box);
  const v = input.value.trim(); const st = cbState(box);
  box._opts = CB[name](v, st); box._active = box._opts.length && v ? 0 : -1;
  if (!box._opts.length) {
    const nuevo = { cliente: `Cliente nuevo: se creará “${esc(v)}” al guardar`, poliza: `Póliza nueva: se creará “${esc(v)}” al guardar`, asegurado: `Asegurado nuevo: se agregará a la póliza al guardar`, cert: 'Certificado nuevo' }[name];
    list.innerHTML = `<li class="cb-empty">${v ? nuevo : name === 'cert' ? (st.polizaId ? 'Esta póliza no tiene certificados registrados' : 'Elige primero la póliza') : 'Escribe para buscar'}</li>`;
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
  pick(box.dataset.cb, o, cbState(box));
  input.value = o.label;
  cbClose(box);
  return true;
}
// Al salir sin elegir: si lo escrito coincide con una sola opción exacta, se toma esa.
function cbAutoMatch(input) {
  const box = input.closest('.cb'); if (!box) return;
  const name = box.dataset.cb, v = input.value.trim(), st = cbState(box);
  if (!v) return;
  if (name === 'asegurado' && st.picked && norm(st.picked) === norm(v)) return;
  const opts = CB[name](v, st);
  const exact = opts.filter(o => norm(o.label) === norm(v) || (o.find && norm(o.find).split(' ').includes(norm(v))));
  const only = exact.length === 1 ? exact[0] : (opts.length === 1 && opts[0].s >= 4 ? opts[0] : null);
  if (only) { pick(name, only, st); input.value = only.label; }
  else syncRow(st);
}

document.addEventListener('focusin', e => { const i = e.target.closest?.('.cb input'); if (i && (S.route === 'reclamos' || i.closest('.drawer')) && (i.value || finePointer())) cbOpen(i); });
document.addEventListener('focusout', e => {
  const i = e.target.closest?.('.cb input'); if (!i) return;
  setTimeout(() => { const box = i.closest('.cb'); if (box && !box.contains(document.activeElement)) { cbAutoMatch(i); cbClose(box); } }, 120);
});
document.addEventListener('input', e => {
  const i = e.target.closest?.('.cb input');
  if (i) {
    const box = i.closest('.cb'), name = box.dataset.cb, v = i.value, st = cbState(box);
    if (name === 'cliente') { st.clienteTxt = v; if (st.clienteId && norm(v) !== norm(clienteNombre(st.clienteId))) st.clienteId = ''; }
    if (name === 'poliza') { st.polizaTxt = v; const p = poliza(st.polizaId); if (p && norm(v) !== norm(p.numero)) st.polizaId = ''; }
    if (name === 'asegurado') { st.asegurado = v; if (norm(v) !== norm(st.picked)) st.picked = ''; }
    if (name === 'cert') st.certificado = v;
    if (st === RX) rxKeep();
    cbOpen(i);
    const h = $('.row-hint', rowEl(st)); if (h) { const x = hintFila(st); h.innerHTML = x.html; h.dataset.estado = x.estado; }
    return;
  }
  const k = e.target.dataset?.f;
  if (k) { const st = rowState(e.target); if (st) { st[k] = e.target.value; if (st === RX) rxKeep(); if (k === 'paciente') { const h = $('.row-hint', rowEl(st)); if (h) h.innerHTML = hintFila(st).html; } } }
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.f;
  if (k === 'parentesco') { const st = rowState(e.target); if (st) { st.parentesco = e.target.value; if (st === RX) rxKeep(); syncRow(st); } }
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
  // Salta a la siguiente casilla vacía de la misma fila
  const row = input.closest('[data-row]'); if (!row) return;
  const all = $$('input[type=text]', row).filter(x => x.offsetParent);
  const rest = all.slice(all.indexOf(input) + 1);
  (rest.find(el => !el.value) || rest[rest.length - 1])?.focus();
}

/* --- guardar desde la fila de ingreso --- */
document.addEventListener('submit', async e => {
  if (e.target.id !== 'rx-new') return;
  e.preventDefault();
  if (document.activeElement?.closest('.cb')) cbAutoMatch(document.activeElement);
  RX.etapa = $('#rx-etapa').value;
  if (!RX.clienteId && !limpiar(RX.clienteTxt)) { toast('Escribe el cliente (la empresa) o elige la póliza', 'err'); $('#rx-cliente').focus(); return; }
  const btn = $('#rx-new [type=submit]'); btn.disabled = true;
  let t;
  try {
    await asegurarEntidades(RX);
    t = nuevoReclamo(RX, { etapa: RX.etapa, docs: RX.docs });
    await save('tramites', t, `${t.codigo} Reclamo · ${shortName(clienteNombre(t.clienteId))}${t.asegurado !== clienteNombre(t.clienteId) ? ' › ' + t.asegurado : ''}${t.numeroReclamo ? ' · ' + t.numeroReclamo : ''}`);
  } catch (err) { btn.disabled = false; if (err.message) toast(err.message, 'err'); return; }
  const keep = { etapa: RX.etapa, clienteId: RX.clienteId, clienteTxt: RX.clienteTxt, polizaId: RX.polizaId };
  // Para la colectiva se queda la empresa y la póliza: el siguiente reclamo suele ser de otro empleado
  RX = filaNueva(esColectiva({ ...RX }) ? keep : { etapa: RX.etapa });
  rxKeep();
  render(false);
  $(`.rx-row[data-id="${t.id}"]`)?.classList.add('rx-flash');
  (RX.clienteId ? $('#rx-asegurado') : $('#rx-cliente'))?.focus();
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
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'numero', texto: `Número asignado ${v}.` }];
      accion = 'movió'; resumen = `${t.codigo} a Número asignado (${v})`;
    }
    try { await save('tramites', t, resumen, accion); el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); toast(accion ? `${t.codigo}: Número asignado` : 'Guardado'); if (accion) render(false); } catch (err) { }
  }
  if (el.dataset.rxUpload) {
    const files = [...el.files]; if (!files.length) return;
    const id = el.dataset.rxUpload;
    const target = id === 'new' ? null : tramite(id);
    const carpeta = clienteNombre(target ? target.clienteId : RX.clienteId) || (RX.clienteTxt ? shortName(RX.clienteTxt) : 'Reclamos sin cliente');
    const subidos = [];
    for (const f of files) {
      try { toast(`Subiendo ${f.name}…`); const d = await uploadFile(f, carpeta); subidos.push({ id: d.id, name: d.name || f.name, size: d.size || f.size, url: d.url || '' }); }
      catch (err) { toast(err.message, 'err'); }
    }
    el.value = '';
    if (target) { target.docs = [...(target.docs || []), ...subidos]; try { await save('tramites', target, `${target.codigo}: ${subidos.length} PDF agregado${subidos.length > 1 ? 's' : ''}`); render(false); toast('PDF agregado'); } catch (err) { } return; }
    RX.docs.push(...subidos); rxKeep(); syncRow(RX);
    await leerSubidos(subidos);
  }
});

/* Lee los PDF que se adjuntaron en la fila de ingreso: un formulario llena la fila; varios abren la revisión */
async function leerSubidos(docs) {
  if (!docs.length) return;
  if (S.mode === 'demo') { toast('Adjuntado. En la demo no se leen PDFs reales: prueba con el correo de INJIBOA en la Bandeja.'); return; }
  toast('Leyendo el PDF…');
  let textos;
  try { textos = (await api('api/leer', { json: { fileIds: docs.map(d => d.id) } })).textos || []; }
  catch (err) { toast('No se pudo leer el PDF: ' + err.message, 'err'); return; }
  const forms = textos.flatMap(t => leerFormularios(t.texto).map(f => ({ f, ref: t.ref })));
  if (!forms.length) { toast('Adjuntado. No encontré un formulario de reclamo en ese PDF; llena la fila a mano.'); return; }
  if (forms.length === 1) {
    const n = filaDeFormulario(forms[0].f);
    for (const k of ['clienteId', 'clienteTxt', 'polizaId', 'polizaTxt', 'asegurado', 'certificado', 'paciente', 'parentesco', 'monto', 'notas', 'picked']) if (!RX[k] && n[k]) RX[k] = n[k];
    rxKeep(); syncRow(RX);
    toast('Formulario leído. Revisa la fila y pulsa Agregar.');
    return;
  }
  openVariosDesde({
    titulo: `${forms.length} reclamos en ${docs.length === 1 ? 'el PDF' : 'los PDF'}`, sub: docs.map(d => d.name).join(', '),
    pool: docs.map(d => ({ id: d.id, name: d.name, size: d.size, doc: d })),
    rows: forms.map(x => filaDeFormulario(x.f, x.ref)), aseguradora: ''
  });
  RX.docs = []; rxKeep(); syncRow(RX);
}

/* "Ingresar en línea": abre el portal de la aseguradora y deja en la fila un botón "Ya lo ingresé". */
const PORTAL_ABIERTO = new Set();
function trasPortal(id) {
  const t = tramite(id);
  if (!t || t.etapa !== 'recibido') return;
  PORTAL_ABIERTO.add(id);
  setTimeout(() => render(false), 50);
}

async function marcarIngresadoPortal(id) {
  const t0 = tramite(id); if (!t0) return;
  const t = structuredClone(t0);
  const pt = portalDe(t.aseguradora || poliza(t.polizaId)?.aseguradora);
  t.etapa = 'ingresado'; t.canal = 'Portal de la aseguradora'; t.fechaIngreso = t.fechaIngreso || todayISO();
  t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'ingresado', texto: `Ingresado en línea en el portal de ${pt?.nombre || t.aseguradora || 'la aseguradora'}.` }];
  try { await save('tramites', t, `${t.codigo} a Ingresado (en línea)`, 'movió'); } catch (e) { return; }
  PORTAL_ABIERTO.delete(id);
  toast(`${t.codigo}: Ingresado`);
  render(false);
}
