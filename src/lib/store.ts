// src/lib/store.ts

import { ROLES } from './roles';
export type User = {
  id: string;
  name: string;
  staffNo: string;
  email: string;
  password: string;
  designation: string;
  // Use the roles that actually exist in your Supabase Enum
  role: typeof ROLES[keyof typeof ROLES];
};

let users: User[] = [
  {
    id: '1',
    name: 'ESS Director',
    staffNo: 'NASRDA/ESS/001',
    email: 'admin@nasrda.gov.ng',
    password: 'admin123',
    designation: 'Director, Engineering & Space Systems',
    role: ROLES.DG, // Updated from SUPER_ADMIN
  }
];

export const store = { users };
export default store;