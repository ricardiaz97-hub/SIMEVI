/* ---------- Reporte de lo ingresado ----------
   Qué se ingresó (o qué recibió número) en un período, quién lo hizo y a qué hora.
   Sale como PDF, imagen, tabla para pegar en Gmail o Excel (CSV). */

const fechaLocal = iso => !iso ? '' : String(iso).length <= 10 ? String(iso) : new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const horaLocal = iso => iso && String(iso).length > 10 ? fmtTime(iso) : '';

// El momento en que el trámite pasó a una etapa (por la línea de tiempo)
function momentoEtapa(t, k) {
  const ev = t.eventos || [];
  const pat = { ingresado: /^(ingresad|entregad|enviado|presentad)/i, numero: /n[uú]mero asignado|asign[oó] el n[uú]mero|^n[uú]mero\s/i }[k];
  const e = ev.find(e => e.a === k) || ev.find(e => !e.a && e.tipo === 'etapa' && pat?.test(e.texto)) || (k === 'ingresado' ? ev.find(e => e.a === 'numero') : null);
  if (e) return { fecha: e.fecha, por: e.por, auto: !!e.auto };
  if (k === 'ingresado' && t.fechaIngreso) return { fecha: t.fechaIngreso, por: t.responsable, auto: false };
  return null;
}

function rangoReporte(f) {
  const T = todayISO();
  const lunes = addDays(T, -((new Date(T + 'T12:00:00').getDay() + 6) % 7));
  return {
    hoy: [T, T, 'hoy'], ayer: [addDays(T, -1), addDays(T, -1), 'ayer'], semana: [lunes, T, 'esta semana'],
    mes: [T.slice(0, 8) + '01', T, 'este mes'], rango: [f.desde || T, f.hasta || f.desde || T, '']
  }[f.per] || [T, T, 'hoy'];
}

function datosReporte(f) {
  const [desde, hasta] = rangoReporte(f);
  return DB.tramites.map(t => {
    const ing = momentoEtapa(t, 'ingresado'), num = momentoEtapa(t, 'numero');
    const m = f.que === 'numero' ? num : ing;
    return { t, ing, num, m };
  }).filter(({ t, m }) => {
    if (!m) return false;
    const d = fechaLocal(m.fecha);
    if (d < desde || d > hasta) return false;
    if (f.tipo === 'reclamos' && t.tipo !== 'Reclamo') return false;
    if (f.tipo === 'otros' && t.tipo === 'Reclamo') return false;
    if (f.quien && m.por !== f.quien) return false;
    return true;
  }).sort((a, b) => String(a.m.fecha).localeCompare(String(b.m.fecha)))
    .map(({ t, ing, num }, i) => {
      const cli = clienteNombre(t.clienteId);
      const col = t.asegurado && norm(t.asegurado) !== norm(cli);
      return {
        n: i + 1, id: t.id, codigo: t.codigo, tipo: t.tipo, cliente: cli, asegurado: col ? t.asegurado : '', paciente: t.paciente || '',
        aseguradora: t.aseguradora || poliza(t.polizaId)?.aseguradora || '', poliza: poliza(t.polizaId)?.numero || '', numero: t.numeroReclamo || '',
        monto: +t.monto > 0 ? +t.monto : '', recibido: t.fechaSolicitud || '', canal: t.canal || '',
        ingreso: ing ? `${fmtShort(fechaLocal(ing.fecha))}${horaLocal(ing.fecha) ? ', ' + horaLocal(ing.fecha) : ''}` : '',
        porIngreso: ing ? (firstName(userBy(ing.por)) || '') : '',
        numeroCuando: num ? `${fmtShort(fechaLocal(num.fecha))}${horaLocal(num.fecha) ? ', ' + horaLocal(num.fecha) : ''}` : '',
        etapa: t.etapa === 'rechazado' ? 'Rechazado' : ETAPA[t.etapa]?.n || ''
      };
    });
}

