/* ---------- Correos con varios reclamos o varios cheques ----------
   Lee el correo línea por línea: cada persona conocida (asegurado de una colectiva o cliente),
   cada número de reclamo y cada cheque arma una fila. Los adjuntos se reparten por el nombre
   del archivo. Todo queda en una tabla para revisar antes de crear nada. */

const flatLine = s => norm(s).replace(/[ \t\r]+/g, ' ');
const wb = p => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);

function personas() {
  const out = [];
  DB.polizas.filter(p => p.modalidad === 'Colectiva' && !p.cancelada).forEach(p => (p.asegurados || []).forEach(a => {
    if (a.nombre && !/planilla|anexo|·/i.test(a.nombre)) out.push({ kind: 'aseg', nombre: a.nombre, clienteId: p.clienteId, polizaId: p.id, certificado: a.certificado || '', gm: p.ramo === 'Gastos médicos' });
  }));
  DB.clientes.forEach(c => out.push({ kind: 'cli', nombre: c.nombre, clienteId: c.id }));
  for (const x of out) {
    const t = norm(x.nombre).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['de', 'del', 'la', 'los', 'sa', 'cv'].includes(w));
    x.pats = [t.join(' ')];
    if (t.length >= 3) x.pats.push(`${t[0]} ${t[1]}`, `${t[0]} ${t[2]}`, `${t[0]} ${t[t.length - 1]}`);
    x.pats = [...new Set(x.pats)].filter(p => p.length >= 7).map(wb);
  }
  return out;
}
// Quién se menciona en un texto (sin repetir; el asegurado de gastos médicos gana)
function quienes(text, gente) {
  const f = flatLine(text);
  const hits = gente.filter(x => x.pats.some(r => r.test(f)));
  const best = new Map();
  for (const h of hits) {
    const k = norm(h.nombre);
    const prev = best.get(k);
    if (!prev || (h.kind === 'aseg' && prev.kind === 'cli') || (h.gm && !prev.gm)) best.set(k, h);
  }
  // si "Karla Ventura" y "Grupo Las Brisas" salen en la misma línea, el asegurado basta
  const list = [...best.values()];
  return list.filter(x => !(x.kind === 'cli' && list.some(y => y.kind === 'aseg' && y.clienteId === x.clienteId)));
}

