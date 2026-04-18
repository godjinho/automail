/**
 * Firebase Admin SDK 초기화 + email→documentKey 유틸.
 *
 * 업무비서(com.freeis.copilot)와 AutoMail(이 앱) 사이의 유일한 공통 키는
 * 사용자의 Google 이메일이다. NextAuth(Google)와 Firebase Auth(Google)는
 * 같은 계정이라도 서로 다른 UID를 발급하기 때문에, 경로 키를 email에서
 * 유도한다.
 *
 * - emailToKey(email) = URL-safe base64 of lowercased email, no padding
 *   예) godjin.ho@gmail.com → "Z29kamluLmhvQGdtYWlsLmNvbQ"
 *
 * 서비스 계정 JSON은 Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT 로 주입.
 * 값이 없으면 초기화가 silent-skip 되고 mirror 호출은 no-op이 된다.
 * (로컬 개발이나 환경변수 미설정 시에도 Gmail 조회 자체는 영향 받지 않음)
 */

import type { App, ServiceAccount } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;
let initAttempted = false;

function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? JSON.parse(raw)
      : JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    if (!json.project_id || !json.client_email || !json.private_key) {
      return null;
    }
    return {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: (json.private_key as string).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export async function getFirestoreAdmin(): Promise<Firestore | null> {
  if (cachedDb) return cachedDb;
  if (initAttempted) return null;
  initAttempted = true;

  const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!sa) {
    console.warn(
      "[firestore] FIREBASE_SERVICE_ACCOUNT 미설정 또는 파싱 실패 - mirror skip"
    );
    return null;
  }

  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    cachedApp =
      getApps()[0] ??
      initializeApp({
        credential: cert(sa),
      });

    cachedDb = getFirestore(cachedApp);
    return cachedDb;
  } catch (err) {
    console.error("[firestore] Admin SDK 초기화 실패:", err);
    return null;
  }
}

/**
 * email을 Firestore document ID로 쓰기 위한 URL-safe base64 인코딩.
 * - lower case
 * - trim
 * - base64url (padding 제거)
 */
export function emailToKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  return Buffer.from(normalized, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
