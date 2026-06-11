// src/app/staff/messages/page.tsx

'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import "./messages.css";

export default function MessagesPage() {
  const [profile, setProfile] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<any>(null);
  const activeConvRef = useRef<any>(null);
  const pollingRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      profileRef.current = prof;

      await loadConversations(user.id);

      pollingRef.current = setInterval(async () => {
        await loadConversations(user.id);
        if (activeConvRef.current && profileRef.current) {
          await loadMessages(activeConvRef.current.id, profileRef.current.id, true);
        }
      }, 5000);
    };
    load();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async (userId: string) => {
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from('messages').select('receiver_id').eq('sender_id', userId),
      supabase.from('messages').select('sender_id').eq('receiver_id', userId),
    ]);

    const ids = new Set<string>();
    (sent || []).forEach((m: any) => ids.add(m.receiver_id));
    (received || []).forEach((m: any) => ids.add(m.sender_id));
    if (ids.size === 0) return;

    const [{ data: convProfiles }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('id, name, designation, role').in('id', Array.from(ids)),
      supabase.from('messages')
        .select('sender_id')
        .eq('receiver_id', userId)
        .eq('read', false),
    ]);

    setConversations(convProfiles || []);

    const counts: Record<string, number> = {};
    (unreadMsgs || []).forEach((m: any) => {
      counts[m.sender_id] = (counts[m.sender_id] || 0) + 1;
    });
    setUnreadCounts(counts);
  };

  const loadMessages = async (otherId: string, myId: string, silent = false) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    setMessages(data || []);

    await supabase.from('messages')
      .update({ read: true })
      .eq('sender_id', otherId)
      .eq('receiver_id', myId);

    setUnreadCounts(prev => ({ ...prev, [otherId]: 0 }));
  };

  useEffect(() => {
    const doSearch = async () => {
      if (search.length < 2) { setSearchResults([]); return; }
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${search}%`)
        .neq('id', profileRef.current?.id || '')
        .limit(8);
      setSearchResults(data || []);
    };
    const t = setTimeout(doSearch, 300);
    return () => clearTimeout(t);
  }, [search]);

  const startConversation = async (other: any) => {
    setActiveConv(other);
    activeConvRef.current = other;
    setSearch('');
    setSearchResults([]);
    if (profileRef.current) {
      await loadMessages(other.id, profileRef.current.id);
    }
    if (!conversations.find((c: any) => c.id === other.id)) {
      setConversations(prev => [other, ...prev]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConv || !profileRef.current) return;
    setSending(true);
    const optimistic = {
      id: `temp-${Date.now()}`,
      sender_id: profileRef.current.id,
      receiver_id: activeConv.id,
      content: newMsg.trim(),
      created_at: new Date().toISOString(),
      read: false,
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg('');

    const { data } = await supabase.from('messages').insert({
      sender_id: profileRef.current.id,
      receiver_id: activeConv.id,
      content: optimistic.content,
      read: false,
    }).select().single();

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m));
    }
    setSending(false);
  };

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatConvTime = (conv: any) => {
    // Could be enriched with last message time — left for future
    return conv.designation || '';
  };

  const totalUnread = Object.values(unreadCounts).reduce((a: number, b) => a + (b as number), 0);

  return (
    <div className="messages-page">
      {/* ── Sidebar ──────────────────────────────── */}
      <div className="msg-sidebar">
        <div className="msg-sidebar-header">
          <div className="msg-sidebar-title-row">
            <h2>Messages</h2>
            {totalUnread > 0 && <span className="msg-unread-total">{totalUnread}</span>}
          </div>
          <div className="msg-search-wrap">
            <input
              type="text"
              className="msg-input"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="msg-search-results">
                {searchResults.map((s: any) => (
                  <div key={s.id} className="msg-search-item" onClick={() => startConversation(s)}>
                    <div className="msg-avatar">{initials(s.name)}</div>
                    <div className="msg-search-info">
                      <div className="msg-search-name">{s.name}</div>
                      <div className="msg-search-role">{s.designation}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {search.length >= 2 && searchResults.length === 0 && (
              <div className="msg-search-results">
                <div className="msg-search-empty">No results found</div>
              </div>
            )}
          </div>
        </div>

        <div className="msg-conv-list">
          {conversations.length === 0 ? (
            <p className="msg-no-conv">Search for a colleague above to start messaging.</p>
          ) : (
            conversations.map((c: any) => (
              <div
                key={c.id}
                className={`msg-conv-item ${activeConv?.id === c.id ? 'active' : ''}`}
                onClick={() => startConversation(c)}
              >
                <div className="msg-avatar-wrap">
                  <div className="msg-avatar">{initials(c.name)}</div>
                  {(unreadCounts[c.id] || 0) > 0 && (
                    <div className="msg-conv-badge">{unreadCounts[c.id]}</div>
                  )}
                </div>
                <div className="msg-conv-info">
                  <div className="msg-conv-name">{c.name}</div>
                  <div className="msg-conv-role">{c.designation}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────── */}
      <div className="msg-main">
        {!activeConv ? (
          <div className="msg-no-active">
            <div className="msg-no-active-icon">💬</div>
            <p>Select a conversation or search for someone to message.</p>
          </div>
        ) : (
          <>
            <div className="msg-chat-header">
              <div className="msg-avatar">{initials(activeConv.name)}</div>
              <div className="msg-chat-header-info">
                <div className="msg-chat-name">{activeConv.name}</div>
                <div className="msg-chat-role">{activeConv.designation}</div>
              </div>
            </div>

            <div className="msg-chat-body">
              {messages.length === 0 ? (
                <div className="msg-chat-empty">
                  <p>No messages yet. Say hello!</p>
                </div>
              ) : (
                <>
                  {messages.map((m: any, i: number) => {
                    const isMine = m.sender_id === profileRef.current?.id;
                    const prevMsg = messages[i - 1];
                    const showTime = !prevMsg ||
                      new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000;

                    return (
                      <div key={m.id}>
                        {showTime && (
                          <div className="msg-time-divider">{formatTime(m.created_at)}</div>
                        )}
                        <div className={`msg-bubble-wrap ${isMine ? 'mine' : 'theirs'}`}>
                          <div className={`msg-bubble ${isMine ? 'mine' : 'theirs'} ${m.id?.startsWith('temp') ? 'sending' : ''}`}>
                            {m.content}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            <div className="msg-input-row">
              <input
                ref={inputRef}
                type="text"
                className="msg-input msg-compose"
                placeholder={`Message ${activeConv.name.split(' ')[0]}…`}
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); }}
              />
              <button
                className="msg-send-btn"
                onClick={sendMessage}
                disabled={sending || !newMsg.trim()}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}