const RE_RECLAMO = /(n[uú]mero\s+de\s+)?(?:reclamo|siniestro|caso|gesti[oó]n)\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*([A-Z]{1,6}-[A-Z0-9-]*\d[A-Z0-9-]*|\d{5,})/gi;
const RE_CODIGO = /\b([A-Z]{1,6}-[A-Z]{0,6}-?\d{2,4}-\d{3,6})\b/g; // números sueltos tipo PAL-GM-2026-31902
const RE_CHEQUE = /cheque\s*(?:n[°oº.]*|#|n[uú]mero)?\s*:?\s*(\d{5,})/gi;
const RE_MONTO = /(?:US)?\$\s?([\d.,]+\d)/;
// "Karla Ventura: consulta y exámenes, $145" → "consulta y exámenes, $145"
function limpiaNota(nota, w, nums) {
  let n = nota;
  const m = n.match(/^([^:–-]{3,80})[:–-]\s*(.+)$/);
  if (m && w.pats.some(r => r.test(flatLine(m[1])))) n = m[2];
  nums.forEach(x => { n = n.replace(new RegExp(x.replace(/[-]/g, '\\-'), 'i'), ''); });
  n = n.replace(/\b(reclamo|siniestro|n[uú]mero)\b\s*(n[°oº.]*|#)?\s*:?\s*$/i, '').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
  return n;
}
const toNum = s => +String(s).replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '');

function extraer(m) {
  const k = classify(m);
  const gente = personas();
  const polizas = new Set(DB.polizas.map(p => norm(p.numero)));
  const texto = [m.subject || '', m.body || m.snippet || ''].join('\n');
  const lines = texto.split(/\n|;|•/).map(s => s.trim()).filter(Boolean);
  const items = [];
  const numsIn = l => {
    const out = [...l.matchAll(RE_RECLAMO)].map(x => x[2].toUpperCase());
    [...l.matchAll(RE_CODIGO)].forEach(x => out.push(x[1].toUpperCase()));
    return [...new Set(out)].filter(n => !polizas.has(norm(n)));
  };
  for (const l of lines) {
    const who = quienes(l, gente);
    const nums = numsIn(l);
    const cheques = [...l.matchAll(RE_CHEQUE)].map(x => x[1]);
    const monto = (l.match(RE_MONTO) || [])[1];
    const nota = l.replace(/^\s*(?:\d+[.)-]|[-*])\s*/, '').slice(0, 160);
    if (who.length) {
      who.forEach((w, i) => {
        const same = items.find(it => it.persona && norm(it.persona.nombre) === norm(w.nombre));
        const it = same || { persona: w, docs: [], notas: '' };
        if (!same) items.push(it);
        if (who.length === 1) {
          if (nums.length === 1 && !it.numero) it.numero = nums[0];
          if (cheques.length === 1 && !it.cheque) it.cheque = cheques[0];
          if (monto && !it.monto) it.monto = toNum(monto);
          if (l !== m.subject && !it.notas) it.notas = limpiaNota(nota, w, nums);
        }
      });
    } else if (nums.length || cheques.length) {
      const last = items[items.length - 1];
      const lone = nums.length + cheques.length === 1;
      if (last && lone && ((nums[0] && !last.numero) || (cheques[0] && !last.cheque))) {
        if (nums[0]) last.numero = nums[0];
        if (cheques[0]) last.cheque = cheques[0];
        if (monto && !last.monto) last.monto = toNum(monto);
      } else if (l !== m.subject || !items.length) {
        nums.forEach(n => items.push({ numero: n, docs: [], notas: nota, monto: monto ? toNum(monto) : '' }));
        cheques.filter(c => !items.some(i => i.cheque === c)).forEach(c => items.push({ cheque: c, docs: [], notas: nota, monto: monto ? toNum(monto) : '' }));
      }
    }
  }
  // Un número suelto (p. ej. en el asunto) se une a la única persona a la que le puede tocar
  for (const o of items.filter(i => !i.persona)) {
    const fits = items.filter(i => i.persona && (!o.numero || !i.numero || i.numero === o.numero) && (!o.cheque || !i.cheque || i.cheque === o.cheque));
    if (fits.length === 1) {
      const t = fits[0];
      t.numero = t.numero || o.numero; t.cheque = t.cheque || o.cheque; t.monto = t.monto || o.monto; t.docs.push(...o.docs);
      items.splice(items.indexOf(o), 1);
    }
  }
  // Una empresa nombrada de paso ("…de la póliza de Grupo Las Brisas") no es un reclamo aparte
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i], w = it.persona;
    if (w?.kind === 'cli' && !it.numero && !it.cheque && !it.monto && items.some(o => o !== it && o.persona?.kind === 'aseg' && o.persona.clienteId === w.clienteId)) items.splice(i, 1);
  }
  // Adjuntos: por el nombre del archivo
  const sueltos = [];
  for (const a of m.attachments || []) {
    const w = quienes(a.name.replace(/[_.-]+/g, ' '), gente)[0];
    let it = w && items.find(i => i.persona && norm(i.persona.nombre) === norm(w.nombre));
    if (w && !it) { it = { persona: w, docs: [], notas: '' }; items.push(it); }
    if (it) it.docs.push(a.id); else sueltos.push(a.id);
  }
  if (!items.length && (m.attachments || []).length >= 2 && /\b(reclamos|reembolsos|siniestros)\b/i.test(texto)) {
    (m.attachments || []).forEach(a => items.push({ docs: [a.id], notas: a.name.replace(/\.[a-z0-9]+$/i, '') }));
    sueltos.length = 0;
  }
  if (!items.length) items.push({ docs: [], notas: m.subject || '' });
  if (items.length === 1) items[0].docs.push(...sueltos.splice(0));
  else { const sin = items.filter(i => !i.docs.length); if (sin.length === sueltos.length) sin.forEach((i, j) => i.docs.push(sueltos[j])), sueltos.length = 0; }

  // Cada fila: datos del cliente y, si existe, el reclamo que ya está abierto
  const mode = k.kind === 'pago' || items.some(i => i.cheque) ? 'pagos' : 'reclamos';
  const rows = items.map(it => {
    const w = it.persona;
    const r = { asegurado: w?.nombre || '', picked: w?.nombre || '', clienteId: w?.clienteId || k.clienteId || '', polizaId: w?.polizaId || '', certificado: w?.certificado || '', numero: it.numero || '', notas: it.notas || '', monto: it.monto || '', cheque: it.cheque || '', docs: it.docs, tramiteId: '' };
    if (r.clienteId && !r.polizaId) { const ps = DB.polizas.filter(p => p.clienteId === r.clienteId && !p.cancelada && (!k.aseguradora || p.aseguradora === k.aseguradora)); if (ps.length === 1) r.polizaId = ps[0].id; }
    if (!r.clienteId && k.polizaId && items.length === 1) { r.polizaId = k.polizaId; r.clienteId = poliza(k.polizaId).clienteId; }
    let t = r.numero && DB.tramites.find(t => norm(t.numeroReclamo) === norm(r.numero));
    if (!t && r.clienteId && (k.kind !== 'solicitud' || mode === 'pagos')) {
      const abiertos = DB.tramites.filter(t => t.tipo === 'Reclamo' && tramiteAbierto(t) && t.clienteId === r.clienteId && (!r.asegurado || !t.asegurado || norm(t.asegurado) === norm(r.asegurado)));
      t = mode === 'pagos' ? abiertos.find(t => t.etapa !== 'recibido') : abiertos.find(t => !t.numeroReclamo);
    }
    if (t) { r.tramiteId = t.id; r.clienteId = t.clienteId; r.polizaId = r.polizaId || t.polizaId; if (!r.asegurado) { r.asegurado = t.asegurado || clienteNombre(t.clienteId); r.picked = r.asegurado; } }
    if (!r.asegurado && r.clienteId) { r.asegurado = clienteNombre(r.clienteId); r.picked = r.asegurado; }
    return r;
  });
  return { mode, kind: k.kind, aseguradora: k.aseguradora, rows, sueltos };
}

