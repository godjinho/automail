import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { threadId, to, cc, subject, body, messageId, references } = await request.json();

  if (!threadId || !to || !body) {
    return NextResponse.json({ error: "필수 필드 누락 (threadId, to, body)" }, { status: 400 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const replySubject = subject?.startsWith("Re:") ? subject : `Re: ${subject}`;
  const refChain = [references, messageId].filter(Boolean).join(" ");

  const headers = [
    `From: ${session.user?.email || "me"}`,
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ];

  if (cc) headers.push(`Cc: ${cc}`);
  if (messageId) headers.push(`In-Reply-To: ${messageId}`);
  if (refChain) headers.push(`References: ${refChain}`);

  const rawMessage = [...headers, "", body].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Send error:", error);
    return NextResponse.json(
      { error: error.message || "전송 실패" },
      { status: 500 }
    );
  }
}
