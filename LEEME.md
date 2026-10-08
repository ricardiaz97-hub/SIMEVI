# SIMEVI · trámites, reclamos, pólizas y pagos

App web para Silvia de Díaz y Ricardo Vega (SIMEVI Corredores de Seguros). Todo se guarda en Google:

| Qué | Dónde queda |
| --- | --- |
| Clientes, pólizas, trámites, pagos, bitácora | Hoja de cálculo **SIMEVI · Base de datos** (una pestaña por tabla) |
| PDFs y fotos | Drive → carpeta **SIMEVI / Documentos / nombre del cliente** |
| Solicitudes, números de reclamo, avisos de cheque | Se leen del **Gmail de trabajo de cada persona** (solo lectura: la app no envía ni borra correos) |

No hay Supabase ni otro servicio de almacenamiento. Vercel solo sirve la app.

## Qué hace

- **Trámites**: reclamos, modificaciones, inclusiones, exclusiones, renovaciones y emisiones. Etapas: Recibido → Ingresado (portal o físico) → Número asignado → En análisis → Pago disponible → Cerrado. Cada trámite guarda documentos, notas y una línea de tiempo con quién hizo cada paso.
- **Pagos**: el libro de cheques y depósitos en digital, con folio del libro físico, quién lo recogió y a quién se entregó. Exporta a CSV.
- **Pólizas** individuales y colectivas, con vigencia, prima, suma asegurada y la lista de asegurados o certificados.
- **Clientes** con un **enlace privado** (`/c/…`) para ver cómo van sus trámites, sin contraseña.
- **Bandeja**: lee Gmail y reconoce solicitudes, números de reclamo y avisos de pago; con un clic los convierte en trámites o pagos y copia los adjuntos a Drive.
- **Bitácora**: cada cambio queda firmado con el nombre de quien lo hizo (el servidor pone el nombre, no el navegador).

## Configuración (una sola vez, unos 20 minutos)

### 1. GitHub
Crea el repositorio `simevi` (privado) y sube todo el contenido de esta carpeta.

### 2. Google Cloud
Puedes usar el mismo proyecto de Arca o uno nuevo.

1. **APIs y servicios → Biblioteca**: habilita **Google Drive API**, **Google Sheets API** y **Gmail API**.
2. **Google Auth Platform → Clientes → Crear cliente → Aplicación web**:
   - *Orígenes de JavaScript autorizados*: `https://TU-DOMINIO` (el de Vercel, sin `/` al final).
   - *URIs de redireccionamiento autorizados*: `https://TU-DOMINIO/api/google/callback`.
   - Guarda el **Client ID** y el **Client secret**.
3. **Google Auth Platform → Público**: pasa la app a **En producción**. En modo *Prueba* el permiso caduca cada 7 días.
   Como la app lee Gmail, Google mostrará la pantalla "Google no verificó esta app": pulsa *Configuración avanzada → Ir a SIMEVI*. Es normal para apps de uso interno con pocas personas.

### 3. Vercel
Importa el repositorio y agrega en **Settings → Environment Variables**:

| Variable | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | el Client ID (termina en `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | el Client secret |
| `SIMEVI_USUARIOS` | `ricardovegaprod@gmail.com:Ricardo Vega, silviavegadediaz@gmail.com:Silvia de Díaz` |
| `SESSION_SECRET` | una frase larga cualquiera (40+ caracteres) |

La primera persona de `SIMEVI_USUARIOS` es quien administra la conexión con Google. Pulsa **Deploy**.

### 4. Conectar Google
Hay dos conexiones distintas:

**Cuenta de datos** (una sola vez, quien administra). Es la cuenta de Google donde se guardan la Hoja y los PDFs, la que tiene más espacio.
1. Entra a la app con tu correo de trabajo y ve a **Ajustes → Conectar cuenta de datos**.
2. En la pantalla de Google elige la cuenta de datos (por ejemplo richigbkd@gmail.com) y acepta.
3. La página final muestra un **token**. Pégalo en Vercel como `GOOGLE_REFRESH_TOKEN`, y el ID que aparece como `SIMEVI_SHEET_ID`. Pulsa **Redeploy**.

**Gmail de cada persona** (cada quien desde su sesión). La Bandeja lee los correos de trabajo de todos los que se conecten.
1. Entra a la app y ve a **Ajustes → Conectar mi Gmail**.
2. Elige tu correo de trabajo y acepta. No hay que pegar nada: el permiso se guarda cifrado en una pestaña oculta de la Hoja.

Google mostrará "Google no verificó esta app": pulsa *Configuración avanzada → Ir a SIMEVI*. Es normal para una app interna.

Si algo no conecta, abre `https://TU-DOMINIO/api/diagnose`: revisa cada paso y dice qué falta, sin mostrar secretos.

## Reclamos de pólizas colectivas (como INJIBOA)

En la pestaña **Reclamos** el orden es **Cliente (la empresa) → Póliza → Asegurado (el empleado) → Paciente** si es un dependiente. En pólizas individuales el asegurado es el mismo cliente.

No hace falta cargar todo antes: si el cliente, la póliza o el empleado no existen, se crean al guardar el reclamo y queda anotado en la bitácora.

**Lectura de PDFs:** en la Bandeja, los correos con PDF tienen el botón **Leer reclamos del PDF**. Google Drive saca el texto del escaneo y la app busca los formularios de reclamo (contratante, póliza, afiliado, certificado, asegurado afectado, parentesco y total). Si el PDF trae varios formularios salen varias filas; lo demás que venga escaneado (recetas, facturas) se ignora. También funciona al adjuntar un PDF en la fila de Reclamos. Google lee hasta unas 10 páginas por PDF.

## Uso diario

1. Llega una solicitud al correo → **Bandeja → Crear trámite**. Los PDFs se copian solos a Drive.
2. Lo ingresas en el portal o lo llevas en físico → en el trámite pulsa **Ingresado**.
3. La aseguradora manda el número → **Bandeja → Poner número** (o escríbelo y pulsa **Número asignado**).
4. Llega el aviso de cheque o depósito → **Bandeja → Registrar pago**. El trámite pasa a *Pago disponible*.
5. Recoges el cheque → **Ya lo recogí**. Lo entregas → **Marcar entregado** y anota el folio del libro. El trámite se cierra solo.
6. Para que el cliente vea su avance: en el cliente, **Copiar enlace** y envíalo por WhatsApp. Solo ve los trámites marcados como visibles y el mensaje que le escribas.

## Límites

- Archivos de hasta 4 MB por subida (límite de Vercel). Los adjuntos de Gmail no tienen ese límite.
- La bandeja muestra los 30 correos más recientes de la búsqueda configurada en **Ajustes → Bandeja** (por ejemplo `label:simevi newer_than:14d`).
- Si los dos editan el mismo trámite al mismo tiempo, gana el último en guardar. La app recarga los datos cada vez que vuelves a la pestaña.
- Puedes abrir la Hoja de cálculo para ver o filtrar datos, pero no cambies los encabezados de la fila 1 ni la columna `id`.

## Para hacer cambios al código

El código de la app está en `src/` (partes numeradas). Después de editar, ejecuta `python3 tools/build.py` (o `npm run unir`), que une las partes en `app.js`, y sube los dos.

```
index.html        estructura y modo ligero
app.css           estilo Vidrio estelar con los colores del logo
src/*.js          la app (datos, pantallas, bandeja, arranque)
api/*.js          funciones de Vercel: sesión, base de datos, Drive, Gmail, portal
lib/*.js          Google, Hoja de cálculo, esquema de tablas y sesión
```