/* ---------- la hoja para revisar ---------- */
let MX = null;

function openVarios(mailId) {
  const m = (S.inbox || []).find(x => x.id === mailId); if (!m) return;
  const x = extraer(m);
  MX = { mail: m, ...x };
  if (MX.rows.length === 1 && (m.attachments || []).length >= 2 && MX.mode === 'reclamos') {
    // "Separar en varios": una fila por adjunto
    MX.rows = m.attachments.map(a => ({ ...structuredClone(MX.rows[0]), docs: [a.id], notas: a.name.replace(/\.[a-z0-9]+$/i, '') }));
  }
  const d = openDrawer(variosHTML());
  d.classList.add('wide');
  MX.rows.forEach(syncMx);
}

const mxAtt = id => (MX.mail.attachments || []).find(a => a.id === id);
function variosHTML() {
  const pagos = MX.mode === 'pagos';
  const n = MX.rows.length;
  return `
  <div class="drawer-h"><div class="t"><span class="label">${esc(MX.mail.fromName || MX.mail.from)} · ${fmtAgo(MX.mail.fecha)}</span><h2>${n} ${pagos ? (n === 1 ? 'pago' : 'pagos') : (n === 1 ? 'reclamo' : 'reclamos')} en este correo</h2>
    <div class="muted" style="font-size:.86rem;margin-top:4px">${esc(MX.mail.subject || '')}</div></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b">
    <p class="muted" style="margin:0 0 14px;font-size:.86rem">Revisa cada fila. Puedes escribir en Nombre, Póliza y Certificado para buscar; ${pagos ? 'cada fila será un pago ligado a su reclamo.' : 'las filas que dicen <b>Actualiza</b> ponen el número o los PDFs en un reclamo que ya existe.'}</p>
    <details class="mx-mail"><summary>Ver el correo</summary><p>${esc(MX.mail.body || MX.mail.snippet || '').replace(/\n/g, '<br>')}</p></details>
    <div class="mx-rows">${MX.rows.map((r, i) => mxRowHTML(r, i)).join('')}</div>
    <button class="btn sm" type="button" data-act="mx-add" style="margin-top:10px">${ic('plus')}Agregar fila</button>
  </div>
  <div class="drawer-f"><span class="muted" style="font-size:.8rem">${MX.sueltos?.length ? `${MX.sueltos.length} adjunto${MX.sueltos.length > 1 ? 's' : ''} sin asignar` : ''}</span><span class="spacer"></span>
    <button class="btn primary" type="button" data-act="mx-go">${ic('check')}${pagos ? `Registrar ${n} ${n === 1 ? 'pago' : 'pagos'}` : `Guardar ${n} ${n === 1 ? 'reclamo' : 'reclamos'}`}</button></div>`;
}

