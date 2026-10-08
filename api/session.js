// Quién está conectado y el estado de Google. La app lo pide al arrancar.
import { CLIENT_ID, REFRESH_TOKEN, missingEnv, workspace, tokenInfo } from '../lib/google.js';
import { currentUser, users } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const missing = missingEnv();
  const user = missing.length ? null : currentUser(req);
  const out = { configured: !missing.length, missing, clientId: CLIENT_ID(), user, users: user ? users() : [], google: { connected: !!REFRESH_TOKEN() } };
  if (user && REFRESH_TOKEN()) {
    try {
      const ws = await workspace(req);
      out.google.sheetUrl = `https://docs.google.com/spreadsheets/d/${ws.sheetId}/edit`;
      out.google.folderUrl = `https://drive.google.com/drive/folders/${ws.root}`;
      const info = await tokenInfo(req);
      out.google.account = info.email;
      out.google.gmail = info.scopes.some(s => s.includes('gmail'));
    } catch (e) { out.google.error = e.message; }
  }
  res.json(out);
}
