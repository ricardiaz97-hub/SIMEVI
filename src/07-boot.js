/* ---------- eventos (delegados) ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'A' && act !== 'open-ref') return; // los enlaces navegan solos
  if (act !== 'open-ref' || el.tagName === 'A') e.preventDefault();
  switch (act) {
    case 'go': if (el.dataset.f === 'por-vencer') { S.f.polEst = 'por-vencer'; saveFilters(); } go(el.dataset.r); break;
    case 'more': {
      if ($('.more-sheet')) { $('.more-sheet').remove(); break; }
      const m = document.createElement('div'); m.className = 'more-sheet';
      m.innerHTML = ROUTES.filter(r => r.desk).map(r => `<a class="nav" href="#/${r.k}">${ic(r.i)}<span>${r.n}</span></a>`).join('');
      document.body.appendChild(m);
      setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !ev.target.closest('[data-act=more]')) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true));
      break;
    }
    case 'search-m': { const q = await ask('Buscar cliente, póliza, número de reclamo o cheque', { value: S.q, ok: 'Buscar' }); if (q !== null) { S.q = q; go('buscar'); render(false); } break; }
    case 'drawer-close': closeDrawer(); break;
    case 'filter': S.f[el.dataset.k] = el.dataset.v; saveFilters(); render(false); break;
    case 'open-tramite': openTramite(id); break;
    case 'open-pago': openPago(id); break;
    case 'open-poliza': openPoliza(id); break;
    case 'open-cliente': openCliente(id); break;
    case 'open-ref': {
      const t = el.dataset.t;
      if (!byId(t, id)) { toast('Ese registro ya no existe', 'err'); break; }
      ({ tramites: openTramite, pagos: openPago, polizas: openPoliza, clientes: openCliente }[t] || (() => { }))(id); break;
    }
    case 'new-tramite': openTramite(null); break;
    case 'new-pago': openPago(null); break;
    case 'new-poliza': openPoliza(null); break;
    case 'new-cliente': openCliente(null); break;
    case 'tramite-save': saveTramite(); break;
    case 'tramite-advance': saveTramite(el.dataset.to); break;
    case 'tramite-more': tramiteMoreMenu(el); break;
    case 'pago-from-tramite': { const t = readTramiteForm(); if (!t?.id || !tramite(t.id)) { toast('Guarda primero el trámite', 'err'); break; } newPagoFromTramite(t); break; }
    case 'add-note': {
      const inpN = $('#note'); const txt = inpN.value.trim(); if (!txt) { inpN.focus(); break; }
      const t = readTramiteForm();
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'nota', texto: txt }];
      try { await save('tramites', t, `${t.codigo} nota: ${txt.slice(0, 80)}`); } catch (err) { break; }
      const d = drawerEl(); d.innerHTML = tramiteHTML(t, false); wireTramite(d); render(false);
      $('#note', d)?.focus();
      break;
    }
    case 'pago-save': savePago(el.dataset.to); break;
    case 'pago-del': {
      const p = cur.row; if (!await ask('¿Eliminar este pago? Queda anotado en la bitácora.', { danger: true, ok: 'Eliminar' })) break;
      await remove('pagos', p.id, `${p.forma} ${p.numero || ''} por ${fmtMoney(p.monto)}`); closeDrawer(); render(false); toast('Pago eliminado'); break;
    }
    case 'export-pagos': exportPagos(); break;
    case 'poliza-save': savePoliza(); break;
    case 'poliza-del': {
      const p = cur.row; if (DB.tramites.some(t => t.polizaId === p.id) && !await ask('Esta póliza tiene trámites. ¿Eliminarla igual?')) break;
      if (!await ask(`¿Eliminar la póliza ${p.numero}?`, { danger: true, ok: 'Eliminar' })) break;
      await remove('polizas', p.id, `${p.numero} ${p.ramo}`); closeDrawer(); render(false); toast('Póliza eliminada'); break;
    }
    case 'pol-mod': {
      const v = el.dataset.v, d = drawerEl();
      $('[name=modalidad]', d).value = v;
      $$('[data-act=pol-mod]', d).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
      $('#ins-sec', d).hidden = v !== 'Colectiva';
      $('[name=clienteId]', d).closest('.field').querySelector('span').textContent = v === 'Colectiva' ? 'Contratante' : 'Cliente';
      break;
    }
    case 'ins-add': {
      const tb = $('#ins-body'); const tmp = document.createElement('tbody'); tmp.innerHTML = insRows([{ nombre: '', documento: '', certificado: String(tb.children.length + 1).padStart(3, '0'), plan: '' }]);
      const tr = tmp.firstElementChild; tb.appendChild(tr); $('input', tr).focus(); break;
    }
    case 'ins-del': el.closest('tr').remove(); break;
    case 'tramite-from-poliza': { const p = cur.row; closeDrawer(true); openTramite(null, { clienteId: p.clienteId, polizaId: p.id, aseguradora: p.aseguradora, tipo: diasPoliza(p) !== null && diasPoliza(p) <= 45 ? 'Renovación' : 'Reclamo' }); break; }
    case 'tramite-from-cliente': { const c = cur.row; closeDrawer(true); openTramite(null, { clienteId: c.id }); break; }
    case 'poliza-from-cliente': { const c = cur.row; closeDrawer(true); openPoliza(null, { clienteId: c.id, modalidad: c.tipo === 'Empresa' ? 'Colectiva' : 'Individual' }); break; }
    case 'cliente-save': saveCliente(); break;
    case 'cliente-del': {
      const c = cur.row;
      if (DB.polizas.some(p => p.clienteId === c.id) || DB.tramites.some(t => t.clienteId === c.id)) { toast('Tiene pólizas o trámites. Elimínalos primero.', 'err'); break; }
      if (!await ask(`¿Eliminar a ${c.nombre}?`, { danger: true, ok: 'Eliminar' })) break;
      await remove('clientes', c.id, c.nombre); closeDrawer(); render(false); toast('Cliente eliminado'); break;
    }
    case 'portal-copy': copyPortal(id); break;
    case 'portal-reset': {
      const c = cliente(cur.row.id); if (!c || !await ask('El enlace anterior dejará de funcionar. ¿Continuar?')) break;
      c.portal = token(); await save('clientes', c, `${c.nombre}: enlace del portal cambiado`); closeDrawer(true); openCliente(c.id); toast('Enlace nuevo creado'); break;
    }
    case 'portal-back': go('clientes'); break;
    case 'rx-clear': RX = RX_BLANK(); rxKeep(); render(false); $('#rx-nombre')?.focus(); break;
    case 'rx-new-cliente': {
      const name = $('#rx-nombre').value.trim(); cbClose($('#rx-nombre').closest('.cb'));
      openCliente(null, { nombre: name });
      cur.afterSave = c => { pick('nombre', { kind: 'cli', label: c.nombre, clienteId: c.id }); render(false); toast('Cliente creado. Ahora agrega su póliza si no está.'); $('#rx-poliza')?.focus(); };
      break;
    }
    case 'doc-del': {
      const i = +el.dataset.i; const doc = cur.row.docs[i];
      if (!await ask(`¿Quitar ${doc.name} de este registro? El archivo sigue en Drive.`, { ok: 'Quitar' })) break;
      cur.row.docs.splice(i, 1); el.closest('.doc').remove();
      $$('[data-act=doc-del]', drawerEl()).forEach((b, j) => b.dataset.i = j);
      toast('Quitado. Pulsa Guardar para confirmar.');
      break;
    }
    case 'mail-tramite': case 'mail-numero': case 'mail-pago': case 'mail-skip': mailAction(act, id); break;
    case 'inbox-refresh': S.inbox = S.mode === 'demo' ? S.inbox : null; loadInbox(true); if (S.mode === 'demo') toast('Bandeja al día'); break;
    case 'switch-user': {
      if (S.mode === 'demo') { S.me = S.users.find(u => u.email !== S.me.email); persistDemo(); render(false); toast(`Ahora estás como ${S.me.nombre}`); }
      else if (await ask('¿Cerrar sesión?')) { await fetch('api/logout', { method: 'POST' }); location.reload(); }
      break;
    }
    case 'set-user': S.me = S.users.find(u => u.email === el.dataset.v); persistDemo(); render(false); break;
    case 'gmail-off': {
      const c = el.dataset.v;
      if (!await ask(`¿Dejar de leer ${c} en la Bandeja?`, { ok: 'Quitar' })) break;
      try { await api('api/google/disconnect', { json: { cuenta: c } }); S.sess.google.gmails = S.sess.google.gmails.filter(g => g.cuenta !== c); S.inbox = null; render(false); toast('Gmail quitado'); } catch (err) { toast(err.message, 'err'); }
      break;
    }
    case 'logout': await fetch('api/logout', { method: 'POST' }); location.reload(); break;
    case 'bandeja-todos': S.f.bandejaTodos = !!el.dataset.v; saveFilters(); if (S.mode === 'live') { S.inbox = null; loadInbox(true); } else render(false); break;
    case 'remitentes-save': {
      const valor = $('#remitentes').value.split(/[\s,;]+/).map(x => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean).join(', ');
      if (!valor) { toast('Escribe al menos un dominio o correo', 'err'); break; }
      const cli = $('#remit-cli').checked ? 'si' : 'no';
      try {
        await save('ajustes', { ...(DB.ajustes.find(a => a.id === 'remitentes') || {}), id: 'remitentes', valor }, `Remitentes de la Bandeja: ${valor}`);
        if (cli !== ajuste('remitentes-clientes', 'si')) await save('ajustes', { ...(DB.ajustes.find(a => a.id === 'remitentes-clientes') || {}), id: 'remitentes-clientes', valor: cli }, cli === 'si' ? 'La Bandeja incluye correos de clientes' : 'La Bandeja ya no incluye correos de clientes');
      } catch (err) { break; }
      if (S.mode === 'live') S.inbox = null;
      render(false); toast('Remitentes guardados');
      break;
    }
    case 'gmailq-save': S.f.gmailQ = $('#gmailq').value.trim(); saveFilters(); S.inbox = null; toast('Búsqueda de Gmail guardada'); break;
    case 'export-all': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportado: nowISO(), por: S.me.email, ...DB }, null, 2)], { type: 'application/json' }));
      a.download = `SIMEVI copia ${todayISO()}.json`; a.click(); break;
    }
    case 'demo-reset': if (await ask('¿Borrar los cambios de la demo y volver a los datos de ejemplo?')) { bootDemoData(true); render(false); toast('Datos de ejemplo restaurados'); } break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.filter) { S.f[el.dataset.filter] = el.value; saveFilters(); render(false); }
  if (el.dataset.filterCheck) { S.f[el.dataset.filterCheck] = el.checked; saveFilters(); render(false); }
  if (el.dataset.actChange === 'lite') { document.documentElement.classList.toggle('lite', el.checked); try { localStorage.setItem('simevi-lite', el.checked ? '1' : '0'); } catch (err) { } }
  if (el.dataset.upload) handleFiles(el.files, el.dataset.upload);
});

let searchT;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'gsearch' || el.dataset.bind === 'q') {
    S.q = el.value;
    clearTimeout(searchT);
    searchT = setTimeout(() => {
      if (el.id === 'gsearch' && !['tramites', 'pagos', 'polizas', 'clientes', 'buscar'].includes(S.route)) { if (S.q) go('buscar'); }
      else render(false);
    }, 140);
  }
});

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if ($('.popmenu')) $('.popmenu').remove(); else if (drawerEl()) closeDrawer(); }
  else if (e.key === '/' && !typing && !drawerEl()) { e.preventDefault(); ($('.toolbar input[type=search]') || $('#gsearch'))?.focus(); }
  else if (e.key === 'Enter' && e.target.id === 'note') { e.preventDefault(); $('[data-act=add-note]')?.click(); }
});

/* Arrastrar y soltar archivos */
document.addEventListener('dragover', e => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest?.('[data-drop]'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.remove('over'); handleFiles(e.dataTransfer.files, z.dataset.drop); } });

