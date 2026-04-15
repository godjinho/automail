"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";

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

interface Analysis {
  summary: string;
  requirements: string[];
  nextActions: string[];
  draftReply: string;
  urgency: "high" | "medium" | "low";
}

type Tone = "formal" | "friendly" | "concise" | "detailed";
type Label = "INBOX" | "SENT" | "STARRED" | "IMPORTANT";

const TONE_LABELS: Record<Tone, string> = {
  formal: "격식체",
  friendly: "친근하게",
  concise: "간결하게",
  detailed: "상세하게",
};

const LABEL_ITEMS: { key: Label; label: string; icon: string }[] = [
  { key: "INBOX", label: "받은편지함", icon: "&#9993;" },
  { key: "SENT", label: "보낸편지함", icon: "&#10148;" },
  { key: "STARRED", label: "별표", icon: "&#9733;" },
  { key: "IMPORTANT", label: "중요", icon: "&#9888;" },
];

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-500/15", text: "text-red-400", label: "긴급" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "보통" },
  low: { bg: "bg-gray-500/15", text: "text-gray-400", label: "낮음" },
};

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
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<{
    thread: { id: string; subject: string; messages: Message[] };
    analysis: Analysis;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [draftReply, setDraftReply] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tone, setTone] = useState<Tone>("formal");
  const [label, setLabel] = useState<Label>("INBOX");
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const threadListRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  // --- 키보드 단축키 ---
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, threads.length - 1);
          if (threads[next]) selectThread(threads[next].id);
          return next;
        });
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          if (threads[next]) selectThread(threads[next].id);
          return next;
        });
      }
      if (e.key === "Escape") {
        setSelectedThread(null);
        setSelectedIndex(-1);
        setShowConfirm(false);
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && selectedThread) {
        e.preventDefault();
        handleReanalyze();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [threads, selectedThread, tone]);

  async function fetchThreads(query?: string, append = false) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setNextPageToken(undefined);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (append && nextPageToken) params.set("pageToken", nextPageToken);
      if (!query) params.set("label", label);

      const res = await fetch(`/api/threads?${params}`);
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) { signIn("google"); return; }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (append) {
        setThreads((prev) => [...prev, ...(data.threads || [])]);
      } else {
        setThreads(data.threads || []);
      }
      setNextPageToken(data.nextPageToken);
    } catch (err: any) {
      setError(err.message);
      showToast("메일 조회 실패: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function selectThread(threadId: string, selectedTone?: Tone, force = false) {
    setAnalyzing(true);
    setError(null);
    const idx = threads.findIndex((t) => t.id === threadId);
    if (idx >= 0) setSelectedIndex(idx);

    try {
      const t = selectedTone || tone;
      const url = `/api/threads/${threadId}?tone=${t}${force ? "&force=true" : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) { signIn("google"); return; }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.thread && data.analysis) {
        setSelectedThread(data);
        setDraftReply(data.analysis.draftReply);
        // 모바일에서는 사이드바 닫기
        if (window.innerWidth < 768) setSidebarOpen(false);
      }
    } catch (err: any) {
      setError(err.message);
      showToast("분석 실패: " + err.message, "error");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleReanalyze() {
    if (!selectedThread) return;
    selectThread(selectedThread.thread.id, tone, true);
  }

  function handleToneChange(newTone: Tone) {
    setTone(newTone);
    if (selectedThread) selectThread(selectedThread.thread.id, newTone);
  }

  function handleLabelChange(newLabel: Label) {
    setLabel(newLabel);
    setSearchQuery("");
    setSelectedThread(null);
    setSelectedIndex(-1);
  }

  function getReplyRecipients() {
    if (!selectedThread) return { to: "", cc: "" };
    const lastMsg = selectedThread.thread.messages[selectedThread.thread.messages.length - 1];
    const myEmail = session?.user?.email || "";
    const to = extractEmail(lastMsg.from);

    if (!replyAll) return { to, cc: "" };

    const allTo = lastMsg.to?.split(",").map((e) => extractEmail(e.trim())) || [];
    const allCc = lastMsg.cc?.split(",").map((e) => extractEmail(e.trim())) || [];
    const ccList = [...allTo, ...allCc]
      .filter((e) => e && e !== myEmail && e !== to)
      .filter((e, i, arr) => arr.indexOf(e) === i);

    return { to, cc: ccList.join(", ") };
  }

  async function handleSend() {
    if (!selectedThread || !draftReply.trim()) return;
    setSending(true);
    const lastMsg = selectedThread.thread.messages[selectedThread.thread.messages.length - 1];
    const { to, cc } = getReplyRecipients();

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread.thread.id,
          to,
          cc: cc || undefined,
          subject: selectedThread.thread.subject,
          body: draftReply,
          messageId: lastMsg.messageId,
          references: lastMsg.references,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("답장이 전송되었습니다", "success");
        setShowConfirm(false);
      } else {
        showToast("전송 실패: " + data.error, "error");
        setShowConfirm(false);
      }
    } catch {
      showToast("전송 중 오류가 발생했습니다", "error");
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draftReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchThreads(searchQuery || undefined);
  }

  // --- 로딩 ---
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="animate-pulse text-lg">로딩 중...</div>
      </div>
    );
  }

  // --- 로그인 ---
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-3 tracking-tight">Automail</h1>
          <p className="text-gray-400 text-lg">이메일 스레드 답장 코파일럿</p>
          <p className="text-gray-600 text-sm mt-2">AI가 메일을 읽고 요약 · 분석 · 답장 초안까지</p>
        </div>
        <button
          onClick={() => signIn("google")}
          className="bg-white text-gray-900 px-8 py-3.5 rounded-xl font-semibold hover:bg-gray-100 transition cursor-pointer flex items-center gap-3 shadow-lg"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google로 로그인
        </button>
        <p className="text-gray-700 text-xs">키보드: j/k 이동 · Enter 선택 · / 검색 · r 재분석 · Esc 닫기</p>
      </div>
    );
  }

  const urgencyStyle = selectedThread ? URGENCY_STYLES[selectedThread.analysis.urgency] || URGENCY_STYLES.medium : null;
  const { to: replyTo, cc: replyCc } = getReplyRecipients();

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 토스트 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-xl text-sm font-medium animate-slide-in ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>{toast.message}</div>
      )}

      {/* 전송 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-3">답장을 보내시겠습니까?</h3>
            <div className="space-y-1 text-sm text-gray-400 mb-3">
              <p>받는 사람: <span className="text-gray-200">{replyTo}</span></p>
              {replyCc && <p>CC: <span className="text-gray-200">{replyCc}</span></p>}
            </div>
            <div className="bg-gray-950 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{draftReply.slice(0, 500)}{draftReply.length > 500 ? "..." : ""}</p>
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

      {/* 모바일 사이드바 토글 */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-30 bg-gray-800 p-2 rounded-lg cursor-pointer">
        <span className="text-lg">{sidebarOpen ? "\u2715" : "\u2630"}</span>
      </button>

      {/* 좌측 사이드바 */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0 transition-transform duration-200 
        fixed md:relative z-20 h-full w-80 md:w-96 border-r border-gray-800 flex flex-col shrink-0 bg-gray-950`}>

        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="pl-8 md:pl-0">
              <h1 className="text-lg font-bold">Automail</h1>
              <p className="text-xs text-gray-500">{session.user?.email}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setSearchQuery(""); fetchThreads(); }} disabled={loading}
                className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded transition cursor-pointer">
                {loading ? "..." : "새로고침"}
              </button>
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

          {/* 라벨 필터 */}
          <div className="flex gap-1 mb-3">
            {LABEL_ITEMS.map((item) => (
              <button key={item.key} onClick={() => handleLabelChange(item.key)}
                className={`flex-1 text-xs py-1.5 rounded-lg transition cursor-pointer ${
                  label === item.key && !searchQuery ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}>
                <span dangerouslySetInnerHTML={{ __html: item.icon }} className="mr-1" />
                {item.label}
              </button>
            ))}
          </div>

          {/* 검색 */}
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

        <div className="flex-1 overflow-y-auto" ref={threadListRef}>
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
                <button key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`w-full text-left p-4 border-b border-gray-800/50 hover:bg-gray-900/80 transition cursor-pointer ${
                    selectedIndex === i ? "bg-gray-900 border-l-2 border-l-blue-500" : ""
                  } ${thread.isUnread ? "bg-gray-900/30" : ""}`}>
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
              ))}

              {/* 더 보기 */}
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

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-10 bg-black/40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* 우측 분석 패널 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {analyzing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-1">AI가 스레드를 분석 중...</p>
              <p className="text-gray-600 text-sm">요약 · 요구사항 · 액션 · 답장 초안 · 긴급도</p>
            </div>
          </div>
        ) : !selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center space-y-3">
              <div className="text-5xl opacity-30">&#9993;</div>
              <p className="text-xl">메일을 선택하세요</p>
              <p className="text-sm text-gray-700">j/k로 이동 · / 검색 · r 재분석</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* 상단 바 */}
            <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 md:px-6 py-3 flex items-center justify-between z-10 gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-base md:text-lg font-bold truncate">{selectedThread.thread.subject}</h2>
                  {urgencyStyle && (
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyStyle.bg} ${urgencyStyle.text}`}>
                      {urgencyStyle.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{selectedThread.thread.messages.length}개 메시지</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select value={tone} onChange={(e) => handleToneChange(e.target.value as Tone)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 md:px-3 py-1.5 text-xs cursor-pointer focus:outline-none focus:border-blue-500">
                  {Object.entries(TONE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button onClick={handleReanalyze} disabled={analyzing}
                  className="bg-gray-800 hover:bg-gray-700 px-2 md:px-3 py-1.5 rounded-lg text-xs transition cursor-pointer disabled:opacity-50">
                  재분석
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-5">
              {/* 핵심 요약 */}
              <section className="bg-gray-900 rounded-xl p-4 md:p-5 border border-gray-800">
                <h3 className="text-blue-400 font-semibold mb-3 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />핵심 요약
                </h3>
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap text-[15px]">{selectedThread.analysis.summary}</p>
              </section>

              {/* 상대 요구사항 */}
              <section className="bg-gray-900 rounded-xl p-4 md:p-5 border border-gray-800">
                <h3 className="text-amber-400 font-semibold mb-3 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />상대 요구사항
                </h3>
                {selectedThread.analysis.requirements.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedThread.analysis.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-gray-300 text-[15px]">
                        <span className="text-amber-500/70 mt-1 text-xs">&#9654;</span>{req}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-gray-600 text-sm">특별한 요구사항이 감지되지 않았습니다</p>}
              </section>

              {/* 다음 액션 */}
              <section className="bg-gray-900 rounded-xl p-4 md:p-5 border border-gray-800">
                <h3 className="text-green-400 font-semibold mb-3 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />다음 액션
                </h3>
                {selectedThread.analysis.nextActions.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedThread.analysis.nextActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-gray-300 text-[15px]">
                        <span className="bg-green-500/20 text-green-400 text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded shrink-0 mt-0.5">{i + 1}</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-gray-600 text-sm">추가 액션이 없습니다</p>}
              </section>

              {/* 답장 초안 */}
              <section className="bg-gray-900 rounded-xl p-4 md:p-5 border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-purple-400 font-semibold text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />답장 초안
                  </h3>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={replyAll}
                        onChange={(e) => setReplyAll(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-600 accent-blue-500" />
                      <span className="text-xs text-gray-500">전체답장</span>
                    </label>
                    <button onClick={handleCopy}
                      className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer">
                      {copied ? "복사됨!" : "복사"}
                    </button>
                  </div>
                </div>

                {/* 받는사람 표시 */}
                <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                  <p>받는 사람: <span className="text-gray-400">{replyTo}</span></p>
                  {replyCc && <p>CC: <span className="text-gray-400">{replyCc}</span></p>}
                </div>

                <textarea value={draftReply} onChange={(e) => setDraftReply(e.target.value)} rows={8}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg p-4 text-gray-200 text-[15px] resize-y min-h-[160px] focus:outline-none focus:border-purple-500/60 transition leading-relaxed" />
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={() => setShowConfirm(true)} disabled={sending || !draftReply.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2.5 rounded-lg font-medium transition cursor-pointer text-sm">
                    답장 보내기
                  </button>
                  <button onClick={() => setDraftReply(selectedThread.analysis.draftReply)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer">
                    초안 되돌리기
                  </button>
                </div>
              </section>

              {/* 원본 스레드 */}
              <details className="bg-gray-900 rounded-xl border border-gray-800">
                <summary className="p-4 md:p-5 cursor-pointer text-gray-400 hover:text-gray-200 transition text-sm">
                  원본 메일 스레드 ({selectedThread.thread.messages.length}개)
                </summary>
                <div className="px-4 md:px-5 pb-5 space-y-5">
                  {selectedThread.thread.messages.map((msg) => {
                    const isMe = session.user?.email && msg.from.includes(session.user.email);
                    return (
                      <div key={msg.id} className={`border-l-2 pl-4 ${isMe ? "border-blue-500/50" : "border-gray-700"}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className={`text-sm font-medium ${isMe ? "text-blue-300" : "text-gray-300"}`}>
                              {extractName(msg.from)}
                              {isMe && <span className="text-[10px] text-blue-500 ml-1.5">나</span>}
                            </span>
                            {msg.cc && <p className="text-[10px] text-gray-600 mt-0.5">CC: {msg.cc}</p>}
                          </div>
                          <span className="text-xs text-gray-600">{formatDate(msg.date)}</span>
                        </div>
                        <pre className="text-sm text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
                          {msg.body || "(본문 없음)"}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
