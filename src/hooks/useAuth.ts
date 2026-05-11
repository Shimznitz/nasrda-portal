// src/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (!authUser || !mounted) return;

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (mounted) {
          setUser(authUser);
          setProfile(prof);
        }
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUser();

    return () => { mounted = false; };
  }, []);

  return { user, profile, loading };
}