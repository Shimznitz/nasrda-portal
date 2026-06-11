// src/app/layout.tsx

'use client'; // Required to use hooks
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setIsAdmin(profile?.role === 'admin');
      }
    };
    checkUser();
  }, []);

  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          <Link href="/staff/projects">Dashboard</Link>
          {isAdmin && <Link href="/admin/projects/create">Create Project</Link>}
        </nav>
        {children}
      </body>
    </html>
  );
}