function tituloReporte(f, filas) {
  const [desde, hasta, nombre] = rangoReporte(f);
  const periodo = desde === hasta ? fmtDate(desde) : `${fmtDate(desde)} al ${fmtDate(hasta)}`;
  const que = f.que === 'numero' ? 'con número asignado' : 'ingresados';
  const cosa = f.tipo === 'reclamos' ? 'Reclamos' : f.tipo === 'otros' ? 'Trámites (sin reclamos)' : 'Trámites';
  const porPersona = S.users.map(u => [firstName(u), filas.filter(r => (f.que === 'numero' ? true : r.porIngreso === firstName(u))).length]).filter(([, n]) => n);
  return {
    titulo: `${cosa} ${que}`, periodo: `${nombre ? nombre[0].toUpperCase() + nombre.slice(1) + ' · ' : ''}${periodo}`,
    resumen: `${filas.length} ${filas.length === 1 ? 'trámite' : 'trámites'}${f.que !== 'numero' && porPersona.length > 1 ? ' · ' + porPersona.map(([n, c]) => `${n} ${c}`).join(' · ') : ''}${f.que !== 'numero' ? ` · ${filas.filter(r => r.numero).length} con número` : ''}${f.quien ? ' · solo ' + firstName(userBy(f.quien)) : ''}`,
    archivo: `SIMEVI ${que} ${desde}${hasta !== desde ? ' a ' + hasta : ''}`
  };
}

const COLS_REP = [
  ['n', '#'], ['codigo', 'Código'], ['quien', 'Cliente / asegurado'], ['tipo', 'Tipo'], ['aseguradora', 'Aseguradora'], ['poliza', 'Póliza'],
  ['numero', 'N.º de reclamo'], ['monto', 'Monto'], ['ingreso', 'Ingresado'], ['porIngreso', 'Por'], ['numeroCuando', 'Número recibido']
];
const celdaRep = (r, k) => k === 'quien' ? [r.cliente, r.asegurado, r.paciente ? 'Paciente: ' + r.paciente : ''].filter(Boolean).join(' › ') : k === 'monto' ? (r.monto ? fmtMoney(r.monto) : '') : String(r[k] ?? '');

/* --- hoja del reporte --- */
function openReporte(tipo) {
  S.f.rep = { per: 'hoy', que: 'ingresado', tipo: tipo || 'todos', quien: '', desde: todayISO(), hasta: todayISO(), ...(S.f.rep || {}), ...(tipo ? { tipo } : {}) };
  const d = openDrawer(reporteHTML());
  d.classList.add('wide');
}
function reporteRedraw() { const d = drawerEl(); if (!d) return; const sc = $('.drawer-b', d).scrollTop; d.innerHTML = reporteHTML(); $('.drawer-b', d).scrollTop = sc; }

