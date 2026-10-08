// Lectura de PDFs escaneados con el reconocimiento de texto de Google Drive (gratis, sin otro servicio).
// Se crea un Google Doc temporal con el texto, se lee y se borra.
import { Readable } from 'node:stream';
import { drive, subfolder } from './google.js';

const DOC = 'application/vnd.google-apps.document';
const HOJA = 'application/vnd.google-apps.spreadsheet';
const esHoja = (mime, nombre) => /spreadsheet|excel|csv/i.test(mime || '') || /\.(xlsx?|csv|ods)$/i.test(nombre || '');
const esTexto = (mime, nombre) => /^text\/plain/i.test(mime || '') || /\.txt$/i.test(nombre || '');
let carpeta = null;
const temporal = async req => (carpeta = carpeta || await subfolder(req, '_lectura temporal'));

async function exportar(req, id, mimeType = 'text/plain') {
  const d = drive(req);
  try {
    const r = await d.files.export({ fileId: id, mimeType }, { responseType: 'text' });
    return String(r.data || '');
  } finally {
    await d.files.delete({ fileId: id }).catch(() => { });
  }
}

// Desde bytes (adjunto de Gmail). PDF, fotos y Word → texto; Excel → CSV; texto → tal cual.
export async function leerBytes(req, buf, mime, nombre) {
  if (esTexto(mime, nombre)) return buf.toString('utf8');
  const hoja = esHoja(mime, nombre);
  const r = await drive(req).files.create({
    requestBody: { name: '_lectura ' + nombre, mimeType: hoja ? HOJA : DOC, parents: [await temporal(req)] },
    media: { mimeType: mime || 'application/pdf', body: Readable.from(buf) },
    ocrLanguage: 'es', fields: 'id'
  });
  return exportar(req, r.data.id, hoja ? 'text/csv' : 'text/plain');
}

// Desde un archivo que ya está en Drive (PDF subido en la app)
export async function leerArchivo(req, fileId) {
  const d = drive(req);
  const meta = (await d.files.get({ fileId, fields: 'mimeType,name' })).data;
  if (esTexto(meta.mimeType, meta.name)) return String((await d.files.get({ fileId, alt: 'media' }, { responseType: 'text' })).data || '');
  const hoja = esHoja(meta.mimeType, meta.name);
  const r = await d.files.copy({
    fileId, ocrLanguage: 'es', fields: 'id',
    requestBody: { name: '_lectura', mimeType: hoja ? HOJA : DOC, parents: [await temporal(req)] }
  });
  return exportar(req, r.data.id, hoja ? 'text/csv' : 'text/plain');
}
