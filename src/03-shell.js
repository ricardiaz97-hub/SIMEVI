/* ---------- avisos y celebración ---------- */
function toast(msg, kind = '', action) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `${ic(kind === 'err' ? 'warning' : 'check-circle')}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.run(); close(); };
  box.appendChild(el);
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  const arm = () => { timer = setTimeout(close, kind === 'err' ? 6000 : 3600); };
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', arm);
  arm();
}

const SPARK = 'M12 0C12.6 7.6 16.4 11.4 24 12 16.4 12.6 12.6 16.4 12 24 11.4 16.4 7.6 12.6 0 12 7.6 11.4 11.4 7.6 12 0Z';
function celebrate() {
  if (reduceMotion()) return;
  const c = document.createElement('div');
  c.className = 'celebrate'; c.setAttribute('aria-hidden', 'true');
  let h = '<i class="dm"></i><i class="dm b"></i>';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 110 + (i % 3) * 40;
    h += `<svg viewBox="0 0 24 24" style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;animation-delay:${(i % 4) * 30}ms"><path d="${SPARK}"/></svg>`;
  }
  c.innerHTML = h;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1200);
}

/* Destellos: cuántas pólizas vigentes tiene el cliente (1, 2, 3, 5, 8+) */
function sparkles(n) {
  const th = [1, 2, 3, 5, 8];
  const on = th.filter(t => n >= t).length;
  return `<span class="stars5" role="img" aria-label="${n} ${n === 1 ? 'póliza vigente' : 'pólizas vigentes'}">${th.map((t, i) => `<svg viewBox="0 0 24 24" class="${i < on ? 'on' : ''}"><path d="${SPARK}"/></svg>`).join('')}</span>`;
}

