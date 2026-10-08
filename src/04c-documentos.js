/* ---------- Lector de documentos (todos los adjuntos, no solo reclamos) ----------
   Con el texto que Google saca de cada adjunto (PDF escaneado, foto, Word, Excel), reconoce
   qué documento es y saca sus datos. Con eso propone el trámite: reclamos, inclusiones,
   exclusiones, cambios de beneficiarios, renovaciones, emisiones o el pago de una liquidación. */

const TIPOS_DOC = [
  { k: 'liquidacion', n: 'Carta de liquidación', i: 'hand-coins', re: /liquidaci[oó]n|finiquito|total\s+a\s+(reembolsar|pagar)|monto\s+a\s+pagar|valor\s+del\s+cheque/g },
  { k: 'beneficiarios', n: 'Cambio de beneficiarios', i: 'users', tipo: 'Modificación', asunto: 'Cambio de beneficiarios', re: /beneficiari[oa]s?|designaci[oó]n\s+de\s+beneficiari/g },
  { k: 'inclusion', n: 'Solicitud de inclusión', i: 'user-plus', tipo: 'Inclusión', asunto: 'Inclusión', re: /inclusi[oó]n|incluir|solicitud\s+de\s+(seguro|ingreso|afiliaci[oó]n|adhesi[oó]n)|alta\s+de\s+(personal|emplead|asegurad)|certificado\s+individual|nuevo\s+ingreso|fecha\s+de\s+ingreso/g },
  { k: 'exclusion', n: 'Exclusión', i: 'user', tipo: 'Exclusión', asunto: 'Exclusión', re: /exclusi[oó]n|excluir|baja\s+de|retiro\s+de|renuncia|fecha\s+de\s+(retiro|baja|salida)|cese\s+laboral/g },
  { k: 'renovacion', n: 'Renovación', i: 'arrows-clockwise', tipo: 'Renovación', asunto: 'Renovación', re: /renovaci[oó]n|renovar/g },
  { k: 'emision', n: 'Cotización o emisión', i: 'shield-check', tipo: 'Emisión', asunto: 'Emisión', re: /cotizaci[oó]n|solicitud\s+de\s+emisi[oó]n|nueva\s+p[oó]liza|propuesta\s+de\s+seguro/g },
  { k: 'modificacion', n: 'Modificación', i: 'note-pencil', tipo: 'Modificación', asunto: 'Modificación', re: /modificaci[oó]n|cambio\s+de\s+(plan|suma|datos|nombre|direcci)|endoso|correcci[oó]n|actualizaci[oó]n\s+de\s+datos/g },
  { k: 'identidad', n: 'Documento de identidad', i: 'identification-card', apoyo: true, re: /documento\s+[uú]nico\s+de\s+identidad|\bdui\b|registro\s+nacional\s+de\s+las\s+personas|pasaporte/g },
  { k: 'factura', n: 'Factura o receta', i: 'receipt', apoyo: true, re: /factura|cr[eé]dito\s+fiscal|receta|farmacia|recibo\s+de\s+pago/g }
];
const TIPO_DOC = Object.fromEntries(TIPOS_DOC.map(t => [t.k, t]));
const leible = a => /pdf|image|word|officedocument|msword|excel|spreadsheet|csv|text\/plain/i.test(a.mime || '') || /\.(pdf|jpe?g|png|heic|docx?|xlsx?|csv|txt)$/i.test(a.name || '');

