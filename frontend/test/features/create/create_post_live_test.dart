import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/app_theme.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/repositories/post_repository.dart';
import 'package:blocks_app/features/create/presentation/create_post_screen.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../../helpers/fake_photo_picker.dart';

const _live = AppConfig(
  environment: AppEnvironment.staging,
  useMockData: false,
  apiBaseUrl: 'https://api.example.test',
  enableLogging: false,
);

const _me = AppUser(
  id: 'u1',
  name: 'Asha',
  username: '@asha',
  bio: '',
  district: '',
  state: '',
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
  reachLevel: ReachLevel.district,
);

/// Records what the screen publishes, and answers or fails as the test says.
class _Posts implements PostRepository {
  final List<PostDraft> published = [];
  Object? failWith;

  @override
  Future<Post> createPost(PostDraft draft) async {
    published.add(draft);
    final f = failWith;
    if (f != null) throw f;
    return Post(
      id: 'p1',
      author: _me.summary,
      type: draft.type,
      caption: draft.caption,
      district: '',
      state: '',
      createdAt: DateTime.utc(2026, 10, 9),
      stats: const PostStats(),
      qualifiedReach: 0,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _open(
  WidgetTester tester,
  _Posts posts,
  FakePhotoPicker picker,
) async {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  tester.view
    ..physicalSize = const Size(780, 2400)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: Routes.createPost,
    routes: [
      GoRoute(
        path: Routes.createPost,
        builder: (_, _) => const CreatePostScreen(),
      ),
      GoRoute(
        path: Routes.home,
        builder: (_, _) => const Scaffold(body: Text('HOME')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        localStoreProvider.overrideWithValue(InMemoryLocalStore()),
        appConfigProvider.overrideWithValue(_live),
        postRepositoryProvider.overrideWithValue(posts),
        profilePhotoPickerProvider.overrideWithValue(picker),
        currentUserProvider.overrideWith((ref) async => _me),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _post(WidgetTester tester) async {
  final button = find.widgetWithText(FilledButton, 'Post').last;
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  group('writing a post against the live service', () {
    testWidgets(
      'offers the device\'s own photos, not the demo gallery or a place',
      (tester) async {
        await _open(tester, _Posts(), FakePhotoPicker());
        expect(find.text('Choose from Gallery'), findsOneWidget);
        expect(find.text('Take Photo'), findsOneWidget);
        expect(find.textContaining('Demo gallery'), findsNothing);
        expect(find.text('Location'), findsNothing);
        expect(find.text('Change'), findsNothing);
      },
    );

    testWidgets(
      'a chosen photo is previewed and published, then home says the post is live',
      (tester) async {
        final posts = _Posts();
        final picker = FakePhotoPicker();
        await _open(tester, posts, picker);

        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        expect(picker.requested, [PhotoSource.gallery]);
        expect(find.text('Change photo'), findsOneWidget);
        expect(find.bySemanticsLabel('Preview of your photo'), findsOneWidget);

        await tester.enterText(find.byType(TextField).first, 'Golden hour');
        await tester.pump();
        await _post(tester);

        final sent = posts.published.single;
        expect(sent.type, PostType.image);
        expect(sent.photo, isNotNull);
        expect(sent.caption, 'Golden hour');
        expect(find.text('HOME'), findsOneWidget);
        expect(find.text('Your post is live'), findsOneWidget);
      },
    );

    testWidgets('the camera is offered too', (tester) async {
      final picker = FakePhotoPicker();
      await _open(tester, _Posts(), picker);
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();
      expect(picker.requested, [PhotoSource.camera]);
    });

    testWidgets(
      'backing out of the picker changes nothing; a picker that cannot open says so',
      (tester) async {
        final picker = FakePhotoPicker([
          null,
          const PhotoPickFailure('denied'),
        ]);
        await _open(tester, _Posts(), picker);

        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        expect(
          find.text('Choose from Gallery'),
          findsOneWidget,
          reason: 'still no photo',
        );

        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        expect(
          find.text("Couldn't open your camera or gallery."),
          findsOneWidget,
        );
      },
    );

    testWidgets('no photo, no post: the screen says so and sends nothing', (
      tester,
    ) async {
      final posts = _Posts();
      await _open(tester, posts, FakePhotoPicker());
      await _post(tester);
      expect(find.text('Choose a photo or video first'), findsOneWidget);
      expect(posts.published, isEmpty);
    });

    testWidgets('a text post needs no photo and no place', (tester) async {
      final posts = _Posts();
      await _open(tester, posts, FakePhotoPicker());
      await tester.tap(find.text('Text'));
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Hello Hyderabad');
      await tester.pump();
      await _post(tester);
      expect(posts.published.single.type, PostType.text);
      expect(posts.published.single.photo, isNull);
      expect(find.text('HOME'), findsOneWidget);
    });

    testWidgets(
      'a restricted account is told, and stays on the form with its words',
      (tester) async {
        final posts = _Posts()
          ..failWith = const ForbiddenFailure('x', 'ACCOUNT_RESTRICTED');
        await _open(tester, posts, FakePhotoPicker());
        await tester.tap(find.text('Text'));
        await tester.pump();
        await tester.enterText(find.byType(TextField).first, 'Hello');
        await tester.pump();
        await _post(tester);

        expect(find.text("Your account can't post right now."), findsOneWidget);
        expect(find.text('HOME'), findsNothing);
        expect(find.text('Hello'), findsOneWidget);
      },
    );

    testWidgets('each other failure has its own message', (tester) async {
      Future<void> run(Object failure, String expected) async {
        final posts = _Posts()..failWith = failure;
        await _open(tester, posts, FakePhotoPicker());
        await tester.tap(find.text('Text'));
        await tester.pump();
        await tester.enterText(find.byType(TextField).first, 'Hello');
        await tester.pump();
        await _post(tester);
        expect(find.text(expected), findsOneWidget, reason: '$failure');
      }

      await run(const NetworkFailure(), 'Something went wrong');
      await run(
        const RateLimitedFailure(),
        "You're posting too fast. Wait a moment and try again.",
      );
      await run(
        const ValidationFailure('photoTooLarge'),
        'That photo is too large. Choose one under 5 MB.',
      );
      await run(
        const ValidationFailure('photoUnsupported'),
        'Use a JPG, PNG or WebP photo.',
      );
    });

    testWidgets('changing the post clears the old failure', (tester) async {
      final posts = _Posts()..failWith = const NetworkFailure();
      await _open(tester, posts, FakePhotoPicker());
      await tester.tap(find.text('Text'));
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Hello');
      await tester.pump();
      await _post(tester);
      expect(find.text('Something went wrong'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'Hello again');
      await tester.pump();
      expect(find.text('Something went wrong'), findsNothing);
    });
  });
}
