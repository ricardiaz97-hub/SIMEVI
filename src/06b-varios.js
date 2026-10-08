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

/* ---------- la hoja para revisar ----------
   MX.rows son filas de reclamo (mismas casillas que la pestaña Reclamos).
   MX.pool son los archivos disponibles: adjuntos del correo o PDF ya subidos a Drive. */
let MX = null;

function openVarios(mailId) {
  const m = (S.inbox || []).find(x => x.id === mailId); if (!m) return;
  const x = extraer(m);
  let rows = x.rows.map(r => filaNueva({ ...r, clienteTxt: r.clienteId ? clienteNombre(r.clienteId) : '', polizaTxt: '' }));
  if (rows.length === 1 && (m.attachments || []).length >= 2 && x.mode === 'reclamos')
    rows = m.attachments.map(a => filaNueva({ ...structuredClone(rows[0]), docs: [a.id], notas: a.name.replace(/\.[a-z0-9]+$/i, '') }));
  openVariosDesde({ mail: m, mode: x.mode, kind: x.kind, aseguradora: x.aseguradora, rows, pool: m.attachments || [], sueltos: x.sueltos });
}

/* Lee los PDF adjuntos de un correo y arma una fila por cada formulario de reclamo */
async function leerPdfsCorreo(mailId) {
  const m = (S.inbox || []).find(x => x.id === mailId); if (!m) return;
  const pdfs = (m.attachments || []).filter(a => /pdf|image/i.test(a.mime || '') || /\.(pdf|jpe?g|png)$/i.test(a.name));
  if (!pdfs.length) return toast('Este correo no trae PDF', 'err');
  let textos;
  if (S.mode === 'demo') textos = pdfs.map(a => ({ ref: a.id, name: a.name, texto: a.ocr || '' }));
  else {
    toast(`Leyendo ${pdfs.length} ${pdfs.length === 1 ? 'PDF' : 'PDFs'}…`);
    try { textos = (await api('api/leer', { json: { mail: { id: m.id, cuenta: m.cuenta, partIds: pdfs.map(a => a.id) } } })).textos || []; }
    catch (e) { return toast('No se pudo leer: ' + e.message, 'err'); }
  }
  const forms = textos.flatMap(t => leerFormularios(t.texto).map(f => ({ f, ref: t.ref })));
  const malos = textos.filter(t => t.error);
  if (!forms.length) { toast(malos.length ? `No se pudo leer: ${malos[0].error}` : 'No encontré formularios de reclamo en los PDF. Usa “Crear trámite”.', 'err'); return; }
  const aseg = aseguradoraDeCorreo(m.from);
  openVariosDesde({
    mail: m, mode: 'reclamos', kind: 'solicitud', aseguradora: aseg,
    titulo: `${forms.length} ${forms.length === 1 ? 'reclamo leído' : 'reclamos leídos'} del PDF`,
    rows: forms.map(x => filaDeFormulario(x.f, x.ref)), pool: m.attachments || []
  });
}

function openVariosDesde(o) {
  MX = { mail: null, mode: 'reclamos', kind: 'solicitud', aseguradora: '', titulo: '', sub: '', pool: [], sueltos: [], ...o };
  const d = openDrawer(variosHTML());
  d.classList.add('wide');
  MX.rows.forEach(syncRow);
}

const mxAtt = id => MX.pool.find(a => a.id === id);
function variosHTML() {
  const pagos = MX.mode === 'pagos';
  const n = MX.rows.length;
  const m = MX.mail;
  const titulo = MX.titulo || `${n} ${pagos ? (n === 1 ? 'pago' : 'pagos') : (n === 1 ? 'reclamo' : 'reclamos')} en este correo`;
  return `
  <div class="drawer-h"><div class="t"><span class="label">${m ? `${esc(m.fromName || m.from)} · ${fmtAgo(m.fecha)}` : 'Desde PDF'}</span><h2>${esc(titulo)}</h2>
    <div class="muted" style="font-size:.86rem;margin-top:4px">${esc(m ? m.subject || '' : MX.sub)}</div></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b">
    <p class="muted" style="margin:0 0 14px;font-size:.86rem">Revisa cada fila. Cliente, póliza, asegurado y certificado buscan mientras escribes. ${pagos ? 'Cada fila será un pago ligado a su reclamo.' : 'Lo marcado como <b>Se creará</b> se agrega solo al guardar; las filas que dicen <b>Actualiza</b> completan un reclamo que ya existe.'}</p>
    ${m ? `<details class="mx-mail"><summary>Ver el correo</summary><p>${esc(m.body || m.snippet || '').replace(/\n/g, '<br>')}</p></details>` : ''}
    <div class="mx-rows">${MX.rows.map((r, i) => mxRowHTML(r, i)).join('')}</div>
    <button class="btn sm" type="button" data-act="mx-add" style="margin-top:10px">${ic('plus')}Agregar fila</button>
  </div>
  <div class="drawer-f"><span class="muted" style="font-size:.8rem">${MX.sueltos?.length ? `${MX.sueltos.length} adjunto${MX.sueltos.length > 1 ? 's' : ''} sin asignar` : ''}</span><span class="spacer"></span>
    <button class="btn primary" type="button" data-act="mx-go">${ic('check')}${pagos ? `Registrar ${n} ${n === 1 ? 'pago' : 'pagos'}` : `Guardar ${n} ${n === 1 ? 'reclamo' : 'reclamos'}`}</button></div>`;
}

