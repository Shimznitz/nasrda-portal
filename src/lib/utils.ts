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


export function displayName(profile?: { title?: string | null; name?: string | null } | null): string {
  if (!profile) return '—';
  const parts = [profile.title, profile.name].filter(Boolean);
  return parts.join(' ') || '—';
}

// First name with title for greetings: "Dr. John" or "John"
export function getFirstName(name?: string | null, title?: string | null): string {
  if (!name) return 'User';
  const firstName = name.trim().split(/\s+/)[0];
  return title ? `${title} ${firstName}` : firstName;
}