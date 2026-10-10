import 'dart:async';

import 'package:blocks_app/core/pagination/content_epoch.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Test double: pages of ints, counting every fetch.
class _Numbers extends PagedNotifier<int> {
  static int fetches = 0;
  static bool failNext = false;
  static Completer<void>? gate;

  @override
  Future<PagedResult<int>> fetchPage(String? cursor) async {
    fetches++;
    await gate?.future;
    if (failNext) {
      failNext = false;
      throw StateError('boom');
    }
    final start = int.parse(cursor ?? '0');
    final end = (start + 10).clamp(0, 25);
    return PagedResult(
      items: [for (var i = start; i < end; i++) i],
      nextCursor: end < 25 ? '$end' : null,
    );
  }
}

final _provider = AsyncNotifierProvider<_Numbers, PagedState<int>>(
  _Numbers.new,
);

ProviderContainer _container() {
  _Numbers.fetches = 0;
  _Numbers.failNext = false;
  _Numbers.gate = null;
  final c = ProviderContainer();
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('first page loads and exposes a cursor', () async {
    final c = _container();
    final s = await c.read(_provider.future);
    expect(s.items, List.generate(10, (i) => i));
    expect(s.hasMore, isTrue);
    expect(_Numbers.fetches, 1);
  });

  test('loadMore appends pages until the cursor runs out', () async {
    final c = _container();
    await c.read(_provider.future);
    final n = c.read(_provider.notifier);

    await n.loadMore();
    await n.loadMore();
    final s = c.read(_provider).value!;
    expect(s.items, List.generate(25, (i) => i));
    expect(s.hasMore, isFalse);

    await n.loadMore(); // nothing left: must not fetch again
    expect(_Numbers.fetches, 3);
  });

  test('concurrent loadMore calls fetch only one page', () async {
    final c = _container();
    await c.read(_provider.future);
    final n = c.read(_provider.notifier);

    _Numbers.gate = Completer<void>();
    final calls = [n.loadMore(), n.loadMore(), n.loadMore()];
    expect(c.read(_provider).value!.isLoadingMore, isTrue);
    _Numbers.gate!.complete();
    await Future.wait(calls);

    expect(_Numbers.fetches, 2); // first page + exactly one more
    expect(c.read(_provider).value!.items, hasLength(20));
  });

  test('a failed page keeps existing items and can be retried', () async {
    final c = _container();
    await c.read(_provider.future);
    final n = c.read(_provider.notifier);

    _Numbers.failNext = true;
    await n.loadMore();
    var s = c.read(_provider).value!;
    expect(s.loadMoreFailed, isTrue);
    expect(s.isLoadingMore, isFalse);
    expect(s.items, hasLength(10)); // nothing lost

    await n.loadMore(); // retry succeeds
    s = c.read(_provider).value!;
    expect(s.loadMoreFailed, isFalse);
    expect(s.items, hasLength(20));
  });

  test('refresh starts again from the first page', () async {
    final c = _container();
    await c.read(_provider.future);
    final n = c.read(_provider.notifier);
    await n.loadMore();
    expect(c.read(_provider).value!.items, hasLength(20));

    await n.refresh();
    expect(c.read(_provider).value!.items, hasLength(10));
  });

  test('prepend puts a new item first without refetching', () async {
    final c = _container();
    await c.read(_provider.future);
    c.read(_provider.notifier).prepend(-1);
    expect(c.read(_provider).value!.items.first, -1);
    expect(_Numbers.fetches, 1);
  });

  test('bumping the content epoch refetches every paged list', () async {
    final c = _container();
    await c.read(_provider.future);
    expect(_Numbers.fetches, 1);

    c.read(contentEpochProvider.notifier).bump();
    await c.read(_provider.future);
    expect(_Numbers.fetches, 2);
  });
}
