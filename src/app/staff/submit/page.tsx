// src/app/staff/submit/page.tsx
'use client';

import "./submit.css";
import { useState } from "react";

export default function SubmitWork() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !description) return;

    setSubmitting(true);

    // Simulate submission
    setTimeout(() => {
      alert("Work submitted successfully! (Demo)");
      setFile(null);
      setDescription("");
      setSubmitting(false);
    }, 1500);
  };

  return (
    <div className="submit-page">
      <div className="page-header">
        <h1>Submit Work</h1>
        <p>Upload your deliverables or progress report</p>
      </div>

      <div className="submit-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project</label>
            <select className="select-input">
              <option>Propulsion System Upgrade</option>
              <option>Satellite Ground Station Maintenance</option>
            </select>
          </div>

          <div className="form-group">
            <label>Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what you are submitting..."
              rows={5}
            />
          </div>

          <div className="form-group">
            <label>Upload File</label>
            <div className="file-upload-area">
              <input
                type="file"
                onChange={handleFileChange}
                id="file-upload"
                className="hidden"
              />
              <label htmlFor="file-upload" className="upload-label">
                {file ? file.name : "Click to select file or drag & drop"}
              </label>
            </div>
          </div>

          <button type="submit" disabled={submitting || !file || !description} className="submit-btn">
            {submitting ? "Submitting..." : "Submit Work"}
          </button>
        </form>
      </div>
    </div>
  );
}