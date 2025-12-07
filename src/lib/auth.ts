import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { ensureMasterUser } from "@/lib/ensureMaster";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile } from "@prisma/client";

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
            profile: true,
            password: true,
            ownerId: true,
            seniorId: true,
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
          profile: user.profile,
          ownerId: user.ownerId ?? null,
          seniorId: user.seniorId ?? null,
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
            profile?: Profile;
            ownerId?: string | null;
            seniorId?: string | null;
            officeIds?: Office[];
          };
          token.id = typedUser.id;
          if (typedUser.role) {
            token.role = typedUser.role;
          }
          if (typedUser.profile) {
            token.profile = typedUser.profile;
          }
          if (typedUser.ownerId) {
            token.ownerId = typedUser.ownerId;
          }
          if (typedUser.seniorId) {
            token.seniorId = typedUser.seniorId;
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
          const profile = token.profile as Profile | undefined;
          const ownerId = token.ownerId as string | undefined;
          const seniorId = token.seniorId as string | undefined;
          const officeIds = token.officeIds as Office[] | undefined;
          if (id) session.user.id = id;
          if (role) session.user.role = role;
          if (profile) session.user.profile = profile;
          if (ownerId) session.user.ownerId = ownerId;
          if (seniorId) session.user.seniorId = seniorId;
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
