import { promises as dns } from "node:dns";

const DISPOSABLE = new Set([
  "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
  "yopmail.com", "throwawaymail.com", "trashmail.com", "sharklasers.com",
  "dispostable.com", "maildrop.cc",
]);

const FREEMAIL = new Set([
  "gmail.com", "hotmail.com", "hotmail.co.uk", "yahoo.com", "yahoo.co.uk",
  "outlook.com", "live.com", "icloud.com", "aol.com", "msn.com", "me.com",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net",
]);

const ROLE_LOCALS = new Set([
  "info", "hello", "contact", "reception", "enquiries", "admin",
  "appointments", "bookings", "team", "practice", "frontdesk", "office",
  "hi", "mail", "support", "help", "noreply", "no-reply", "smile", "welcome",
]);

export interface EmailCheck {
  email: string;
  syntaxOk: boolean;
  hasMx: boolean;
  mxHost?: string;
  isDisposable: boolean;
  isFreemail: boolean;
  isRoleAddress: boolean;
}

const mxCache = new Map<string, { hasMx: boolean; mxHost?: string }>();

export async function checkEmail(email: string): Promise<EmailCheck> {
  const lc = email.toLowerCase().trim();
  const m = lc.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) {
    return { email: lc, syntaxOk: false, hasMx: false, isDisposable: false, isFreemail: false, isRoleAddress: false };
  }
  const [, local, domain] = m;
  const isDisposable = DISPOSABLE.has(domain);
  const isFreemail = FREEMAIL.has(domain);
  const isRole = ROLE_LOCALS.has(local);

  let mx = mxCache.get(domain);
  if (!mx) {
    try {
      const records = await dns.resolveMx(domain);
      const sorted = records.sort((a, b) => a.priority - b.priority);
      mx = { hasMx: sorted.length > 0, mxHost: sorted[0]?.exchange };
    } catch {
      mx = { hasMx: false };
    }
    mxCache.set(domain, mx);
  }

  return {
    email: lc,
    syntaxOk: true,
    hasMx: mx.hasMx,
    mxHost: mx.mxHost,
    isDisposable,
    isFreemail,
    isRoleAddress: isRole,
  };
}

export function emailLooksPersonal(email: string): boolean {
  const local = email.toLowerCase().split("@")[0] ?? "";
  if (ROLE_LOCALS.has(local)) return false;
  // typical personal forms: first.last, flast, firstl, firstname
  return /[a-z]\.[a-z]/.test(local) || /^[a-z]{2,}[0-9]?$/.test(local) || /^[a-z]\.[a-z]/.test(local);
}
