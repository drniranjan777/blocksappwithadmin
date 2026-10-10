/// Compact counts for social UI: 950 -> "950", 18450 -> "18.4K",
/// 1280000 -> "1.28M". Truncates (never rounds up) so a post never appears
/// to have more reach than it does.
String compactCount(int value) {
  if (value < 0) {
    throw ArgumentError.value(value, 'value', 'must not be negative');
  }
  if (value < 1000) return '$value';
  if (value < 1000000) return _trim(value / 1000, 1, 'K');
  if (value < 1000000000) return _trim(value / 1000000, 2, 'M');
  return _trim(value / 1000000000, 2, 'B');
}

/// Indian digit grouping without a currency sign: 1234567 -> "12,34,567".
String groupIndian(int value) {
  final negative = value < 0;
  final digits = value.abs().toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final last3 = digits.substring(digits.length - 3);
    var rest = digits.substring(0, digits.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    grouped = '${parts.join(',')},$last3';
  }
  return negative ? '-$grouped' : grouped;
}

/// Rupees with Indian digit grouping: 18420 -> "₹18,420",
/// 1234567 -> "₹12,34,567".
String formatRupees(int value) {
  final negative = value < 0;
  return '₹${negative ? '-' : ''}${groupIndian(value.abs())}';
}

String _trim(double scaled, int decimals, String suffix) {
  final factor = decimals == 1 ? 10 : 100;
  final truncated = (scaled * factor).floorToDouble() / factor;
  var text = truncated.toStringAsFixed(decimals);
  if (text.contains('.')) {
    text = text
        .replaceFirst(RegExp(r'0+$'), '')
        .replaceFirst(RegExp(r'\.$'), '');
  }
  return '$text$suffix';
}
