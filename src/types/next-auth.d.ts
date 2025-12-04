import { Role, Escritorio } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    mustResetPassword: boolean;
    isBlocked: boolean;
    escritorio: Escritorio | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: Role;
      mustResetPassword?: boolean;
      isBlocked?: boolean;
      escritorio?: Escritorio | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustResetPassword?: boolean;
    isBlocked?: boolean;
    escritorio?: Escritorio | null;
  }
}
