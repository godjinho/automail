export interface Attachment {
  name: string;
  type: string;
  data: string; // base64
  size: number;
}

export interface SendMailParams {
  accessToken: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody: string;
  threadId?: string;
  messageId?: string;
  references?: string;
  attachments?: Attachment[];
}

const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB Gmail limit

function encodeUtf8Base64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function mimeEncode(str: string): string {
  return `=?UTF-8?B?${encodeUtf8Base64(str)}?=`;
}

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

export function validateAttachments(files: Attachment[]): string | null {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_SIZE) {
    const mb = (total / 1024 / 1024).toFixed(1);
    return `첨부파일 총 용량(${mb}MB)이 Gmail 제한(25MB)을 초과합니다.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function sendMailDirect(params: SendMailParams): Promise<void> {
  const {
    accessToken, to, cc, bcc, subject, body,
    threadId, messageId, references, attachments,
  } = params;

  const htmlBody = textToHtml(body);
  const plainFooter = "\n\n---\n유진호\nfreekitlab.com | Tel. 010-7207-5808";
  const hasAttachments = attachments && attachments.length > 0;

  const mixedBoundary = "boundary_mixed_" + Date.now();
  const altBoundary = "boundary_alt_" + Date.now() + "_alt";

  const replySubject = threadId
    ? (subject.startsWith("Re:") ? subject : `Re: ${subject}`)
    : subject;

  const refChain = [references, messageId].filter(Boolean).join(" ");

  const headers: string[] = [
    `From: ${mimeEncode("유진호")} <me>`,
    `To: ${to}`,
    `Subject: ${mimeEncode(replySubject || "")}`,
    "MIME-Version: 1.0",
  ];

  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  if (messageId) headers.push(`In-Reply-To: ${messageId}`);
  if (refChain) headers.push(`References: ${refChain}`);

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  }

  const altPart = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeUtf8Base64(body + plainFooter),
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeUtf8Base64(htmlBody),
    "",
    `--${altBoundary}--`,
  ].join("\r\n");

  let rawMessage: string;

  if (hasAttachments) {
    const parts = [
      ...headers,
      "",
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      altPart,
    ];

    for (const att of attachments!) {
      parts.push(
        `--${mixedBoundary}`,
        `Content-Type: ${att.type}; name="${att.name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${att.name}"`,
        "",
        att.data,
      );
    }
    parts.push(`--${mixedBoundary}--`);
    rawMessage = parts.join("\r\n");
  } else {
    rawMessage = [...headers, "", altPart].join("\r\n");
  }

  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Use uploadType=multipart for large messages, raw for small
  const url = "https://www.googleapis.com/gmail/v1/users/me/messages/send";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: encoded,
      ...(threadId && { threadId }),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API 오류 (${res.status})`);
  }
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        data: base64,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}
