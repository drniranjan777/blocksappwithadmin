import { describe, expect, it } from 'vitest';
import { extractHashtags, extractMentions } from './text-parsing.js';

describe('hashtags', () => {
  it('are lower-cased, de-duplicated and in order of appearance', () => {
    expect(extractHashtags('Great day #Hyderabad #FOOD #hyderabad #food')).toEqual([
      'hyderabad',
      'food',
    ]);
  });

  it('work in any script', () => {
    expect(extractHashtags('#హైదరాబాద్ మరియు #दिल्ली और #चेन्नई')).toEqual([
      'హైదరాబాద్',
      'दिल्ली',
      'चेन्नई',
    ]);
  });

  it('need a letter, two characters, and a clean boundary', () => {
    expect(extractHashtags('#1 #12345 #a #ab #a1')).toEqual(['ab', 'a1']);
    expect(extractHashtags('mail me at x#tag or a&#amp; and ##double')).toEqual([]);
    expect(extractHashtags('(#inbrackets) end.#after_dot #ok,')).toEqual([
      'inbrackets',
      'after_dot',
      'ok',
    ]);
  });

  it('stop at 50 characters rather than swallowing more', () => {
    expect(extractHashtags(`#${'a'.repeat(60)}`)).toEqual([]);
    expect(extractHashtags(`#${'a'.repeat(50)}`)).toEqual(['a'.repeat(50)]);
  });

  it('are found across lines and ignore plain text', () => {
    expect(extractHashtags('first line #one\nsecond #two\n\nno tags here')).toEqual(['one', 'two']);
    expect(extractHashtags('')).toEqual([]);
    expect(extractHashtags('no tags')).toEqual([]);
  });
});

describe('mentions', () => {
  it('are lower-cased, de-duplicated and in order', () => {
    expect(extractMentions('thanks @Asha_Rao and @bob.k, again @asha_rao')).toEqual([
      'asha_rao',
      'bob.k',
    ]);
  });

  it('are not found inside an e-mail address or a longer word', () => {
    expect(extractMentions('write to someone@example.com or a@b.co')).toEqual([]);
    expect(extractMentions('x@yzabc')).toEqual([]);
    expect(extractMentions('@@double and @@@triple')).toEqual([]);
  });

  it('follow the username rules: 3 to 30 of a-z 0-9 . _, no trailing dot', () => {
    expect(extractMentions('@ab @abc @a.b.c. and @x')).toEqual(['abc', 'a.b.c']);
    expect(extractMentions(`@${'a'.repeat(31)}`)).toEqual([]);
    expect(extractMentions(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(30)]);
  });

  it('cannot be forged with look-alike characters', () => {
    // A full-width @ and a Cyrillic "а" are not the platform's characters.
    expect(extractMentions('＠admin and @аdmin')).toEqual([]);
  });

  it('are found at the start, after punctuation and on new lines', () => {
    expect(extractMentions('@first (@second) "@third"\n@fourth')).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });
});
