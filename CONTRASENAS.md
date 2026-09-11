# Cambiar contraseñas

Todavía no existe una pantalla de administración de usuarios, así que las
contraseñas se cambian desde la línea de comandos con
`prisma/set-password.ts`.

Hay un caso urgente y uno rutinario. El urgente es antes de abrir el local: las
tres cuentas que crea el seed tienen contraseñas escritas en el `README.md`, o
sea publicadas en el repositorio. El rutinario es cuando alguien se olvida la
suya o deja de trabajar en el local.

---

## Lo primero: saber a qué base vas a apuntar

El script cambia la contraseña en **la base de datos a la que apunte
`DATABASE_URL`**. No hay confirmación ni pregunta. Antes de correrlo, conviene
mirar contra qué está conectado:

```bash
node -e "require('dotenv').config(); console.log(new URL(process.env.DATABASE_URL).hostname)"
```

- Si imprime `localhost`, vas a cambiar la contraseña en tu base local.
- Si imprime algo terminado en `.aws.neon.tech`, vas a cambiarla en producción.

Las dos cosas son válidas. Lo que no querés es creer que estás en una y estar
en la otra.

---

## Cambiar una contraseña

```bash
npx tsx prisma/set-password.ts admin@marcostech.py
```

El script pide la contraseña dos veces y no la muestra como argumento, así que
no queda en el historial de la terminal.

Si querés apuntar a producción sin tocar tu `.env`, pasá la cadena de conexión
en la misma línea:

```bash
DATABASE_URL="<la cadena directa de Neon>" npx tsx prisma/set-password.ts admin@marcostech.py
```

---

## Las tres cuentas del seed

Estas son las que hay que cambiar antes de que el local empiece a usar el
sistema:

```bash
npx tsx prisma/set-password.ts admin@marcostech.py
npx tsx prisma/set-password.ts vendedor@marcostech.py
npx tsx prisma/set-password.ts tecnico@marcostech.py
```

Después de cambiarlas, las contraseñas que figuran en el `README.md` dejan de
servir. Eso es exactamente lo que buscás. Volver a correr el seed no las
restaura: el seed solo crea usuarios que no existen y nunca pisa una contraseña
ya cambiada.

---

## Qué valida el script

- **Que el usuario exista.** Si el email no está en la base, avisa y no hace
  nada.
- **Que las dos escrituras coincidan.** Si no, no cambia nada.
- **Que tenga al menos diez caracteres.** Si es más corta, no cambia nada.

En los tres casos termina con error y la contraseña vieja sigue funcionando. No
hay estado intermedio.

---

## Si algo sale mal

**"No existe ningún usuario con el email ..."**
El email está mal escrito, o estás apuntando a la base equivocada. Volvé al
primer paso de este documento.

**"Entrada incompleta. No se cambió nada."**
Cortaste el script antes de escribir las dos veces, o lo estás alimentando por
una tubería que se quedó sin líneas. Corrolo interactivamente.

**Cambiaste la contraseña y no podés entrar.**
Verificá que cambiaste la cuenta de la base correcta. Es el error más común:
cambiar en local y después intentar entrar en producción.

---

## Lo que todavía no se puede

**Agregar un empleado nuevo.** Hoy requiere insertar el usuario directamente en
la base. Cuando el local contrate a alguien, va a hacer falta una pantalla de
administración de usuarios, o al menos un segundo script.

**Que el propio usuario cambie su contraseña.** Tampoco existe. Todo pasa por
quien tenga acceso a la línea de comandos y a la base.

Las dos carencias están listadas en `DEPLOY.md`.
