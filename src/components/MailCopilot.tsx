"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Attachment, fileToAttachment, validateAttachments, formatFileSize, sendMailDirect,
} from "@/lib/mail-client";
import {
  searchContacts, getContacts, getVipEmails, saveRecipientsFromSend,
  toggleVip, deleteContact, addOrUpdateContact, Contact,
} from "@/lib/address-book";

// --- Email Tag Input Component ---
function EmailTagInput({
  emails,
  onChange,
  placeholder,
  id,
  autoFocus,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputValue.length >= 1) {
      const results = searchContacts(inputValue).filter((c) => !emails.includes(c.email));
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSuggestion(-1);
    } else {
      setShowSuggestions(false);
    }
  }, [inputValue, emails]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addEmails(raw: string) {
    const parts = raw.split(/[;,\s]+/).map((s) => s.trim()).filter(Boolean);
    const newEmails = parts.filter(
      (e) => e.includes("@") && !emails.includes(e)
    );
    if (newEmails.length > 0) {
      onChange([...emails, ...newEmails]);
    }
    setInputValue("");
    setShowSuggestions(false);
  }

  function selectSuggestion(contact: Contact) {
    if (!emails.includes(contact.email)) {
      onChange([...emails, contact.email]);
    }
    setInputValue("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((p) => Math.min(p + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion((p) => Math.max(p - 1, -1));
        return;
      }
      if (e.key === "Enter" && selectedSuggestion >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestion]);
        return;
      }
    }
    if (e.key === "Enter" || e.key === ";" || e.key === ",") {
      e.preventDefault();
      if (inputValue.trim()) addEmails(inputValue);
    }
    if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.includes(";") || val.includes(",")) {
      addEmails(val);
    } else {
      setInputValue(val);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    addEmails(text);
  }

  function handleBlur() {
    if (inputValue.trim()) addEmails(inputValue);
    setTimeout(() => setShowSuggestions(false), 150);
  }

  function handleFocus() {
    if (inputValue.length >= 1) {
      const results = searchContacts(inputValue).filter((c) => !emails.includes(c.email));
      if (results.length > 0) { setSuggestions(results); setShowSuggestions(true); }
    }
  }

  function removeEmail(idx: number) {
    onChange(emails.filter((_, i) => i !== idx));
  }

  const vipEmails = getVipEmails();

  return (
    <div ref={wrapRef} className="flex-1 relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 min-h-[38px] focus-within:border-blue-500 transition cursor-text"
      >
        {emails.map((email, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md max-w-[220px] border ${
            vipEmails.includes(email) ? "bg-amber-600/20 text-amber-300 border-amber-500/30" : "bg-blue-600/20 text-blue-300 border-blue-500/30"
          }`}>
            {vipEmails.includes(email) && <span className="text-amber-400 text-[10px]">&#9733;</span>}
            <span className="truncate">{email}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); removeEmail(i); }}
              className="text-current hover:text-white transition cursor-pointer text-xs leading-none ml-0.5 opacity-60 hover:opacity-100">&times;</button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          onFocus={handleFocus}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={emails.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-600"
        />
      </div>

      {showSuggestions && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((c, i) => (
            <button key={c.email}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(c); }}
              className={`w-full text-left px-3 py-2 text-sm transition cursor-pointer flex items-center gap-2 ${
                i === selectedSuggestion ? "bg-blue-600/30" : "hover:bg-gray-800"
              }`}>
              {c.vip && <span className="text-amber-400 text-xs">&#9733;</span>}
              <span className="text-gray-300 truncate">{c.name || c.email}</span>
              {c.name && <span className="text-gray-600 text-xs truncate">{c.email}</span>}
              <span className="ml-auto text-[10px] text-gray-600 shrink-0">{c.count}회</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Thread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  lastFrom: string;
  lastDate: string;
  messageCount: number;
  isUnread: boolean;
  isStarred: boolean;
}

interface Message {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
  messageId: string;
  references: string;
}

interface ThreadDetail {
  id: string;
  subject: string;
  messages: Message[];
}

interface Analysis {
  summary: string;
  requirements: string[];
  nextActions: string[];
  draftReply: string;
  urgency: "high" | "medium" | "low";
}

type Label = "INBOX" | "SENT" | "STARRED" | "VIP";
type EditorMode = "reply" | "compose" | null;

const LABEL_ITEMS: { key: Label; label: string; icon: string }[] = [
  { key: "INBOX", label: "받은편지함", icon: "&#9993;" },
  { key: "SENT", label: "보낸편지함", icon: "&#10148;" },
  { key: "STARRED", label: "별표", icon: "&#9733;" },
  { key: "VIP", label: "VIP", icon: "&#9733;" },
];

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-500/15", text: "text-red-400", label: "긴급" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "보통" },
  low: { bg: "bg-gray-500/15", text: "text-gray-400", label: "낮음" },
};

const DEFAULT_GREETING = "안녕하세요, 유진호 입니다.\n\n";
const DEFAULT_CLOSING = "\n\n유진호 올림";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    if (d.getFullYear() === now.getFullYear()) return `${month}/${day}`;
    return `${d.getFullYear()}/${month}/${day}`;
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export default function MailCopilot() {
  const { data: session, status } = useSession();
  const [isApp, setIsApp] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsApp(params.get("app") === "android" || !!(window as any).__AUTOMAIL_APP);
  }, []);

  // Thread list
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [label, setLabel] = useState<Label>("INBOX");
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Thread detail (no auto-analysis)
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AI analysis (on-demand)
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Editor (reply/compose)
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorTo, setEditorTo] = useState<string[]>([]);
  const [editorCc, setEditorCc] = useState<string[]>([]);
  const [editorBcc, setEditorBcc] = useState<string[]>([]);
  const [editorSubject, setEditorSubject] = useState("");
  const [editorBody, setEditorBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // AI draft
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showReplyChoice, setShowReplyChoice] = useState(false);
  const [replyChoiceAll, setReplyChoiceAll] = useState(false);

  // Schedule
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleTimer, setScheduleTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [scheduleRemaining, setScheduleRemaining] = useState<string | null>(null);

  // UI
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isApp && window.innerWidth >= 768) setSidebarOpen(true);
  }, [isApp]);
  const [showContacts, setShowContacts] = useState(false);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [vipSet, setVipSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVipSet(new Set(getVipEmails()));
  }, [showContacts]);

  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (session?.accessToken) fetchThreads();
  }, [session, label]);

  useEffect(() => {
    if (session?.error === "RefreshTokenError") signIn("google");
  }, [session?.error]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, threads.length - 1);
          if (threads[next]) openThread(threads[next].id);
          return next;
        });
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          if (threads[next]) openThread(threads[next].id);
          return next;
        });
      }
      if (e.key === "Escape") {
        if (showConfirm) { setShowConfirm(false); return; }
        if (editorMode) { setEditorMode(null); return; }
        setThreadDetail(null);
        setAnalysis(null);
        setSelectedIndex(-1);
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [threads, threadDetail, editorMode, showConfirm]);

  // --- Fetch threads ---
  async function fetchThreads(query?: string, append = false) {
    if (append) setLoadingMore(true);
    else { setLoading(true); setNextPageToken(undefined); }
    setError(null);
    try {
      const params = new URLSearchParams();

      if (query) {
        params.set("q", query);
      } else if (label === "VIP") {
        const vips = getVipEmails();
        if (vips.length === 0) {
          setThreads([]);
          setLoading(false);
          return;
        }
        params.set("q", "from:(" + vips.join(" OR ") + ")");
      } else {
        params.set("label", label);
      }

      if (append && nextPageToken) params.set("pageToken", nextPageToken);
      const res = await fetch(`/api/threads?${params}`);
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) { signIn("google"); return; }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (append) setThreads((prev) => [...prev, ...(data.threads || [])]);
      else setThreads(data.threads || []);
      setNextPageToken(data.nextPageToken);
    } catch (err: any) {
      setError(err.message);
      showToast("메일 조회 실패: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // --- Open thread (NO auto-analysis) ---
  async function openThread(threadId: string) {
    setDetailLoading(true);
    setAnalysis(null);
    setEditorMode(null);
    setError(null);
    const idx = threads.findIndex((t) => t.id === threadId);
    if (idx >= 0) setSelectedIndex(idx);

    try {
      const res = await fetch(`/api/threads/${threadId}`);
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) { signIn("google"); return; }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setThreadDetail(data.thread);
      if (isApp || window.innerWidth < 768) setSidebarOpen(false);
    } catch (err: any) {
      setError(err.message);
      showToast("메일 조회 실패: " + err.message, "error");
    } finally {
      setDetailLoading(false);
    }
  }

  // --- AI Analysis (on-demand) ---
  async function requestAnalysis() {
    if (!threadDetail) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/threads/${threadDetail.id}?analyze=true&tone=formal`);
      if (!res.ok) throw new Error("분석 실패");
      const data = await res.json();
      setAnalysis(data.analysis);
      showToast("AI 분석 완료", "success");
    } catch (err: any) {
      showToast("AI 분석 실패: " + err.message, "error");
    } finally {
      setAnalyzing(false);
    }
  }

  // --- Open Reply Editor ---
  function openReply(all = false, useAi = false) {
    if (!threadDetail) return;
    setReplyAll(all);
    const lastMsg = threadDetail.messages[threadDetail.messages.length - 1];
    const myEmail = session?.user?.email || "";
    const to = extractEmail(lastMsg.from);

    setEditorTo(to === myEmail && lastMsg.to ? [extractEmail(lastMsg.to)] : [to]);

    if (all) {
      const allTo = lastMsg.to?.split(",").map((e) => extractEmail(e.trim())) || [];
      const allCc = lastMsg.cc?.split(",").map((e) => extractEmail(e.trim())) || [];
      const ccList = [...allTo, ...allCc]
        .filter((e) => e && e !== myEmail && e !== to)
        .filter((e, i, arr) => arr.indexOf(e) === i);
      setEditorCc(ccList);
    } else {
      setEditorCc([]);
    }
    setEditorBcc([]);
    setEditorSubject(threadDetail.subject.startsWith("Re:") ? threadDetail.subject : `Re: ${threadDetail.subject}`);
    setEditorBody(DEFAULT_GREETING + "\n" + DEFAULT_CLOSING);
    setEditorMode("reply");
    setShowAiPanel(false);
    setShowReplyChoice(false);
    setAttachments([]);

    if (useAi) {
      setEditorBody("");
      setAiDrafting(true);
      setEditorMode("reply");
      const context = threadDetail.messages
        .map((m) => `보낸사람: ${m.from}\n날짜: ${m.date}\n\n${m.body}`)
        .join("\n\n---\n\n");
      fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: "메일 내용을 참고하여 적절한 답장을 작성해줘",
          context,
          type: "reply",
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          setEditorBody(data.body || data.draft || DEFAULT_GREETING + "\n" + DEFAULT_CLOSING);
        })
        .catch(() => {
          setEditorBody(DEFAULT_GREETING + "\n" + DEFAULT_CLOSING);
          showToast("AI 초안 작성 실패", "error");
        })
        .finally(() => setAiDrafting(false));
    } else {
      setTimeout(() => bodyRef.current?.focus(), 100);
    }
  }

  // --- Open Compose ---
  function openCompose() {
    setEditorTo([]);
    setEditorCc([]);
    setEditorBcc([]);
    setEditorSubject("");
    setEditorBody(DEFAULT_GREETING + "\n" + DEFAULT_CLOSING);
    setEditorMode("compose");
    setShowAiPanel(false);
    setAttachments([]);
    setTimeout(() => {
      const toInput = document.getElementById("editor-to");
      toInput?.focus();
    }, 100);
  }

  // --- AI Draft ---
  async function requestAiDraft() {
    setAiDrafting(true);
    try {
      let context = "";
      if (editorMode === "reply" && threadDetail) {
        context = threadDetail.messages
          .map((m) => `보낸사람: ${m.from}\n날짜: ${m.date}\n\n${m.body}`)
          .join("\n\n---\n\n");
      }
      const instruction = aiInstruction.trim() || (editorMode === "reply"
        ? "메일 내용을 참고하여 적절한 답장을 작성해줘"
        : "적절한 비즈니스 메일을 작성해줘");
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          context: context || undefined,
          type: editorMode === "reply" ? "reply" : "compose",
        }),
      });
      if (!res.ok) throw new Error("AI 작성 실패");
      const data = await res.json();
      const draftBody = data.body || data.draft || "";
      if (!draftBody) {
        showToast("AI 응답이 비어있습니다. 다시 시도해주세요.", "error");
        return;
      }
      setEditorBody(draftBody);
      if (data.subject && editorMode === "compose") {
        setEditorSubject(data.subject);
      }
      setAiInstruction("");
      setShowAiPanel(false);
      showToast("AI 초안 작성 완료", "success");
    } catch (err: any) {
      showToast("AI 작성 실패: " + err.message, "error");
    } finally {
      setAiDrafting(false);
    }
  }

  // --- Schedule Send ---
  const scheduleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cancelSchedule() {
    if (scheduleTimer) { clearTimeout(scheduleTimer); setScheduleTimer(null); }
    if (scheduleIntervalRef.current) { clearInterval(scheduleIntervalRef.current); scheduleIntervalRef.current = null; }
    setScheduleRemaining(null);
    setScheduleDate("");
  }

  function formatRemaining(ms: number): string {
    if (ms <= 0) return "전송 중...";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}시간 ${m}분 후 전송`;
    if (m > 0) return `${m}분 ${s}초 후 전송`;
    return `${s}초 후 전송`;
  }

  function handleScheduleSend() {
    if (!scheduleDate || !scheduleTime || editorTo.length === 0 || !editorBody.trim()) return;
    const targetTime = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
    const now = Date.now();
    const delay = targetTime - now;
    if (delay <= 0) {
      showToast("예약 시간이 현재보다 이후여야 합니다", "error");
      return;
    }

    setShowSchedulePicker(false);
    setShowConfirm(false);
    const timer = setTimeout(() => {
      handleSend();
      cancelSchedule();
      showToast("예약된 메일이 전송되었습니다", "success");
    }, delay);
    setScheduleTimer(timer);
    setScheduleRemaining(formatRemaining(delay));

    scheduleIntervalRef.current = setInterval(() => {
      const remaining = targetTime - Date.now();
      if (remaining <= 0) {
        if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
        setScheduleRemaining("전송 중...");
      } else {
        setScheduleRemaining(formatRemaining(remaining));
      }
    }, 1000);

    const target = new Date(`${scheduleDate}T${scheduleTime}`);
    showToast(`${target.toLocaleString("ko-KR")}에 전송 예약됨`, "success");
  }

  // --- File Attachments ---
  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const att = await fileToAttachment(file);
        newAttachments.push(att);
      } catch {
        showToast(`파일 읽기 실패: ${file.name}`, "error");
      }
    }
    const merged = [...attachments, ...newAttachments];
    const err = validateAttachments(merged);
    if (err) {
      showToast(err, "error");
      return;
    }
    setAttachments(merged);
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleEditorDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }

  // --- Send ---
  async function handleSend() {
    if (editorTo.length === 0 || !editorBody.trim()) return;
    setSending(true);
    try {
      if (attachments.length > 0) {
        const params: any = {
          accessToken: session!.accessToken,
          to: editorTo.join(", "),
          subject: editorSubject,
          body: editorBody,
          htmlBody: "",
          attachments,
        };
        if (editorCc.length > 0) params.cc = editorCc.join(", ");
        if (editorBcc.length > 0) params.bcc = editorBcc.join(", ");
        if (editorMode === "reply" && threadDetail) {
          const lastMsg = threadDetail.messages[threadDetail.messages.length - 1];
          params.threadId = threadDetail.id;
          params.messageId = lastMsg.messageId;
          params.references = lastMsg.references;
        }
        await sendMailDirect(params);
      } else {
        const payload: any = {
          to: editorTo.join(", "),
          subject: editorSubject,
          body: editorBody,
        };
        if (editorCc.length > 0) payload.cc = editorCc.join(", ");
        if (editorBcc.length > 0) payload.bcc = editorBcc.join(", ");
        if (editorMode === "reply" && threadDetail) {
          const lastMsg = threadDetail.messages[threadDetail.messages.length - 1];
          payload.threadId = threadDetail.id;
          payload.messageId = lastMsg.messageId;
          payload.references = lastMsg.references;
        }
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      }
      saveRecipientsFromSend(
        editorTo.join(","),
        editorCc.join(","),
        editorBcc.join(","),
      );
      showToast(editorMode === "reply" ? "답장이 전송되었습니다" : "메일이 전송되었습니다", "success");
      setShowConfirm(false);
      setEditorMode(null);
      setAttachments([]);
    } catch (err: any) {
      showToast("전송 실패: " + (err.message || "오류 발생"), "error");
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchThreads(searchQuery || undefined);
  }

  async function toggleStar(threadId: string, currentStarred: boolean) {
    const newStarred = !currentStarred;
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, isStarred: newStarred } : t))
    );
    try {
      const res = await fetch("/api/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, star: newStarred }),
      });
      if (!res.ok) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, isStarred: currentStarred } : t))
        );
        showToast("별표 변경 실패", "error");
      }
    } catch {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, isStarred: currentStarred } : t))
      );
    }
  }

  function handleToggleVip(email: string) {
    const addr = extractEmail(email).toLowerCase();
    addOrUpdateContact(addr, extractName(email));
    toggleVip(addr);
    setVipSet(new Set(getVipEmails()));
  }

  function handleLabelChange(newLabel: Label) {
    setLabel(newLabel);
    setSearchQuery("");
    setThreadDetail(null);
    setAnalysis(null);
    setEditorMode(null);
    setSelectedIndex(-1);
  }

  // --- Loading screen ---
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="animate-pulse text-lg">로딩 중...</div>
      </div>
    );
  }

  // --- Login screen ---
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-3 tracking-tight">Automail</h1>
          <p className="text-gray-400 text-lg">이메일 작업공간</p>
          <p className="text-gray-600 text-sm mt-2">메일을 읽고, 쓰고, AI의 도움을 받으세요</p>
        </div>
        <button onClick={() => signIn("google")}
          className="bg-white text-gray-900 px-8 py-3.5 rounded-xl font-semibold hover:bg-gray-100 transition cursor-pointer flex items-center gap-3 shadow-lg">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google로 로그인
        </button>
      </div>
    );
  }

  // --- Main UI ---
  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-xl text-sm font-medium animate-slide-in ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>{toast.message}</div>
      )}

      {/* Send Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-3">
              {editorMode === "reply" ? "답장을 보내시겠습니까?" : "메일을 보내시겠습니까?"}
            </h3>
            <div className="space-y-1 text-sm text-gray-400 mb-3">
              <p>받는 사람: <span className="text-gray-200">{editorTo.join(", ")}</span></p>
              {editorCc.length > 0 && <p>참조(CC): <span className="text-gray-200">{editorCc.join(", ")}</span></p>}
              {editorBcc.length > 0 && <p>비밀참조(BCC): <span className="text-gray-200">{editorBcc.join(", ")}</span></p>}
              {editorSubject && <p>제목: <span className="text-gray-200">{editorSubject}</span></p>}
              {attachments.length > 0 && (
                <p>첨부파일: <span className="text-gray-200">{attachments.length}개 ({formatFileSize(attachments.reduce((s, a) => s + a.size, 0))})</span></p>
              )}
            </div>
            <div className="bg-gray-950 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{editorBody.slice(0, 500)}{editorBody.length > 500 ? "..." : ""}</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSend} disabled={sending}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-lg font-medium transition cursor-pointer">
                {sending ? "전송 중..." : "보내기"}
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-lg font-medium transition cursor-pointer">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Modal */}
      {showContacts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowContacts(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">주소록 관리</h3>
              <button onClick={() => setShowContacts(false)}
                className="text-gray-500 hover:text-white transition cursor-pointer text-xl">&times;</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">메일 전송 시 수신자가 자동으로 저장됩니다. VIP로 설정하면 VIP 탭에서 해당 연락처의 메일만 모아볼 수 있습니다.</p>

            {contactList.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm py-8">
                저장된 연락처가 없습니다
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1">
                {contactList.map((c) => (
                  <div key={c.email} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                    c.vip ? "bg-amber-600/10 border border-amber-500/20" : "bg-gray-800/50 border border-transparent hover:bg-gray-800"
                  }`}>
                    <button onClick={() => {
                        toggleVip(c.email);
                        setContactList(getContacts());
                      }}
                      className={`text-lg transition cursor-pointer shrink-0 ${
                        c.vip ? "text-amber-400 hover:text-amber-300" : "text-gray-600 hover:text-amber-400"
                      }`} title={c.vip ? "VIP 해제" : "VIP 설정"}>
                      &#9733;
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{c.email}</p>
                      {c.name && <p className="text-xs text-gray-500 truncate">{c.name}</p>}
                    </div>
                    <span className="text-[10px] text-gray-600 shrink-0">{c.count}회</span>
                    <button onClick={() => {
                        deleteContact(c.email);
                        setContactList(getContacts());
                      }}
                      className="text-gray-600 hover:text-red-400 transition cursor-pointer text-sm shrink-0" title="삭제">
                      &#128465;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-30 bg-gray-800 p-2 rounded-lg cursor-pointer">
        <span className="text-lg">{sidebarOpen ? "\u2715" : "\u2630"}</span>
      </button>

      {/* Left Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0 transition-transform duration-200 
        fixed md:relative z-20 h-full w-80 md:w-96 border-r border-gray-800 flex flex-col shrink-0 bg-gray-950`}>

        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="pl-8 md:pl-0">
              <h1 className="text-lg font-bold">Automail</h1>
              <p className="text-xs text-gray-500">{session.user?.email}</p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => signIn("google", undefined, { prompt: "select_account" })}
                className="text-xs text-blue-400 hover:text-blue-300 transition cursor-pointer">
                계정전환
              </button>
              <button onClick={() => signOut()}
                className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer">
                로그아웃
              </button>
            </div>
          </div>

          {/* Compose button */}
          <button onClick={openCompose}
            className="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer mb-2 flex items-center justify-center gap-2">
            <span className="text-lg leading-none">+</span> 새 메일 작성
          </button>

          {/* Contacts button */}
          <button onClick={() => { setContactList(getContacts()); setShowContacts(true); }}
            className="w-full bg-gray-800 hover:bg-gray-700 py-2 rounded-xl text-xs text-gray-400 transition cursor-pointer mb-3 flex items-center justify-center gap-1.5">
            <span>&#128209;</span> 주소록 관리
          </button>

          {/* Label filter */}
          <div className="flex gap-1 mb-3">
            {LABEL_ITEMS.map((item) => (
              <button key={item.key} onClick={() => handleLabelChange(item.key)}
                className={`flex-1 text-xs py-1.5 rounded-lg transition cursor-pointer ${
                  label === item.key && !searchQuery ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}>
                <span dangerouslySetInnerHTML={{ __html: item.icon }}
                  className={`mr-1 ${item.key === "VIP" ? "text-amber-400" : ""}`} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input ref={searchRef} type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="메일 검색... ( / )"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-gray-600" />
            <button type="submit" disabled={loading}
              className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition cursor-pointer">
              검색
            </button>
          </form>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-3 bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-800 rounded w-full" />
                  <div className="h-2 bg-gray-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : error && threads.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <button onClick={() => fetchThreads()}
                className="text-xs bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded transition cursor-pointer">
                다시 시도
              </button>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>메일이 없습니다</p>
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); fetchThreads(); }}
                  className="text-xs text-blue-400 mt-2 hover:underline cursor-pointer">전체 메일 보기</button>
              )}
            </div>
          ) : (
            <>
              {threads.map((thread, i) => (
                <div key={thread.id}
                  className={`relative flex items-start border-b border-gray-800/50 hover:bg-gray-900/80 transition ${
                    selectedIndex === i ? "bg-gray-900 border-l-2 border-l-blue-500" : ""
                  } ${thread.isUnread ? "bg-gray-900/30" : ""}`}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(thread.id, thread.isStarred); }}
                    className={`shrink-0 pt-4 pl-3 pr-1 text-base cursor-pointer transition hover:scale-110 ${
                      thread.isStarred ? "text-yellow-400" : "text-gray-700 hover:text-gray-500"
                    }`}
                    title={thread.isStarred ? "별표 해제" : "별표 추가"}>
                    {thread.isStarred ? "\u2605" : "\u2606"}
                  </button>
                  <button
                    onClick={() => openThread(thread.id)}
                    className="flex-1 text-left p-4 pl-2 cursor-pointer">
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm truncate max-w-[180px] ${thread.isUnread ? "font-bold text-white" : "font-medium text-gray-300"}`}>
                        {extractName(thread.from)}
                      </span>
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {thread.messageCount > 1 && (
                          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{thread.messageCount}</span>
                        )}
                        <span className="text-xs text-gray-600">{formatDate(thread.lastDate || thread.date)}</span>
                      </div>
                    </div>
                    <div className={`text-sm truncate mb-1 ${thread.isUnread ? "text-white" : "text-gray-400"}`}>
                      {thread.subject}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      {thread.messageCount > 1 && thread.lastFrom && (
                        <span className="text-gray-500">{extractName(thread.lastFrom)}: </span>
                      )}
                      {thread.snippet}
                    </div>
                  </button>
                </div>
              ))}
              {nextPageToken && (
                <div className="p-4 text-center">
                  <button onClick={() => fetchThreads(searchQuery || undefined, true)}
                    disabled={loadingMore}
                    className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-6 py-2 rounded-lg transition cursor-pointer">
                    {loadingMore ? "불러오는 중..." : "더 보기"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-10 bg-black/40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Right Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor mode (reply/compose) */}
        {editorMode ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor header */}
            <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 md:px-6 py-3 flex items-center justify-between z-10">
              <h2 className="text-base font-bold">
                {editorMode === "reply" ? "답장 작성" : "새 메일 작성"}
              </h2>
              <div className="flex gap-2">
                <button onClick={() => setShowAiPanel(!showAiPanel)}
                  className={`text-xs px-3 py-1.5 rounded transition cursor-pointer ${
                    showAiPanel ? "bg-purple-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                  }`}>
                  AI 작성
                </button>
                <button onClick={() => setEditorMode(null)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition cursor-pointer">
                  닫기
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="max-w-3xl mx-auto space-y-3">
                {/* AI panel */}
                {showAiPanel && (
                  <div className="bg-purple-950/30 border border-purple-800/50 rounded-xl p-4">
                    <p className="text-sm text-purple-300 mb-2">AI에게 작성을 요청하세요</p>
                    <div className="flex gap-2">
                      <input type="text" value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); requestAiDraft(); } }}
                        placeholder="예: 미팅 일정 확인 요청, 정중하게 거절, 견적서 요청 등..."
                        className="flex-1 bg-gray-900 border border-purple-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 transition placeholder:text-gray-600" />
                      <button onClick={requestAiDraft} disabled={aiDrafting}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer shrink-0">
                        {aiDrafting ? "작성 중..." : "작성"}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">비워두면 자동 작성 | 요청사항 입력 시 반영 | 서명·푸터 자동 포함</p>
                  </div>
                )}

                {/* To */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-gray-500 w-16 shrink-0 text-right mt-2">받는사람</label>
                  <EmailTagInput id="editor-to" emails={editorTo} onChange={setEditorTo} placeholder="이메일 주소 입력 후 Enter" autoFocus={editorMode === "compose"} />
                </div>

                {/* CC */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-gray-500 w-16 shrink-0 text-right mt-2">참조</label>
                  <EmailTagInput emails={editorCc} onChange={setEditorCc} placeholder="CC" />
                </div>

                {/* BCC */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-gray-500 w-16 shrink-0 text-right mt-2">비밀참조</label>
                  <EmailTagInput emails={editorBcc} onChange={setEditorBcc} placeholder="BCC" />
                </div>

                {/* Subject */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-500 w-16 shrink-0 text-right">제목</label>
                  <input type="text" value={editorSubject}
                    onChange={(e) => setEditorSubject(e.target.value)}
                    placeholder="메일 제목"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition" />
                </div>

                {/* Body */}
                <div className="mt-2 relative"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleEditorDrop}>
                  {aiDrafting && (
                    <div className="absolute inset-0 bg-gray-900/80 rounded-xl flex items-center justify-center z-10">
                      <div className="text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-sm text-purple-300">AI가 답장을 작성하고 있습니다...</p>
                      </div>
                    </div>
                  )}
                  <textarea ref={bodyRef} value={editorBody}
                    onChange={(e) => setEditorBody(e.target.value)}
                    rows={16}
                    style={{ fontFamily: "'맑은 고딕', 'Malgun Gothic', sans-serif", fontSize: "18px", lineHeight: "150%" }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-5 text-gray-200 resize-y min-h-[300px] focus:outline-none focus:border-blue-500/60 transition" />
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" multiple
                      onChange={(e) => handleFileSelect(e.target.files)}
                      className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5">
                      <span>&#128206;</span> 파일 첨부
                    </button>
                    <span className="text-[11px] text-gray-600">
                      드래그 앤 드롭 가능 · 최대 25MB
                      {attachments.length > 0 && (
                        <> · 총 {formatFileSize(attachments.reduce((s, a) => s + a.size, 0))}</>
                      )}
                    </span>
                  </div>
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-gray-300 truncate max-w-[160px]">{att.name}</span>
                          <span className="text-gray-500">{formatFileSize(att.size)}</span>
                          <button onClick={() => removeAttachment(i)}
                            className="text-gray-500 hover:text-red-400 transition cursor-pointer">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer preview */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
                  <p className="mb-1 text-gray-600">자동 추가 푸터:</p>
                  <p><strong className="text-gray-400">유진호</strong></p>
                  <p><a href="https://freekitlab.com/" className="text-blue-400">freekitlab.com</a> &nbsp;|&nbsp; Tel. 010-7207-5808</p>
                </div>

                {/* Action buttons + Schedule */}
                <div className="space-y-3 pt-2">
                  {/* Schedule indicator */}
                  {scheduleRemaining && (
                    <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 text-sm">&#9200;</span>
                        <span className="text-sm text-amber-300">{scheduleRemaining}</span>
                      </div>
                      <button onClick={cancelSchedule}
                        className="text-xs text-amber-400 hover:text-amber-200 transition cursor-pointer">
                        예약 취소
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => setShowConfirm(true)}
                      disabled={sending || editorTo.length === 0 || !editorBody.trim() || aiDrafting || !!scheduleRemaining}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-8 py-2.5 rounded-lg font-medium transition cursor-pointer">
                      {editorMode === "reply" ? "답장 보내기" : "메일 보내기"}
                    </button>

                    {!scheduleRemaining && (
                      <div className="relative">
                        <button onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                          disabled={editorTo.length === 0 || !editorBody.trim() || aiDrafting}
                          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5">
                          <span>&#128197;</span> 예약 보내기
                        </button>

                        {showSchedulePicker && (
                          <div className="absolute bottom-full mb-2 left-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 z-30 w-[280px]"
                            onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-gray-200">예약 발송 설정</h4>
                              <button onClick={() => setShowSchedulePicker(false)}
                                className="text-gray-500 hover:text-white transition cursor-pointer">&times;</button>
                            </div>

                            <label className="block text-xs text-gray-500 mb-1">날짜</label>
                            <input type="date" value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                              min={new Date().toISOString().slice(0, 10)}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition cursor-pointer mb-3" />

                            <label className="block text-xs text-gray-500 mb-1">시간</label>
                            <input type="time" value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition cursor-pointer mb-3" />

                            <div className="flex gap-2 text-xs text-gray-500 mb-3 flex-wrap">
                              {[
                                { label: "내일 오전 9시", fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); setScheduleDate(d.toISOString().slice(0, 10)); setScheduleTime("09:00"); }},
                                { label: "내일 오후 2시", fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); setScheduleDate(d.toISOString().slice(0, 10)); setScheduleTime("14:00"); }},
                                { label: "월요일 오전 9시", fn: () => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 1 : day === 1 ? 7 : 8 - day; d.setDate(d.getDate() + diff); setScheduleDate(d.toISOString().slice(0, 10)); setScheduleTime("09:00"); }},
                              ].map((preset) => (
                                <button key={preset.label} onClick={preset.fn}
                                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md px-2 py-1 transition cursor-pointer">
                                  {preset.label}
                                </button>
                              ))}
                            </div>

                            {scheduleDate && scheduleTime && (
                              <p className="text-xs text-amber-400 mb-3">
                                &#128197; {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            )}

                            <button onClick={handleScheduleSend}
                              disabled={!scheduleDate || !scheduleTime || editorTo.length === 0 || !editorBody.trim()}
                              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-lg text-sm font-medium transition cursor-pointer">
                              예약 확정
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <button onClick={() => { cancelSchedule(); setEditorMode(null); }}
                      className="text-sm text-gray-500 hover:text-gray-300 transition cursor-pointer">
                      취소
                    </button>
                  </div>
                </div>

                {/* Original thread (reply mode only) */}
                {editorMode === "reply" && threadDetail && (
                  <div className="border-t border-gray-800 pt-4 mt-2">
                    <p className="text-xs text-gray-500 mb-3 font-medium">원본 메일</p>
                    <div className="space-y-3">
                      {[...threadDetail.messages].reverse().map((msg) => {
                        const isMe = session?.user?.email && msg.from.includes(session.user.email);
                        return (
                          <div key={msg.id} className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
                            <div className="px-4 py-2 border-b border-gray-800/50 flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <span className={`text-xs font-medium ${isMe ? "text-blue-300" : "text-gray-300"}`}>
                                  {extractName(msg.from)}
                                  {isMe && <span className="text-[10px] text-blue-500 ml-1">나</span>}
                                </span>
                                <p className="text-[10px] text-gray-600 truncate">{extractEmail(msg.from)} &rarr; {extractEmail(msg.to)}</p>
                              </div>
                              <span className="text-[10px] text-gray-600 shrink-0">{formatFullDate(msg.date)}</span>
                            </div>
                            <div className="px-4 py-3">
                              <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">{msg.body || "(본문 없음)"}</pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400">메일 불러오는 중...</p>
            </div>
          </div>
        ) : !threadDetail ? (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center space-y-4">
              <div className="text-5xl opacity-30">&#9993;</div>
              <p className="text-xl">메일을 선택하세요</p>
              <button onClick={openCompose}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer inline-flex items-center gap-2">
                <span className="text-lg leading-none">+</span> 새 메일 작성
              </button>
              <p className="text-sm text-gray-700">j/k로 이동 · / 검색 · Esc 닫기</p>
            </div>
          </div>
        ) : (
          /* Thread detail view */
          <div className="flex-1 overflow-y-auto">
            {/* Thread header + actions */}
            <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 md:px-6 py-3 z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base md:text-lg font-bold truncate">{threadDetail.subject}</h2>
                  <p className="text-xs text-gray-500">{threadDetail.messages.length}개 메시지</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button onClick={() => { setReplyChoiceAll(false); setShowReplyChoice(true); }}
                    className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded font-medium transition cursor-pointer">
                    답장
                  </button>
                  <button onClick={() => { setReplyChoiceAll(true); setShowReplyChoice(true); }}
                    className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition cursor-pointer">
                    전체답장
                  </button>
                  <button onClick={requestAnalysis} disabled={analyzing}
                    className="text-xs bg-purple-700/80 hover:bg-purple-600 disabled:opacity-50 px-3 py-1.5 rounded transition cursor-pointer">
                    {analyzing ? "분석 중..." : "AI 분석"}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              {/* Reply choice modal */}
              {showReplyChoice && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-gray-200">
                    {replyChoiceAll ? "전체 답장" : "답장"} 방식을 선택하세요
                  </h3>
                  <div className="flex gap-3">
                    <button onClick={() => openReply(replyChoiceAll, false)}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-medium text-sm transition cursor-pointer flex flex-col items-center gap-1">
                      <span className="text-lg">&#9997;</span>
                      직접 작성
                    </button>
                    <button onClick={() => openReply(replyChoiceAll, true)}
                      className="flex-1 bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-medium text-sm transition cursor-pointer flex flex-col items-center gap-1">
                      <span className="text-lg">&#10024;</span>
                      AI 답장
                    </button>
                  </div>
                  <button onClick={() => setShowReplyChoice(false)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer w-full text-center mt-1">
                    취소
                  </button>
                </div>
              )}

              {/* AI Analysis (if requested) */}
              {analysis && (
                <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-4 md:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-purple-300 font-semibold text-sm flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />AI 분석 결과
                    </h3>
                    {analysis.urgency && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${URGENCY_STYLES[analysis.urgency]?.bg} ${URGENCY_STYLES[analysis.urgency]?.text}`}>
                        {URGENCY_STYLES[analysis.urgency]?.label}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-blue-400 font-medium mb-1">핵심 요약</p>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
                  </div>
                  {analysis.requirements.length > 0 && (
                    <div>
                      <p className="text-xs text-amber-400 font-medium mb-1">상대 요구사항</p>
                      <ul className="space-y-1">
                        {analysis.requirements.map((r, i) => (
                          <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="text-amber-500/70 mt-0.5 text-xs">&#9654;</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.nextActions.length > 0 && (
                    <div>
                      <p className="text-xs text-green-400 font-medium mb-1">다음 액션</p>
                      <ul className="space-y-1">
                        {analysis.nextActions.map((a, i) => (
                          <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="bg-green-500/20 text-green-400 text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded shrink-0 mt-0.5">{i + 1}</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.draftReply && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-purple-400 font-medium">AI 추천 답장</p>
                        <button onClick={() => {
                          openReply(false);
                          setTimeout(() => setEditorBody(analysis.draftReply), 50);
                        }}
                          className="text-[11px] text-purple-400 hover:text-purple-300 transition cursor-pointer">
                          답장에 적용
                        </button>
                      </div>
                      <p className="text-sm text-gray-400 whitespace-pre-wrap bg-gray-900/50 rounded-lg p-3">{analysis.draftReply}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              {threadDetail.messages.map((msg, i) => {
                const isMe = session.user?.email && msg.from.includes(session.user.email);
                const isLast = i === threadDetail.messages.length - 1;
                const senderEmail = extractEmail(msg.from).toLowerCase();
                const senderIsVip = vipSet.has(senderEmail);
                return (
                  <div key={msg.id} className={`bg-gray-900 rounded-xl border ${isLast ? "border-gray-700" : "border-gray-800"} overflow-hidden`}>
                    <div className="px-4 md:px-5 py-3 border-b border-gray-800/50 flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-medium ${isMe ? "text-blue-300" : "text-gray-200"}`}>
                            {extractName(msg.from)}
                          </span>
                          {isMe && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">나</span>}
                          {!isMe && (
                            <button onClick={() => handleToggleVip(msg.from)}
                              className={`text-sm transition cursor-pointer ${
                                senderIsVip ? "text-amber-400 hover:text-amber-300" : "text-gray-700 hover:text-amber-400"
                              }`} title={senderIsVip ? "VIP 해제" : "VIP 지정"}>
                              &#9733;
                            </button>
                          )}
                          {senderIsVip && !isMe && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">VIP</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-600 truncate">
                          {extractEmail(msg.from)}
                          {msg.to && <> &rarr; {extractEmail(msg.to)}</>}
                        </p>
                        {msg.cc && <p className="text-[11px] text-gray-600">CC: {msg.cc}</p>}
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{formatFullDate(msg.date)}</span>
                    </div>
                    <div className="px-4 md:px-5 py-4">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {msg.body || "(본문 없음)"}
                      </pre>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* App mode: Floating AI action buttons */}
        {isApp && threadDetail && !editorMode && selectedIndex >= 0 && (
          <div className="fixed bottom-6 right-4 z-30 flex flex-col gap-2 items-end">
            <button onClick={() => { openReply(false, true); }}
              className="bg-blue-600 hover:bg-blue-500 shadow-xl rounded-full px-4 py-3 text-sm font-medium transition flex items-center gap-2">
              <span>&#9998;</span> AI 답장
            </button>
            <button onClick={() => { openReply(false, false); }}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 shadow-xl rounded-full px-4 py-3 text-sm font-medium transition flex items-center gap-2">
              <span>&#8617;</span> 직접 답장
            </button>
            <button onClick={requestAnalysis}
              disabled={analyzing}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 shadow-xl rounded-full px-4 py-3 text-sm font-medium transition flex items-center gap-2">
              <span>&#9889;</span> {analyzing ? "분석 중..." : "AI 분석"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
