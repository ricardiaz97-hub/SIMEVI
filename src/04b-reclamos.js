/* ---------- Reclamos: tabla rápida de ingreso ----------
   Una fila arriba para escribir el reclamo nuevo. Nombre, póliza y certificado son listas
   en las que se puede escribir: buscan mientras escribes y llenan lo demás solas. */

const RX_BLANK = () => ({ asegurado: '', clienteId: '', polizaId: '', certificado: '', numero: '', notas: '', docs: [], etapa: 'ingresado', picked: '' });
let RX = RX_BLANK();
try { const d = JSON.parse(sessionStorage.getItem('simevi-rx') || 'null'); if (d) RX = { ...RX_BLANK(), ...d }; } catch (e) { }
const rxKeep = () => { try { sessionStorage.setItem('simevi-rx', JSON.stringify(RX)); } catch (e) { } };

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

/* Opciones de cada lista */
const CB = {
  nombre(q) {
    const opts = [];
    DB.polizas.filter(p => p.modalidad === 'Colectiva' && !p.cancelada).forEach(p => (p.asegurados || []).forEach(a => {
      if (!a.nombre) return;
      opts.push({ kind: 'aseg', label: a.nombre, sub: `Cert. ${a.certificado || '-'} · ${p.numero} · ${shortName(clienteNombre(p.clienteId))}`, find: `${a.nombre} ${a.documento} ${a.certificado}`, clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '', bonus: p.ramo === 'Gastos médicos' ? 0.5 : 0 });
    }));
    DB.clientes.forEach(c => {
      const n = DB.polizas.filter(p => p.clienteId === c.id && !p.cancelada).length;
      opts.push({ kind: 'cli', label: c.nombre, sub: `${c.tipo} · ${n} ${n === 1 ? 'póliza' : 'pólizas'}`, find: `${c.nombre} ${c.documento}`, clienteId: c.id });
    });
    if (!q) {
      const recent = [...new Set(DB.tramites.filter(t => t.tipo === 'Reclamo').map(t => t.asegurado || clienteNombre(t.clienteId)))].slice(0, 6);
      return recent.map(n => opts.find(o => o.label === n)).filter(Boolean);
    }
    return opts.map(o => ({ ...o, s: score(o.find, q) && score(o.find, q) + (o.bonus || 0) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  },
  poliza(q, st = RX) {
    return DB.polizas.filter(p => !p.cancelada && (!st.clienteId || p.clienteId === st.clienteId))
      .map(p => ({ kind: 'pol', label: p.numero, sub: `${p.ramo} · ${p.aseguradora} · ${shortName(clienteNombre(p.clienteId))}`, find: `${p.numero} ${p.ramo} ${p.aseguradora} ${clienteNombre(p.clienteId)}`, polizaId: p.id, clienteId: p.clienteId }))
      .map(o => ({ ...o, s: score(o.find, q) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  },
  cert(q, st = RX) {
    const p = poliza(st.polizaId);
    return (p?.asegurados || []).filter(a => a.certificado || a.nombre)
      .map(a => ({ kind: 'cert', label: a.certificado || '-', sub: a.nombre, find: `${a.certificado} ${a.nombre} ${a.documento}`, nombre: a.nombre }))
      .map(o => ({ ...o, s: score(o.find, q) })).filter(o => o.s).sort((a, b) => b.s - a.s).slice(0, 8);
  }
};

function pick(name, o, st = RX) {
  if (name === 'nombre') {
    st.asegurado = o.label; st.picked = o.label; st.clienteId = o.clienteId;
    if (o.kind === 'aseg') { st.polizaId = o.polizaId; st.certificado = o.certificado; }
    else {
      const ps = DB.polizas.filter(p => p.clienteId === o.clienteId && !p.cancelada);
      if (!ps.some(p => p.id === st.polizaId)) st.polizaId = ps.length === 1 ? ps[0].id : '';
    }
  }
  if (name === 'poliza') {
    st.polizaId = o.polizaId;
    if (st.clienteId !== o.clienteId) { st.clienteId = o.clienteId; if (!st.asegurado || st.picked !== st.asegurado) { st.asegurado = clienteNombre(o.clienteId); st.picked = st.asegurado; } }
  }
  if (name === 'cert') { st.certificado = o.label; if (!st.asegurado || st.asegurado === clienteNombre(st.clienteId)) { st.asegurado = o.nombre; st.picked = o.nombre; } }
  if (st === RX) { rxKeep(); syncEntry(); } else syncMx(st);
}

/* Pinta en la fila de ingreso lo que ya se sabe */
function syncEntry() {
  const row = $('#rx-new'); if (!row) return;
  const p = poliza(RX.polizaId);
  const set = (id, v) => { const el = $('#' + id, row); if (el && document.activeElement !== el) el.value = v; };
  set('rx-nombre', RX.asegurado);
  set('rx-poliza', p ? p.numero : (RX.polizaTxt || ''));
  set('rx-cert', RX.certificado);
  $('#rx-hint', row).innerHTML = RX.clienteId
    ? `${ic('check-circle')}<span>${esc(shortName(clienteNombre(RX.clienteId)))}${p ? ` · ${esc(p.ramo)} · ${esc(p.aseguradora)}` : ''}</span>`
    : `<span class="faint">Escribe un nombre, DUI o número de póliza</span>`;
  $('#rx-hint', row).classList.toggle('ok', !!RX.clienteId);
  $('#rx-docs-n', row).textContent = RX.docs.length ? RX.docs.length : '';
  $('#rx-pdf', row).classList.toggle('has', RX.docs.length > 0);
  $('#rx-pdf', row).title = RX.docs.map(d => d.name).join('\n') || 'Adjuntar PDF';
}

const comboHTML = (name, id, label, val, ph) => `
  <div class="cb" data-cb="${name}">
    <label class="sr" for="${id}">${label}</label>
    <input id="${id}" type="text" value="${esc(val)}" placeholder="${esc(ph)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false">
    ${ic('caret-up-down', 'cb-caret')}
    <ul class="cb-list card" id="${id}-list" role="listbox" hidden></ul>
  </div>`;

VIEWS.reclamos = () => {
  const f = S.f, q = norm(S.q);
  f.rxVer = f.rxVer || 'abiertos';
  const all = DB.tramites.filter(t => t.tipo === 'Reclamo');
  const list = all.filter(t => {
    if (f.rxVer === 'abiertos' && !tramiteAbierto(t)) return false;
    if (f.rxVer === 'sinnum' && (t.numeroReclamo || !tramiteAbierto(t))) return false;
    if (q && !norm([t.codigo, t.asegurado, clienteNombre(t.clienteId), poliza(t.polizaId)?.numero, t.certificado, t.numeroReclamo, t.descripcion].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
  const sinNum = all.filter(t => tramiteAbierto(t) && !t.numeroReclamo).length;
  const p = poliza(RX.polizaId);
  const seg = [['abiertos', 'Abiertos'], ['sinnum', `Sin número${sinNum ? ' · ' + sinNum : ''}`], ['todos', 'Todos']];

  return head('Reclamos', 'Escribe en la primera fila y pulsa Enter. Nombre, póliza y certificado buscan mientras escribes y se llenan entre sí.') + `
  <div class="rx-entry">
    <span class="rx-title">Nuevo reclamo</span>
    <div class="rx-grid rx-head" aria-hidden="true"><span>Nombre</span><span>Póliza</span><span>Cert.</span><span>PDF</span><span>N.º de reclamo</span><span>Notas</span><span></span></div>
    <form class="rx-grid rx-new" id="rx-new" autocomplete="off">
      <div class="rx-cell" data-l="Nombre">${comboHTML('nombre', 'rx-nombre', 'Nombre del asegurado', RX.asegurado, 'Asegurado o cliente')}</div>
      <div class="rx-cell" data-l="Póliza">${comboHTML('poliza', 'rx-poliza', 'Póliza', p ? p.numero : '', 'Póliza')}</div>
      <div class="rx-cell" data-l="Certificado">${comboHTML('cert', 'rx-cert', 'Número de certificado', RX.certificado, 'Cert.')}</div>
      <div class="rx-cell" data-l="PDF"><label class="btn icon rx-pdf" id="rx-pdf" title="Adjuntar PDF">${ic('paperclip')}<span id="rx-docs-n" class="rx-n"></span><input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="new"></label></div>
      <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="rx-num">Número de reclamo</label><input id="rx-num" type="text" value="${esc(RX.numero)}" placeholder="Opcional" data-rx="numero"></div>
      <div class="rx-cell" data-l="Notas"><label class="sr" for="rx-notas">Notas</label><input id="rx-notas" type="text" value="${esc(RX.notas)}" placeholder="Qué se reclama" data-rx="notas"></div>
      <div class="rx-cell rx-go"><button class="btn primary" type="submit" title="Agregar (Enter)">${ic('plus')}Agregar</button></div>
      <div class="rx-under">
        <span class="rx-hint" id="rx-hint"></span>
        <label class="rx-stage"><span>Queda como</span><select id="rx-etapa" data-rx="etapa">${opt([['recibido', 'Recibido (falta ingresar)'], ['ingresado', 'Ingresado a la aseguradora']], RX.etapa)}</select></label>
        <button class="btn ghost sm" type="button" data-act="rx-clear">Limpiar</button>
      </div>
    </form>
  </div>

  <div class="toolbar" style="margin-top:18px">
    <label class="search"><span class="sr">Buscar reclamos</span>${ic('magnifying-glass')}<input type="search" id="rxsearch" data-bind="q" placeholder="Nombre, póliza, certificado, número…" value="${esc(S.q)}"></label>
    <div class="seg" role="group" aria-label="Ver">${seg.map(([k, n]) => `<button type="button" data-act="filter" data-k="rxVer" data-v="${k}" aria-pressed="${f.rxVer === k}">${n}</button>`).join('')}</div>
  </div>

  <div class="panel rx">
    ${list.length ? `<div class="rx-grid rx-head" aria-hidden="true"><span>Nombre</span><span>Póliza</span><span>Cert.</span><span>PDF</span><span>N.º de reclamo</span><span>Notas</span><span>Etapa</span></div>
    ${list.map(t => {
      const pp = poliza(t.polizaId);
      const nombre = t.asegurado || clienteNombre(t.clienteId);
      return `<div class="rx-grid rx-row" data-id="${t.id}">
        <div class="rx-cell" data-l="Nombre"><b>${esc(nombre)}</b>${nombre !== clienteNombre(t.clienteId) ? `<small>${esc(shortName(clienteNombre(t.clienteId)))}</small>` : `<small>${esc(t.codigo)} · ${fmtShort(t.fechaSolicitud)}</small>`}</div>
        <div class="rx-cell" data-l="Póliza"><b class="tnum" style="font-weight:500">${esc(pp?.numero || '-')}</b><small>${esc(t.aseguradora || '')}</small></div>
        <div class="rx-cell tnum" data-l="Certificado">${esc(t.certificado || '-')}</div>
        <div class="rx-cell rx-docs" data-l="PDF">${(t.docs || []).length ? `<a class="rx-doc" href="${esc(docUrl(t.docs[0]))}" target="_blank" rel="noopener" title="${esc(t.docs.map(d => d.name).join('\n'))}" aria-label="Abrir ${esc(t.docs[0].name)}">${ic('file-pdf')}${t.docs.length > 1 ? `<sup>${t.docs.length}</sup>` : ''}</a>` : ''}<label class="rx-doc add" title="Agregar PDF" aria-label="Agregar PDF">${ic('plus')}<input type="file" multiple accept="application/pdf,image/*" hidden data-rx-upload="${t.id}"></label></div>
        <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="rn-${t.id}">Número de reclamo de ${esc(nombre)}</label><input id="rn-${t.id}" type="text" class="rx-inline tnum" value="${esc(t.numeroReclamo || '')}" placeholder="Pendiente" data-rinline="numeroReclamo"></div>
        <div class="rx-cell" data-l="Notas"><label class="sr" for="rt-${t.id}">Notas de ${esc(nombre)}</label><input id="rt-${t.id}" type="text" class="rx-inline" value="${esc(t.descripcion || '')}" placeholder="Agregar nota" data-rinline="descripcion"></div>
        <div class="rx-cell rx-end" data-l="Etapa"><button type="button" class="rx-stagebtn" data-act="open-tramite" data-id="${t.id}" title="Abrir ${esc(t.codigo)}">${etapaPill(t)}</button></div>
      </div>`;
    }).join('')}` : `<div class="panel-b">${emptyState('first-aid', all.length ? 'Nada con estos filtros' : 'Aún no hay reclamos', all.length ? 'Prueba con “Todos”.' : 'Escribe el primero en la fila de arriba.')}</div>`}
  </div>`;
};

/* --- comportamiento de las listas (el estado vive en cada caja) --- */
const finePointer = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
const cbState = box => { const r = box.closest('[data-mx]'); return r ? MX.rows[+r.dataset.mx] : RX; };
function cbOpen(input) {
  const box = input.closest('.cb'); const name = box.dataset.cb; const list = $('.cb-list', box);
  const v = input.value.trim(); const st = cbState(box);
  box._opts = CB[name](v, st); box._active = box._opts.length && v ? 0 : -1;
  if (!box._opts.length) {
    list.innerHTML = v ? `<li class="cb-empty">Sin coincidencias${name === 'nombre' && st === RX ? `. <button type="button" data-act="rx-new-cliente">Crear cliente “${esc(v)}”</button>` : ''}</li>` : `<li class="cb-empty">${name === 'cert' ? (st.polizaId ? 'Esta póliza no tiene certificados registrados' : 'Elige primero la póliza') : 'Escribe para buscar'}</li>`;
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
  if (name === 'nombre' && st.picked && norm(st.picked) === norm(v)) return;
  const opts = CB[name](v, st);
  const exact = opts.filter(o => norm(o.label) === norm(v) || (name === 'nombre' && o.find && norm(o.find).split(' ').includes(norm(v))));
  const only = exact.length === 1 ? exact[0] : (opts.length === 1 && opts[0].s >= 4 ? opts[0] : null);
  if (only) { pick(name, only, st); input.value = only.label; }
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
    if (name === 'nombre') { st.asegurado = v; if (norm(v) !== norm(st.picked)) { st.picked = ''; if (!v) { st.clienteId = ''; st.polizaId = ''; st.certificado = ''; } } }
    if (name === 'poliza') { st.polizaTxt = v; if (!v) st.polizaId = ''; }
    if (name === 'cert') st.certificado = v;
    if (st === RX) rxKeep();
    cbOpen(i);
    if (!v && name === 'nombre') st === RX ? syncEntry() : syncMx(st);
    return;
  }
  const r = e.target.dataset?.rx; if (r) { RX[r] = e.target.value; rxKeep(); }
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
  const row = input.closest('.rx-new, .mx-row'); if (!row) return;
  const all = $$('input[type=text]', row);
  const rest = all.slice(all.indexOf(input) + 1);
  (rest.find(el => !el.value) || rest[rest.length - 1])?.focus();
}

/* --- guardar --- */
document.addEventListener('submit', async e => {
  if (e.target.id !== 'rx-new') return;
  e.preventDefault();
  if (document.activeElement?.closest('.cb')) cbAutoMatch(document.activeElement);
  // Si escribieron una póliza que existe, tomarla
  if (!RX.polizaId && $('#rx-poliza').value.trim()) { const p = DB.polizas.find(x => norm(x.numero) === norm($('#rx-poliza').value)); if (p) pick('poliza', { polizaId: p.id, clienteId: p.clienteId }); }
  RX.numero = $('#rx-num').value.trim(); RX.notas = $('#rx-notas').value.trim(); RX.etapa = $('#rx-etapa').value;
  RX.asegurado = $('#rx-nombre').value.trim(); RX.certificado = $('#rx-cert').value.trim();
  if (!RX.clienteId) { toast('Elige el nombre o la póliza de la lista para saber de qué cliente es', 'err'); $('#rx-nombre').focus(); return; }
  const p = poliza(RX.polizaId);
  const etapa = RX.numero ? 'numero' : RX.etapa;
  const ev = [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: etapa === 'recibido' ? 'Recibido.' : `Ingresado a ${p?.aseguradora || 'la aseguradora'}.` }];
  if (RX.numero) ev.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Número asignado ${RX.numero}.` });
  const t = {
    id: '', codigo: nextCodigo(), tipo: 'Reclamo', clienteId: RX.clienteId, polizaId: RX.polizaId, aseguradora: p?.aseguradora || '',
    asegurado: RX.asegurado || clienteNombre(RX.clienteId), certificado: RX.certificado,
    asunto: `Reclamo de ${RX.asegurado || shortName(clienteNombre(RX.clienteId))}`, descripcion: RX.notas,
    canal: CANALES[0], etapa, numeroReclamo: RX.numero, monto: '', fechaSolicitud: todayISO(), fechaIngreso: etapa === 'recibido' ? '' : todayISO(),
    responsable: S.me.email, visibleCliente: true, notaCliente: '', docs: RX.docs, eventos: ev
  };
  const btn = $('#rx-new [type=submit]'); btn.disabled = true;
  try { await save('tramites', t, `${t.codigo} Reclamo · ${t.asegurado}${t.numeroReclamo ? ' · ' + t.numeroReclamo : ''}`); }
  catch (err) { btn.disabled = false; return; }
  const keepEtapa = RX.etapa;
  RX = RX_BLANK(); RX.etapa = keepEtapa; rxKeep();
  render(false);
  $(`.rx-row[data-id="${t.id}"]`)?.classList.add('rx-flash');
  $('#rx-nombre')?.focus();
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
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Número asignado ${v}.` }];
      accion = 'movió'; resumen = `${t.codigo} a Número asignado (${v})`;
    }
    try { await save('tramites', t, resumen, accion); el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); toast(accion ? `${t.codigo}: Número asignado` : 'Guardado'); if (accion) render(false); } catch (err) { }
  }
  if (el.dataset.rxUpload) {
    const files = [...el.files]; if (!files.length) return;
    const id = el.dataset.rxUpload;
    const target = id === 'new' ? null : tramite(id);
    const carpeta = clienteNombre(target ? target.clienteId : RX.clienteId) || 'General';
    for (const f of files) {
      try { toast(`Subiendo ${f.name}…`); const d = await uploadFile(f, carpeta); (target ? (target.docs = target.docs || []) : RX.docs).push({ id: d.id, name: d.name || f.name, size: d.size || f.size, url: d.url || '' }); }
      catch (err) { toast(err.message, 'err'); }
    }
    el.value = '';
    if (target) { try { await save('tramites', target, `${target.codigo}: ${files.length} PDF agregado${files.length > 1 ? 's' : ''}`); render(false); toast('PDF agregado'); } catch (err) { } }
    else { rxKeep(); syncEntry(); toast(`${RX.docs.length} PDF listo${RX.docs.length > 1 ? 's' : ''} para el reclamo`); }
  }
});

// Enter en una casilla de la tabla guarda y baja a la siguiente fila
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList?.contains('rx-inline')) return;
  e.preventDefault();
  const k = e.target.dataset.rinline;
  e.target.blur();
  const next = e.target.closest('.rx-row')?.nextElementSibling?.querySelector(`[data-rinline="${k}"]`);
  next?.focus();
});
