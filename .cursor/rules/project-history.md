# Project History

## 2026-04-16
- Automail 프로젝트 최초 생성
- Next.js 16 + TypeScript + Tailwind CSS 기반 프로젝트 초기화
- Google OAuth2 (NextAuth.js) 설정 완료
- Gmail API 연동 구현 (스레드 목록/상세 조회, 답장 전송)
- LLM 분석 엔진 구현 (DeepSeek 1순위, GPT-4.1-mini 폴백)
- 메인 UI 뼈대 구현 (좌측 메일목록 + 우측 분석패널)
- Google Cloud Console 신규 계정으로 설정 완료 (OAuth 클라이언트 생성)

### 1차 보완
- 토큰 자동 갱신 (access_token 만료 1분 전 자동 refresh)
- Gmail 목록 조회 최적화 (N+1 → Promise.all 병렬 처리)
- HTML 메일 지원 (text/html → 텍스트 변환)
- 답장 헤더 보완 (In-Reply-To, References)
- 메일 검색, 톤 선택, 재분석, 전송 확인 모달
- 초안 복사/되돌리기, 토스트 알림
- 날짜 상대 표시, 읽음/안읽음, 내 메시지 구분
- 스켈레톤 로딩, 커스텀 스크롤바

### 2차 보완
- 이메일 인용문(quote) 자동 제거 → LLM 분석 품질 대폭 향상
- 긴급도 감지 (high/medium/low) → 상단에 뱃지 표시
- 분석 캐싱 (5분 TTL, 최대 50개) → 같은 스레드 재클릭 시 즉시 표시
- 캐시 강제 무효화 (force=true 파라미터)
- 페이지네이션 (더 보기 버튼 + nextPageToken)
- 라벨 필터 (받은편지함/보낸편지함/별표/중요)
- 키보드 단축키 (j/k 이동, / 검색, r 재분석, Esc 닫기)
- 전체답장(Reply-All) CC 지원
- 최근 메시지 발신자 + 날짜 표시 (스레드 목록에서)
- From 헤더 추가 (답장 전송 시)
- 모바일 반응형 (슬라이드 사이드바 + 터치 지원)
- API 에러 고도화 (401 자동 재로그인, 429 안내 메시지)
