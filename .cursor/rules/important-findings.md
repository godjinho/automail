# Important Findings

## 2026-04-16

### Google Cloud Console UI 변경
- OAuth 동의 화면 설정 UI가 변경됨
- 현재: "프로젝트 구성" 4단계 (앱 정보 → 대상 → 연락처 정보 → 완료)

### NextAuth + Gmail API 조합
- authOptions를 별도 파일(src/lib/auth.ts)로 분리 필수
- Gmail API 스코프: authorization.params.scope에 포함
- access_type: "offline" + prompt: "consent" 필수 (refresh_token용)

### 토큰 자동 갱신
- Google access_token 1시간 후 만료
- jwt callback에서 expiresAt 체크 → 만료 1분 전 갱신
- refresh 실패 시 session.error = "RefreshTokenError" → 클라이언트 자동 재로그인

### Gmail API 최적화
- listThreads: Promise.all 병렬 처리 (N+1 해결)
- metadata format으로 목록 조회 (가볍게)
- full format은 상세 조회 시만 사용
- pageToken으로 페이지네이션 구현

### HTML 메일 처리
- 추출 우선순위: text/plain → text/html → multipart 재귀
- HTML → 텍스트: br/p/div → 줄바꿈, 엔티티 디코딩, 태그 제거

### 이메일 인용문(Quote) 제거 — LLM 품질 핵심
- "On [date], [person] wrote:" 패턴 감지 및 이하 인용문 제거
- "--- Original Message ---", "--- 전달된 메시지 ---" 패턴 처리
- ">>" 시작 라인 제거
- 이 처리 없이는 LLM이 중복 인용문에 토큰을 낭비하여 분석 품질 저하

### 답장 헤더 (In-Reply-To, References)
- 마지막 메시지의 Message-ID → In-Reply-To
- 기존 References 체인 이어서 설정
- From 헤더도 포함해야 Gmail에서 발신자 이름이 정상 표시

### LLM 분석 캐싱
- 메모리 Map 기반, key = threadId:tone
- TTL 5분, 최대 50개 (초과 시 가장 오래된 것 제거)
- force=true 파라미터로 강제 무효화 가능

### 긴급도 감지
- LLM 프롬프트에 urgency 판단 기준 명시
- high: 기한 임박, "긴급", ASAP, 결제/법적 이슈
- medium: 일반 업무 요청
- low: 정보 공유, 안부

### 모바일 반응형
- md: breakpoint 기준으로 사이드바 슬라이드 전환
- translate-x + backdrop 오버레이 패턴
- 스레드 선택 시 자동으로 사이드바 닫힘

### API 에러 처리
- 401 → signIn("google") 자동 호출
- 429 → "요청이 너무 많습니다" 사용자 안내
- invalid_grant → "인증 만료" 안내

### 서비스 방향 전환 (3차)
- 기존: AI 자동분석 중심 → 스레드 클릭하면 바로 분석 시작
- 변경: 사용자 작업공간 → 스레드 클릭하면 메일 내용만 표시
- AI 분석은 "AI 분석" 버튼을 누를 때만 /api/threads/[id]?analyze=true로 호출
- AI 초안 작성은 /api/draft POST로 별도 분리
- 회신/새메일 에디터: To/CC/BCC 필드 포함, EditorMode로 상태 관리
- HTML 메일 전송: multipart/alternative (text/plain + text/html)
- 기본 서명 규칙: "안녕하세요, 유진호 입니다." → 본문 → "유진호 올림"
- 자동 푸터: freekitlab.com | 010-7207-5808
- 글씨체: 맑은고딕, 18px, 줄간격 150%
- DeepSeek 1순위, GPT-4.1-mini 폴백 유지

### Vercel 빌드 관련
- LLM 클라이언트는 반드시 lazy 초기화 (getOpenAI/getDeepSeek 패턴)
- top-level에서 process.env 접근 시 빌드 타임 에러 발생
- NEXTAUTH_URL 환경변수 Vercel에 반드시 설정 필요

### 클라이언트 측 메일 전송 (첨부파일)
- Vercel 서버리스 함수 payload 제한 → 첨부파일 포함 시 클라이언트에서 직접 Gmail API 호출
- sendMailDirect: src/lib/mail-client.ts, multipart/mixed MIME 구성
- Gmail 25MB 첨부제한 활용, fileToAttachment로 base64 변환

### From 헤더 MIME 인코딩
- 한글 이름("유진호")은 RFC 2047 Base64 MIME 인코딩 필수
- `=?UTF-8?B?{base64}?=` 형식으로 인코딩해야 이메일 클라이언트에서 정상 표시

### LLM 프롬프트 파싱 (새 메일 작성)
- JSON 형식은 본문 내 개행 문자로 인해 파싱 실패 빈번
- 해결: `===SUBJECT===` / `===BODY===` 구분자 방식으로 변경
- JSON 폴백도 유지하되, 개행 이스케이프 처리 필요

### 자동 주소록 (2026-04-16)
- localStorage 기반, key: "automail_contacts"
- Contact: { email, name, vip, count, lastUsed }
- 메일 전송 시 saveRecipientsFromSend()로 자동 저장
- EmailTagInput에 자동완성 드롭다운 (searchContacts → 화살표/Enter 선택)
- VIP 토글 → VIP 탭에서 from:(vip1 OR vip2...) Gmail 검색으로 필터링
- 주소록 관리 모달: 사이드바 "주소록 관리" 버튼 → 목록/VIP 토글/삭제

### 개인별 발송 (2026-04-25)
- "개인별로 보내기"는 To 수신자만 한 명씩 분리하여 별도 메시지로 전송한다.
- CC/BCC는 각 개인별 메일에 동일하게 붙는다. 수신자 간 완전 비공개가 필요하면 CC를 비우고 BCC만 사용해야 한다.
- 첨부파일 없는 발송은 `/api/send` 서버 라우트가 `sendIndividually`를 처리한다.
- 첨부파일 있는 발송은 Vercel payload 제한 때문에 기존처럼 클라이언트에서 Gmail API를 직접 호출하며, `MailCopilot`에서 수신자별 루프를 돈다.

### 대량메일 엑셀 수신처 (2026-04-25)
- 엑셀 수신처 import는 `xlsx` 패키지로 클라이언트에서 파일을 읽는다.
- 업로드한 엑셀 파일은 저장하지 않고, 브라우저 메모리에서 이메일 추출 후 input value를 비운다.
- 모든 시트/셀을 문자열화한 뒤 이메일 정규식으로 이메일만 추출하고, 소문자 기준으로 중복 제거한다.
- To 수신처는 최대 100명으로 제한한다. 초과분은 제외하고 토스트로 안내한다.
- 엑셀 import 성공 시 `sendIndividually=true`로 자동 전환한다.
- 기본 참조 3명은 UI에서 삭제되어도 `handleSend()`에서 `withDefaultCc()`로 다시 포함한다.
- "새 메일 작성"은 바로 작성 화면으로 가지 않고 "신규작성/엑셀업로드" 선택 모달을 먼저 띄운다.
