import { describe, expect, it } from 'vitest';
import { foldForMatching, screenText } from './text-safety.js';

describe('text screening', () => {
  it('lets ordinary text through', () => {
    expect(screenText('Lovely morning at Charminar, the chai was great! #hyderabad')).toEqual({
      clean: true,
      reasons: [],
    });
    expect(screenText('')).toEqual({ clean: true, reasons: [] });
  });

  it('holds back text containing a listed term, whole words only', () => {
    const terms = ['badword', 'two words'];
    expect(screenText('this has a BadWord in it', terms).reasons).toEqual(['blocked_term']);
    expect(screenText('this has two   words in it', terms).reasons).toEqual(['blocked_term']);
    // Not a word on its own: part of an innocent one.
    expect(screenText('badwordsmith is a surname', terms).clean).toBe(true);
    expect(screenText('notbadword', terms).clean).toBe(true);
  });

  it('sees through look-alike forms and hidden characters', () => {
    const terms = ['badword'];
    expect(screenText('b\u200Ba\u200Bdword', terms).clean).toBe(false);
    expect(screenText('ＢＡＤＷＯＲＤ', terms).clean).toBe(false); // full-width letters
    expect(foldForMatching('  A \n\t B ')).toBe('a b');
  });

  it('works for terms in other scripts', () => {
    expect(screenText('ఇది ఒక చెడు పదం ఉంది', ['చెడు పదం']).clean).toBe(false);
    expect(screenText('ఇది మంచి మాట', ['చెడు పదం']).clean).toBe(true);
  });

  it('ignores empty or one-letter entries in the list, so a bad setting cannot flag everything', () => {
    expect(screenText('anything at all', ['', ' ', 'a']).clean).toBe(true);
  });

  it('treats regex characters in a term as plain text', () => {
    expect(screenText('cost (50%) now', ['(50%)']).clean).toBe(false);
    expect(screenText('anything', ['.*']).clean).toBe(true);
    expect(screenText('x'.repeat(10), ['x+x+x+x+x+']).clean).toBe(true);
  });

  it('flags a wall of links', () => {
    const many = Array.from({ length: 6 }, (_, i) => `https://spam.example/${i}`).join(' ');
    expect(screenText(many).reasons).toEqual(['too_many_links']);
    expect(
      screenText(Array.from({ length: 5 }, (_, i) => `https://ok.example/${i}`).join(' ')).clean,
    ).toBe(true);
    expect(screenText('www.a.com www.b.com www.c.com www.d.com www.e.com www.f.com').clean).toBe(
      false,
    );
  });

  it('flags mechanical repetition but not enthusiasm', () => {
    expect(screenText('a'.repeat(30)).reasons).toEqual(['repetition']);
    expect(screenText(Array(20).fill('buy').join(' ')).reasons).toEqual(['repetition']);
    expect(screenText('wooooooow that is amazing!!!!!!!!!!').clean).toBe(true);
    expect(screenText(Array(10).fill('go').join(' ')).clean).toBe(true);
  });

  it('can raise several reasons at once', () => {
    const many = Array.from({ length: 6 }, (_, i) => `https://s.example/${i}`).join(' ');
    expect(screenText(`${many} badword`, ['badword']).reasons).toEqual([
      'blocked_term',
      'too_many_links',
    ]);
  });

  it('is fast on long, hostile input', () => {
    const start = Date.now();
    screenText('a '.repeat(50_000) + 'b'.repeat(50_000), ['x+x+y']);
    screenText('word '.repeat(60_000));
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
