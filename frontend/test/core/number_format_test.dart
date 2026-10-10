import 'package:blocks_app/core/utils/number_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('compactCount', () {
    test('small numbers are unchanged', () {
      expect(compactCount(0), '0');
      expect(compactCount(950), '950');
    });

    test('thousands use K with one decimal, truncated', () {
      expect(compactCount(1000), '1K');
      expect(compactCount(18450), '18.4K');
      expect(compactCount(12400), '12.4K');
      expect(compactCount(999999), '999.9K');
    });

    test('millions use M with two decimals', () {
      expect(compactCount(1280000), '1.28M');
      expect(compactCount(2000000), '2M');
    });

    test('rejects negative values', () {
      expect(() => compactCount(-5), throwsArgumentError);
    });
  });
}
