import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/messages/presentation/chat_screen.dart';
import 'package:blocks_app/features/messages/presentation/messages_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void main() {
  testWidgets(
    'conversation list shows people, last messages and unread badges',
    (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.messages);

      expect(find.byType(MessagesScreen), findsOneWidget);
      expect(find.text('Meera Reddy'), findsOneWidget);
      expect(find.text('Farhan Qureshi'), findsOneWidget);
      expect(find.text('Tanvi Nair'), findsOneWidget);
      expect(find.text('Perfect. I\'ll bring the camera.'), findsOneWidget);
      expect(find.text('Thank you! More chapters coming.'), findsOneWidget);
    },
  );

  testWidgets('search narrows the list after the debounce', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.messages);

    await tester.enterText(find.byType(TextField), 'tanvi');
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Meera Reddy'), findsOneWidget); // not yet applied

    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('Tanvi Nair'), findsOneWidget);
    expect(find.text('Meera Reddy'), findsNothing);

    await tester.enterText(find.byType(TextField), 'zzzz');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('No conversations match “zzzz”'), findsOneWidget);
  });

  testWidgets('opening a chat shows history and the online indicator', (
    tester,
  ) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.messages);

    await tester.tap(find.text('Meera Reddy'));
    await tester.pumpAndSettle();
    expect(find.byType(ChatScreen), findsOneWidget);
    expect(find.text('Online'), findsOneWidget);
    expect(
      find.text('Loved your Charminar reel! Collab on a food walk?'),
      findsOneWidget,
    );
    expect(find.text('Absolutely. Next Saturday?'), findsOneWidget);
  });

  testWidgets('sending a message appends a bubble and clears the field', (
    tester,
  ) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.chat('cv~u1'));

    expect(find.byIcon(Icons.mic_rounded), findsOneWidget); // empty -> mic
    await tester.enterText(find.byType(TextField), 'See you at 5');
    await tester.pump();
    expect(find.byIcon(Icons.send_rounded), findsOneWidget); // text -> send

    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    expect(find.text('See you at 5'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      isEmpty,
    );
  });

  testWidgets('image and voice messages render as placeholders', (
    tester,
  ) async {
    await openSignedInApp(tester);

    await pushRoute(tester, Routes.chat('cv~u2'));
    expect(find.byType(BlocksImage), findsWidgets); // photo bubble

    await pushRoute(tester, Routes.chat('cv~u3'));
    expect(find.text('0:17'), findsOneWidget); // voice bubble duration
    expect(find.byIcon(Icons.play_circle_fill_rounded), findsOneWidget);
  });

  testWidgets('voice and attachment are clearly unavailable in the demo', (
    tester,
  ) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.chat('cv~u1'));

    await tester.tap(find.byIcon(Icons.mic_rounded));
    await tester.pump();
    expect(find.text('Not available in this demo'), findsOneWidget);
  });

  testWidgets('a brand-new conversation starts with an empty state', (
    tester,
  ) async {
    await openSignedInApp(tester);
    final conv = await containerOf(tester)
        .read(messageRepositoryProvider)
        .conversationWith('u10');
    await pushRoute(tester, Routes.chat(conv.id));

    expect(find.text('Say hello'), findsOneWidget);
    expect(find.text('Harpreet Singh'), findsOneWidget);
  });

  testWidgets('unknown conversation shows an error with retry', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.chat('cv~nobody'));
    expect(find.text('Something went wrong'), findsOneWidget);
  });
}