function reporteHTML() {
  const f = S.f.rep, filas = datosReporte(f), h = tituloReporte(f, filas);
  const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, n]) => `<button type="button" data-act="rep-set" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${n}</button>`).join('')}</div>`;
  return `
  <div class="drawer-h"><div class="t"><span class="label">Reporte</span><h2>${esc(h.titulo)}</h2><div class="muted" style="font-size:.86rem;margin-top:4px">${esc(h.periodo)} · ${esc(h.resumen)}</div></div>
    <button class="btn ghost icon" type="button" data-act="drawer-close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="drawer-b">
    <div class="rep-ctl">
      ${seg('per', [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Fechas']])}
      ${f.per === 'rango' ? `<label class="rep-date"><span>Del</span><input type="date" data-rep="desde" value="${esc(f.desde)}"></label><label class="rep-date"><span>al</span><input type="date" data-rep="hasta" value="${esc(f.hasta)}"></label>` : ''}
    </div>
    <div class="rep-ctl">
      ${seg('que', [['ingresado', 'Ingresados'], ['numero', 'Con número asignado']])}
      ${seg('tipo', [['todos', 'Todo'], ['reclamos', 'Reclamos'], ['otros', 'Otros trámites']])}
      <select data-rep="quien" aria-label="Persona"><option value="">Los dos</option>${S.users.map(u => `<option value="${esc(u.email)}" ${f.quien === u.email ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>
    </div>
    ${filas.length ? `<div class="panel rep-prev"><div class="table-wrap"><table class="resp"><thead><tr>${COLS_REP.map(([k, n]) => `<th class="${k === 'monto' ? 'r' : ''}">${n}</th>`).join('')}</tr></thead><tbody>
      ${filas.map(r => `<tr data-act="open-tramite" data-id="${r.id}">${COLS_REP.map(([k, n]) => `<td data-l="${n}" class="${k === 'monto' ? 'r tnum' : k === 'n' ? 'faint tnum' : ['ingreso', 'numeroCuando', 'numero', 'poliza'].includes(k) ? 'tnum' : ''}">${k === 'codigo' ? `<span class="tk-code">${esc(r.codigo)}</span>` : k === 'porIngreso' && r.porIngreso ? `${av(DB.tramites.find(t => t.id === r.id) && momentoEtapa(tramite(r.id), 'ingresado')?.por, 'sm')} ${esc(r.porIngreso)}` : esc(celdaRep(r, k))}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>`
    : `<div class="panel panel-b">${emptyState('clipboard-text', 'Nada en este período', f.que === 'numero' ? 'Ningún trámite recibió número en estas fechas.' : 'No se ingresó ningún trámite en estas fechas.')}</div>`}
    <p class="faint" style="font-size:.8rem;margin:12px 0 0">La hora sale de la línea de tiempo de cada trámite: cuándo se marcó <b>Ingresado</b> y cuándo llegó el número. Si fue automático (por un correo de la aseguradora), cuenta la hora en que la app lo registró.</p>
  </div>
  <div class="drawer-f rep-f">
    <button class="btn" type="button" data-act="rep-csv" ${filas.length ? '' : 'disabled'}>${ic('download-simple')}Excel</button>
    <button class="btn" type="button" data-act="rep-img" ${filas.length ? '' : 'disabled'}>${ic('file')}Imagen</button>
    <button class="btn" type="button" data-act="rep-pdf" ${filas.length ? '' : 'disabled'}>${ic('file-pdf')}PDF</button>
    <span class="spacer"></span>
    <button class="btn primary" type="button" data-act="rep-gmail" ${filas.length ? '' : 'disabled'}>${ic('envelope-simple')}Enviar por Gmail</button>
  </div>`;
}

/* --- salidas --- */
function tablaHTMLRep(f, filas) {
  const h = tituloReporte(f, filas);
  const th = 'padding:7px 9px;border-bottom:2px solid #C9A063;text-align:left;font:600 11px Arial,sans-serif;color:#0B1A2B;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap';
  const td = 'padding:7px 9px;border-bottom:1px solid #E4DED2;font:13px Arial,sans-serif;color:#1C2633;vertical-align:top';
  return `<div style="font-family:Arial,sans-serif;color:#1C2633">
  <div style="font:700 18px Arial,sans-serif;color:#0B1A2B;margin:0 0 2px">${esc(h.titulo)}</div>
  <div style="font:13px Arial,sans-serif;color:#5A6472;margin:0 0 12px">${esc(h.periodo)} · ${esc(h.resumen)}</div>
  <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%"><thead><tr>${COLS_REP.map(([k, n]) => `<th style="${th}${k === 'monto' ? ';text-align:right' : ''}">${n}</th>`).join('')}</tr></thead>
  <tbody>${filas.map((r, i) => `<tr style="background:${i % 2 ? '#FAF7F1' : '#FFFFFF'}">${COLS_REP.map(([k]) => `<td style="${td}${k === 'monto' ? ';text-align:right;white-space:nowrap' : k === 'codigo' || k === 'ingreso' || k === 'numeroCuando' ? ';white-space:nowrap' : ''}${k === 'codigo' ? ';font-weight:700;color:#9C7440' : ''}">${esc(celdaRep(r, k))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <div style="font:11px Arial,sans-serif;color:#8A93A0;margin-top:10px">SIMEVI Corredores de Seguros · generado por ${esc(S.me.nombre)} el ${esc(fmtDate(todayISO()))}, ${esc(fmtTime(nowISO()))}</div></div>`;
}

function textoPlanoRep(f, filas) {
  const h = tituloReporte(f, filas);
  return [`${h.titulo} · ${h.periodo}`, h.resumen, '', ...filas.map(r => `${r.n}. ${r.codigo} · ${celdaRep(r, 'quien')} · ${r.tipo} · ${r.aseguradora}${r.numero ? ' · N.º ' + r.numero : ''}${r.monto ? ' · ' + fmtMoney(r.monto) : ''} · ingresado ${r.ingreso}${r.porIngreso ? ' por ' + r.porIngreso : ''}`)].join('\n');
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function repCSV() {
  const f = S.f.rep, filas = datosReporte(f), h = tituloReporte(f, filas);
  const cols = [['codigo', 'Código'], ['tipo', 'Tipo'], ['cliente', 'Cliente'], ['asegurado', 'Asegurado'], ['paciente', 'Paciente'], ['aseguradora', 'Aseguradora'], ['poliza', 'Póliza'], ['numero', 'N.º de reclamo'], ['monto', 'Monto'], ['recibido', 'Recibido'], ['ingreso', 'Ingresado'], ['porIngreso', 'Ingresó'], ['canal', 'Cómo'], ['numeroCuando', 'Número recibido'], ['etapa', 'Etapa actual']];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(c => q(c[1])).join(','), ...filas.map(r => cols.map(([k]) => q(r[k])).join(','))].join('\r\n');
  descargar(new Blob(['﻿' + csv], { type: 'text/csv' }), h.archivo + '.csv');
}

function repPDF() {
  const f = S.f.rep, filas = datosReporte(f), h = tituloReporte(f, filas);
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(fr);
  const doc = fr.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(h.archivo)}</title><style>@page{size:letter landscape;margin:12mm}body{margin:0}tr{page-break-inside:avoid}</style></head><body>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #E4DED2"><div style="font:700 15px Arial;letter-spacing:.3em;color:#0B1A2B">SIMEVI<div style="font:500 9px Arial;letter-spacing:.2em;color:#9C7440">CORREDORES DE SEGUROS</div></div><div style="font:12px Arial;color:#5A6472">${esc(fmtDate(todayISO()))}</div></div>
    ${tablaHTMLRep(f, filas)}</body></html>`);
  doc.close();
  setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Este navegador no deja imprimir aquí. Usa “Imagen” o “Excel”.', 'err'); } setTimeout(() => fr.remove(), 60e3); }, 250);
  toast('Elige “Guardar como PDF” en la ventana de impresión');
}

// Dibuja la tabla en un canvas (sin librerías) y la devuelve como PNG
async function repPNG() {
  const f = S.f.rep, filas = datosReporte(f), h = tituloReporte(f, filas);
  try { await document.fonts?.ready; } catch (e) { }
  const W = 1500, pad = 36, rowH = 40, headH = 132, thH = 36;
  const widths = { n: 34, codigo: 118, quien: 300, tipo: 104, aseguradora: 140, poliza: 128, numero: 156, monto: 92, ingreso: 128, porIngreso: 78, numeroCuando: 126 };
  const H = headH + thH + filas.length * rowH + 64;
  const sc = 2, cv = document.createElement('canvas');
  cv.width = W * sc; cv.height = H * sc;
  const g = cv.getContext('2d'); g.scale(sc, sc);
  const F = (w, s) => `${w} ${s}px Archivo, Arial, sans-serif`;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0B1A2B'; g.fillRect(0, 0, W, 8);
  g.fillStyle = '#C9A063'; g.fillRect(0, 8, W, 3);
  g.fillStyle = '#0B1A2B'; g.font = F(700, 15); g.fillText('S I M E V I', pad, 44);
  g.fillStyle = '#9C7440'; g.font = F(600, 9); g.fillText('CORREDORES DE SEGUROS', pad, 58);
  g.fillStyle = '#0B1A2B'; g.font = F(700, 24); g.fillText(h.titulo, pad, 96);
  g.fillStyle = '#5A6472'; g.font = F(400, 14); g.fillText(`${h.periodo} · ${h.resumen}`, pad, 118);
  const cut = (s, w) => { s = String(s); if (g.measureText(s).width <= w) return s; while (s && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  let x, y = headH;
  g.strokeStyle = '#C9A063'; g.lineWidth = 2; g.beginPath(); g.moveTo(pad, y + thH); g.lineTo(W - pad, y + thH); g.stroke();
  g.font = F(600, 11); g.fillStyle = '#0B1A2B'; x = pad;
  for (const [k, n] of COLS_REP) { const w = widths[k]; const s = n.toUpperCase(); g.textAlign = k === 'monto' ? 'right' : 'left'; g.fillText(cut(s, w - 12), k === 'monto' ? x + w - 8 : x + 6, y + 23); x += w; }
  y += thH;
  filas.forEach((r, i) => {
    if (i % 2) { g.fillStyle = '#FAF7F1'; g.fillRect(pad, y, W - pad * 2, rowH); }
    g.strokeStyle = '#E4DED2'; g.lineWidth = 1; g.beginPath(); g.moveTo(pad, y + rowH); g.lineTo(W - pad, y + rowH); g.stroke();
    x = pad;
    for (const [k] of COLS_REP) {
      const w = widths[k];
      g.font = F(k === 'codigo' ? 700 : 400, 13); g.fillStyle = k === 'codigo' ? '#9C7440' : k === 'n' ? '#8A93A0' : '#1C2633';
      g.textAlign = k === 'monto' ? 'right' : 'left';
      g.fillText(cut(celdaRep(r, k), w - 12), k === 'monto' ? x + w - 8 : x + 6, y + 25);
      x += w;
    }
    y += rowH;
  });
  g.textAlign = 'left'; g.font = F(400, 11); g.fillStyle = '#8A93A0';
  g.fillText(`Generado por ${S.me.nombre} el ${fmtDate(todayISO())}, ${fmtTime(nowISO())}`, pad, y + 34);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  return { blob, nombre: h.archivo + '.png' };
}

async function repImagen() {
  const { blob, nombre } = await repPNG();
  const file = new File([blob], nombre, { type: 'image/png' });
  // En el teléfono se comparte directo (WhatsApp, Gmail…); en la computadora se descarga
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({ files: [file], title: nombre }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
  toast('Imagen descargada');
}

async function repGmail() {
  const f = S.f.rep, filas = datosReporte(f), h = tituloReporte(f, filas);
  const html = tablaHTMLRep(f, filas), plano = textoPlanoRep(f, filas);
  let copiado = false;
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plano], { type: 'text/plain' }) })]);
      copiado = true;
    }
  } catch (e) { }
  const asunto = `${h.titulo} · ${h.periodo}`;
  const cuerpo = copiado ? `Buen día,\n\nLe comparto lo ${f.que === 'numero' ? 'que recibió número' : 'ingresado'} (${h.periodo.toLowerCase()}):\n\n` : plano;
  const url = `https://mail.google.com/mail/?view=cm&fs=1&authuser=${encodeURIComponent(S.me.email)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo.slice(0, 1800))}`;
  window.open(url, '_blank', 'noopener');
  if (copiado) toast('Tabla copiada: en el correo pulsa Ctrl+V (o mantén presionado y Pegar)', '', { label: 'Imagen', run: repImagen });
  else toast('Se abrió Gmail con el reporte en texto. Para la tabla con formato, usa “Imagen” o “PDF”.');
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act^="rep-"]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'rep-open') return openReporte(b.dataset.v);
  if (!S.f.rep) return;
  if (act === 'rep-set') { S.f.rep[b.dataset.k] = b.dataset.v; saveFilters(); reporteRedraw(); }
  if (act === 'rep-csv') repCSV();
  if (act === 'rep-pdf') repPDF();
  if (act === 'rep-img') repImagen();
  if (act === 'rep-gmail') repGmail();
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.rep; if (!k || !S.f.rep) return;
  S.f.rep[k] = e.target.value;
  if (k === 'desde' && S.f.rep.hasta < S.f.rep.desde) S.f.rep.hasta = S.f.rep.desde;
  saveFilters(); reporteRedraw();
});
