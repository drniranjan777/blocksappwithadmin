import 'dart:async';

import 'package:flutter/foundation.dart';

/// Delays [run] until [delay] has passed without another call.
/// Use for search-as-you-type so we never fire a query per keystroke.
class Debouncer {
  Debouncer({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;
  Timer? _timer;

  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }

  void dispose() => _timer?.cancel();
}
