import "dotenv/config";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Sets a user's password from the command line.
 *
 * There is no user-administration screen yet, and going live with the seeded
 * passwords published in the README is not an option. Run this against the
 * production database once, for each account, before the shop opens.
 *
 *   npx tsx prisma/set-password.ts admin@marcostech.py
 *
 * The password is read from a prompt, never from an argument, so it does not
 * end up in the shell history.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MIN_LENGTH = 10;

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("Uso: npx tsx prisma/set-password.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true, role: true },
  });

  if (!user) {
    console.error(`No existe ningún usuario con el email ${email}`);
    process.exit(1);
  }

  const [password, confirmation] = await ask([
    `Nueva contraseña para ${user.fullName} (${user.role}): `,
    "Repetila: ",
  ]);

  if (password !== confirmation) {
    console.error("Las contraseñas no coinciden. No se cambió nada.");
    process.exit(1);
  }

  if (password.length < MIN_LENGTH) {
    console.error(`La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`Listo. La contraseña de ${user.email} quedó cambiada.`);
}

/**
 * Reads one line per prompt, working the same whether a person is typing or the
 * input is piped in. Running out of input is an error rather than a silent
 * exit, so a half-finished run never looks like a successful one.
 */
async function ask(prompts: string[]): Promise<string[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });

  const iterator = rl[Symbol.asyncIterator]();
  const answers: string[] = [];

  try {
    for (const prompt of prompts) {
      process.stdout.write(prompt);
      const next = await iterator.next();
      if (next.done) throw new Error("\nEntrada incompleta. No se cambió nada.");
      answers.push(next.value.trim());
    }
  } finally {
    rl.close();
  }

  return answers;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
