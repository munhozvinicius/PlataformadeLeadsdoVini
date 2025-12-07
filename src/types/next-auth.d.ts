import { Role, Office } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    profile?: Profile;
    office?: Office | null;
    officeIds?: Office[];
    ownerId?: string | null;
    seniorId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: Role;
      profile?: Profile;
      office?: Office | null;
      officeIds?: Office[];
      ownerId?: string | null;
      seniorId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    profile?: Profile;
    office?: Office | null;
    officeIds?: Office[];
    ownerId?: string | null;
    seniorId?: string | null;
  }
}
