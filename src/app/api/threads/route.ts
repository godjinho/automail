import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listThreads, MailLabel } from "@/lib/gmail";

const VALID_LABELS: MailLabel[] = ["INBOX", "SENT", "STARRED", "IMPORTANT", "DRAFT"];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() || undefined;
  const pageToken = params.get("pageToken") || undefined;
  const label = params.get("label") as MailLabel | null;
  const maxResults = Math.min(parseInt(params.get("limit") || "20"), 50);

  try {
    const result = await listThreads(session.accessToken, {
      maxResults,
      pageToken,
      label: label && VALID_LABELS.includes(label) ? label : "INBOX",
      query,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.code || error?.status || 500;
    const message = error?.message || "메일 조회 실패";

    if (status === 401 || message.includes("invalid_grant")) {
      return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
    }
    if (status === 429) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    console.error("Thread list error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