function mxRowHTML(r, i) {
  const pagos = MX.mode === 'pagos';
  const t = tramite(r.tramiteId);
  const c = campos(r, `mx${i}`);
  return `<section class="mx-row card" data-row="mx" data-mx="${i}">
    <div class="mx-top"><span class="mx-n">${i + 1}</span>
      ${t ? `<span class="pill gold">Actualiza ${esc(t.codigo)}</span><button class="btn ghost sm" type="button" data-act="mx-unlink" data-i="${i}">Hacer nuevo</button>` : `<span class="pill info">${pagos ? 'Pago nuevo' : 'Reclamo nuevo'}</span>`}
      <span class="row-hint"></span>
      <button class="btn ghost icon sm" type="button" data-act="mx-del" data-i="${i}" aria-label="Quitar fila ${i + 1}">${ic('x')}</button></div>
    <div class="rx-l1">${c.cliente}${c.poliza}${c.asegurado}${c.cert}${pagos ? '' : c.paciente + c.parentesco}</div>
    <div class="rx-l2 mx-l2">${c.monto}${pagos ? c.cheque : c.numero}${c.notas}</div>
    ${MX.pool.length ? `<div class="mx-atts" role="group" aria-label="PDFs de esta fila">${MX.pool.map(a => `<button type="button" class="mx-att" data-act="mx-att" data-i="${i}" data-a="${esc(a.id)}" aria-pressed="${r.docs.includes(a.id)}">${ic(r.docs.includes(a.id) ? 'check' : 'paperclip')}${esc(a.name)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function mxRedraw() {
  const d = drawerEl(); if (!d || !MX) return;
  const scroll = $('.drawer-b', d).scrollTop;
  d.innerHTML = variosHTML();
  $('.drawer-b', d).scrollTop = scroll;
  MX.rows.forEach(syncRow);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act^="mx-"], [data-act="mail-varios"], [data-act="mail-leer"]'); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  if (act === 'mail-varios') return openVarios(b.dataset.id);
  if (act === 'mail-leer') return leerPdfsCorreo(b.dataset.id);
  if (!MX) return;
  if (act === 'mx-att') { const r = MX.rows[i], a = b.dataset.a; r.docs = r.docs.includes(a) ? r.docs.filter(x => x !== a) : [...r.docs, a]; MX.sueltos = (MX.sueltos || []).filter(x => !MX.rows.some(rr => rr.docs.includes(x))); mxRedraw(); }
  if (act === 'mx-del') { MX.rows.splice(i, 1); if (!MX.rows.length) return closeDrawer(); mxRedraw(); }
  if (act === 'mx-add') { const last = MX.rows[MX.rows.length - 1]; MX.rows.push(filaNueva(last ? { clienteId: last.clienteId, clienteTxt: last.clienteTxt, polizaId: last.polizaId, polizaTxt: last.polizaTxt } : {})); mxRedraw(); $(`#mx${MX.rows.length - 1}-asegurado`)?.focus(); }
  if (act === 'mx-unlink') { MX.rows[i].tramiteId = ''; mxRedraw(); }
  if (act === 'mx-go') guardarVarios(b);
});

async function guardarVarios(btn) {
  const m = MX.mail, pagos = MX.mode === 'pagos';
  const malas = MX.rows.map((r, i) => r.clienteId || limpiar(r.clienteTxt) ? -1 : i).filter(i => i >= 0);
  if (malas.length) { toast(`Falta el cliente en la fila ${malas.map(i => i + 1).join(', ')}`, 'err'); $(`#mx${malas[0]}-cliente`)?.focus(); return; }
  if (pagos && MX.rows.some(r => !(toNum(r.monto) > 0))) { toast('Escribe el monto de cada pago', 'err'); return; }
  btn.disabled = true;
  try {
    // 1. Crear lo que falte (clientes, pólizas, asegurados)
    for (const r of MX.rows) await asegurarEntidades(r, MX.aseguradora);
    // 2. Los PDF: si ya están en Drive se usan; si vienen del correo se copian a la carpeta del cliente
    const docBy = {};
    const porCliente = {};
    MX.rows.forEach(r => r.docs.forEach(a => { const x = mxAtt(a); if (x?.doc) docBy[r.clienteId + a] = x.doc; else (porCliente[r.clienteId] = porCliente[r.clienteId] || new Set()).add(a); }));
    for (const [cid, set] of Object.entries(porCliente)) {
      const ids = [...set];
      if (S.mode === 'demo' || !m) ids.forEach(a => { const x = mxAtt(a); if (x) docBy[cid + a] = { id: 'demo-' + a, name: x.name, size: x.size }; });
      else {
        toast('Guardando adjuntos en Drive…');
        const r = await api('api/gmail', { json: { id: m.id, cuenta: m.cuenta, attachments: ids, folder: clienteNombre(cid) } });
        (r.docs || []).forEach(d => { docBy[cid + d.partId] = d; });
      }
    }
    const docsDe = r => r.docs.map(a => docBy[r.clienteId + a]).filter(Boolean);
    const fecha = (m?.fecha || nowISO()).slice(0, 10);
    const hechos = [];
    for (const r of MX.rows) {
      const p = poliza(r.polizaId);
      if (pagos) {
        const t = tramite(r.tramiteId);
        const pg = { id: '', tramiteId: r.tramiteId, clienteId: r.clienteId, aseguradora: MX.aseguradora || t?.aseguradora || p?.aseguradora || '', forma: r.cheque ? 'Cheque' : 'Depósito', numero: r.cheque, banco: '', monto: toNum(r.monto), fechaAviso: fecha, fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: r.cheque ? 'disponible' : 'depositado', notas: r.notas || m?.subject || '' };
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
        if (r.monto && !t.monto) t.monto = toNum(r.monto);
        if (r.paciente && !t.paciente) { t.paciente = r.paciente; t.parentesco = r.parentesco; }
        let accion;
        if (r.numero && ['recibido', 'ingresado'].includes(t.etapa)) { t.etapa = 'numero'; t.fechaIngreso = t.fechaIngreso || todayISO(); accion = 'movió'; }
        t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: accion ? 'etapa' : 'nota', texto: `${m ? `Del correo "${m.subject}"` : 'Del PDF'}: ${cambios.join(', ') || 'revisado'}.` }];
        await save('tramites', t, `${t.codigo}: ${cambios.join(', ') || 'actualizado'}`, accion);
        hechos.push(t);
      } else {
        const etapa = r.numero ? 'numero' : (MX.kind === 'solicitud' ? 'recibido' : 'ingresado');
        const nt = nuevoReclamo(r, { etapa, fecha: r.fecha || fecha, gmailId: m?.id || '', docs: docsDe(r), aseguradora: MX.aseguradora, origen: m ? `Recibido en el correo "${m.subject}".` : 'Leído del PDF.' });
        await save('tramites', nt, `${nt.codigo} Reclamo · ${shortName(clienteNombre(nt.clienteId))}${nt.asegurado !== clienteNombre(nt.clienteId) ? ' › ' + nt.asegurado : ''}${nt.numeroReclamo ? ' · ' + nt.numeroReclamo : ''}`);
        hechos.push(nt);
      }
    }
    const n = hechos.length;
    if (m) await markMail(m.id, pagos ? `${n} pagos registrados` : `${n} reclamos: ${hechos.map(h => h.codigo).filter(Boolean).join(', ')}`, hechos[0]?.id || hechos[0]?.tramiteId);
    MX = null;
    closeDrawer(); render(false);
    toast(pagos ? `${n} ${n === 1 ? 'pago registrado' : 'pagos registrados'}` : `${n} ${n === 1 ? 'reclamo guardado' : 'reclamos guardados'}`);
  } catch (e) { btn.disabled = false; toast('No se terminó: ' + e.message, 'err'); render(false); }
}
