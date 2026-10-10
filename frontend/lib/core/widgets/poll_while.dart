import 'dart:async';

import 'package:flutter/widgets.dart';

/// Calls [onTick] every [interval] while [active] is true, and nothing at all
/// otherwise. Used for things that finish on their own on the server (an
/// identity review, a payout) so the screen updates without a manual refresh,
/// but never polls once there is nothing left to wait for.
class PollWhile extends StatefulWidget {
  const PollWhile({
    required this.active,
    required this.onTick,
    required this.child,
    super.key,
    this.interval = const Duration(seconds: 4),
  });

  final bool active;
  final Duration interval;
  final VoidCallback onTick;
  final Widget child;

  @override
  State<PollWhile> createState() => _PollWhileState();
}

class _PollWhileState extends State<PollWhile> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(PollWhile old) {
    super.didUpdateWidget(old);
    if (old.active != widget.active || old.interval != widget.interval) {
      _sync();
    }
  }

  void _sync() {
    _timer?.cancel();
    _timer = widget.active
        ? Timer.periodic(widget.interval, (_) => widget.onTick())
        : null;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
