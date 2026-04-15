import { google } from "googleapis";

export interface GmailThread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  lastFrom: string;
  lastDate: string;
  messageCount: number;
  hasAttachment: boolean;
  isUnread: boolean;
}

export interface GmailMessage {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
  messageId: string;
  references: string;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  messages: GmailMessage[];
}

export interface ThreadListResult {
  threads: GmailThread[];
  nextPageToken?: string;
}

export type MailLabel = "INBOX" | "SENT" | "STARRED" | "IMPORTANT" | "DRAFT";

function getHeader(headers: { name: string; value: string }[], name: string) {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

function decodeBody(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTextBody(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBody(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBody(part.body.data));
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = extractTextBody(part);
        if (nested) return nested;
      }
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBody(payload.body.data));
  }

  return "";
}

function createGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function buildThreadSummary(detail: any): GmailThread {
  const messages = detail.data.messages || [];
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];
  const firstHeaders = firstMsg?.payload?.headers || [];
  const lastHeaders = lastMsg?.payload?.headers || [];
  const lastLabels = lastMsg?.labelIds || [];

  return {
    id: detail.data.id!,
    snippet: lastMsg?.snippet || "",
    subject: getHeader(firstHeaders as any, "Subject") || "(제목 없음)",
    from: getHeader(firstHeaders as any, "From"),
    date: getHeader(firstHeaders as any, "Date"),
    lastFrom: getHeader(lastHeaders as any, "From"),
    lastDate: getHeader(lastHeaders as any, "Date"),
    messageCount: messages.length,
    hasAttachment: false,
    isUnread: lastLabels.includes("UNREAD"),
  };
}

export async function listThreads(
  accessToken: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    label?: MailLabel;
    query?: string;
  } = {}
): Promise<ThreadListResult> {
  const gmail = createGmailClient(accessToken);
  const { maxResults = 20, pageToken, label = "INBOX", query } = options;

  const params: any = { userId: "me", maxResults };
  if (pageToken) params.pageToken = pageToken;
  if (query) {
    params.q = query;
  } else {
    params.labelIds = [label];
  }

  const res = await gmail.users.threads.list(params);
  const threadIds = res.data.threads || [];

  if (threadIds.length === 0) {
    return { threads: [], nextPageToken: undefined };
  }

  const details = await Promise.all(
    threadIds.map((t) =>
      gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      })
    )
  );

  return {
    threads: details.map(buildThreadSummary),
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

export async function getThreadDetail(
  accessToken: string,
  threadId: string
): Promise<ThreadDetail> {
  const gmail = createGmailClient(accessToken);

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages: GmailMessage[] = (res.data.messages || []).map((msg) => {
    const headers = msg.payload?.headers || [];
    return {
      id: msg.id!,
      from: getHeader(headers as any, "From"),
      to: getHeader(headers as any, "To"),
      cc: getHeader(headers as any, "Cc"),
      date: getHeader(headers as any, "Date"),
      subject: getHeader(headers as any, "Subject"),
      body: extractTextBody(msg.payload),
      messageId: getHeader(headers as any, "Message-ID") || getHeader(headers as any, "Message-Id"),
      references: getHeader(headers as any, "References"),
    };
  });

  const subject = messages[0]?.subject || "(제목 없음)";

  return { id: threadId, subject, messages };
}
