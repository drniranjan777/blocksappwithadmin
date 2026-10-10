import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/stories/application/story_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Full-screen story viewer.
///  * tap right / left third: next / previous
///  * press and hold: pause
///  * swipe down: close
///  * auto-advances through every viewable group
class StoryViewerScreen extends ConsumerStatefulWidget {
  const StoryViewerScreen({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends ConsumerState<StoryViewerScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _timer = AnimationController(vsync: this);
  final _reply = FocusNode();

  List<StoryGroup> _groups = const [];
  int _g = 0;
  int _i = 0;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _timer.addStatusListener((s) {
      if (s == AnimationStatus.completed) _next();
    });
    _reply.addListener(() => _reply.hasFocus ? _timer.stop() : _resume());
    ref.read(storyControllerProvider.future).then(_init);
  }

  void _init(List<StoryGroup> all) {
    if (!mounted) return;
    // Snapshot: viewing marks groups as viewed and re-sorts the tray, which
    // must not reshuffle what the viewer is stepping through.
    _groups = all.where((g) => g.items.isNotEmpty).toList();
    _g = _groups.indexWhere((g) => g.id == widget.groupId);
    if (_g < 0) {
      context.pop();
      return;
    }
    setState(() => _ready = true);
    _start();
  }

  StoryItem get _item => _groups[_g].items[_i];

  void _start() {
    ref.read(storyControllerProvider.notifier).markViewed(_groups[_g].id);
    _timer
      ..duration = context.reduceMotion ? _item.duration * 1.5 : _item.duration
      ..forward(from: 0);
  }

  void _resume() {
    if (_ready && !_timer.isCompleted && !_timer.isAnimating) _timer.forward();
  }

  void _next() {
    if (!mounted) return;
    if (_i < _groups[_g].items.length - 1) {
      setState(() => _i++);
    } else if (_g < _groups.length - 1) {
      setState(() {
        _g++;
        _i = 0;
      });
    } else {
      context.pop();
      return;
    }
    _start();
  }

  void _previous() {
    if (_i > 0) {
      setState(() => _i--);
    } else if (_g > 0) {
      setState(() {
        _g--;
        _i = 0;
      });
    }
    _start();
  }

  @override
  void dispose() {
    _timer.dispose();
    _reply.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final l10n = context.l10n;
    final group = _groups[_g];
    final item = _item;
    final now = ref.read(clockProvider)();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        resizeToAvoidBottomInset: true,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) {
            if (_reply.hasFocus) {
              _reply.unfocus();
              return;
            }
            final w = MediaQuery.sizeOf(context).width;
            d.localPosition.dx < w * 0.33 ? _previous() : _next();
          },
          onLongPressStart: (_) => _timer.stop(),
          onLongPressEnd: (_) => _resume(),
          onVerticalDragEnd: (d) {
            if ((d.primaryVelocity ?? 0) > 300) context.pop();
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              BlocksImage(url: item.mediaUrl, variant: ImageVariant.large),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x99000000),
                      Color(0x00000000),
                      Color(0x00000000),
                      Color(0xB3000000),
                    ],
                    stops: [0, 0.25, 0.6, 1],
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  children: [
                    _ProgressBars(
                      count: group.items.length,
                      index: _i,
                      timer: _timer,
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: BlocksSpacing.md,
                        vertical: BlocksSpacing.sm,
                      ),
                      child: Row(
                        children: [
                          BlocksAvatar(
                            name: group.user.name,
                            imageUrl: group.user.avatarUrl,
                            size: 36,
                          ),
                          const SizedBox(width: BlocksSpacing.md),
                          Expanded(
                            child: Text(
                              '${group.user.name}  ·  ${timeAgo(l10n, item.createdAt, now: now)}',
                              style: context.text.titleSmall?.copyWith(
                                color: Colors.white,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          IconButton(
                            tooltip: l10n.storyClose,
                            color: Colors.white,
                            icon: const Icon(Icons.close_rounded),
                            onPressed: () => context.pop(),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    if (item.caption != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: BlocksSpacing.xl,
                          vertical: BlocksSpacing.lg,
                        ),
                        child: Text(
                          item.caption!,
                          textAlign: TextAlign.center,
                          style: context.text.titleLarge?.copyWith(
                            color: Colors.white,
                            shadows: const [
                              Shadow(blurRadius: 12, color: Colors.black54),
                            ],
                          ),
                        ),
                      ),
                    if (!group.isOwn)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BlocksSpacing.md,
                          0,
                          BlocksSpacing.sm,
                          BlocksSpacing.md,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                focusNode: _reply,
                                style: const TextStyle(color: Colors.white),
                                textInputAction: TextInputAction.send,
                                onSubmitted: (_) {
                                  _reply.unfocus();
                                  showAppSnack(context, l10n.storyDemoReaction);
                                },
                                decoration: InputDecoration(
                                  hintText: l10n.storyReplyHint,
                                  hintStyle: const TextStyle(
                                    color: Colors.white70,
                                  ),
                                  fillColor: Colors.white.withValues(
                                    alpha: 0.16,
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(
                                      BlocksRadius.pill,
                                    ),
                                    borderSide: const BorderSide(
                                      color: Colors.white54,
                                    ),
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(
                                      BlocksRadius.pill,
                                    ),
                                    borderSide: const BorderSide(
                                      color: Colors.white54,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: l10n.actionLike,
                              color: Colors.white,
                              icon: const Icon(Icons.favorite_border_rounded),
                              onPressed: () =>
                                  showAppSnack(context, l10n.storyDemoReaction),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProgressBars extends StatelessWidget {
  const _ProgressBars({
    required this.count,
    required this.index,
    required this.timer,
  });

  final int count;
  final int index;
  final Animation<double> timer;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.sm,
        BlocksSpacing.sm,
        BlocksSpacing.sm,
        0,
      ),
      child: Row(
        children: [
          for (var i = 0; i < count; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: i == index
                      ? AnimatedBuilder(
                          animation: timer,
                          builder: (_, _) => LinearProgressIndicator(
                            value: timer.value,
                            minHeight: 3,
                            color: Colors.white,
                            backgroundColor: Colors.white30,
                          ),
                        )
                      : LinearProgressIndicator(
                          value: i < index ? 1 : 0,
                          minHeight: 3,
                          color: Colors.white,
                          backgroundColor: Colors.white30,
                        ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
