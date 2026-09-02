// src/components/layout/Topbar.tsx
'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { initials, getFirstName, displayName, formatRole } from '@/lib/utils';

import Link from "next/link";
import Avatar from "@/components/Avatar";
import "./Topbar.css";

export type UserRole = 
  | 'SUPER_ADMIN'
  | 'DG'
  | 'DEPT_ADMIN'
  | 'DIVISION_HEAD'
  | 'UNIT_HEAD'
  | 'STAFF';

export type ReportPeriod = 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

export const getRoleTitle = (role?: UserRole | string): string => {
  if (!role) return formatRole(role);

  const roleTitles: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    DG: 'Director General',
    DEPT_ADMIN: 'Department Head',
    DIVISION_HEAD: 'Division Head',
    UNIT_HEAD: 'Unit Head',
    STAFF: 'Staff Member',
  };

  return roleTitles[role] || formatRole(role);
};

export default function Topbar() {
  const [profile, setProfile] = useState<any>(null);
  const [isLight, setIsLight] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  // AI Assistant Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMode, setAiMode] = useState<'chat' | 'report'>('chat');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Report Period State
  const [period, setPeriod] = useState<ReportPeriod>('MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);

  // Report Dispatch State
  const [recipients, setRecipients] = useState<{ id: string; name?: string | null; title?: string | null; role: string }[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (mounted) setProfile(prof);

        // Fetch recipient list
        const { data: staffList } = await supabase
          .from('profiles')
          .select('id, name, title, role')
          .neq('id', user.id)
          .order('name', { ascending: true });

        if (mounted && staffList) setRecipients(staffList);

        const fetchCounts = async () => {
          if (!user || !mounted) return;

          const { count: nc } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);

          const { count: mc } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('read', false);

          if (mounted) {
            setUnreadNotifs(nc || 0);
            setUnreadMsgs(mc || 0);
          }
        };

        await fetchCounts();
        interval = setInterval(fetchCounts, 15000);

      } catch (err) {
        console.error("Topbar load error:", err);
      }
    };

    load();
    setIsLight(document.body.classList.contains('light-mode'));

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  const toggleTheme = () => {
    document.body.classList.toggle('light-mode');
    setIsLight(!isLight);
  };

  const handleSendAiMessage = async () => {
    if (!aiMessage.trim() || aiLoading) return;

    const userText = aiMessage;
    setAiMessage('');
    setChatHistory(prev => [...prev, { sender: 'user', text: userText }]);
    setAiLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', message: userText }),
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { sender: 'ai', text: data.text || 'No response.' }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { sender: 'ai', text: 'An error occurred while contacting the assistant.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    setAiLoading(true);
    setGeneratedReport(null);
    setDispatchStatus(null);

    let start = startDate;
    let end = endDate;

    const now = new Date();
    if (period === 'WEEK') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      end = now.toISOString();
    } else if (period === 'MONTH') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      end = now.toISOString();
    } else if (period === 'YEAR') {
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
      end = now.toISOString();
    }

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'generate-report', 
          periodType: period,
          startDate: start,
          endDate: end
        }),
      });
      const data = await res.json();
      setGeneratedReport(data.report?.summary_markdown || 'Failed to generate report.');
    } catch (err) {
      setGeneratedReport('An error occurred during report generation.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendReportToRecipient = async () => {
    if (!selectedRecipientId || !generatedReport) return;
    setSendingReport(true);
    setDispatchStatus(null);

    try {
      const res = await fetch('/api/ai/report/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedRecipientId,
          reportMarkdown: generatedReport,
          periodType: period,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to dispatch');

      setDispatchStatus('Report successfully archived and sent to recipient!');
    } catch (err: any) {
      setDispatchStatus(`Failed to send report: ${err.message || 'Error occurred'}`);
    } finally {
      setSendingReport(false);
    }
  };

  const userDisplayName = displayName(profile); 
  const formattedFirstName = getFirstName(profile?.name, profile?.title); 
  const roleDisplay = getRoleTitle(profile?.role);

  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="greeting">
          Welcome back, <span className="highlight">{formattedFirstName}</span>
        </div>

        <div className="topbar-right">
          <button 
            onClick={() => setShowAiModal(true)} 
            className="ai-assistant-btn"
          >
            <span>✨</span> AI Assistant
          </button>

          <button onClick={toggleTheme} className="theme-toggle">
            {isLight ? '☀️' : '🌙'}
          </button>

          <Link href="/staff/messages" className="icon-btn">
            💬
            {unreadMsgs > 0 && <span className="badge">{unreadMsgs}</span>}
          </Link>

          <Link href="/staff/notifications" className="icon-btn">
            🔔
            {unreadNotifs > 0 && <span className="badge">{unreadNotifs}</span>}
          </Link>

          <div className="user-info">
            <div>
              <div className="user-name">{userDisplayName}</div>
              <div className="user-role">{roleDisplay}</div>
            </div>
            <Link href="/staff/profile" style={{ textDecoration: 'none' }}>
              <Avatar name={formattedFirstName} avatarUrl={profile?.avatar_url} size="md" />
            </Link>
          </div>
        </div>
      </div>

      {/* AI Assistant Drawer */}
      {showAiModal && (
        <div className="ai-modal-overlay" onClick={() => setShowAiModal(false)}>
          <div className="ai-modal-drawer" onClick={e => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3><span>✨</span> Workspace AI Assistant</h3>
              <button onClick={() => setShowAiModal(false)} className="ai-close-btn">
                ✕
              </button>
            </div>

            <div className="ai-tab-bar">
              <button 
                onClick={() => setAiMode('chat')}
                className={`ai-tab-btn ${aiMode === 'chat' ? 'active' : ''}`}
              >
                Scoped Q&A
              </button>
              <button 
                onClick={() => setAiMode('report')}
                className={`ai-tab-btn ${aiMode === 'report' ? 'active' : ''}`}
              >
                Generate Report
              </button>
            </div>

            {aiMode === 'chat' ? (
              <div className="ai-chat-body">
                <div className="ai-chat-messages">
                  {chatHistory.length === 0 && (
                    <div className="ai-chat-placeholder">
                      Ask questions about tasks, document routes, or workspace guidance suited to your scope ({roleDisplay}).
                    </div>
                  )}
                  {chatHistory.map((item, idx) => (
                    <div key={idx} className={`ai-chat-bubble ${item.sender}`}>
                      {item.text}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="ai-chat-loading">
                      AI is thinking...
                    </div>
                  )}
                </div>

                <div className="ai-chat-input-wrapper">
                  <input 
                    type="text" 
                    value={aiMessage} 
                    onChange={e => setAiMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendAiMessage()}
                    placeholder="Ask assistant..."
                    className="ai-chat-input"
                  />
                  <button 
                    onClick={handleSendAiMessage} 
                    disabled={aiLoading}
                    className="ai-send-btn"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="ai-report-body">
                <div className="ai-report-form">
                  <span className="ai-label">Select Report Range:</span>
                  <div className="ai-date-pills">
                    <button 
                      className={`ai-pill-btn ${period === 'WEEK' ? 'active' : ''}`}
                      onClick={() => setPeriod('WEEK')}
                    >
                      Past Week
                    </button>
                    <button 
                      className={`ai-pill-btn ${period === 'MONTH' ? 'active' : ''}`}
                      onClick={() => setPeriod('MONTH')}
                    >
                      Past Month
                    </button>
                    <button 
                      className={`ai-pill-btn ${period === 'YEAR' ? 'active' : ''}`}
                      onClick={() => setPeriod('YEAR')}
                    >
                      Past Year
                    </button>
                    <button 
                      className={`ai-pill-btn ${period === 'CUSTOM' ? 'active' : ''}`}
                      onClick={() => setPeriod('CUSTOM')}
                    >
                      Custom
                    </button>
                  </div>

                  {period === 'CUSTOM' && (
                    <div className="ai-custom-dates">
                      <div>
                        <span className="ai-label">Start Date</span>
                        <input 
                          type="date" 
                          className="ai-date-input" 
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <span className="ai-label">End Date</span>
                        <input 
                          type="date" 
                          className="ai-date-input" 
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleGenerateReport}
                    disabled={aiLoading}
                    className="ai-report-gen-btn"
                  >
                    {aiLoading ? 'Compiling Metrics...' : 'Generate Performance Report'}
                  </button>
                </div>

                {generatedReport && (
                  <div className="ai-report-output-container">
                    <div className="ai-report-output">
                      {generatedReport}
                    </div>

                    <div className="ai-dispatch-card">
                      <span className="ai-label">Dispatch Report to Line Manager / Colleague:</span>
                      <select 
                        className="ai-dispatch-select"
                        value={selectedRecipientId}
                        onChange={e => setSelectedRecipientId(e.target.value)}
                      >
                        <option value="">Select recipient...</option>
                        {recipients.map(r => (
                          <option key={r.id} value={r.id}>
                            {displayName(r)} — {getRoleTitle(r.role)}
                          </option>
                        ))}
                      </select>

                      <button 
                        className="ai-dispatch-btn"
                        onClick={handleSendReportToRecipient}
                        disabled={sendingReport || !selectedRecipientId}
                      >
                        {sendingReport ? 'Sending...' : 'Send Report via Message'}
                      </button>

                      {dispatchStatus && (
                        <span style={{ fontSize: '0.75rem', color: dispatchStatus.startsWith('Failed') ? '#e05c5c' : '#10b981' }}>
                          {dispatchStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}