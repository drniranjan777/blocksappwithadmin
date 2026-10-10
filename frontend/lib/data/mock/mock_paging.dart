import 'package:blocks_app/data/models/paged_result.dart';

const _maxPageSize = 50;

/// Builds a page from an index-addressable source. [build] may return null
/// (item unavailable) and [keep] may reject an item (e.g. hidden author);
/// both are skipped without ending the page early.
PagedResult<T> pageByIndex<T>({
  required String? cursor,
  required int limit,
  required int total,
  required T? Function(int index) build,
  bool Function(T item)? keep,
}) {
  final cap = limit.clamp(1, _maxPageSize);
  var i = int.tryParse(cursor ?? '0') ?? 0;
  final items = <T>[];
  while (i < total && items.length < cap) {
    final item = build(i);
    i++;
    if (item == null) continue;
    if (keep != null && !keep(item)) continue;
    items.add(item);
  }
  return PagedResult(items: items, nextCursor: i < total ? '$i' : null);
}
