// src/app/staff/messages/page.tsx
'use client';

import { useEffect, useState, useRef } from "react";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<any>(null);
  const activeConvRef = useRef<any>(null);
  const pollingRef = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      profileRef.current = prof;
      await loadConversations(user.id);

      // Poll for new messages every 5 seconds instead of realtime
      pollingRef.current = setInterval(async () => {
        await loadConversations(user.id);
        if (activeConvRef.current && profileRef.current) {
          await loadMessages(activeConvRef.current.id, profileRef.current.id);
        }
      }, 5000);
    };
    load();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async (userId: string) => {
    const { data: sent } = await supabase
      .from('messages')
      .select('receiver_id')
      .eq('sender_id', userId);

    const { data: received } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId);

    const ids = new Set<string>();
    (sent || []).forEach((m: any) => ids.add(m.receiver_id));
    (received || []).forEach((m: any) => ids.add(m.sender_id));

    if (ids.size === 0) return;

    const { data: convProfiles } = await supabase
      .from('profiles')
      .select('id, name, designation')
      .in('id', Array.from(ids));

    setConversations(convProfiles || []);
  };

  const loadMessages = async (otherId: string, myId: string) => {
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
      setConversations(prev => [...prev, other]);
    }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConv || !profileRef.current) return;
    setSending(true);
    const { data } = await supabase.from('messages').insert({
      sender_id: profileRef.current.id,
      receiver_id: activeConv.id,
      content: newMsg.trim(),
      read: false,
    }).select().single();
    if (data) setMessages(prev => [...prev, data]);
    setNewMsg('');
    setSending(false);
  };

  return (
    <div className="messages-page">
      <div className="messages-sidebar">
        <div className="messages-header">
          <h2>Messages</h2>
          <div className="new-msg-search">
            <input type="text" className="input-field"
              placeholder="Start new conversation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)} />
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((s: any) => (
                  <div key={s.id} className="search-item"
                    onClick={() => startConversation(s)}>
                    <div className="msg-avatar">{s.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="search-name">{s.name}</div>
                      <div className="search-designation">{s.designation}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="conv-list">
          {conversations.length === 0 && (
            <p className="no-conv">No conversations yet. Search for a staff member above.</p>
          )}
          {conversations.map((c: any) => (
            <div key={c.id}
              className={`conv-item ${activeConv?.id === c.id ? 'active' : ''}`}
              onClick={() => startConversation(c)}>
              <div className="msg-avatar">{c.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="conv-name">{c.name}</div>
                <div className="conv-role">{c.designation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="messages-main">
        {!activeConv ? (
          <div className="no-active">
            <p>Select a conversation or search for someone to message.</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div className="msg-avatar">{activeConv.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="chat-name">{activeConv.name}</div>
                <div className="chat-role">{activeConv.designation}</div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((m: any) => (
                <div key={m.id}
                  className={`msg-bubble-wrap ${m.sender_id === profileRef.current?.id ? 'mine' : 'theirs'}`}>
                  <div className={`msg-bubble ${m.sender_id === profileRef.current?.id ? 'mine' : 'theirs'}`}>
                    {m.content}
                  </div>
                  <div className="msg-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
              <input type="text" className="input-field"
                placeholder="Type a message..."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
              <button className="send-btn" onClick={sendMessage}
                disabled={sending || !newMsg.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}