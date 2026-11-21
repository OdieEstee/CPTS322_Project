/*
 * Messages.tsx — chat between matched users
 *
 * Left: the user's matches (from GET /api/matches).
 * Right: the conversation with the selected match.
 *
 * New messages are found by "polling": every couple of seconds the page asks
 * the server for messages newer than the last one it has
 * (GET /api/matches/:id/messages?after=<last id>). It's simpler than
 * WebSockets and fast enough for chat; switching to WebSockets later would
 * only change how new messages arrive, not the rest of this page.
 *
 * Match cards can open a conversation directly by rendering
 * <Messages ... initialMatchId={match.id} />.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import "./Messages.css";
import type { AuthUser } from "./App.tsx";
import { apiFetch, ApiError, type ChatMessage, type Match } from "./api.ts";

const MESSAGE_POLL_MS = 2000; // check the open conversation for new messages
const MATCH_POLL_MS = 5000; // refresh the inbox (new matches, previews)
const PAGE_SIZE = 50;
const MAX_LENGTH = 2000;

interface MessagesProps {
  user: AuthUser;
  initialMatchId?: string;
  onSessionExpired: () => void;
}

// Combines two lists of messages, dropping duplicates, oldest first.
// (A message we just sent can also come back from the next poll.)
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Messages({ user, initialMatchId, onSessionExpired }: MessagesProps) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialMatchId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // The newest message id we have, so polling only asks for newer ones.
  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Logs the user out on an expired session; shows other errors.
  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    },
    [onSessionExpired]
  );

  /* ---- Inbox: load now, then refresh every few seconds ---- */
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function loadMatches() {
      try {
        const data = await apiFetch<{ matches: Match[] }>("/api/matches", user.token);
        if (cancelled) return;
        setMatches(data.matches);
        // Open the first conversation automatically if none is chosen.
        setSelectedId((current) => current ?? data.matches[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) handleError(err);
      }
      if (!cancelled) timer = window.setTimeout(loadMatches, MATCH_POLL_MS);
    }

    loadMatches();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user.token, handleError]);

  /* ---- Open conversation: load recent messages, then poll for new ones ---- */
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    let timer: number | undefined;
    const base = `/api/matches/${encodeURIComponent(selectedId)}/messages`;

    async function loadRecent() {
      let loaded = false;
      try {
        const data = await apiFetch<{ messages: ChatMessage[] }>(
          `${base}?limit=${PAGE_SIZE}`,
          user.token
        );
        if (cancelled) return;
        setMessages(data.messages);
        setHasOlder(data.messages.length === PAGE_SIZE);
        lastIdRef.current = data.messages.at(-1)?.id ?? 0;
        setError("");
        loaded = true;
      } catch (err) {
        if (!cancelled) handleError(err);
      }
      // Start checking for new messages, or retry the first load if it failed.
      if (!cancelled) timer = window.setTimeout(loaded ? poll : loadRecent, MESSAGE_POLL_MS);
    }

    async function poll() {
      try {
        const data = await apiFetch<{ messages: ChatMessage[] }>(
          `${base}?after=${lastIdRef.current}&limit=100`,
          user.token
        );
        if (cancelled) return;
        if (data.messages.length > 0) {
          setMessages((current) => mergeMessages(current, data.messages));
          lastIdRef.current = Math.max(lastIdRef.current, data.messages.at(-1)!.id);
        }
      } catch (err) {
        if (!cancelled) handleError(err);
      }
      if (!cancelled) timer = window.setTimeout(poll, MESSAGE_POLL_MS);
    }

    loadRecent();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedId, user.token, handleError]);

  // Keep the newest message in view.
  const newestId = messages.at(-1)?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [newestId, selectedId]);

  function openConversation(matchId: string) {
    if (matchId === selectedId) return;
    setMessages([]);
    setHasOlder(false);
    setDraft("");
    setError("");
    lastIdRef.current = 0;
    setSelectedId(matchId);
  }

  async function loadOlder() {
    if (!selectedId || messages.length === 0) return;
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(
        `/api/matches/${encodeURIComponent(selectedId)}/messages?before=${messages[0].id}&limit=${PAGE_SIZE}`,
        user.token
      );
      setMessages((current) => mergeMessages(current, data.messages));
      setHasOlder(data.messages.length === PAGE_SIZE);
    } catch (err) {
      handleError(err);
    }
  }

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || sending) return;

    setSending(true);
    setError("");
    try {
      const data = await apiFetch<{ message: ChatMessage }>(
        `/api/matches/${encodeURIComponent(selectedId)}/messages`,
        user.token,
        { method: "POST", body: { body } }
      );
      setMessages((current) => mergeMessages(current, [data.message]));
      setDraft("");
    } catch (err) {
      handleError(err); // the draft stays, so nothing typed is lost
    } finally {
      setSending(false);
    }
  }

  // Enter sends; Shift+Enter starts a new line.
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  }

  const selected = matches?.find((m) => m.id === selectedId) ?? null;

  return (
    <main className="messages-page">
      <section className="messages-card">
        <aside className="match-list" aria-label="Your matches">
          <h2>Messages</h2>

          {matches === null && <p className="muted">Loading…</p>}

          {matches?.length === 0 && (
            <p className="muted">
              No matches yet. When you match with someone, your conversation
              will show up here.
            </p>
          )}

          <ul>
            {matches?.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className={match.id === selectedId ? "match active" : "match"}
                  onClick={() => openConversation(match.id)}
                >
                  <span className="avatar" aria-hidden="true">
                    {match.otherUser.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="match-text">
                    <span className="match-name">{match.otherUser.name}</span>
                    <span className="match-preview">
                      {match.lastMessage
                        ? `${match.lastMessage.senderId === user.id ? "You: " : ""}${match.lastMessage.body}`
                        : "Say hi!"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="conversation" aria-label="Conversation">
          {!selected ? (
            <p className="muted center" role={error ? "alert" : undefined}>
              {error || (matches?.length ? "Pick a conversation." : "")}
            </p>
          ) : (
            <>
              <header className="conversation-header">
                <span className="avatar" aria-hidden="true">
                  {selected.otherUser.name.charAt(0).toUpperCase()}
                </span>
                <strong>{selected.otherUser.name}</strong>
              </header>

              <div className="message-scroll" role="log" aria-live="polite">
                {hasOlder && (
                  <button type="button" className="load-older" onClick={loadOlder}>
                    Load earlier messages
                  </button>
                )}

                {messages.length === 0 && (
                  <p className="muted center">
                    You matched with {selected.otherUser.name}. Send the first message!
                  </p>
                )}

                {messages.map((message) => {
                  const mine = message.senderId === user.id;
                  return (
                    <div key={message.id} className={mine ? "bubble-row mine" : "bubble-row"}>
                      {/* Rendered as plain text by React, so HTML in a message can't run. */}
                      <div className="bubble">{message.body}</div>
                      <time className="bubble-time" dateTime={message.createdAt}>
                        {formatTime(message.createdAt)}
                      </time>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {error && <p className="chat-error" role="alert">{error}</p>}

              <form className="composer" onSubmit={sendMessage}>
                <textarea
                  aria-label={`Message ${selected.otherUser.name}`}
                  placeholder="Write a message…"
                  value={draft}
                  maxLength={MAX_LENGTH}
                  rows={1}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button type="submit" disabled={sending || draft.trim() === ""}>
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default Messages;
