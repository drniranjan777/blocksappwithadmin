import 'package:blocks_app/features/reel_studio/domain/music_clip.dart';
import 'package:flutter_test/flutter_test.dart';

Duration s(int n) => Duration(seconds: n);

void main() {
  const track = Duration(minutes: 3); // 180 s

  group('maximum length', () {
    test('is the reel length, but at least the minimum', () {
      expect(MusicClipRules.maxLength(track: track, reel: s(23)), s(23));
      expect(MusicClipRules.maxLength(track: track, reel: s(2)), s(5));
    });

    test('never longer than the track itself', () {
      expect(MusicClipRules.maxLength(track: s(20), reel: s(90)), s(20));
    });
  });

  group('initial slice', () {
    test('starts at the beginning and covers the reel', () {
      expect(MusicClipRules.initial(track: track, reel: s(23)), (s(0), s(23)));
    });

    test('a short track plays in full', () {
      expect(MusicClipRules.initial(track: s(12), reel: s(30)), (s(0), s(12)));
    });
  });

  group('dragging the handles', () {
    (Duration, Duration) clamp(
      int start,
      int end, {
      required bool movedStart,
      int max = 30,
    }) => MusicClipRules.clamp(
      start: s(start),
      end: s(end),
      track: track,
      maxLen: s(max),
      movedStart: movedStart,
    );

    test('a slice inside the limits is left alone', () {
      expect(clamp(20, 45, movedStart: true), (s(20), s(45)));
    });

    test(
      'dragging the start back stretches the slice, but never past the maximum',
      () {
        // End was at 100; start dragged to 40 would make 60 s. End gives way.
        expect(clamp(40, 100, movedStart: true), (s(40), s(70)));
      },
    );

    test('dragging the end out stops at the maximum; the start gives way', () {
      expect(clamp(40, 120, movedStart: false), (s(90), s(120)));
    });

    test('too short is stretched to the minimum from the dragged handle', () {
      expect(clamp(50, 52, movedStart: true), (s(50), s(55)));
      expect(clamp(50, 52, movedStart: false), (s(47), s(52)));
    });

    test('handles that cross are pulled together', () {
      final (a, b) = clamp(90, 60, movedStart: true);
      expect(b - a, greaterThanOrEqualTo(MusicClipRules.minLength));
      expect(a, s(90));
    });

    test('the slice always stays inside the track', () {
      // Start dragged to the very end: the slice slides back to fit.
      expect(clamp(179, 180, movedStart: true), (s(175), s(180)));
      // End dragged to the very start: the slice slides forward to fit.
      expect(clamp(0, 1, movedStart: false), (s(0), s(5)));
    });

    test('values outside the track are clamped', () {
      expect(clamp(-30, 10, movedStart: true), (s(0), s(10)));
      // 160..180 is already a valid 20 s slice: only the end is pulled in.
      expect(clamp(160, 400, movedStart: false), (s(160), s(180)));
    });

    test('every result respects min, max and the track, for any drag', () {
      for (var start = -10; start <= 200; start += 7) {
        for (var end = -10; end <= 200; end += 11) {
          for (final movedStart in [true, false]) {
            final (a, b) = MusicClipRules.clamp(
              start: s(start),
              end: s(end),
              track: track,
              maxLen: s(30),
              movedStart: movedStart,
            );
            expect(a >= Duration.zero, isTrue, reason: '$start/$end');
            expect(b <= track, isTrue, reason: '$start/$end');
            expect(
              b - a >= MusicClipRules.minLength,
              isTrue,
              reason: '$start/$end',
            );
            expect(b - a <= s(30), isTrue, reason: '$start/$end');
          }
        }
      }
    });

    test('a track shorter than the minimum plays in full', () {
      final (a, b) = MusicClipRules.clamp(
        start: s(0),
        end: s(2),
        track: s(3),
        maxLen: s(30),
        movedStart: false,
      );
      expect((a, b), (s(0), s(3)));
    });
  });
}
