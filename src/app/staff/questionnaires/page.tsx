// src/app/staff/questionnaires/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./questionnaires.css";

export default function QuestionnairesPage() {
  const [questionnaires, setQuestionnaires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
  setLoading(true);

  // Get questionnaires
  const { data: questionnairesData, error } = await supabase
    .from('questionnaires')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    setLoading(false);
    return;
  }

  // Fetch creator for each questionnaire
  const merged = await Promise.all(
    (questionnairesData || []).map(async (q) => {

      const { data: creator, error: creatorError } = await supabase
        .from('profiles')
        .select('id, name, designation')
        .eq('id', q.created_by)
        .single();

      if (creatorError) {
        console.error("Creator fetch error:", creatorError);
      }

      return {
        ...q,
        creator,
      };
    })
  );

  console.log("Merged questionnaires:", merged);

  setQuestionnaires(merged);
  setLoading(false);
};

  return (
  <div className="questionnaires-page">
    <div className="page-header">
      <div>
        <h1>Internal Questionnaires</h1>
        <p>Manage and track internal surveys and feedback</p>
      </div>
      <button className="btn primary" onClick={() => setShowCreateModal(true)}>
        + Create New Questionnaire
      </button>
    </div>

    {loading ? (
      <p className="loading-text">Loading questionnaires...</p>
    ) : questionnaires.length === 0 ? (
      <div className="empty-state">
        <p>No questionnaires yet. Create your first one.</p>
      </div>
    ) : (
      <div className="questionnaires-grid">
        {questionnaires.map((q: any) => (
          <div key={q.id} className="questionnaire-card">
            <div className="card-header">
              <h3>{q.title}</h3>
              <span className={`status-badge ${q.due_date && new Date(q.due_date) < new Date() ? 'expired' : 'active'}`}>
                {q.due_date ? new Date(q.due_date).toLocaleDateString() : 'No due date'}
              </span>
            </div>

            <p className="description">
              {q.description || 'No description provided.'}
            </p>

            <div className="card-meta">
  <div>
    <strong>{q.creator?.name || 'Unknown'}</strong>
    {q.creator?.designation && ` • ${q.creator.designation}`}
  </div>
  <small>Questions: {Array.isArray(q.questions) ? q.questions.length : 0}</small>
</div>

            <div className="card-footer">
              <button className="view-btn">View Results</button>
            </div>
          </div>
        ))}
      </div>
    )}

    {showCreateModal && <CreateQuestionnaireModal onClose={() => setShowCreateModal(false)} onCreated={loadData} />}
  </div>
);
}

// =============================================
// CREATE QUESTIONNAIRE MODAL
// =============================================
function CreateQuestionnaireModal({ onClose, onCreated }: any) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    target_type: 'all',
    target_search: '',
  });

  const [questions, setQuestions] = useState<any[]>([
    { id: 1, type: 'short', question: '', required: true, options: [] }
  ]);

  const [saving, setSaving] = useState(false);

  const addQuestion = () => {
    setQuestions([...questions, { 
      id: Date.now(), 
      type: 'short', 
      question: '', 
      required: true, 
      options: [] 
    }]);
  };

  const updateQuestion = (id: number, field: string, value: any) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const removeQuestion = (id: number) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter(q => q.id !== id));
  };

  const addOption = (qId: number) => {
  setQuestions(questions.map(q => 
    q.id === qId 
      ? { ...q, options: [...(q.options || []), ''] } 
      : q
  ));
};

const updateOption = (qId: number, index: number, value: string) => {
  setQuestions(questions.map(q => {
    if (q.id === qId) {
      const newOptions = [...(q.options || [])];
      newOptions[index] = value;
      return { ...q, options: newOptions };
    }
    return q;
  }));
};

const removeOption = (qId: number, index: number) => {
  setQuestions(questions.map(q => {
    if (q.id === qId) {
      const newOptions = (q.options || []).filter((_: string, i: number) => i !== index);
      return { ...q, options: newOptions };
    }
    return q;
  }));
};;

  const handleCreate = async () => {
    if (!form.title.trim()) {
      alert("Questionnaire title is required!");
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("You must be logged in");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('questionnaires')
      .insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        target_type: form.target_type,
        created_by: user.id,
        questions: questions,
      });

    setSaving(false);

    if (error) {
      console.error(error);
      alert("Failed to create questionnaire. Please try again.");
    } else {
      alert("✅ Questionnaire created successfully!");
      onCreated();
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large questionnaire-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Questionnaire</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-section">
          <input 
            type="text" 
            className="title-input" 
            placeholder="Questionnaire Title" 
            value={form.title} 
            onChange={(e) => setForm({...form, title: e.target.value})} 
          />

          <textarea 
            className="description-input" 
            placeholder="Description (optional)" 
            value={form.description} 
            onChange={(e) => setForm({...form, description: e.target.value})} 
          />

          <div className="form-row">
            <div className="form-group">
              <label>Due Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={form.due_date} 
                onChange={(e) => setForm({...form, due_date: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label>Target Audience</label>
              <select 
                className="input-field" 
                value={form.target_type} 
                onChange={(e) => setForm({...form, target_type: e.target.value})}
              >
                <option value="all">All Staff</option>
                <option value="centre">Specific Centre / Lab</option>
                <option value="division">Specific Division</option>
                <option value="unit">Specific Unit</option>
              </select>
            </div>
          </div>
        </div>

        <div className="questions-section">
          <h3>Questions ({questions.length})</h3>
          
          {questions.map((q, index) => (
            <div key={q.id} className="question-block">
              <div className="question-header">
                <span className="question-number">Q{index + 1}</span>
                <select 
                  value={q.type} 
                  onChange={(e) => updateQuestion(q.id, 'type', e.target.value)}
                  className="question-type"
                >
                  <option value="short">Short Answer</option>
                  <option value="paragraph">Paragraph</option>
                  <option value="multiple">Multiple Choice</option>
                  <option value="checkbox">Checkboxes</option>
                </select>
                <button className="remove-q-btn" onClick={() => removeQuestion(q.id)}>Remove</button>
              </div>

              <input 
                type="text" 
                className="question-input" 
                placeholder="Enter your question here..." 
                value={q.question} 
                onChange={(e) => updateQuestion(q.id, 'question', e.target.value)} 
              />

              {(q.type === 'multiple' || q.type === 'checkbox') && (
                <div className="options-section">
                  <p className="options-label">Options:</p>
                  {(q.options || []).map((opt: string, i: number) => (
                    <div key={i} className="option-row">
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder={`Option ${i+1}`} 
                        value={opt} 
                        onChange={(e) => updateOption(q.id, i, e.target.value)} 
                      />
                      <button className="remove-q-btn" onClick={() => removeOption(q.id, i)}>×</button>
                    </div>
                  ))}
                  <button className="add-option-btn" onClick={() => addOption(q.id)}>
                    + Add Option
                  </button>
                </div>
              )}
            </div>
          ))}

          <button className="add-question-btn" onClick={addQuestion}>
            + Add Question
          </button>
        </div>

        <button className="create-btn" onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating...' : 'Create & Publish Questionnaire'}
        </button>
      </div>
    </div>
  );
}