const FECHA_RE = '(\\d{1,2}\\s*(?:[\\/-]|de)\\s*(?:\\d{1,2}|[a-záéíóú]+)\\s*(?:[\\/-]|de[l]?)\\s*\\d{2,4})';
function camposDoc(texto) {
  const t = String(texto || '');
  const g = re => { const x = t.match(re); return x ? limpiar(x[x.length - 1]) : ''; };
  const linea = '([^\\n]{3,80})';
  const c = {};
  c.poliza = (g(/P[oó]liza\s*(?:No\.?|N[°º]|#|n[uú]mero)?\s*[:.]?\s*([A-Z]{0,6}-?\d[\w.-]*\d)/i) || '').toUpperCase();
  c.contratante = g(new RegExp(`(?:Contratante|Empresa|Patrono|Raz[oó]n\\s+social|Cliente)\\s*[:.]\\s*${linea}`, 'i')).replace(/\s{2,}.*$/, '');
  c.nombre = nombrePropio(g(/(?:Nombre\s+(?:completo\s+)?(?:del?\s+)?(?:asegurado|empleado|solicitante|afiliado|trabajador)(?:\s+titular)?|Nombres?\s+y\s+apellidos?|Asegurado\s+titular|Asegurado|Empleado|Afiliado|Solicitante|Nombre)\s*[:.]\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñü. ]{4,60}?)(?=\s{2,}|\s+(?:DUI|Edad|Fecha|Cert|Sexo|NIT|Cargo|No\.|N[°º])|\n|$)/i));
  c.certificado = g(/Certificado\s*(?:No\.?|N[°º]|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{0,12})\b/i);
  c.dui = (t.match(/\b(\d{8}-\d)\b/) || [])[1] || '';
  c.nacimiento = fechaISO(g(new RegExp(`Fecha\\s+de\\s+nacimiento\\s*[:.]?\\s*${FECHA_RE}`, 'i')));
  c.efectiva = fechaISO(g(new RegExp(`Fecha\\s+(?:de\\s+)?(?:ingreso|efectiva|vigencia|retiro|baja|inicio|alta|salida|renuncia)\\s*[:.]?\\s*${FECHA_RE}`, 'i')));
  c.plan = g(/Plan\s*[:.]\s*([^\n]{2,40})/i);
  c.suma = montoDe(g(/Suma\s+asegurada\s*[:.]?\s*([^\n]{2,40})/i));
  const tl = t.split('\n').find(l => /(total\s+a\s+(reembolsar|pagar)|monto\s+a\s+pagar|valor\s+del\s+cheque|total\s+pagado|neto)/i.test(l) && montoDe(l)) || t.split('\n').find(l => /total/i.test(l) && montoDe(l));
  c.monto = tl ? montoDe(tl) : '';
  // Beneficiarios: "MARÍA LÓPEZ   ESPOSA   50%" (columnas) o "María López, esposa, 50%"
  const PAR = /^(hij[oa]s?|espos[oa]|c[oó]nyuge|compa[nñ]er[oa](\s+de\s+vida)?|madre|padre|herman[oa]|ti[oa]|sobrin[oa]|niet[oa]|abuel[oa]|otro)$/i;
  c.beneficiarios = t.split('\n').filter(l => /\d\s*%/.test(l)).map(l => {
    const pct = +((l.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/) || [])[1] || '0').replace(',', '.');
    const cols = l.replace(/(\d{1,3}(?:[.,]\d+)?)\s*%.*/, '').split(/\s{2,}|\t|\s*[,;|]\s*/).map(x => x.trim()).filter(Boolean);
    let par = cols.find(x => PAR.test(x)) || '';
    let nombre = cols.find(x => !PAR.test(x) && /[a-z]{2,}\s+[a-z]{2,}/i.test(x) && !/^\d/.test(x)) || '';
    if (!par) { const m = nombre.match(/^(.*?)\s+(hij[oa]s?|espos[oa]|c[oó]nyuge|madre|padre|herman[oa])$/i); if (m) { nombre = m[1]; par = m[2]; } }
    return { nombre: nombrePropio(nombre.replace(/^\d+[.)-]?\s*/, '')), parentesco: par ? nombrePropio(par) : '', pct };
  }).filter(b => b.nombre && b.pct > 0 && b.pct <= 100);
  c.codigos = codigosEn(t).slice(0, 30);
  return c;
}

/* Qué documento es y qué dice */
function analizarDoc(texto, nombreArchivo = '') {
  const t = String(texto || '');
  const forms = leerFormularios(t);
  const n = norm(t) + ' ' + norm(nombreArchivo);
  const puntos = TIPOS_DOC.map((x, i) => ({ x, s: (n.match(x.re) || []).length * (x.apoyo ? 0.6 : 1) - i * 0.01 })).filter(p => p.s > 0).sort((a, b) => b.s - a.s);
  let tipo = forms.length ? { k: 'reclamo', n: 'Formulario de reclamo', i: 'first-aid', tipo: 'Reclamo' } : puntos[0]?.x || { k: 'otro', n: 'Documento', i: 'file', apoyo: true };
  // Si casi no hay texto, se dice
  if (!forms.length && t.replace(/\s+/g, '').length < 25) tipo = { k: 'vacio', n: 'No se pudo leer', i: 'warning', apoyo: true };
  const campos = camposDoc(t);
  const resumen = t.split('\n').map(l => l.trim()).filter(l => l.length > 12 && /[a-z]/i.test(l)).slice(0, 3).join(' · ').slice(0, 220);
  return { tipo, campos, forms, resumen };
}

