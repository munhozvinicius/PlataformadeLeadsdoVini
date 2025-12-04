import { Role, Office } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    office?: Office | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: Role;
      office?: Office | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    office?: Office | null;
  }
}
