// src/app/staff/submit/page.tsx
'use client';

import "./submit.css";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function SubmitWork() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, title");
    setProjects(data || []);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);

    // preview (images + pdf fallback icon)
    setPreviewUrl(URL.createObjectURL(f));
  };

  const uploadFile = async () => {
    if (!file) return null;

    const filePath = `${selectedProject}/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from("submissions")
      .upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from("submissions")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !description || !selectedProject) return;

    setSubmitting(true);

    try {
      const fileUrl = await uploadFile();

      const { data: userData } = await supabase.auth.getUser();

      const user = userData?.user;

      // 1. create submission
      const { error } = await supabase.from("submissions").insert({
        project_id: selectedProject,
        submitted_by: user?.id,
        description,
        file_url: fileUrl,
      });

      if (error) throw error;

      // 2. notification for admin/creator
      const { data: project } = await supabase
        .from("projects")
        .select("created_by")
        .eq("id", selectedProject)
        .single();

      if (project?.created_by) {
        await supabase.from("notifications").insert({
          user_id: project.created_by,
          title: "New Submission",
          body: "A task has been submitted for review",
          type: "submission",
          read: false,
          link: `/admin/submissions`,
        });
      }

      alert("Work submitted successfully");

      setFile(null);
      setDescription("");
      setSelectedProject("");
      setPreviewUrl(null);
    } catch (err: any) {
      alert(err.message);
    }

    setSubmitting(false);
  };

  return (
    <div className="submit-page">
      <div className="submit-card">
        <h1>Submit Work</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              required
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="What did you do?"
              required
            />
          </div>

          <div className="form-group">
            <label>File</label>
            <input type="file" onChange={handleFileChange} />

            {previewUrl && (
              <div className="preview-box">
                {file?.type.startsWith("image") ? (
                  <img src={previewUrl} />
                ) : (
                  <a href={previewUrl} target="_blank">
                    Preview File
                  </a>
                )}
              </div>
            )}
          </div>

          <button disabled={submitting} type="submit">
            {submitting ? "Submitting..." : "Submit Work"}
          </button>
        </form>
      </div>
    </div>
  );
}