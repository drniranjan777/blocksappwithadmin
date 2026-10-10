import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _load(String lang) =>
    jsonDecode(File('lib/l10n/app_$lang.arb').readAsStringSync())
        as Map<String, dynamic>;

Set<String> _placeholders(String message) =>
    RegExp(r'\{(\w+)(?:,[^}]*)?\}')
        .allMatches(message)
        .map((m) => m.group(1)!)
        .toSet();

void main() {
  final en = _load('en');
  final messages = {
    for (final e in en.entries)
      if (!e.key.startsWith('@')) e.key: e.value as String,
  };

  for (final lang in ['hi', 'te']) {
    group('app_$lang.arb', () {
      final other = _load(lang);

      test('has every key the English template has', () {
        final missing = messages.keys.where((k) => !other.containsKey(k));
        expect(missing, isEmpty, reason: 'untranslated keys');
      });

      test('has no keys the template lacks', () {
        final extra = other.keys.where(
          (k) => !k.startsWith('@') && !messages.containsKey(k),
        );
        expect(extra, isEmpty, reason: 'orphaned keys');
      });

      test('uses the same placeholders as English in every message', () {
        for (final key in messages.keys) {
          final translated = other[key];
          if (translated is! String) continue;
          expect(
            _placeholders(translated),
            _placeholders(messages[key]!),
            reason: '$key placeholders differ',
          );
        }
      });

      test('no translation is empty', () {
        for (final key in messages.keys) {
          expect((other[key] as String).trim(), isNotEmpty, reason: key);
        }
      });
    });
  }

  test('every English message with placeholders declares them', () {
    for (final e in messages.entries) {
      final names = _placeholders(e.value);
      if (names.isEmpty) continue;
      final meta = en['@${e.key}'] as Map<String, dynamic>?;
      expect(meta, isNotNull, reason: '${e.key} needs @metadata');
      final declared = (meta!['placeholders'] as Map<String, dynamic>).keys
          .toSet();
      expect(declared, names, reason: e.key);
    }
  });

  test('there are no hard-coded user-facing strings in widgets', () {
    // Quoted literals that start with a capital letter inside Text(...) are
    // almost always UI copy that should be in an ARB file. Brand name and a
    // few symbols are allowed.
    final allowed = RegExp(r'^(BLOCKS|—|×|·|[₹%])');
    final offenders = <String>[];
    // ignore: prefer_single_quotes
    final pattern = RegExp(r"Text\(\s*'([^'$]*[A-Za-z][^']*)'");
    for (final f
        in Directory('lib')
            .listSync(recursive: true)
            .whereType<File>()
            .where(
              (f) => f.path.endsWith('.dart') && !f.path.contains('l10n'),
            )) {
      final src = f.readAsStringSync();
      for (final m in pattern.allMatches(src)) {
        final text = m.group(1)!;
        if (!allowed.hasMatch(text)) offenders.add('${f.path}: "$text"');
      }
    }
    expect(offenders, isEmpty);
  });
}
