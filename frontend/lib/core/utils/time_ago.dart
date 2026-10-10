import 'package:blocks_app/l10n/gen/app_localizations.dart';

/// Short relative time: "now", "5m", "3h", "2d", "4w".
String timeAgo(AppLocalizations l10n, DateTime time, {required DateTime now}) {
  final d = now.difference(time);
  if (d.inMinutes < 1) return l10n.timeNow;
  if (d.inMinutes < 60) return l10n.timeMinutes(d.inMinutes);
  if (d.inHours < 24) return l10n.timeHours(d.inHours);
  if (d.inDays < 7) return l10n.timeDays(d.inDays);
  return l10n.timeWeeks(d.inDays ~/ 7);
}