/* ---------- hoja lateral ---------- */
let drawerOnClose = null;
function openDrawer(html, onClose) {
  closeDrawer(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.act = 'drawer-close';
  const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = html;
  document.body.append(scrim, d);
  drawerOnClose = onClose || null;
  requestAnimationFrame(() => { scrim.classList.add('on'); d.classList.add('on'); });
  try { history.pushState({ drawer: 1 }, ''); } catch (e) { }
  setTimeout(() => { const f = d.querySelector('[autofocus]'); if (f) f.focus(); else d.querySelector('.drawer-h button')?.focus({ preventScroll: true }); }, 60);
  return d;
}
function closeDrawer(silent) {
  const d = $('.drawer'), s = $('.scrim');
  if (!d) return;
  if (drawerOnClose) { const fn = drawerOnClose; drawerOnClose = null; fn(); }
  d.classList.remove('on'); s?.classList.remove('on');
  d.classList.add('closing');
  const kill = () => { d.remove(); s?.remove(); };
  if (silent || reduceMotion()) kill(); else setTimeout(kill, 300);
  try { if (!silent && history.state?.drawer) history.back(); } catch (e) { }
}
const drawerEl = () => $('.drawer:not(.closing)');
addEventListener('popstate', () => { if (drawerEl()) closeDrawer(true); });

/* ---------- navegación ---------- */
const ROUTES = [
  { k: 'inicio', n: 'Inicio', i: 'house' },
  { k: 'tramites', n: 'Trámites', i: 'folder-open' },
  { k: 'pagos', n: 'Pagos', i: 'money-wavy' },
  { k: 'polizas', n: 'Pólizas', i: 'shield-check' },
  { k: 'clientes', n: 'Clientes', i: 'users' },
  { k: 'bandeja', n: 'Bandeja', i: 'tray', desk: true },
  { k: 'bitacora', n: 'Bitácora', i: 'clock-counter-clockwise', desk: true },
  { k: 'ajustes', n: 'Ajustes', i: 'gear-six', desk: true }
];

function go(route, arg = '') { location.hash = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : ''); }
function parseHash() {
  const [, r = 'inicio', a = ''] = (location.hash || '').match(/^#\/([^/?]*)\/?([^?]*)/) || [];
  S.route = ROUTES.some(x => x.k === r) || r === 'buscar' || r === 'c' ? r : 'inicio';
  S.arg = decodeURIComponent(a || '');
}
addEventListener('hashchange', () => { parseHash(); $('.more-sheet')?.remove(); render(true); });

function counts() {
  return {
    tramites: DB.tramites.filter(t => t.etapa === 'recibido').length,
    pagos: DB.pagos.filter(pagoAbierto).length,
    bandeja: S.inbox ? S.inbox.filter(m => !mailDone(m)).length : 0
  };
}

function shell(content) {
  const c = counts();
  const navItem = r => `<a class="nav ${r.desk ? 'desk' : ''}" href="#/${r.k}" ${S.route === r.k ? 'aria-current="page"' : ''}>${ic(r.i)}<span>${r.n}</span>${c[r.k] ? `<span class="count" aria-label="${c[r.k]} pendientes">${c[r.k]}</span>` : ''}</a>`;
  return `
  <div class="app">
    <nav class="rail" aria-label="Secciones">
      <a class="brand" href="#/inicio" aria-label="SIMEVI, inicio"><img src="img/sv.webp" alt=""><span><b>SIMEVI</b><small>CORREDORES DE SEGUROS</small></span></a>
      ${ROUTES.slice(0, 5).map(navItem).join('')}
      <button class="nav mob-more" type="button" data-act="more" style="display:none">${ic('dots-three')}<span>Más</span></button>
      <div class="sep"></div>
      ${ROUTES.slice(5).map(navItem).join('')}
      <div class="rail-foot">
        ${av(S.me.email)}
        <div class="who"><b>${esc(S.me.nombre)}</b><small>${S.mode === 'demo' ? 'Demostración' : 'Conectado a Google'}</small></div>
        <button class="btn ghost icon sm" type="button" data-act="switch-user" title="${S.mode === 'demo' ? 'Cambiar de persona' : 'Cerrar sesión'}" aria-label="${S.mode === 'demo' ? 'Cambiar de persona' : 'Cerrar sesión'}">${ic(S.mode === 'demo' ? 'arrows-clockwise' : 'sign-out')}</button>
      </div>
    </nav>
    <div class="col-main">
      <header class="mbar">
        <img src="img/sv.webp" alt=""><b>SIMEVI</b><span class="spacer"></span>
        <button class="btn icon sm" type="button" data-act="search-m" aria-label="Buscar">${ic('magnifying-glass')}</button>
        <button class="btn primary icon sm" type="button" data-act="new-tramite" aria-label="Nuevo trámite">${ic('plus')}</button>
        <button class="btn ghost icon sm" type="button" data-act="switch-user" aria-label="Persona">${av(S.me.email, 'sm')}</button>
      </header>
      <main class="main" id="main">
        <div class="top">
          <label class="search"><span class="sr">Buscar</span>${ic('magnifying-glass')}<input type="search" id="gsearch" placeholder="Buscar cliente, póliza, número de reclamo o cheque" value="${esc(S.q)}" autocomplete="off"></label>
          <span class="spacer"></span>
          ${S.route === 'tramites' ? '' : `<button class="btn primary" type="button" data-act="new-tramite">${ic('plus')}Nuevo trámite</button>`}
        </div>
        ${S.mode === 'demo' ? `<div class="banner">${ic('sparkle')}<span class="long">Modo demostración: los datos son de ejemplo y se guardan solo en este navegador. Estás como <b>${esc(S.me.nombre)}</b>.</span><span class="short">Demo · estás como <b>${esc(firstName(S.me))}</b></span><button class="btn sm" type="button" data-act="switch-user">Cambiar a ${esc(firstName(S.users.find(u => u.email !== S.me.email)))}</button></div>` : ''}
        <div id="view">${content}</div>
      </main>
    </div>
  </div>`;
}

const VIEWS = {};
let lastRoute = '';
function render(animate) {
  if (S.route === 'c') return renderPortal(S.arg);
  if (!S.me) return;
  const html = (VIEWS[S.route] || VIEWS.inicio)();
  const root = $('#root');
  const keepFocus = document.activeElement?.id;
  const sel = document.activeElement?.selectionStart;
  if (!$('.app', root)) root.innerHTML = shell(html);
  else {
    const tmp = document.createElement('div'); tmp.innerHTML = shell('');
    $('.rail', root).replaceWith($('.rail', tmp));
    $('.banner', root)?.replaceWith($('.banner', tmp) || '');
    $('.top', root).replaceWith($('.top', tmp));
    $('#view').innerHTML = html;
  }
  const v = $('#view');
  if (animate !== false && S.route !== lastRoute) {
    v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    Array.from(v.children).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 6)));
    window.scrollTo(0, 0);
  } else v.classList.remove('enter');
  lastRoute = S.route;
  if (keepFocus) { const el = document.getElementById(keepFocus); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) { } } }
  document.title = (ROUTES.find(r => r.k === S.route)?.n || 'Buscar') + ' · SIMEVI';
  const more = $('.mob-more'); if (more) more.style.display = matchMedia('(max-width:760px)').matches ? '' : 'none';
}
addEventListener('resize', () => { const more = $('.mob-more'); if (more) more.style.display = matchMedia('(max-width:760px)').matches ? '' : 'none'; });

