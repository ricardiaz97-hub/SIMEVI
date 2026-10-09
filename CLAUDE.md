# SIMEVI · ficha para Claude

App de trámites de SIMEVI Corredores de Seguros (San Salvador). Usuarios: Silvia de Díaz (silviavegadediaz@gmail.com) y Ricardo Vega (ricardovegaprod@gmail.com, administra). Ricardo habla en español; responde en español, corto y claro.

## Dónde vive
- App: https://simevi.vercel.app (Vercel publica solo al hacer push a `main` de github.com/ricardiaz97-hub/SIMEVI).
- Datos: Hoja de Google "SIMEVI · Base de datos" + carpeta SIMEVI/Documentos en el Drive de richigbkd@gmail.com (cuenta de datos, token en `GOOGLE_REFRESH_TOKEN`).
- Gmail: cada persona conecta el suyo (solo lectura), guardado cifrado en la pestaña oculta Conexiones.
- Variables en Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, SIMEVI_SHEET_ID, SIMEVI_USUARIOS, SESSION_SECRET. Nunca escribir secretos en el código ni en el chat.

## Cómo está hecho
- Frontend sin framework: `src/*.js` en orden numérico → `python3 tools/build.py` los une en `app.js` (subir los dos). `app.css`, `index.html`, `icons.svg` (Phosphor).
- Demo de un solo archivo: `python3 tools/build.py --demo <salida.html> --artifact` (datos de ejemplo en `src/02-data.js`, clave `DEMO_KEY`; súbela de versión si cambias el seed).
- Backend: funciones Vercel en `api/` (máximo 12 en el plan Hobby; rutas extra van en `lib/rutas/` con rewrites en `vercel.json`). `lib/schema.js` = columnas de cada pestaña (agregar al final es seguro).
- OCR: `lib/ocr.js` convierte PDF/fotos/Word a Google Doc (Excel a Sheet) y exporta el texto.
- Probar: Playwright con `/opt/pw-browsers/chromium` sobre la demo.

## Partes de la app
- `04a-formularios.js` lee formularios de reclamo de SISA (CONTRATANTE / PÓLIZA / AFILIADO / CERTIFICADO / ASEGURADO / TOTAL); siglas de clientes (INJIBOA ↔ Ingenio Central Azucarero Jiboa); `polizaPorNumero` acepta "507549" por SALC-507549.
- `04b-reclamos.js` pestaña Reclamos (Cliente → Póliza → Asegurado → Paciente), botón "Ingresar en línea" (solo SISA).
- `04c-documentos.js` lee cualquier adjunto (inclusión, exclusión, beneficiarios, renovación, liquidación, factura, DUI) y propone trámites.
- `05b-personas.js` base de personas armada de pólizas + reclamos; autocompletar.
- `06-bandeja.js` Bandeja, remitentes, dominios de aseguradoras, Ajustes. `06b-varios.js` varios reclamos por correo y "Lo que dicen los adjuntos". `06c-auto.js` procesamiento automático (avisos de SISA, correos de mbonilla@injiboa.com.sv, respuestas en conversación). `06d-reporte.js` reporte de ingresados (PDF, imagen, Gmail, CSV).

## Decisiones tomadas
- Diseño "Vidrio estelar" con dorado #C9A063 sobre azul marino; sin decoración griega.
- Colectivas: empresa → empleado → paciente. No hace falta crear clientes antes de un reclamo (se crean al guardar).
- Lo automático solo toca correos llegados después de `auto-desde`; lo dudoso queda "Para revisar".
- Transferencia notificada cierra el trámite (pendiente de confirmar con Ricardo).

## Pendiente
- Probar con correos/PDF reales de inclusión, exclusión, beneficiarios y carta de liquidación y ajustar lo que lea mal.
- Que Silvia conecte su Gmail. Importar la lista de clientes existente (Excel / hoja "RECLAMOS").
