// Lectura de PDFs escaneados con el reconocimiento de texto de Google Drive (gratis, sin otro servicio).
// Se crea un Google Doc temporal con el texto, se lee y se borra.
import { Readable } from 'node:stream';
import { drive, subfolder } from './google.js';

const DOC = 'application/vnd.google-apps.document';
let carpeta = null;
const temporal = async req => (carpeta = carpeta || await subfolder(req, '_lectura temporal'));

async function exportar(req, id) {
  const d = drive(req);
  try {
    const r = await d.files.export({ fileId: id, mimeType: 'text/plain' }, { responseType: 'text' });
    return String(r.data || '');
  } finally {
    await d.files.delete({ fileId: id }).catch(() => { });
  }
}

// Desde bytes (adjunto de Gmail)
export async function leerBytes(req, buf, mime, nombre) {
  const r = await drive(req).files.create({
    requestBody: { name: '_lectura ' + nombre, mimeType: DOC, parents: [await temporal(req)] },
    media: { mimeType: mime || 'application/pdf', body: Readable.from(buf) },
    ocrLanguage: 'es', fields: 'id'
  });
  return exportar(req, r.data.id);
}

// Desde un archivo que ya está en Drive (PDF subido en la app)
export async function leerArchivo(req, fileId) {
  const r = await drive(req).files.copy({
    fileId, ocrLanguage: 'es', fields: 'id',
    requestBody: { name: '_lectura', mimeType: DOC, parents: [await temporal(req)] }
  });
  return exportar(req, r.data.id);
}
