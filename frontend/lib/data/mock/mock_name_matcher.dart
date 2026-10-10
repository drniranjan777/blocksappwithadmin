/// How the (mock) payout server decides that the name on a bank account is
/// the same person as the verified identity.
///
/// Real matching is done by the bank / payout provider and is stricter. The
/// demo's version handles what Indian names commonly do: different word order,
/// honorifics ("Mr", "Smt", "Shri"), punctuation, and initials ("Aarav K").
abstract final class NameMatcher {
  static const _honorifics = {
    'mr',
    'mrs',
    'ms',
    'miss',
    'mx',
    'shri',
    'sri',
    'smt',
    'dr',
    'prof',
    'kumari',
  };

  static List<String> tokens(String name) => name
      .toLowerCase()
      .replaceAll(RegExp(r'[^\p{L}\p{M}\s]', unicode: true), ' ')
      .split(RegExp(r'\s+'))
      .where((t) => t.isNotEmpty && !_honorifics.contains(t))
      .toList();

  static bool matches(String a, String b) {
    final ta = tokens(a);
    final tb = tokens(b);
    if (ta.isEmpty || tb.isEmpty) return false;

    final sa = ta.toSet();
    final sb = tb.toSet();
    if (sa.length == sb.length && sa.containsAll(sb)) return true;

    // "Aarav K" ~ "Aarav Kumar": every word of the shorter name must be found
    // in the longer one, whole or as an initial, with at least two words and
    // one whole-word hit so "Kumar" alone never matches "Aarav Kumar".
    final shorter = ta.length <= tb.length ? ta : tb;
    final longer = ta.length <= tb.length ? tb : ta;
    if (shorter.length < 2) return false;

    final used = <int>{};
    var wholeWords = 0;
    for (final t in shorter) {
      var found = -1;
      for (var i = 0; i < longer.length; i++) {
        if (!used.contains(i) && longer[i] == t) {
          found = i;
          wholeWords++;
          break;
        }
      }
      if (found < 0 && t.length == 1) {
        for (var i = 0; i < longer.length; i++) {
          if (!used.contains(i) && longer[i].startsWith(t)) {
            found = i;
            break;
          }
        }
      }
      if (found < 0) return false;
      used.add(found);
    }
    return wholeWords >= 1;
  }
}
