import OpenAI from "openai";
import type { ThreadDetail } from "./gmail";

let _openaiClient: OpenAI | null = null;
let _deepseekClient: OpenAI | null = null;

function getOpenAI() {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
}

function getDeepSeek() {
  if (!_deepseekClient) {
    _deepseekClient = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
  }
  return _deepseekClient;
}

export type ReplyTone = "formal" | "friendly" | "concise" | "detailed";

export interface AnalysisResult {
  summary: string;
  requirements: string[];
  nextActions: string[];
  draftReply: string;
  urgency: "high" | "medium" | "low";
}

const analysisCache = new Map<string, { result: AnalysisResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function stripQuotedReplies(body: string): string {
  const lines = body.split("\n");
  const cleaned: string[] = [];
  let inQuote = false;

  for (const line of lines) {
    if (
      /^On .+ wrote:$/i.test(line.trim()) ||
      /^\d{4}년 .+ 작성:$/.test(line.trim()) ||
      /^-{3,}\s*Original Message\s*-{3,}$/i.test(line.trim()) ||
      /^-{3,}\s*전달된 메시지\s*-{3,}$/.test(line.trim()) ||
      /^>{2,}/.test(line.trim())
    ) {
      inQuote = true;
      continue;
    }

    if (inQuote && line.startsWith(">")) continue;
    if (inQuote && line.trim() === "") continue;
    if (inQuote && !line.startsWith(">") && line.trim() !== "") {
      inQuote = false;
    }

    if (!inQuote) {
      cleaned.push(line);
    }
  }

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildThreadText(thread: ThreadDetail): string {
  return thread.messages
    .map((m, i) => {
      const cleanBody = stripQuotedReplies(m.body);
      return `--- 메일 ${i + 1} ---\n보낸사람: ${m.from}\n받는사람: ${m.to}\n날짜: ${m.date}\n\n${cleanBody}`;
    })
    .join("\n\n");
}

const TONE_DESC: Record<ReplyTone, string> = {
  formal: "격식 있는 비즈니스 톤. 존댓말, 정중한 표현 사용.",
  friendly: "친근하고 부드러운 톤. 존댓말은 유지하되 딱딱하지 않게.",
  concise: "간결하고 핵심만. 불필요한 인사치레 최소화.",
  detailed: "상세하고 꼼꼼하게. 배경 설명과 근거를 포함.",
};

function buildSystemPrompt(tone: ReplyTone) {
  return `당신은 이메일 분석 비서입니다. 이메일 스레드를 받으면 반드시 아래 5가지를 한국어로 제공합니다.

답장 초안 톤: ${TONE_DESC[tone]}

urgency 판단 기준:
- high: 기한이 임박, "긴급", "ASAP", "오늘까지", 결제/법적 이슈
- medium: 기한이 있지만 여유 있음, 일반적 업무 요청
- low: 정보 공유, 안부, 긴급하지 않은 문의

응답은 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요.

{
  "summary": "핵심 요약 (3줄 이내, 스레드 전체 흐름)",
  "requirements": ["상대가 나에게 요구하는 사항 1", "사항 2", ...],
  "nextActions": ["내가 해야 할 다음 액션 1", "액션 2", ...],
  "draftReply": "답장 초안",
  "urgency": "high 또는 medium 또는 low"
}`;
}

export async function analyzeThread(
  thread: ThreadDetail,
  userEmail?: string,
  tone: ReplyTone = "formal"
): Promise<AnalysisResult> {
  const cacheKey = `${thread.id}:${tone}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  let threadText = buildThreadText(thread);

  if (threadText.length > 15000) {
    threadText = threadText.slice(-12000);
  }

  const result = await runAnalysis(threadText, thread.subject, userEmail, tone);

  analysisCache.set(cacheKey, { result, timestamp: Date.now() });

  if (analysisCache.size > 50) {
    const oldest = [...analysisCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) analysisCache.delete(oldest[0]);
  }

  return result;
}

export function invalidateCache(threadId: string) {
  for (const key of analysisCache.keys()) {
    if (key.startsWith(`${threadId}:`)) {
      analysisCache.delete(key);
    }
  }
}

async function runAnalysis(
  threadText: string,
  subject: string,
  userEmail: string | undefined,
  tone: ReplyTone
): Promise<AnalysisResult> {
  const systemPrompt = buildSystemPrompt(tone);
  const userPrompt = `아래 이메일 스레드를 분석해주세요.\n\n내 이메일: ${userEmail || "알 수 없음"}\n제목: ${subject}\n\n${threadText}`;

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const res = await getDeepSeek().chat.completions.create({
      model: "deepseek-chat",
      messages,
      max_tokens: 1500,
      temperature: 0.3,
    });
    return parseAnalysis(res.choices[0]?.message?.content || "");
  } catch (err) {
    console.error("DeepSeek failed, falling back to GPT:", err);
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 1500,
      temperature: 0.3,
    });
    return parseAnalysis(res.choices[0]?.message?.content || "");
  }
}

function parseAnalysis(content: string): AnalysisResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || "",
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
        nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : [],
        draftReply: parsed.draftReply || "",
        urgency: ["high", "medium", "low"].includes(parsed.urgency) ? parsed.urgency : "medium",
      };
    }
  } catch {
    // fallback
  }
  return {
    summary: content,
    requirements: [],
    nextActions: [],
    draftReply: "",
    urgency: "medium",
  };
}

// --- AI 메일 초안 작성 ---

const DRAFT_SYSTEM_PROMPT = `당신은 비즈니스 이메일 작성 비서입니다.
작성자: 유진호
기본 톤: 공손하고 격식 있는 비즈니스 한국어

규칙:
- 반드시 "안녕하세요, 유진호 입니다.\n\n" 로 시작
- 본문 작성
- 본문 끝에 "\n\n유진호 올림" 으로 마무리
- 서명 아래에는 아무것도 넣지 마세요 (footer는 시스템이 자동 추가)
- 사용자의 구체적인 지시가 있으면 그에 맞게 작성하세요
- 구체적 지시가 없고 참고 메일이 있으면, 메일 내용을 파악하여 적절한 답장을 자동 작성하세요
- 구체적 지시도 없고 참고 메일도 없으면, 일반적인 비즈니스 이메일 틀을 작성하세요
- 응답은 이메일 본문 텍스트만 출력하세요. JSON이나 다른 형식 금지.`;

export interface DraftRequest {
  instruction: string;
  context?: string;
  type: "reply" | "compose";
}

export async function draftEmail(req: DraftRequest): Promise<string> {
  const userPrompt = req.context
    ? `[${req.type === "reply" ? "회신" : "새 메일"} 작성 요청]\n\n지시: ${req.instruction}\n\n참고 메일 내용:\n${req.context}`
    : `[새 메일 작성 요청]\n\n지시: ${req.instruction}`;

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: DRAFT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const res = await getDeepSeek().chat.completions.create({
      model: "deepseek-chat",
      messages,
      max_tokens: 2000,
      temperature: 0.4,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 2000,
      temperature: 0.4,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  }
}
