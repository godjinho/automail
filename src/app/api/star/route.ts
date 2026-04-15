import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { toggleStar } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { threadId, star } = await request.json();
  if (!threadId || typeof star !== "boolean") {
    return NextResponse.json({ error: "threadId와 star(boolean) 필수" }, { status: 400 });
  }

  try {
    await toggleStar(session.accessToken, threadId, star);
    return NextResponse.json({ success: true, starred: star });
  } catch (error: any) {
    console.error("Star toggle error:", error);
    return NextResponse.json({ error: error.message || "별표 변경 실패" }, { status: 500 });
  }
}
