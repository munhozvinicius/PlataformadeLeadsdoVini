import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { ensureMasterUser } from "@/lib/ensureMaster";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await ensureMasterUser();

        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as { id: string; role?: Role };
        token.id = typedUser.id;
        if (typedUser.role) {
          token.role = typedUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const id = token.id as string | undefined;
        const role = token.role as Role | undefined;
        if (id) session.user.id = id;
        if (role) session.user.role = role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const authHandler = NextAuth(authOptions);
