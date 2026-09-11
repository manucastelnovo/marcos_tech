# Despliegue de MarcosTech

Desde una cuenta de Vercel vacía hasta un local que puede recibir un equipo, en
unos cuarenta minutos. Seguir los pasos en orden: varios dependen del anterior.

El destino es Vercel para la aplicación, Neon para PostgreSQL y Vercel Blob para
las fotos de las reparaciones. Cualquier PostgreSQL y cualquier almacenamiento
compatible con S3 servirían; este es el camino con menos piezas móviles.

---

## Antes de empezar

- Una cuenta de GitHub, con la CLI `gh` o la interfaz web.
- Una cuenta de Vercel; alcanza el plan gratuito.
- Una cuenta de Neon; alcanza el plan gratuito.
- Node 22 o superior en la máquina local, para correr el seed y el script de
  contraseñas.

---

## 1. Subir el código a GitHub

Hoy existe un solo commit inicial, así que toda la aplicación está sin
versionar. Primero hay que confirmar que los secretos no están por publicarse:

```bash
git check-ignore -v .env .env.test
```

Ambos tienen que imprimir una línea. Si alguno no lo hace, **detenerse** y
corregir `.gitignore` antes de commitear nada: `.env` contiene la contraseña de
la base de datos y el secreto de sesión.

Después, commitear y subir:

```bash
git add .
git commit -m "feat: repair shop management system"
gh repo create marcostech --private --source=. --push
```

Usar `--private`. Este repositorio contiene las reglas de negocio del local, y
las contraseñas del seed están escritas en el README.

---

## 2. Crear la base de datos

En Neon, crear un proyecto. Elegir la región más cercana a Paraguay, que suele
ser `aws-sa-east-1` en São Paulo. La latencia hasta el mostrador es lo que
siente el vendedor mientras escribe.

Copiar la cadena de conexión **directa**, la que no lleva `-pooler` en el host.
Se ve así:

```
postgresql://usuario:contraseña@ep-algo.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

### Por qué la directa y no la pooled

Las migraciones toman advisory locks, que un pooler en modo transacción no
soporta, así que `prisma migrate deploy` falla contra el host pooled. Para un
local con tres personas la conexión directa también es perfectamente adecuada
en tiempo de ejecución.

Si esto alguna vez crece a muchos usuarios concurrentes, ese es el momento de
agregar una URL pooled aparte para las consultas y dejar la directa para las
migraciones. No es el momento ahora, y adivinarlo temprano no aporta nada.

---

## 3. Crear el proyecto en Vercel

Importar el repositorio de GitHub en Vercel. Detecta Next.js por su cuenta. Hay
que cambiar una sola cosa antes de desplegar:

**Settings → Build & Development Settings → Build Command**, sobrescribir con:

```
npm run db:deploy && npm run build
```

Esto ejecuta `prisma migrate deploy` antes de compilar, de modo que el esquema
siempre queda en línea con el código que se está desplegando. Si una migración
falla, el despliegue falla y la versión anterior sigue sirviendo. Ese es el
comportamiento deseado.

Dejar Install y Output en sus valores por defecto. El script `postinstall` de
`package.json` regenera el cliente de Prisma durante la instalación, algo que
importa porque el cliente generado está en `.gitignore` y por lo tanto no
existe en un clon nuevo.

Configurar **Settings → Functions → Region** en `gru1` (São Paulo) para que la
aplicación corra al lado de la base de datos y no a un continente de distancia.

---

## 4. Variables de entorno

En **Settings → Environment Variables**, agregar estas para Production:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La cadena directa de Neon del paso 2 |
| `AUTH_SECRET` | Uno nuevo, generado abajo |
| `NEXT_PUBLIC_APP_URL` | La URL de producción, ver la nota siguiente |
| `BLOB_READ_WRITE_TOKEN` | Se agrega solo en el paso 5 |

Generar un secreto de sesión nuevo. No reutilizar el del `.env` local: un
secreto que vivió en una laptop no es un secreto de producción.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### La URL se conoce después del primer despliegue

`NEXT_PUBLIC_APP_URL` se imprime dentro del código QR de cada comprobante, y el
dominio no se conoce hasta que Vercel lo asigna. Entonces:

1. Poner un valor provisorio como `https://marcostech.vercel.app`.
2. Desplegar.
3. Leer el dominio real en el panel de Vercel, o conectar un dominio propio.
4. Corregir la variable y volver a desplegar.

Si se omite el paso 4, la pantalla del comprobante avisa en amarillo antes de
que alguien imprima, y los QR ya impresos no llevan a ningún lado.

---

## 5. Almacenamiento de fotos

En el panel de Vercel, ir a **Storage → Create → Blob**, crear un store y
conectarlo al proyecto. Vercel agrega `BLOB_READ_WRITE_TOKEN` automáticamente.

En producción esto no es opcional. Sin el token la aplicación cae al adaptador
de disco local, que se niega a ejecutarse en producción a propósito: un sistema
de archivos serverless es de solo lectura y efímero, así que las fotos o fallan
al subirse o, peor, parecen guardarse y desaparecen en el despliegue siguiente.

---

## 6. Primer despliegue

