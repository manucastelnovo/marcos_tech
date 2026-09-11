import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { env } from "../env";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * A real bcrypt hash of a value nobody knows. When the email does not exist we
 * still run a comparison against it, so a wrong email and a wrong password take
 * the same time. Without this, response timing tells an attacker which of the
 * shop's emails are real.
 */
const DECOY_HASH = "$2b$12$Cwf7Ck8zaHXsFA9Xy1H0deU8N4Q9NB6IHnEB0mA0m2qXKu7ZTgS0G";

const TWELVE_HOURS = 60 * 60 * 12;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  // JWT sessions: no database round-trip on every page, and no adapter needed.
  session: { strategy: "jwt", maxAge: TWELVE_HOURS },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findFirst({
          where: { email: email.toLowerCase(), isActive: true, deletedAt: null },
        });

        if (!user) {
          await bcrypt.compare(password, DECOY_HASH);
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
