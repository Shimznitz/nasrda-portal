// src/lib/utils.ts

export function initials(name?: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatRole(role?: string): string {
  return role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';
}

export function getFirstName(name?: string): string {
  if (!name) return 'User';
  return name.trim().split(/\s+/)[0];
}