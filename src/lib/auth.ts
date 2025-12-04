import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { ensureMasterUser } from "@/lib/ensureMaster";
import { prisma } from "@/lib/prisma";
import { Escritorio, Role } from "@prisma/client";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            passwordHash: true,
            mustResetPassword: true,
            isBlocked: true,
            escritorio: true,
          },
        });
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
          isBlocked: user.isBlocked,
          escritorio: user.escritorio,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as {
          id: string;
          role?: Role;
          mustResetPassword?: boolean;
          isBlocked?: boolean;
          escritorio?: Escritorio | null;
        };
        token.id = typedUser.id;
        if (typedUser.role) {
          token.role = typedUser.role;
        }
        token.mustResetPassword = Boolean(typedUser.mustResetPassword);
        token.isBlocked = Boolean(typedUser.isBlocked);
        if (typedUser.escritorio) {
          token.escritorio = typedUser.escritorio;
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
        session.user.mustResetPassword = Boolean(token.mustResetPassword);
        session.user.isBlocked = Boolean(token.isBlocked);
        if (token.escritorio) {
          session.user.escritorio = token.escritorio;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const authHandler = NextAuth(authOptions);
