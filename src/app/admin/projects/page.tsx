// src/app/admin/projects/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('created_by', user?.id);

    setProjects(data || []);
  };

  return (
    <div className="admin-projects">
      <h1>My Projects</h1>

      <div className="project-grid">
        {projects.map(p => (
          <div
            key={p.id}
            className="project-card"
            onClick={() => router.push(`/admin/projects/${p.id}`)}
          >
            <h3>{p.title}</h3>
            <p>{p.objectives}</p>
          </div>
        ))}
      </div>
    </div>
  );
}