function head(title, sub, actions = '') {
  return `<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function emptyState(icon, title, text, btn = '') {
  return `<div class="empty"><span class="ico">${ic(icon)}</span><b>${title}</b><span>${text}</span>${btn}</div>`;
}

/* ---------- Inicio ---------- */
function pendientes() {
  const T = todayISO();
  const out = [];
  DB.tramites.filter(t => t.etapa === 'recibido').forEach(t => out.push({ p: 1, icon: 'upload-simple', t: `Ingresar ${t.codigo} en ${t.aseguradora || 'la aseguradora'}`, s: `${t.tipo} · ${clienteNombre(t.clienteId)} · llegó ${fmtAgo(t.fechaSolicitud + 'T12:00:00')}`, act: `data-act="open-tramite" data-id="${t.id}"` }));
  DB.pagos.filter(p => p.estado === 'disponible').forEach(p => out.push({ p: 2, icon: 'hand-coins', t: `Recoger ${p.forma.toLowerCase()} de ${fmtMoney(p.monto)} en ${p.aseguradora}`, s: `${clienteNombre(p.clienteId)} · aviso ${fmtShort(p.fechaAviso)}`, act: `data-act="open-pago" data-id="${p.id}"` }));
  DB.pagos.filter(p => p.estado === 'oficina').forEach(p => out.push({ p: 2, icon: 'money-wavy', t: `Entregar cheque ${p.numero} a ${clienteNombre(p.clienteId).split(',')[0]}`, s: `${fmtMoney(p.monto)} · en oficina desde ${fmtShort(p.fechaRecogido || p.fechaAviso)}`, act: `data-act="open-pago" data-id="${p.id}"` }));
  DB.tramites.filter(t => t.etapa === 'ingresado' && t.fechaIngreso && daysBetween(t.fechaIngreso, T) >= 3).forEach(t => out.push({ p: 3, icon: 'phone', t: `Pedir número a ${t.aseguradora} para ${t.codigo}`, s: `Ingresado hace ${daysBetween(t.fechaIngreso, T)} días · ${clienteNombre(t.clienteId)}`, act: `data-act="open-tramite" data-id="${t.id}"` }));
  DB.polizas.filter(p => !p.cancelada).forEach(p => {
    const d = diasPoliza(p);
    if (d === null || d > 30) return;
    const ya = DB.tramites.some(t => t.polizaId === p.id && t.tipo === 'Renovación' && tramiteAbierto(t));
    if (ya) return;
    out.push({ p: d < 0 ? 1 : 4, icon: 'arrows-clockwise', t: d < 0 ? `Póliza ${p.numero} venció hace ${-d} días` : `Renovar ${p.numero} (vence en ${d} días)`, s: `${p.ramo} · ${clienteNombre(p.clienteId)}`, act: `data-act="open-poliza" data-id="${p.id}"` });
  });
  return out.sort((a, b) => a.p - b.p);
}

VIEWS.inicio = () => {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const abiertos = DB.tramites.filter(tramiteAbierto);
  const enAseg = abiertos.filter(t => t.tipo === 'Reclamo' && ['ingresado', 'numero', 'analisis'].includes(t.etapa));
  const porEntregar = DB.pagos.filter(pagoAbierto);
  const sumaPend = porEntregar.reduce((a, p) => a + (+p.monto || 0), 0);
  const renov = DB.polizas.filter(p => !p.cancelada && diasPoliza(p) !== null && diasPoliza(p) <= 30);
  const todo = pendientes();
  const hoy = new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
  const mine = todo.length;
  return `
  <section class="hello">
    <div class="panel hello-main flash">
      <span class="greek" aria-hidden="true">ΑΣΦΑΛΕΙΑ</span>
      <span class="when">${esc(hoy)}</span>
      <h1>${saludo}, <span>${esc(firstName(S.me))}</span></h1>
      <p>${mine ? `Hay ${mine} ${mine === 1 ? 'cosa pendiente' : 'cosas pendientes'} entre los dos. Lo más urgente está arriba.` : 'Todo al día. No hay trámites por ingresar ni pagos por entregar.'}</p>
      <img class="mono" src="img/sv.webp" alt="" aria-hidden="true">
    </div>
    <div class="kpis">
      <button class="card kpi" type="button" data-act="go" data-r="tramites"><span class="label">${ic('folder-open')}Trámites abiertos</span><b class="tnum">${abiertos.length}</b></button>
      <button class="card kpi" type="button" data-act="go" data-r="tramites"><span class="label">${ic('hourglass-medium')}Reclamos en aseguradora</span><b class="tnum">${enAseg.length}</b></button>
      <button class="card kpi ${porEntregar.length ? 'alert' : ''}" type="button" data-act="go" data-r="pagos"><span class="label">${ic('hand-coins')}Pagos por entregar</span><b class="tnum">${fmtMoney(sumaPend).replace('US', '')}<small>· ${porEntregar.length}</small></b></button>
      <button class="card kpi ${renov.length ? 'alert' : ''}" type="button" data-act="go" data-r="polizas" data-f="por-vencer"><span class="label">${ic('arrows-clockwise')}Vencen en 30 días</span><b class="tnum">${renov.length}</b></button>
    </div>
  </section>
  <section class="home-grid">
    <div class="panel">
      <div class="panel-h"><h2>LO QUE SIGUE</h2><span class="label">${todo.length}</span></div>
      ${todo.length ? `<ul class="next">${todo.slice(0, 8).map(x => `<li><span class="ico">${ic(x.icon)}</span><div class="txt"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></div><button class="btn sm" type="button" ${x.act}>Abrir</button></li>`).join('')}</ul>` : emptyState('check-circle', 'Nada pendiente', 'Cuando llegue una solicitud o un cheque, aparecerá aquí.')}
    </div>
    <div class="panel">
      <div class="panel-h"><h2>QUIÉN HIZO QUÉ</h2><a class="btn ghost sm" href="#/bitacora">Ver todo</a></div>
      ${feed(DB.bitacora.slice(0, 7))}
    </div>
  </section>`;
};

function feed(list, timeOnly) {
  if (!list.length) return emptyState('clock-counter-clockwise', 'Sin movimientos', 'Cada cambio quedará registrado con el nombre de quien lo hizo.');
  return `<ul class="feed">${list.map(e => {
    const u = userBy(e.por);
    return `<li>${av(e.por, 'sm')}<div class="txt"><b>${esc(firstName(u))}</b> ${esc(e.accion)} ${esc(articulo(e.tabla))} <span class="muted">${esc(e.resumen || '')}</span><small>${timeOnly ? fmtTime(e.fecha) : fmtAgo(e.fecha)}${e.ref && e.tabla !== 'correos' ? ` · <a href="#" data-act="open-ref" data-t="${esc(e.tabla)}" data-id="${esc(e.ref)}">abrir</a>` : ''}</small></div></li>`;
  }).join('')}</ul>`;
}
const articulo = t => ({ tramites: 'el trámite', pagos: 'el pago', polizas: 'la póliza', clientes: 'el cliente', correos: 'el correo' }[t] || '');

/* Confirmaciones y preguntas dentro de la página (el visor de artifacts y algunos teléfonos bloquean confirm/prompt). */
function ask(msg, { value, ok = 'Aceptar', danger = false, cancel = 'Cancelar' } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask-wrap';
    const hasInput = value !== undefined;
    wrap.innerHTML = `<form class="panel ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-msg">
      <p id="ask-msg">${esc(msg)}</p>
      ${hasInput ? `<input type="text" id="ask-in" value="${esc(value)}">` : ''}
      <div class="ask-b"><button class="btn ghost" type="button" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(ok)}</button></div>
    </form>`;
    document.body.appendChild(wrap);
    const f = wrap.querySelector('form'), inp = wrap.querySelector('#ask-in');
    const done = v => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(hasInput ? null : false); } };
    document.addEventListener('keydown', key, true);
    f.addEventListener('submit', e => { e.preventDefault(); done(hasInput ? inp.value.trim() : true); });
    wrap.querySelector('[data-r="0"]').onclick = () => done(hasInput ? null : false);
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) done(hasInput ? null : false); });
    setTimeout(() => (inp ? (inp.focus(), inp.select()) : f.querySelector('[type=submit]').focus()), 30);
  });
}