async function handleFiles(files, ctx) {
  if (!files?.length || !cur) return;
  const row = cur.row;
  const carpeta = clienteNombre(row.clienteId) || 'General';
  row.docs = row.docs || [];
  for (const f of files) {
    try {
      toast(`Subiendo ${f.name}…`);
      const d = await uploadFile(f, carpeta);
      row.docs.push({ id: d.id, name: d.name || f.name, size: d.size || f.size, url: d.url || '' });
    } catch (err) { toast(err.message, 'err'); }
  }
  const box = $(`[data-docs="${ctx}"]`, drawerEl());
  if (box) box.outerHTML = docsBlock(row.docs, ctx);
  if (!cur.isNew) {
    try { await save(cur.tabla, row, `${row.codigo || row.numero || ''}: ${files.length} documento${files.length > 1 ? 's' : ''} agregado${files.length > 1 ? 's' : ''}`.trim()); toast(S.mode === 'demo' ? 'Agregado (en la demo los archivos no se guardan)' : 'Guardado en Drive'); }
    catch (err) { }
  } else toast('Listo. Se guardará al crear el registro.');
}

/* ---------- inicio de sesión (versión real) ---------- */
function renderGate(msg) {
  const s = S.sess || {};
  $('#root').innerHTML = `<div class="gate"><div class="panel gate-card flash">
    <img src="img/logo-full.webp" alt="SIMEVI Corredores de Seguros">
    ${s.configured === false ? `<p>Falta configurar la app en Vercel: ${esc((s.missing || []).join(', '))}.</p><a class="btn" href="api/diagnose">Ver diagnóstico</a>`
      : `<p>Entra con tu cuenta de Google. Solo Silvia y Ricardo tienen acceso.</p><div id="gsi"></div>${msg ? `<div class="gate-err">${esc(msg)}</div>` : ''}`}
  </div></div>`;
  if (s.configured === false || !s.clientId) return;
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = () => {
    google.accounts.id.initialize({
      client_id: s.clientId, ux_mode: 'popup', auto_select: true,
      callback: async ({ credential }) => {
        try { await api('api/login', { json: { credential } }); location.reload(); }
        catch (err) { renderGate(err.message); }
      }
    });
    google.accounts.id.renderButton($('#gsi'), { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'es' });
    google.accounts.id.prompt();
  };
  document.head.appendChild(sc);
}

