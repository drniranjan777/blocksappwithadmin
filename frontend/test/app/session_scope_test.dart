import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _Counter extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final _counterProvider = NotifierProvider<_Counter, int>(_Counter.new);
final _storageProvider = Provider<String>((_) => 'default');

class _Probe extends ConsumerWidget {
  const _Probe();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Column(
        children: [
          Text('count ${ref.watch(_counterProvider)}'),
          Text('storage ${ref.watch(_storageProvider)}'),
          Text('start ${ref.watch(initialLocationProvider)}'),
          GestureDetector(
            key: const Key('bump'),
            onTap: () => ref.read(_counterProvider.notifier).bump(),
            child: const Text('bump'),
          ),
          GestureDetector(
            key: const Key('reset'),
            onTap: ref.read(sessionScopeResetProvider),
            child: const Text('reset'),
          ),
        ],
      ),
    );
  }
}

void main() {
  testWidgets(
    'a reset empties every cache and keeps the handles it was given',
    (tester) async {
      await tester.pumpWidget(
        SessionScope(
          overrides: [_storageProvider.overrideWithValue('prefs')],
          child: const _Probe(),
        ),
      );
      expect(find.text('start ${Routes.splash}'), findsOneWidget);

      await tester.tap(find.byKey(const Key('bump')));
      await tester.tap(find.byKey(const Key('bump')));
      await tester.pump();
      expect(find.text('count 2'), findsOneWidget);

      await tester.tap(find.byKey(const Key('reset')));
      await tester.pump();

      // What the last person loaded is gone ...
      expect(find.text('count 0'), findsOneWidget);
      // ... what is the same for the next person is still there ...
      expect(find.text('storage prefs'), findsOneWidget);
      // ... and the app starts at sign-in, not at the splash.
      expect(find.text('start ${Routes.auth}'), findsOneWidget);
    },
  );

  testWidgets('without a SessionScope a reset does nothing', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: _Probe()));
    await tester.tap(find.byKey(const Key('bump')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('reset')));
    await tester.pump();
    expect(find.text('count 1'), findsOneWidget);
  });
}
