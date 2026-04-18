/**
 * Gmail 스레드 조회 결과를 Firestore로 mirror 한다.
 *
 * 경로: users/{emailKey}/inbox/{msgId}
 *  - emailKey  : emailToKey(session.user.email)
 *  - msgId     : Gmail 스레드 ID (thread.id). 한 스레드의 마지막 메시지를
 *                대표로 기록하므로 스레드가 길어지면 같은 문서가 갱신된다.
 *
 * 호출 방식: fire-and-forget.
 *  - `mirrorThreads(...)` 는 절대 throw 하지 않는다.
 *  - 응답 지연을 유발하지 않도록 `/api/threads` 에서는 `void` 로 호출한다.
 *
 * 보안 모델:
 *  - Admin SDK로 쓰기 때문에 Firestore Rules는 client read에만 적용된다.
 *  - 문서에 `accountEmail` 필드를 포함시켜, 업무비서 쪽 Security Rules 가
 *    `request.auth.token.email == resource.data.accountEmail` 로 검증 가능.
 */

import type { GmailThread } from "@/lib/gmail";
import { emailToKey, getFirestoreAdmin } from "@/lib/firestore";

// 단일 responses 에서 이 값보다 많이 mirror 하지 않는다(비용/지연 억제).
const MIRROR_LIMIT = 30;

// 같은 프로세스 내에서 한 문서에 짧은 시간 내 중복 쓰기를 방지.
// msgId -> 마지막 mirror 타임스탬프(ms)
const recentlyMirrored = new Map<string, number>();
const DEDUP_WINDOW_MS = 30 * 1000; // 30s

function shouldSkip(msgId: string): boolean {
  const last = recentlyMirrored.get(msgId);
  if (last == null) return false;
  return Date.now() - last < DEDUP_WINDOW_MS;
}

function markMirrored(msgId: string) {
  recentlyMirrored.set(msgId, Date.now());
  // 메모리 누수 방지용 간단한 정리 (10,000건 이상 시 오래된 것 제거)
  if (recentlyMirrored.size > 10_000) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [k, v] of recentlyMirrored) {
      if (v < cutoff) recentlyMirrored.delete(k);
    }
  }
}

/**
 * Date 헤더 문자열 → ms since epoch. 실패 시 현재 시각.
 */
function parseDateMs(dateStr: string | undefined): number {
  if (!dateStr) return Date.now();
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * "John Doe <john@example.com>" 형식에서 email 부분만 추출.
 */
function extractEmail(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim();
}

export async function mirrorThreads(
  accountEmail: string | undefined,
  threads: GmailThread[]
): Promise<void> {
  try {
    if (!accountEmail || threads.length === 0) return;

    const db = await getFirestoreAdmin();
    if (!db) return; // 초기화 실패 시 silent-skip

    const emailKey = emailToKey(accountEmail);
    const writer = db.bulkWriter();
    writer.onWriteError((err) => {
      if (err.failedAttempts < 3) return true;
      console.warn("[mirror] write 실패(3회):", err.message);
      return false;
    });

    const targets = threads.slice(0, MIRROR_LIMIT);
    let mirrored = 0;

    for (const t of targets) {
      if (shouldSkip(t.id)) continue;

      const receivedAt = parseDateMs(t.lastDate || t.date);
      const docRef = db
        .collection("users")
        .doc(emailKey)
        .collection("inbox")
        .doc(t.id);

      // 업무비서가 수정하는 필드(important/notifiedAt/consumedAt)는
      // merge: true 로 보존. AutoMail은 Gmail 원본 필드만 set.
      writer.set(
        docRef,
        {
          id: t.id,
          accountEmail: accountEmail.toLowerCase(),
          subject: t.subject || "",
          from: t.lastFrom || t.from || "",
          fromEmail: extractEmail(t.lastFrom || t.from || ""),
          snippet: t.snippet || "",
          receivedAt,
          unread: t.isUnread,
          starred: t.isStarred,
          messageCount: t.messageCount,
          threadId: t.id,
          source: "automail",
          mirroredAt: Date.now(),
        },
        { merge: true }
      );

      markMirrored(t.id);
      mirrored++;
    }

    await writer.close();

    if (mirrored > 0) {
      console.log(
        `[mirror] ${mirrored}건 기록 (emailKey=${emailKey.slice(0, 12)}…)`
      );
    }
  } catch (err) {
    // fire-and-forget: 어떤 에러도 상위로 전파 금지
    console.warn(
      "[mirror] mirrorThreads 전체 실패(무시):",
      err instanceof Error ? err.message : err
    );
  }
}
