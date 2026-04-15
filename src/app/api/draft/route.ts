import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { draftEmail } from "@/lib/analyze";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { instruction, context, type } = await request.json();

  if (!instruction) {
    return NextResponse.json({ error: "작성 지시가 필요합니다" }, { status: 400 });
  }

  try {
    const draft = await draftEmail({ instruction, context, type });
    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error("Draft error:", error);
    return NextResponse.json({ error: error.message || "작성 실패" }, { status: 500 });
  }
}
