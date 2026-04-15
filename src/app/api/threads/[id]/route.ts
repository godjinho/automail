import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getThreadDetail } from "@/lib/gmail";
import { analyzeThread, invalidateCache, ReplyTone } from "@/lib/analyze";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { id } = await params;
  const tone = (request.nextUrl.searchParams.get("tone") || "formal") as ReplyTone;
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (force) invalidateCache(id);

  try {
    const thread = await getThreadDetail(session.accessToken, id);
    const analysis = await analyzeThread(thread, session.user?.email || undefined, tone);
    return NextResponse.json({ thread, analysis });
  } catch (error: any) {
    const status = error?.code || error?.status || 500;

    if (status === 401) {
      return NextResponse.json({ error: "인증이 만료되었습니다." }, { status: 401 });
    }
    if (status === 429) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: error.message || "분석 실패" },
      { status: 500 }
    );
  }
}
