/* ---------- Lector de formularios de reclamo ----------
   Recibe el texto que Google Drive saca de un PDF escaneado y encuentra los formularios
   de reclamo ("CONTRATANTE / PÓLIZA / AFILIADO / CERTIFICADO / ASEGURADO / TOTAL").
   Lo demás que venga escaneado (recetas, facturas sueltas) se ignora. */

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const PARENTESCOS = ['Titular', 'Cónyuge', 'Hijo(a)', 'Padre/Madre', 'Otro'];

const limpiar = s => String(s || '').replace(/[_|‘’'`"“”]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s.:;,\-]+|[\s.:;,\-]+$/g, '').trim();
const nombrePropio = s => limpiar(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, w => w.toLowerCase());
const tokens = s => norm(s).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['de', 'del', 'la', 'las', 'los', 'sa', 'cv', 'y'].includes(w));

function fechaISO(s) {
  const t = norm(s);
  let m = t.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de[l]?\s+(\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}

// "US$41.25", "USS41.25" (el OCR confunde $ con S), "$ 1,320.00"
function montoDe(s) {
  const m = String(s).match(/US\s*[S$]?\s*\$?\s*(\d[\d,]*[.,]\d{2})\b/i) || String(s).match(/\$\s*(\d[\d,]*[.,]\d{2})\b/);
  if (!m) return '';
  return +m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
}

function conceptoBonito(s) {
  let c = limpiar(String(s).replace(/^[^a-z]*?(?=factura|otros)/i, '').replace(/factura\s*\(?s?\)?/i, '').replace(/US\s*[S$8]?\s*\$?\s*[\d.,]+/gi, '').replace(/\(.*?\)/g, ''));
  c = c.toLowerCase().replace(/^(por\s+)?(servicios\s+)?(de\s+)?/, '');
  return c ? c[0].toUpperCase() + c.slice(1) : '';
}

function leerBloque(b) {
  const g = re => { const m = b.match(re); return m ? limpiar(m[1]) : ''; };
  const f = {};
  f.contratante = g(/CONTRATANTE\s*[:;]\s*([^\n]+)/i);
  f.poliza = ((b.match(/P[OÓ]LIZA\s*N[oº°.]*\s*[:;]?[\s_]*([A-Z]{1,6}[-\s]?[A-Z0-9]*\d[A-Z0-9-]*)/i) || [])[1] || '').replace(/\s/g, '').replace(/[.\-]+$/, '').toUpperCase();
  f.fecha = fechaISO(g(/FECHA\s*[:;]?\s*([^\n]+)/i));
  f.afiliado = nombrePropio(g(/\(\s*Empleado\s*\)\s*[:;]?\s*([^\n]+?)(?=\s+CERTIFICADO|\n|$)/i) || g(/AFILIADO\s*[:;]\s*([A-ZÁÉÍÓÚÑ][^\n(]+?)(?=\s+CERTIFICADO|\n|$)/i));
  f.certificado = g(/CERTIFICADO\s*N?[oº°.]*\s*[:;]?\s*([A-Z0-9][A-Z0-9-]*)/i);
  f.paciente = nombrePropio(g(/\(\s*Afectado\s*\)\s*[:;]?\s*([^\n]+?)(?=\s+PARENTESCO|\n|$)/i));
  const par = g(/PARENTESCO\s*[:;]?\s*([A-ZÁÉÍÓÚÑa-z()]+)/i).toLowerCase();
  f.parentesco = /hij/.test(par) ? 'Hijo(a)' : /espos|c[oó]nyug/.test(par) ? 'Cónyuge' : /padre|madre/.test(par) ? 'Padre/Madre' : /titular|mism/.test(par) ? 'Titular' : par ? 'Otro' : '';
  const tl = b.match(/TOTAL\s*DE\s*LA\s*RECLAMACI[OÓ]N[^\n]*/i) || b.match(/TOTAL\s*DELA\s*RECLAMACI[OÓ]N[^\n]*/i);
  f.total = tl ? montoDe(tl[0]) : '';
  f.conceptos = b.split('\n').filter(l => /^\s*[\dIil|]*\s*(factura\s*\(?s?\)?|otros)\b/i.test(l) && !/total/i.test(l)).map(l => ({ concepto: conceptoBonito(l), monto: montoDe(l) })).filter(c => c.monto);
  if (!f.total && f.conceptos.length) f.total = Math.round(f.conceptos.reduce((a, c) => a + c.monto, 0) * 100) / 100;
  f.doctor = nombrePropio(g(/Dr[a]?\.?\s*[:;]\s*([^\n]+)/i));
  f.notas = [f.conceptos.map(c => `${c.concepto} ${fmtMoney(c.monto)}`).join(', '), f.doctor ? `Dr. ${f.doctor}` : ''].filter(Boolean).join(' · ');
  f.puntos = [f.certificado, f.afiliado, f.paciente, f.total, f.poliza].filter(Boolean).length;
  f.texto = b;
  return f;
}

/* Devuelve los formularios de reclamo encontrados en el texto (puede haber varios). */
function leerFormularios(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const idx = [...t.matchAll(/CONTRATANTE\s*[:;]/gi)].map(m => m.index);
  const bloques = idx.length ? idx.map((i, k) => t.slice(i, idx[k + 1] ?? t.length)) : [t];
  return bloques.map(leerBloque).filter(f => f.puntos >= 3);
}

function parecido(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return 0;
  const comun = x.filter(w => y.includes(w)).length;
  return comun / Math.min(x.length, y.length);
}

// El contratante del formulario contra los clientes registrados ("INGENIO … JIBOA" ↔ "INJIBOA")
function clientePorNombre(nombre, textoCompleto = '') {
  let mejor = null, nota = 0;
  for (const c of DB.clientes) {
    let s = parecido(c.nombre, nombre);
    const corto = tokens(c.nombre)[0];
    // Nombres cortos de empresa ("INJIBOA") que aparecen en el sello o la firma del formulario
    if (s < 0.6 && c.tipo === 'Empresa' && tokens(c.nombre).length <= 2 && corto && corto.length >= 5 && tokens(textoCompleto).includes(corto)) s = 0.7;
    if (s > nota) { nota = s; mejor = c; }
  }
  return nota >= 0.6 ? mejor : null;
}

/* Un formulario leído se convierte en una fila para revisar, ya ligada a lo que exista. */
function filaDeFormulario(f, docRef) {
  const st = filaNueva({
    asegurado: f.afiliado, certificado: f.certificado,
    paciente: f.paciente && parecido(f.paciente, f.afiliado) < 0.8 ? f.paciente : '',
    parentesco: f.paciente && parecido(f.paciente, f.afiliado) < 0.8 ? f.parentesco : '',
    monto: f.total ? f.total.toFixed(2) : '', notas: f.notas, docs: docRef ? [docRef] : [], polizaTxt: f.poliza, clienteTxt: f.contratante, fecha: f.fecha
  });
  const p = f.poliza && DB.polizas.find(x => norm(x.numero).replace(/\s/g, '') === norm(f.poliza));
  if (p) { st.polizaId = p.id; st.clienteId = p.clienteId; st.clienteTxt = clienteNombre(p.clienteId); }
  else { const c = clientePorNombre(f.contratante, f.texto); if (c) { st.clienteId = c.id; st.clienteTxt = c.nombre; } }
  const pp = poliza(st.polizaId);
  if (pp) {
    const a = (pp.asegurados || []).find(a => (f.certificado && String(a.certificado) === String(f.certificado)) || parecido(a.nombre, f.afiliado) >= 0.75);
    if (a) { st.asegurado = a.nombre; st.certificado = a.certificado || st.certificado; }
  }
  st.picked = st.asegurado;
  // ¿Ya está registrado este mismo reclamo?
  const dup = DB.tramites.find(t => t.tipo === 'Reclamo' && tramiteAbierto(t) && st.clienteId && t.clienteId === st.clienteId &&
    parecido(t.asegurado, st.asegurado) >= 0.8 && (!st.monto || !t.monto || +t.monto === +st.monto) && (!st.paciente || parecido(t.paciente, st.paciente) >= 0.8));
  if (dup) st.tramiteId = dup.id;
  return st;
}
