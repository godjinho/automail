# Automail - 이메일 스레드 답장 코파일럿

## 프로젝트 개요
Gmail 이메일 스레드를 읽고 AI가 핵심 요약, 상대 요구사항, 다음 액션, 답장 초안을 자동 생성해주는 웹 앱

## 기술 스택
- **프레임워크**: Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **인증**: NextAuth.js v4 (Google OAuth2 + Gmail API 스코프)
- **메일**: Gmail API (googleapis 패키지)
- **LLM**: DeepSeek (1순위) → GPT-4.1-mini (폴백)
- **패키지매니저**: npm

## 프로젝트 구조
```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth 핸들러
│   │   ├── threads/route.ts              # 스레드 목록 API
│   │   ├── threads/[id]/route.ts         # 스레드 상세 + AI 분석 API
│   │   └── send/route.ts                 # 답장 전송 API
│   ├── layout.tsx                         # 루트 레이아웃 (Providers 포함)
│   ├── page.tsx                           # 메인 페이지
│   ├── providers.tsx                      # SessionProvider
│   └── globals.css                        # Tailwind 글로벌 스타일
├── components/
│   └── MailCopilot.tsx                    # 메인 UI 컴포넌트
├── lib/
│   ├── auth.ts                            # NextAuth 설정 (authOptions)
│   ├── gmail.ts                           # Gmail API 유틸 (스레드 조회/상세)
│   └── analyze.ts                         # LLM 분석 (DeepSeek/GPT)
└── types/
    └── next-auth.d.ts                     # NextAuth 타입 확장
```

## 환경 변수 (.env.local)
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: Google OAuth2 클라이언트
- NEXTAUTH_URL / NEXTAUTH_SECRET: NextAuth 설정
- OPENAI_API_KEY: GPT 폴백용
- DEEPSEEK_API_KEY: 메인 LLM

## Google Cloud 설정
- 프로젝트: My First Project
- OAuth 클라이언트: Automail Web
- 리디렉션 URI: http://localhost:3000/api/auth/callback/google
- 스코프: gmail.readonly, gmail.send

## 핵심 흐름
1. Google 로그인 → access_token 획득
2. Gmail API로 스레드 목록 조회
3. 스레드 선택 → 상세 메시지 조회
4. LLM에 스레드 전달 → 4가지 분석 결과 수신 (요약/요구사항/액션/초안)
5. 답장 초안 편집 → Gmail API로 전송
