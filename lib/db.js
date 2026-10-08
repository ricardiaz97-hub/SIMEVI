// La Hoja de cálculo como base de datos: una pestaña por tabla, una fila por registro.
import crypto from 'node:crypto';
import { sheets, workspace } from './google.js';
import { TABLES, toCell, fromCell } from './schema.js';

const colLetter = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function readAll(req, only) {
  const { sheetId } = await workspace(req);
  const names = only || Object.keys(TABLES);
  const r = await sheets(req).spreadsheets.values.batchGet({
    spreadsheetId: sheetId, ranges: names.map(n => `${TABLES[n].tab}!A1:ZZ`), valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const out = {};
  names.forEach((n, i) => {
    const rows = r.data.valueRanges?.[i]?.values || [];
    const head = rows[0] || TABLES[n].cols;
    out[n] = rows.slice(1).filter(row => row[0]).map(row => Object.fromEntries(head.map((h, j) => [h, fromCell(h, row[j])])));
  });
  return out;
}

// Encabezados reales de la pestaña; si faltan columnas nuevas del esquema, se agregan al final.
async function headers(req, name) {
  const { sheetId } = await workspace(req);
  const s = sheets(req);
  const t = TABLES[name];
  const r = await s.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${t.tab}!1:1` });
  let head = r.data.values?.[0] || [];
  const missing = t.cols.filter(c => !head.includes(c));
  if (missing.length) {
    head = [...head, ...missing];
    await s.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${t.tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [head] } });
  }
  return head;
}

async function rowIndex(req, name, id) {
  const { sheetId } = await workspace(req);
  const r = await sheets(req).spreadsheets.values.get({ spreadsheetId: sheetId, range: `${TABLES[name].tab}!A:A` });
  const i = (r.data.values || []).findIndex(v => String(v[0]) === String(id));
  return i > 0 ? i + 1 : 0; // número de fila en la hoja (1 = encabezado)
}

export async function upsert(req, name, row) {
  const { sheetId } = await workspace(req);
  const head = await headers(req, name);
  const values = [head.map(h => toCell(h, row[h]))];
  const at = await rowIndex(req, name, row.id);
  const s = sheets(req);
  if (at) await s.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${TABLES[name].tab}!A${at}:${colLetter(head.length - 1)}${at}`, valueInputOption: 'RAW', requestBody: { values } });
  else await s.spreadsheets.values.append({ spreadsheetId: sheetId, range: `${TABLES[name].tab}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
  return { isNew: !at };
}

export async function getRow(req, name, id) {
  const at = await rowIndex(req, name, id);
  if (!at) return null;
  const { sheetId } = await workspace(req);
  const head = await headers(req, name);
  const r = await sheets(req).spreadsheets.values.get({ spreadsheetId: sheetId, range: `${TABLES[name].tab}!A${at}:${colLetter(head.length - 1)}${at}`, valueRenderOption: 'UNFORMATTED_VALUE' });
  const v = r.data.values?.[0] || [];
  return Object.fromEntries(head.map((h, j) => [h, fromCell(h, v[j])]));
}

export async function removeRow(req, name, id) {
  const at = await rowIndex(req, name, id);
  if (!at) return false;
  const { sheetId } = await workspace(req);
  const s = sheets(req);
  const meta = await s.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties(sheetId,title)' });
  const tabId = meta.data.sheets.find(x => x.properties.title === TABLES[name].tab)?.properties.sheetId;
  await s.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId: tabId, dimension: 'ROWS', startIndex: at - 1, endIndex: at } } }] } });
  return true;
}

export async function log(req, por, accion, tabla, ref, resumen) {
  const e = { id: crypto.randomUUID().slice(0, 12), fecha: new Date().toISOString(), por, accion, tabla, ref, resumen: String(resumen || '').slice(0, 500) };
  const { sheetId } = await workspace(req);
  await sheets(req).spreadsheets.values.append({
    spreadsheetId: sheetId, range: 'Bitacora!A1', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [TABLES.bitacora.cols.map(c => toCell(c, e[c]))] }
  });
  return e;
}
