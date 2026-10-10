import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/repositories/story_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

/// Stories whose list loads but whose posting is refused (the service is down, say).
class _PostingFails implements StoryRepository {
  @override
  Future<List<StoryGroup>> getStoryGroups() async => const [];

  @override
  Future<void> markViewed(String groupId) async {}

  @override
  Future<StoryItem> addStory({required String mediaUrl, String? caption}) =>
      Future.error(const NetworkFailure());
}

/// In a live build whose server has no stories yet, the composer must say so. It used to offer
/// demo artwork, and "Share to story" threw an exception nobody caught, so the tap did nothing and
/// the person was told nothing.
void main() {
  testWidgets('the story composer says stories are not available yet', (
    tester,
  ) async {
    await openSignedInApp(
      tester,
      size: const Size(390, 1000),
      overrides: [
        storyRepositoryProvider.overrideWithValue(
          const UnavailableStoryRepository(),
        ),
      ],
    );
    // ignore: unawaited_futures
    containerOf(tester).read(routerProvider).push(Routes.createStory);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Not available yet'), findsOneWidget);
    expect(find.text('Share to story'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('a refused share is reported, never reported as posted', (
    tester,
  ) async {
    await openSignedInApp(
      tester,
      size: const Size(390, 1000),
      overrides: [storyRepositoryProvider.overrideWithValue(_PostingFails())],
    );
    // ignore: unawaited_futures
    containerOf(tester).read(routerProvider).push(Routes.createStory);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Share to story'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.textContaining('posted'), findsNothing);
    // Still on the composer, so the person can try again.
    expect(find.text('Share to story'), findsOneWidget);
  });
}
