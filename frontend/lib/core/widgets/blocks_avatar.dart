import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:flutter/material.dart';

/// Rounded-square avatar (BLOCKS' shape language — deliberately not a circle)
/// with initials fallback, optional verified tick and online dot.
class BlocksAvatar extends StatelessWidget {
  const BlocksAvatar({
    required this.name,
    super.key,
    this.imageUrl,
    this.size = 44,
    this.isVerified = false,
    this.isOnline = false,
    this.decorative = false,
  });

  final String name;
  final String? imageUrl;
  final double size;
  final bool isVerified;
  final bool isOnline;

  /// True when the person's name is already announced next to the avatar
  /// (e.g. in a post header), so screen readers skip the picture.
  final bool decorative;

  static const _fallbacks = [
    Color(0xFF3A3DD8),
    Color(0xFF0FA39A),
    Color(0xFFD6246E),
    Color(0xFF2F6BFF),
    Color(0xFFC96F00),
    Color(0xFF12945A),
  ];

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p.characters.first.toUpperCase()).join();
  }

  Color get _fallbackColor =>
      _fallbacks[name.runes.fold<int>(0, (a, b) => a + b) % _fallbacks.length];

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(size * 0.32);
    final palette = Theme.of(context).extension<BlocksColors>();

    final face = imageUrl == null
        ? DecoratedBox(
            decoration: BoxDecoration(
              color: _fallbackColor,
              borderRadius: radius,
            ),
            child: Center(
              // Initials are decoration; the avatar's label carries the name.
              child: ExcludeSemantics(
                child: Text(
                  _initials,
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: size * 0.36,
                  ),
                ),
              ),
            ),
          )
        : BlocksImage(
            url: imageUrl!,
            variant: ImageVariant.thumbnail,
            width: size,
            height: size,
            borderRadius: radius,
          );

    return Semantics(
      image: !decorative,
      label: decorative ? null : name,
      excludeSemantics: decorative,
      child: SizedBox.square(
        dimension: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(child: face),
            if (isVerified)
              Positioned(
                right: -size * 0.08,
                bottom: -size * 0.08,
                child: Container(
                  padding: EdgeInsets.all(size * 0.04),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.verified_rounded,
                    size: size * 0.32,
                    color: palette?.reachState ?? BlocksPalette.state,
                  ),
                ),
              ),
            if (isOnline && !isVerified)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: size * 0.26,
                  height: size * 0.26,
                  decoration: BoxDecoration(
                    color: palette?.success ?? BlocksPalette.success,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.surface,
                      width: 2,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
