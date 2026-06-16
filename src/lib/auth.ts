import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const customerLoginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.passwordHash || !user.active) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
    CredentialsProvider({
      id: "customer-credentials",
      name: "customer",
      credentials: {
        identifier: { label: "Telefone ou Email", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = customerLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const identifier = parsed.data.identifier.trim();
        const customer = await prisma.customer.findFirst({
          where: {
            OR: [{ phone: identifier }, { email: identifier }],
            active: true,
          },
        });

        if (!customer || !customer.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, customer.passwordHash);
        if (!valid) return null;

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          role: "CUSTOMER",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
        const u = user as { phone?: string };
        if (u.phone) token.phone = u.phone;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        if (token.phone) {
          (session.user as { phone?: string }).phone = token.phone as string;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
