/**
 * Money, exactly.
 *
 * Amounts inside the server are whole **paise** (1/100 of a rupee) held as `bigint`, never
 * floating point: 0.1 + 0.2 must be 0.30 here. They become decimal strings ("123.45") only at
 * the edges, where the database stores `NUMERIC(18,2)` and the API speaks JSON.
 */
export type Paise = bigint;

const DECIMAL = /^(-)?(\d{1,16})(?:\.(\d{1,2}))?$/;

/** "123.45", "123.4", "123" -> paise. Anything else (3 decimals, exponent, text) is refused, not rounded. */
export function parseRupees(text: string): Paise {
  const m = DECIMAL.exec(text.trim());
  if (!m) throw new RangeError(`not an amount of money: ${text}`);
  const whole = BigInt(m[2] as string);
  const fraction = BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  const paise = whole * 100n + fraction;
  return m[1] ? -paise : paise;
}

/** Paise -> "123.45" (always two decimals). */
export function formatRupees(paise: Paise): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** A value read back from the database (a Prisma Decimal, a string or a number) -> paise. */
export function fromDatabase(value: { toString(): string } | null | undefined): Paise {
  if (value === null || value === undefined) return 0n;
  const text = value.toString();
  // Decimal prints "1234.5" or "1234" or "1.2e+21" for huge values; the column cannot hold those.
  return parseRupees(text.includes('.') ? text : `${text}.00`);
}

/**
 * Splits `total` paise across `weights` in proportion, so that the pieces add up to `total`
 * **exactly** (largest-remainder method). Anyone with a zero weight gets zero. If every weight is
 * zero, nobody gets anything and the whole amount is left over.
 *
 * Weights are floating point from the scoring (reach x multiplier x quality); they are turned
 * into integers at a fixed precision first, so the split never depends on float rounding.
 */
export function allocate(
  total: Paise,
  weights: readonly number[],
): { shares: Paise[]; leftover: Paise } {
  const scaled = weights.map((w) =>
    Number.isFinite(w) && w > 0 ? BigInt(Math.round(w * 1_000_000)) : 0n,
  );
  const sum = scaled.reduce((a, b) => a + b, 0n);
  if (total <= 0n || sum === 0n)
    return { shares: scaled.map(() => 0n), leftover: total > 0n ? total : 0n };

  const floors = scaled.map((w) => (total * w) / sum);
  const remainders = scaled.map((w, i) => ({ i, r: (total * w) % sum }));
  let left = total - floors.reduce((a, b) => a + b, 0n);
  // The pieces left over (fewer than one per person) go to those who lost the most to rounding;
  // ties go to the earlier position so the result is deterministic.
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const shares = [...floors];
  for (const { i, r } of remainders) {
    if (left === 0n) break;
    if (r === 0n) continue;
    shares[i] = (shares[i] as bigint) + 1n;
    left -= 1n;
  }
  return { shares, leftover: left };
}

/** Caps each share at `cap` paise; what is taken off is returned as `removed`. */
export function capShares(
  shares: readonly Paise[],
  cap: Paise,
): { shares: Paise[]; removed: Paise } {
  let removed = 0n;
  const out = shares.map((s) => {
    if (s <= cap) return s;
    removed += s - cap;
    return cap;
  });
  return { shares: out, removed };
}