function mxRowHTML(r, i) {
  const pagos = MX.mode === 'pagos';
  const t = tramite(r.tramiteId);
  const atts = MX.mail.attachments || [];
  return `<section class="mx-row card" data-mx="${i}">
    <div class="mx-top"><span class="mx-n">${i + 1}</span>
      ${t ? `<span class="pill gold">Actualiza ${esc(t.codigo)}</span><button class="btn ghost sm" type="button" data-act="mx-unlink" data-i="${i}">Hacer nuevo</button>` : `<span class="pill info">${pagos ? 'Pago nuevo' : 'Reclamo nuevo'}</span>`}
      <span class="mx-hint" id="mx-hint-${i}"></span>
      <button class="btn ghost icon sm" type="button" data-act="mx-del" data-i="${i}" aria-label="Quitar fila ${i + 1}">${ic('x')}</button></div>
    <div class="mx-grid">
      <div class="rx-cell mx-name" data-l="Nombre">${comboHTML('nombre', `mx-nombre-${i}`, 'Nombre', r.asegurado, 'Asegurado o cliente')}</div>
      <div class="rx-cell" data-l="Póliza">${comboHTML('poliza', `mx-poliza-${i}`, 'Póliza', poliza(r.polizaId)?.numero || '', 'Póliza')}</div>
      <div class="rx-cell" data-l="Cert.">${comboHTML('cert', `mx-cert-${i}`, 'Certificado', r.certificado, 'Cert.')}</div>
      ${pagos ? `
      <div class="rx-cell" data-l="Cheque o ref."><label class="sr" for="mx-cheque-${i}">Cheque</label><input id="mx-cheque-${i}" type="text" value="${esc(r.cheque)}" data-mxf="cheque" placeholder="N.º de cheque"></div>
      <div class="rx-cell" data-l="Monto"><label class="sr" for="mx-monto-${i}">Monto</label><input id="mx-monto-${i}" type="text" inputmode="decimal" value="${esc(r.monto)}" data-mxf="monto" placeholder="0.00"></div>`
      : `
      <div class="rx-cell" data-l="N.º de reclamo"><label class="sr" for="mx-num-${i}">Número de reclamo</label><input id="mx-num-${i}" type="text" value="${esc(r.numero)}" data-mxf="numero" placeholder="Opcional"></div>
      <div class="rx-cell mx-notes" data-l="Notas"><label class="sr" for="mx-notas-${i}">Notas</label><input id="mx-notas-${i}" type="text" value="${esc(r.notas)}" data-mxf="notas" placeholder="Qué se reclama"></div>`}
    </div>
    ${atts.length ? `<div class="mx-atts" role="group" aria-label="PDFs de esta fila">${atts.map(a => `<button type="button" class="mx-att" data-act="mx-att" data-i="${i}" data-a="${esc(a.id)}" aria-pressed="${r.docs.includes(a.id)}">${ic(r.docs.includes(a.id) ? 'check' : 'paperclip')}${esc(a.name)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function syncMx(st) {
  const i = MX?.rows.indexOf(st); if (i == null || i < 0) return;
  const row = $(`[data-mx="${i}"]`); if (!row) return;
  const p = poliza(st.polizaId);
  const set = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = v; };
  set(`mx-nombre-${i}`, st.asegurado); set(`mx-poliza-${i}`, p ? p.numero : (st.polizaTxt || '')); set(`mx-cert-${i}`, st.certificado);
  const h = $(`#mx-hint-${i}`);
  h.innerHTML = st.clienteId ? `${ic('check-circle')}${esc(shortName(clienteNombre(st.clienteId)))}${p ? ` · ${esc(p.ramo)} · ${esc(p.aseguradora)}` : ''}` : `${ic('warning')}Falta elegir de quién es`;
  h.classList.toggle('ok', !!st.clienteId);
  row.classList.toggle('bad', !st.clienteId);
}

function mxRedraw() {
  const d = drawerEl(); if (!d || !MX) return;
  const scroll = $('.drawer-b', d).scrollTop;
  d.innerHTML = variosHTML();
  $('.drawer-b', d).scrollTop = scroll;
  MX.rows.forEach(syncMx);
}

document.addEventListener('input', e => {
  const f = e.target.dataset?.mxf; if (!f || !MX) return;
  MX.rows[+e.target.closest('[data-mx]').dataset.mx][f] = e.target.value;
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act^="mx-"], [data-act="mail-varios"]'); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  if (act === 'mail-varios') return openVarios(b.dataset.id);
  if (!MX) return;
  if (act === 'mx-att') { const r = MX.rows[i], a = b.dataset.a; r.docs = r.docs.includes(a) ? r.docs.filter(x => x !== a) : [...r.docs, a]; MX.sueltos = (MX.sueltos || []).filter(x => !MX.rows.some(rr => rr.docs.includes(x))); mxRedraw(); }
  if (act === 'mx-del') { MX.rows.splice(i, 1); if (!MX.rows.length) return closeDrawer(); mxRedraw(); }
  if (act === 'mx-add') { MX.rows.push({ asegurado: '', picked: '', clienteId: '', polizaId: '', certificado: '', numero: '', notas: '', monto: '', cheque: '', docs: [], tramiteId: '' }); mxRedraw(); $(`#mx-nombre-${MX.rows.length - 1}`)?.focus(); }
  if (act === 'mx-unlink') { MX.rows[i].tramiteId = ''; mxRedraw(); }
  if (act === 'mx-go') guardarVarios(b);
});

async function guardarVarios(btn) {
  const m = MX.mail, pagos = MX.mode === 'pagos';
  const malas = MX.rows.map((r, i) => r.clienteId ? -1 : i).filter(i => i >= 0);
  if (malas.length) { toast(`Falta elegir de quién es la fila ${malas.map(i => i + 1).join(', ')}`, 'err'); $(`#mx-nombre-${malas[0]}`)?.focus(); return; }
  if (pagos && MX.rows.some(r => !(toNum(r.monto) > 0))) { toast('Escribe el monto de cada pago', 'err'); return; }
  btn.disabled = true;
  try {
    // Copiar a Drive los adjuntos elegidos, en la carpeta de cada cliente
    const docBy = {};
    const porCliente = {};
    MX.rows.forEach(r => r.docs.forEach(a => { (porCliente[r.clienteId] = porCliente[r.clienteId] || new Set()).add(a); }));
    for (const [cid, set] of Object.entries(porCliente)) {
      const ids = [...set];
      if (S.mode === 'demo') ids.forEach(a => { const x = mxAtt(a); docBy[cid + a] = { id: 'demo-' + a, name: x.name, size: x.size }; });
      else {
        toast('Guardando adjuntos en Drive…');
        const r = await api('api/gmail', { json: { id: m.id, attachments: ids, folder: clienteNombre(cid) } });
        (r.docs || []).forEach(d => { docBy[cid + d.partId] = d; });
      }
    }
    const docsDe = r => r.docs.map(a => docBy[r.clienteId + a]).filter(Boolean);
    const hechos = [];
    for (const r of MX.rows) {
      const p = poliza(r.polizaId);
      if (pagos) {
        const t = tramite(r.tramiteId);
        const pg = { id: '', tramiteId: r.tramiteId, clienteId: r.clienteId, aseguradora: MX.aseguradora || t?.aseguradora || p?.aseguradora || '', forma: r.cheque ? 'Cheque' : 'Depósito', numero: r.cheque, banco: '', monto: toNum(r.monto), fechaAviso: (m.fecha || nowISO()).slice(0, 10), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: r.cheque ? 'disponible' : 'depositado', notas: r.notas || m.subject || '' };
        if (pg.estado === 'depositado') pg.fechaEntregado = pg.fechaAviso;
        await save('pagos', pg, `${pg.forma} ${pg.numero} por ${fmtMoney(pg.monto)} (${shortName(r.asegurado || clienteNombre(r.clienteId))})`);
        await linkPagoTramite(pg, true);
        hechos.push(pg);
        continue;
      }
      const t = tramite(r.tramiteId);
      if (t) {
        const cambios = [];
        if (r.numero && !t.numeroReclamo) { t.numeroReclamo = r.numero; cambios.push(`número ${r.numero}`); }
        const nuevos = docsDe(r); if (nuevos.length) { t.docs = [...(t.docs || []), ...nuevos]; cambios.push(`${nuevos.length} PDF`); }
        if (r.notas && !t.descripcion) t.descripcion = r.notas;
        let accion;
        if (r.numero && ['recibido', 'ingresado'].includes(t.etapa)) { t.etapa = 'numero'; t.fechaIngreso = t.fechaIngreso || todayISO(); accion = 'movió'; }
        t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: accion ? 'etapa' : 'nota', texto: `Del correo "${m.subject}": ${cambios.join(', ') || 'revisado'}.` }];
        await save('tramites', t, `${t.codigo}: ${cambios.join(', ') || 'actualizado'} (correo con varios reclamos)`, accion);
        hechos.push(t);
      } else {
        const etapa = r.numero ? 'numero' : (MX.kind === 'solicitud' ? 'recibido' : 'ingresado');
        const nombre = r.asegurado || clienteNombre(r.clienteId);
        const ev = [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Recibido en el correo "${m.subject}".` }];
        if (r.numero) ev.push({ fecha: nowISO(), por: S.me.email, tipo: 'etapa', texto: `Número asignado ${r.numero}.` });
        const nt = {
          id: '', codigo: nextCodigo(), tipo: 'Reclamo', clienteId: r.clienteId, polizaId: r.polizaId, aseguradora: p?.aseguradora || MX.aseguradora || '',
          asegurado: nombre, certificado: r.certificado, asunto: `Reclamo de ${shortName(nombre)}`, descripcion: r.notas, canal: CANALES[0], etapa, numeroReclamo: r.numero,
          monto: toNum(r.monto) || '', fechaSolicitud: (m.fecha || nowISO()).slice(0, 10), fechaIngreso: etapa === 'recibido' ? '' : todayISO(),
          responsable: S.me.email, visibleCliente: true, notaCliente: '', docs: docsDe(r), eventos: ev, gmailId: m.id
        };
        await save('tramites', nt, `${nt.codigo} Reclamo · ${nombre}${nt.numeroReclamo ? ' · ' + nt.numeroReclamo : ''}`);
        hechos.push(nt);
      }
    }
    const n = hechos.length;
    await markMail(m.id, pagos ? `${n} pagos registrados` : `${n} reclamos: ${hechos.map(h => h.codigo).filter(Boolean).join(', ')}`, hechos[0]?.id || hechos[0]?.tramiteId);
    MX = null;
    closeDrawer(); render(false);
    toast(pagos ? `${n} ${n === 1 ? 'pago registrado' : 'pagos registrados'}` : `${n} ${n === 1 ? 'reclamo guardado' : 'reclamos guardados'}`);
  } catch (e) { btn.disabled = false; toast('No se terminó: ' + e.message, 'err'); }
}