Hacer push a `master`, o presionar Redeploy. En el log del build tienen que
aparecer estas tres líneas, en este orden:

- `prisma generate` durante la instalación
- `N migrations found` y `applied` durante el comando de build
- `Compiled successfully`

Si el build se detiene en `Can't resolve '@/generated/prisma/client'`, falta el
script `postinstall` en `package.json`.

Si se detiene en un error de migración, la base de datos no es alcanzable o la
cadena de conexión es la pooled. Volver al paso 2.

---

## 7. Sembrar la base de datos, una sola vez

El seed crea las tres cuentas, el catálogo de equipos, el catálogo de repuestos
y las plantillas de WhatsApp. Se ejecuta desde la máquina local, apuntando a
producción:

```bash
DATABASE_URL="<la cadena directa de Neon>" npm run db:seed
```

Usa upserts, así que ejecutarlo dos veces es inofensivo. Nunca sobrescribe una
contraseña que ya haya sido cambiada.

---

## 8. Cambiar las contraseñas

**Hacer esto antes de que alguien toque el sistema.** Las contraseñas del seed
están escritas en un README que vive en el repositorio.

Todavía no existe una pantalla de administración de usuarios, así que las
contraseñas se cambian desde la línea de comandos:

```bash
DATABASE_URL="<la cadena directa de Neon>" npx tsx prisma/set-password.ts admin@marcostech.py
DATABASE_URL="<la cadena directa de Neon>" npx tsx prisma/set-password.ts vendedor@marcostech.py
DATABASE_URL="<la cadena directa de Neon>" npx tsx prisma/set-password.ts tecnico@marcostech.py
```

El script pregunta dos veces y nunca toma la contraseña como argumento, así que
no queda en el historial de la terminal. Exige al menos diez caracteres.

El procedimiento completo, con los errores comunes, está en
[CONTRASENAS.md](./CONTRASENAS.md).

Agregar un cuarto empleado también requiere la base de datos hoy. Esa carencia
está listada al final de este documento.

---

## 9. Comprobar que realmente funciona

Abrir la URL de producción y recorrer esta lista. Toma cinco minutos y detecta
todo lo que importa.

1. **Ingreso al sistema.** Iniciar sesión como vendedor con la contraseña nueva.
2. **Recepción.** Recibir un equipo de punta a punta. Cronometrarlo en un
   celular. Si toma más de tres minutos, esa pantalla necesita trabajo antes de
   que el local adopte el sistema.
3. **Comprobante.** Imprimirlo. No debe aparecer ningún aviso amarillo encima.
   Escanear el QR con un teléfono sin sesión iniciada: tiene que abrir la página
   de seguimiento y mostrar el estado sin ningún precio.
4. **Fotos.** Adjuntar una foto desde la cámara del celular y confirmar que
   aparece al recargar. Este paso es el que demuestra que el paso 5 está hecho.
5. **Roles.** Iniciar sesión como técnico. No debe haber Caja, Ventas ni
   Reportes en el menú, y `/caja` debe redirigir al panel.
6. **Caja.** Abrir la caja, registrar un cobro, y cerrarla con un conteo
   deliberadamente equivocado. Tiene que registrar la diferencia en lugar de
   rechazar el cierre.
7. **Auditoría.** Como administrador, abrir Auditoría. Todo lo recién hecho
   tiene que estar listado, con el nombre de quien lo hizo.

Si el paso 7 aparece vacío pero los demás funcionaron, algo está escribiendo en
la base de datos por fuera de los casos de uso. Conviene avisar antes de seguir.

---

## Día a día

**Desplegar un cambio.** Hacer push a `master`. Vercel compila, ejecuta las
migraciones nuevas si las hay, y cambia la versión. Una migración fallida
significa un despliegue fallido, y la versión anterior sigue sirviendo.

**Respaldos.** Neon ofrece restauración a un punto en el tiempo en los planes
pagos; el plan gratuito no. El historial de órdenes de un local de reparaciones
no es algo que se pueda perder, así que conviene presupuestar el plan pago o
programar un `pg_dump` a un lugar seguro antes de que el local dependa de esto.

**Volver atrás.** El Instant Rollback de Vercel repone la versión anterior en
segundos, pero no deshace una migración. Si un despliegue incluyó una migración
destructiva, el rollback no salva nada. Por eso cada migración destructiva en
`prisma/migrations/` lleva una guarda que aborta en lugar de avanzar sobre
datos sin verificar.

---

## Carencias conocidas, a cerrar antes o poco después del lanzamiento

- **No hay pantalla de administración de usuarios.** Agregar personal o cambiar
  una contraseña requiere `prisma/set-password.ts` y una conexión a la base.
- **No hay respaldos automáticos** en el plan gratuito de Neon.
- **WhatsApp funciona con enlaces, no con la Business API.** Los mensajes se
  abren prellenados y una persona presiona enviar. Fue una decisión deliberada
  de la Fase 1, no un olvido.
- **Siguen abiertas dos preguntas de negocio con el cliente**: si la mano de
  obra cuenta como costo en la fórmula de rentabilidad, y si el stock negativo
  debe permitirse con aviso o bloquearse. Ambas son cambios de una línea; ver la
  sección de decisiones en `README.md`.
