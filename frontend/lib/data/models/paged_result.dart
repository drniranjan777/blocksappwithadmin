import 'package:equatable/equatable.dart';

/// One page of a cursor-paginated list. `nextCursor == null` means the end.
///
/// Cursors are opaque strings: the mock uses an index, a real API will use an
/// encoded keyset token. UI code never inspects them.
class PagedResult<T> extends Equatable {
  const PagedResult({required this.items, this.nextCursor});

  const PagedResult.empty() : items = const [], nextCursor = null;

  final List<T> items;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  @override
  List<Object?> get props => [items, nextCursor];
}
