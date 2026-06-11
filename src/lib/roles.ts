// src/lib/roles.ts

export const ROLES = {
  DG: 'DG',
  ADMIN: 'ADMIN',
  DEPT_ADMIN: 'DEPT_ADMIN',
  CENTRE_ADMIN: 'CENTRE_ADMIN',
  LAB_ADMIN: 'LAB_ADMIN',
  DIV_HEAD: 'DIVISION_HEAD',
  UNIT_HEAD: 'UNIT_HEAD',
  STAFF: 'STAFF'
} as const; // 'as const' makes these literal types