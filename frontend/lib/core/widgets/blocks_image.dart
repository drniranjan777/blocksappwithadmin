import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Rendition requested from the image CDN. Lists show [thumbnail]/[medium];
/// only full-screen viewers should ask for [large] or [original].
enum ImageVariant {
  thumbnail(160),
  medium(540),
  large(1080),
  original(null);

  const ImageVariant(this.maxWidth);

  /// Logical width cap used to size the decoded bitmap (and, in production,
  /// the CDN `?w=` parameter). Null means "do not resize".
  final int? maxWidth;
}

/// Maps a canonical image URL to the right rendition. The demo returns the URL
/// untouched; production plugs in a CDN resolver (e.g. appends `?w=540&fm=webp`)
/// without any widget changing.
abstract interface class ImageUrlResolver {
  String resolve(String url, ImageVariant variant);
}

class PassThroughImageUrlResolver implements ImageUrlResolver {
  const PassThroughImageUrlResolver();

  @override
  String resolve(String url, ImageVariant variant) => url;
}

final imageUrlResolverProvider = Provider<ImageUrlResolver>(
  (ref) => const PassThroughImageUrlResolver(),
);

/// The ONLY way screens should load network images: cached, memory-conscious
/// (decodes at display size, not source size), with placeholder and error
/// states.
class BlocksImage extends ConsumerWidget {
  const BlocksImage({
    required this.url,
    super.key,
    this.variant = ImageVariant.medium,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.borderRadius,
    this.semanticLabel,
  });

  final String url;
  final ImageVariant variant;
  final BoxFit fit;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A photo the user just picked: shown from memory, decoded at display size.
    if (LocalMediaStore.isLocal(url)) return _local(context, ref);

    // Demo media is generated on-device (offline, copyright-free).
    final demoSeed = demoSeedOf(url);
    if (demoSeed != null) {
      final art = SizedBox(
        width: width,
        height: height,
        child: DemoArt(seed: demoSeed),
      );
      final clipped = borderRadius == null
          ? art
          : ClipRRect(borderRadius: borderRadius!, child: art);
      return Semantics(
        image: true,
        label: semanticLabel,
        excludeSemantics: semanticLabel != null,
        child: clipped,
      );
    }

    final resolved = ref.watch(imageUrlResolverProvider).resolve(url, variant);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final cap = variant.maxWidth;
    final target = width ?? cap?.toDouble();
    final memWidth = target == null
        ? null
        : (target * dpr).round().clamp(
            1,
            cap == null ? 4096 : (cap * dpr).round(),
          );

    final muted =
        Theme.of(context).extension<BlocksColors>()?.surfaceMuted ??
        Colors.black12;

    final image = CachedNetworkImage(
      imageUrl: resolved,
      width: width,
      height: height,
      fit: fit,
      memCacheWidth: memWidth,
      fadeInDuration: const Duration(milliseconds: 180),
      placeholder: (_, _) => ColoredBox(color: muted),
      errorWidget: (_, _, _) => ColoredBox(
        color: muted,
        child: const Center(child: Icon(Icons.image_not_supported_outlined)),
      ),
    );

    final clipped = borderRadius == null
        ? image
        : ClipRRect(borderRadius: borderRadius!, child: image);
    return Semantics(
      image: true,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: clipped,
    );
  }

  Widget _local(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(localMediaStoreProvider).get(url);
    final muted =
        Theme.of(context).extension<BlocksColors>()?.surfaceMuted ??
        Colors.black12;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final target = width ?? variant.maxWidth?.toDouble();
    final cacheWidth = target == null
        ? null
        : (target * dpr).round().clamp(1, 2048);

    final placeholder = ColoredBox(color: muted);
    final image = bytes == null
        ? SizedBox(width: width, height: height, child: placeholder)
        : Image.memory(
            bytes,
            width: width,
            height: height,
            fit: fit,
            cacheWidth: cacheWidth,
            gaplessPlayback: true,
            // Undecodable bytes must never crash a screen.
            errorBuilder: (_, _, _) => placeholder,
          );
    final clipped = borderRadius == null
        ? image
        : ClipRRect(borderRadius: borderRadius!, child: image);
    return Semantics(
      image: true,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: clipped,
    );
  }
}
