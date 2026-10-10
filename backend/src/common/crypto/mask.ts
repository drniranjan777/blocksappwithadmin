/**
 * Masking for anything shown to a person or written to a log. Each function
 * keeps just enough to recognise the value ("is this my account?") and nothing
 * that would let it be used.
 */

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

/** `+919876543210` -> `+91 ••••• •3210`. Keeps the country code and last four. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 6) return '***';
  const cc = digits.startsWith('+') ? digits.slice(0, 3) : '';
  return `${cc} ••••• •${digits.slice(-4)}`.trim();
}

/** The last four characters of an identifier, e.g. `XXXXXX234F`. */
export function maskIdentifier(value: string, visible = 4): string {
  const clean = value.replace(/[\s-]/g, '');
  if (clean.length <= visible) return 'X'.repeat(clean.length);
  return `${'X'.repeat(clean.length - visible)}${clean.slice(-visible)}`;
}

/** `Aarav Kumar` -> `A**** K****`. */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1)}${'*'.repeat(Math.max(word.length - 1, 1))}`)
    .join(' ');
}

/** The same display from the last four digits alone (all that is kept in clear): `•••• 1234`. */
export function maskLast4(last4: string): string {
  return `•••• ${last4.slice(-4)}`;
}

/** Hides everything but the last four digits of a bank account number. */
export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

/**
 * Masks an IP address for display to its owner (`203.0.113.45` -> `203.0.113.x`)
 * while staff with the right permission can see the full value.
 */
export function maskIp(ip: string): string {
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.x` : '***';
}
