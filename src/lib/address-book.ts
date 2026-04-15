export interface Contact {
  email: string;
  name: string;
  vip: boolean;
  count: number;
  lastUsed: number;
}

const STORAGE_KEY = "automail_contacts";

function load(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(contacts: Contact[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function getContacts(): Contact[] {
  return load().sort((a, b) => {
    if (a.vip !== b.vip) return a.vip ? -1 : 1;
    return b.count - a.count;
  });
}

export function getVipEmails(): string[] {
  return load().filter((c) => c.vip).map((c) => c.email);
}

export function addOrUpdateContact(email: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return;

  const contacts = load();
  const existing = contacts.find((c) => c.email === normalized);

  if (existing) {
    existing.count += 1;
    existing.lastUsed = Date.now();
    if (name && name !== normalized.split("@")[0]) existing.name = name;
  } else {
    contacts.push({
      email: normalized,
      name: name || "",
      vip: false,
      count: 1,
      lastUsed: Date.now(),
    });
  }

  save(contacts);
}

export function saveRecipientsFromSend(to: string, cc?: string, bcc?: string) {
  const all = [to, cc, bcc]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

  for (const email of all) {
    const nameMatch = email.match(/^"?([^"<]+)"?\s*</);
    const addr = email.match(/<([^>]+)>/) ? email.match(/<([^>]+)>/)![1] : email;
    addOrUpdateContact(addr, nameMatch?.[1]?.trim());
  }
}

export function toggleVip(email: string): boolean {
  const contacts = load();
  const contact = contacts.find((c) => c.email === email.toLowerCase());
  if (!contact) return false;
  contact.vip = !contact.vip;
  save(contacts);
  return contact.vip;
}

export function deleteContact(email: string) {
  const contacts = load().filter((c) => c.email !== email.toLowerCase());
  save(contacts);
}

export function searchContacts(query: string): Contact[] {
  if (!query.trim()) return getContacts().slice(0, 8);
  const q = query.toLowerCase();
  return getContacts()
    .filter((c) => c.email.includes(q) || c.name.toLowerCase().includes(q))
    .slice(0, 8);
}
