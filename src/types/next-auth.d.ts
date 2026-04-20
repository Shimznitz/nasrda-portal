// src/types/next-auth.d.ts
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      staffNo: string;
      role: "SUPER_ADMIN" | "CENTRE_ADMIN" | "STAFF";
      designation?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    staffNo: string;
    role: "SUPER_ADMIN" | "CENTRE_ADMIN" | "STAFF";
    designation?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "SUPER_ADMIN" | "CENTRE_ADMIN" | "STAFF";
    staffNo: string;
  }
}