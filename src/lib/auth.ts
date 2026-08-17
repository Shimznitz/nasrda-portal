// src/lib/auth.ts

import { supabase } from './supabase';

let cachedProfile: any = null;
let lastFetch = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function getProfile(force = false): Promise<any> {
  const now = Date.now();
  if (!force && cachedProfile && now - lastFetch < CACHE_TTL) {
    return cachedProfile;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { cachedProfile = null; return null; }
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  cachedProfile = data;
  lastFetch = now;
  return data;
}

export function clearProfileCache() {
  cachedProfile = null;
  lastFetch = 0;
}