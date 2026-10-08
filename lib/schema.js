// Pestañas de la Hoja de cálculo y sus columnas. Agregar una columna al final es seguro:
// la app la añade sola al encabezado la próxima vez que guarda.
const firma = ['creado', 'creadoPor', 'actualizado', 'actualizadoPor'];

export const TABLES = {
  clientes: { tab: 'Clientes', cols: ['id', 'nombre', 'tipo', 'documento', 'contacto', 'correo', 'telefono', 'notas', 'portal', ...firma] },
  polizas: { tab: 'Polizas', cols: ['id', 'numero', 'aseguradora', 'ramo', 'modalidad', 'clienteId', 'vigenciaDesde', 'vigenciaHasta', 'prima', 'frecuencia', 'suma', 'cancelada', 'notas', 'asegurados', 'docs', ...firma] },
  tramites: { tab: 'Tramites', cols: ['id', 'codigo', 'tipo', 'clienteId', 'polizaId', 'aseguradora', 'asunto', 'descripcion', 'canal', 'etapa', 'numeroReclamo', 'monto', 'fechaSolicitud', 'fechaIngreso', 'responsable', 'visibleCliente', 'notaCliente', 'docs', 'eventos', 'gmailId', ...firma, 'asegurado', 'certificado', 'paciente', 'parentesco'] },
  pagos: { tab: 'Pagos', cols: ['id', 'tramiteId', 'clienteId', 'aseguradora', 'forma', 'numero', 'banco', 'monto', 'fechaAviso', 'fechaRecogido', 'fechaEntregado', 'entregadoA', 'folio', 'estado', 'notas', ...firma] },
  correos: { tab: 'Correos', cols: ['id', 'estado', 'nota', 'tramiteId', ...firma] },
  bitacora: { tab: 'Bitacora', cols: ['id', 'fecha', 'por', 'accion', 'tabla', 'ref', 'resumen'] },
  // Preferencias compartidas (p. ej. remitentes de confianza de la Bandeja)
  ajustes: { tab: 'Ajustes', cols: ['id', 'valor', ...firma] },
  // Gmail conectados para la Bandeja. El token va cifrado y la app nunca lo manda al navegador.
  conexiones: { tab: 'Conexiones', cols: ['id', 'tipo', 'cuenta', 'token', 'por', 'fecha'] }
};

export const JSON_COLS = new Set(['asegurados', 'docs', 'eventos']);
export const BOOL_COLS = new Set(['cancelada', 'visibleCliente']);
export const NUM_COLS = new Set(['prima', 'suma', 'monto']);

export function toCell(k, v) {
  if (JSON_COLS.has(k)) return JSON.stringify(v ?? []);
  if (BOOL_COLS.has(k)) return !!v;
  if (NUM_COLS.has(k)) return v === '' || v == null || isNaN(+v) ? '' : +v;
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 45000);
}

export function fromCell(k, v) {
  if (JSON_COLS.has(k)) { try { return v ? JSON.parse(v) : []; } catch { return []; } }
  if (BOOL_COLS.has(k)) return v === true || v === 'TRUE' || v === 'true';
  return v ?? '';
}
