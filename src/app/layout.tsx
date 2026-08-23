// src/app/layout.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isMounted) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (isMounted) {
          setIsAdmin(profile?.role === 'admin');
        }
      }
    };

    checkUser();

    // Listen for auth state changes cleanly
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        checkUser();
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe(); // Cleans up orphaned listeners/locks
    };
  }, []);

  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          {isAdmin && <Link href="/admin/projects/create">Create Project</Link>}
        </nav>
        {children}
      </body>
    </html>
  );
}