/* ---------- arranque ---------- */
async function loadIcons() {
  if (document.getElementById('i-house')) return;
  try { const r = await fetch('icons.svg'); const t = await r.text(); const d = document.createElement('div'); d.innerHTML = t; document.body.prepend(d.firstElementChild); } catch (e) { }
}

async function boot() {
  await loadIcons();
  const portalTok = (location.pathname.match(/^\/c\/([\w-]+)/) || [])[1];
  if (portalTok) { S.mode = 'live'; return renderPortal(portalTok); }
  let sess = null;
  try {
    const r = await fetch('api/session', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) sess = await r.json();
  } catch (e) { }
  if (!sess) {
    bootDemoData();
  } else {
    S.mode = 'live'; S.sess = sess; S.users = sess.users || [];
    if (!sess.user) return renderGate();
    S.me = { ...(S.users.find(u => u.email === sess.user.email) || {}), ...sess.user };
    $('#root').innerHTML = `<div class="gate"><div class="gate-card"><img src="img/sv.webp" alt="" style="width:90px"><div class="skel" style="width:160px"></div></div></div>`;
    try { await loadLive(); }
    catch (e) {
      $('#root').innerHTML = `<div class="gate"><div class="panel gate-card"><img src="img/logo-full.webp" alt="SIMEVI"><p class="gate-err">${esc(e.message)}</p>${sess.user.admin ? `<a class="btn primary" href="api/google/connect">${ic('google-logo')}Conectar Google</a>` : '<p>Pide a Ricardo que conecte la cuenta de Google.</p>'}<a class="btn ghost" href="api/diagnose">Diagnóstico</a></div></div>`;
      return;
    }
    const qs = new URLSearchParams(location.search);
    if (qs.get('google') === 'ok' || qs.get('gmail') === 'ok') { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => toast(qs.get('gmail') ? 'Gmail conectado. La Bandeja ya lo lee.' : 'Google conectado'), 400); }
  }
  parseHash();
  render(true);
  if (S.mode === 'live') {
    try { navigator.serviceWorker?.register('/sw.js'); } catch (e) { }
    loadInbox();
    // Si la otra persona cambia algo, se ve al volver a la pestaña.
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || drawerEl()) return;
      try { await loadLive(); render(false); } catch (e) { }
    });
  } else {
    S.inbox = S.demoInbox;
    render(false);
  }
}
boot();