/* Propuestas de trámite a partir de los documentos leídos de un correo (o de archivos subidos) */
function propuestasDeDocs(docs, ctx = {}) {
  const props = [];
  const apoyo = docs.filter(d => d.tipo.apoyo || d.tipo.k === 'reclamo');
  const cliDe = d => {
    const p = polizaPorNumero(d.campos.poliza);
    if (p) return { clienteId: p.clienteId, polizaId: p.id };
    const c = d.campos.contratante && clientePorNombre(d.campos.contratante, d.texto);
    return { clienteId: c?.id || ctx.clienteId || '', polizaId: ctx.polizaId || '' };
  };
  for (const d of docs.filter(d => !d.tipo.apoyo && d.tipo.k !== 'reclamo')) {
    const { clienteId, polizaId: pid0 } = cliDe(d);
    let polizaId = pid0;
    if (!polizaId && clienteId) { const ps = polizasActivas(clienteId); if (ps.length === 1) polizaId = ps[0].id; }
    if (d.tipo.k === 'liquidacion') {
      const t = DB.tramites.find(t => t.numeroReclamo && d.campos.codigos.includes(norm(t.numeroReclamo))) || null;
      props.push({ kind: 'pago', crear: !!(t && d.campos.monto), tramiteId: t?.id || '', clienteId: t?.clienteId || clienteId, monto: d.campos.monto || '', refs: [d.ref], doc: d, titulo: `${d.tipo.n}${d.campos.monto ? ' · ' + fmtMoney(d.campos.monto) : ''}` });
      continue;
    }
    const persona = d.campos.nombre || '';
    const asunto = `${d.tipo.asunto}${persona ? ' de ' + shortName(persona) : ''}`;
    const detalle = [
      d.campos.certificado && `Certificado ${d.campos.certificado}`, d.campos.dui && `DUI ${d.campos.dui}`,
      d.campos.nacimiento && `Nació el ${fmtDate(d.campos.nacimiento)}`, d.campos.efectiva && `Fecha efectiva ${fmtDate(d.campos.efectiva)}`,
      d.campos.plan && `Plan ${d.campos.plan}`, d.campos.suma && `Suma asegurada ${fmtMoney(d.campos.suma)}`,
      d.campos.beneficiarios.length && `Beneficiarios: ${d.campos.beneficiarios.map(b => `${b.nombre}${b.parentesco ? ' (' + b.parentesco.toLowerCase() + ')' : ''} ${b.pct}%`).join(', ')}`
    ].filter(Boolean).join('. ');
    // ¿Ya hay un trámite abierto igual? (mismo cliente, tipo y persona)
    const ya = DB.tramites.find(t => tramiteAbierto(t) && clienteId && t.clienteId === clienteId && t.tipo === d.tipo.tipo && (!persona || parecido(t.asegurado || t.asunto, persona) >= 0.6));
    props.push({ kind: 'tramite', crear: true, tipo: d.tipo.tipo, clienteId, clienteTxt: clienteId ? '' : nombreEmpresa(d.campos.contratante), polizaTxt: polizaId ? '' : d.campos.poliza, polizaId, asegurado: persona, certificado: d.campos.certificado, asunto, descripcion: detalle || d.resumen, refs: [d.ref], tramiteId: ya?.id || '', doc: d, persona: d.campos });
  }
  // Varios documentos del mismo tipo sin nombre: uno solo
  const sinNombre = props.filter(p => p.kind === 'tramite' && !p.asegurado);
  if (sinNombre.length > 1) { const [a, ...rest] = sinNombre; rest.forEach(r => { a.refs.push(...r.refs); props.splice(props.indexOf(r), 1); }); }
  // Los de apoyo (facturas, DUI) van con cada trámite
  props.filter(p => p.kind === 'tramite').forEach(p => p.refs.push(...apoyo.map(d => d.ref).filter(r => !p.refs.includes(r))));
  return props;
}

