import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";

const EMAIL_FOOTER = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #ddd;font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:13px;color:#888;line-height:160%;">
  <strong style="color:#555;">유진호</strong><br/>
  <a href="https://freekitlab.com/" style="color:#4a90d9;text-decoration:none;">freekitlab.com</a>&nbsp;&nbsp;|&nbsp;&nbsp;Tel. 010-7207-5808
</div>`;

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:18px;line-height:150%;color:#222;">
${escaped}
${EMAIL_FOOTER}
</body></html>`;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { threadId, to, cc, bcc, subject, body, messageId, references } = await request.json();

  if (!to || !body) {
    return NextResponse.json({ error: "받는 사람과 내용은 필수입니다" }, { status: 400 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const htmlBody = textToHtml(body);
  const boundary = "boundary_automail_" + Date.now();

  const replySubject = threadId
    ? (subject?.startsWith("Re:") ? subject : `Re: ${subject}`)
    : subject;

  const refChain = [references, messageId].filter(Boolean).join(" ");

  const headers = [
    `From: 유진호 <${session.user?.email || "me"}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(replySubject || "").toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  if (messageId) headers.push(`In-Reply-To: ${messageId}`);
  if (refChain) headers.push(`References: ${refChain}`);

  const rawMessage = [
    ...headers,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    body + "\n\n---\n유진호\nfreekitlab.com | Tel. 010-7207-5808",
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");

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
        ...(threadId && { threadId }),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Send error:", error);
    return NextResponse.json({ error: error.message || "전송 실패" }, { status: 500 });
  }
}
