// src/lib/store.ts
// In-memory store for development (no Prisma for now)

export type User = {
  id: string;
  name: string;
  staffNo: string;
  email: string;
  password: string;        // plain text for demo only
  designation: string;
  role: 'SUPER_ADMIN' | 'CENTRE_ADMIN' | 'STAFF';
};

let users: User[] = [
  {
    id: '1',
    name: 'ESS Director',
    staffNo: 'NASRDA/ESS/001',
    email: 'superadmin@nasrda.gov.ng',
    password: 'admin123',
    designation: 'Director, Engineering & Space Systems',
    role: 'SUPER_ADMIN',
  }
];

export const store = {
  users,
};

export default store;