/* Crea (o completa) los trámites propuestos. docBy(ref, clienteId) devuelve el documento en Drive. */
async function guardarPropuestas(props, { mail = null, auto = false, docBy } = {}) {
  const hechos = [];
  const quien = mail ? (mail.fromName || mail.from) : '';
  for (const p of props.filter(p => p.crear)) {
    if (p.kind === 'pago') {
      const t = tramite(p.tramiteId); if (!t || !(+p.monto > 0)) continue;
      if (DB.pagos.some(x => x.tramiteId === t.id && Math.abs(+x.monto - +p.monto) < 0.01)) continue;
      const pg = { id: '', tramiteId: t.id, clienteId: t.clienteId, aseguradora: t.aseguradora, forma: 'Cheque', numero: '', banco: '', monto: +p.monto, fechaAviso: todayISO(), fechaRecogido: '', fechaEntregado: '', entregadoA: '', folio: '', estado: 'disponible', notas: 'Según la carta de liquidación' + (auto ? ' (leída sola)' : '') };
      await save('pagos', pg, `Cheque por ${fmtMoney(pg.monto)} · ${t.codigo} (carta de liquidación)`);
      await linkPagoTramite(pg, true);
      hechos.push(t); continue;
    }
    // Lo que falte (cliente, póliza, la persona en la colectiva) se crea como en los reclamos
    if (p.clienteId || p.clienteTxt) {
      const st = filaNueva({ clienteId: p.clienteId, clienteTxt: p.clienteTxt, polizaId: p.polizaId, polizaTxt: p.polizaId ? '' : p.polizaTxt || '', asegurado: p.asegurado, certificado: p.certificado, esEmpresa: true, origenTxt: p.doc ? `“${p.doc.name}”` : 'un documento' });
      const aseg = poliza(p.polizaId)?.aseguradora || aseguradoraEnTexto(p.doc?.texto || '');
      await asegurarEntidades(st, aseg);
      p.clienteId = st.clienteId || p.clienteId; p.polizaId = st.polizaId || p.polizaId;
    }
    if (!p.clienteId) continue;
    const docs = (await Promise.all(p.refs.map(r => docBy(r, p.clienteId)))).filter(Boolean);
    const ex = tramite(p.tramiteId);
    if (ex) {
      const t = structuredClone(ex);
      t.docs = [...(t.docs || []), ...docs.filter(d => !(t.docs || []).some(x => x.id === d.id))];
      t.eventos = [...(t.eventos || []), { fecha: nowISO(), por: S.me.email, tipo: 'correo', auto, texto: `${mail ? `Correo de ${quien}: ` : ''}${p.doc?.tipo.n || 'Documento'}${p.asegurado ? ' de ' + p.asegurado : ''}. ${p.descripcion || ''}`.trim() }];
      await save('tramites', t, `${t.codigo}: ${docs.length} documento${docs.length === 1 ? '' : 's'}${auto ? ' (automático)' : ''}`);
      hechos.push(t); continue;
    }
    const pol = poliza(p.polizaId);
    const t = {
      id: '', codigo: nextCodigo(), tipo: p.tipo, clienteId: p.clienteId, polizaId: p.polizaId || '', aseguradora: pol?.aseguradora || (mail ? aseguradoraEnTexto(p.doc?.texto || '') : '') || '',
      asegurado: p.asegurado || '', certificado: p.certificado || '', asunto: p.asunto, descripcion: p.descripcion || '', canal: CANALES[0], etapa: 'recibido', numeroReclamo: '', monto: '',
      fechaSolicitud: (mail?.fecha || nowISO()).slice(0, 10), fechaIngreso: '', responsable: mail ? responsableDe(mail) : S.me.email, visibleCliente: true, notaCliente: '', docs,
      eventos: [{ fecha: nowISO(), por: S.me.email, tipo: 'etapa', a: 'recibido', auto, texto: `${mail ? `Recibido por correo de ${quien}. ` : ''}${auto ? 'SIMEVI lo creó solo leyendo ' : 'Datos leídos de '}${p.doc ? '“' + p.doc.name + '”' : 'los adjuntos'}.` }],
      gmailId: mail?.id || '', hilo: mail?.raiz || ''
    };
    await save('tramites', t, `${t.codigo} ${t.tipo} · ${shortName(clienteNombre(t.clienteId))}${t.asegurado ? ' › ' + t.asegurado : ''}${auto ? ' (automático)' : ''}`);
    // La persona queda en la lista de asegurados de la colectiva con su DUI y plan (para Personas y los reclamos)
    const ent = pol?.modalidad === 'Colectiva' && t.asegurado && (pol.asegurados || []).find(a => norm(a.nombre) === norm(t.asegurado));
    if (ent && ((p.persona?.dui && !ent.documento) || (p.persona?.plan && !ent.plan))) {
      ent.documento = ent.documento || p.persona.dui || ''; ent.plan = ent.plan || p.persona.plan || '';
      await save('polizas', pol, `${pol.numero}: datos de ${t.asegurado}`).catch(() => { });
    }
    hechos.push(t);
  }
  return hechos;
}
