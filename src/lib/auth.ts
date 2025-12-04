import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { ensureMasterUser } from "@/lib/ensureMaster";
import { prisma } from "@/lib/prisma";
import { Office, Role } from "@prisma/client";

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
            password: true,
            ownerId: true,
            offices: { select: { office: true } },
          },
        });
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ownerId: user.ownerId ?? null,
          officeIds: user.offices.map((entry) => entry.office),
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
            ownerId?: string | null;
            officeIds?: Office[];
          };
          token.id = typedUser.id;
          if (typedUser.role) {
            token.role = typedUser.role;
          }
          if (typedUser.ownerId) {
            token.ownerId = typedUser.ownerId;
          }
          if (typedUser.officeIds) {
            token.officeIds = typedUser.officeIds;
          }
        }
        return token;
      },
    async session({ session, token }) {
        if (session.user) {
          const id = token.id as string | undefined;
          const role = token.role as Role | undefined;
          const ownerId = token.ownerId as string | undefined;
          const officeIds = token.officeIds as Office[] | undefined;
          if (id) session.user.id = id;
          if (role) session.user.role = role;
          if (ownerId) session.user.ownerId = ownerId;
          if (officeIds) session.user.officeIds = officeIds;
        }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const authHandler = NextAuth(authOptions);
