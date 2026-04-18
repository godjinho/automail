This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 업무비서(freeis-copilot) 브릿지 설정

`/api/threads`(INBOX) 호출 시 Gmail 조회 결과를 Firebase Firestore로 mirror
하여 업무비서 앱이 읽을 수 있게 한다. 이 기능은 **환경변수 `FIREBASE_SERVICE_ACCOUNT`가
있을 때만** 동작하고, 없으면 silent-skip 되므로 AutoMail 본래 기능에는 영향이 없다.

### 1) Firebase 콘솔에서 서비스 계정 생성

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트(예: `freekitlab`) 선택
2. 톱니바퀴 → **프로젝트 설정** → **서비스 계정** 탭
3. **새 비공개 키 생성** → `firebase-adminsdk-xxxxx.json` 다운로드
4. 이 JSON 파일은 **절대 Git에 커밋하지 말 것** (루트의 `.gitignore` 가 이미 차단).

### 2) Vercel 환경변수 등록

Vercel Dashboard → 프로젝트 → **Settings** → **Environment Variables** 에서

| Name | Value | Environments |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | JSON 전체 내용을 한 줄로 붙여넣기 (또는 base64 인코딩한 문자열) | Production, Preview, Development |

두 형식 모두 지원:
- 원본 JSON: `{"type":"service_account","project_id":"...", ... ,"private_key":"-----BEGIN PRIVATE KEY-----\n..."}`
  - 주의: Vercel UI에 붙여넣을 때 `private_key` 안의 `\n`은 그대로 두면 됨 (코드에서 자동 복원).
- base64: `echo -n "<JSON>" | base64 -w 0` 의 결과 문자열.

### 3) 배포 후 확인

Vercel 배포 후 AutoMail 앱에서 INBOX 목록을 한 번 열어보고, Firebase 콘솔 →
Firestore → `users/{emailKey}/inbox/...` 에 문서가 생기는지 확인한다.

`emailKey`는 Google 로그인 이메일을 URL-safe base64로 인코딩한 값이다.
예: `godjin.ho@gmail.com` → `Z29kamluLmhvQGdtYWlsLmNvbQ`

### 4) 문서 스키마

```
users/{emailKey}/inbox/{threadId}
  ├ id            : string (threadId와 동일)
  ├ accountEmail  : string  // 보안규칙 검증용 (소유자 email)
  ├ subject       : string
  ├ from          : string  // "Name <email@host>"
  ├ fromEmail     : string  // email만
  ├ snippet       : string
  ├ receivedAt    : number  // ms since epoch
  ├ unread        : boolean
  ├ starred       : boolean
  ├ messageCount  : number
  ├ threadId      : string
  ├ source        : "automail"
  ├ mirroredAt    : number  // ms, 마지막 mirror 시각
  ├ important?    : boolean // 업무비서가 판단/기록
  ├ notifiedAt?   : number  // 업무비서가 발화한 시각
  └ consumedAt?   : number  // 업무비서가 "처리 완료"로 마킹한 시각
```

### 5) Firestore Security Rules (권장 최소 구성)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{emailKey}/inbox/{msgId} {
      allow read: if request.auth != null
                   && resource.data.accountEmail == request.auth.token.email;
      // 클라이언트 write 금지 (AutoMail은 Admin SDK로만 쓰고,
      // 업무비서는 important/notifiedAt/consumedAt만 업데이트):
      allow create: if false;
      allow delete: if false;
      allow update: if request.auth != null
                    && resource.data.accountEmail == request.auth.token.email
                    && request.resource.data.diff(resource.data).affectedKeys()
                         .hasOnly(['important','notifiedAt','consumedAt']);
    }
  }
}
```

### 6) 동기화 트리거

현재는 사용자가 AutoMail에서 INBOX 목록을 열 때마다 해당 페이지의 스레드들이
Firestore로 mirror 된다 (최대 30건, 30초 내 동일 문서 중복 쓰기 방지).
앱을 오래 안 열면 동기화가 멈추므로, 이후 Vercel Cron으로 보완할 수 있다.

