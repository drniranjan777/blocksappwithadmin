import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Every screen must render one of: loading, empty, error (with retry) or
/// content. These shared views keep that consistent.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(
        label: context.l10n.loading,
        child: const CircularProgressIndicator(),
      ),
    );
  }
}

class _MessageView extends StatelessWidget {
  const _MessageView({
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: context.scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(BlocksRadius.xl),
                ),
                child: Icon(
                  icon,
                  size: 32,
                  color: context.scheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              Text(
                title,
                style: context.text.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Text(
                body,
                style: context.text.bodyMedium?.copyWith(
                  color: context.scheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: BlocksSpacing.xl),
                BlocksButton(
                  label: actionLabel!,
                  onPressed: onAction,
                  variant: BlocksButtonVariant.tonal,
                  expand: false,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    this.icon = Icons.grid_view_rounded,
    this.title,
    this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String? title;
  final String? body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => _MessageView(
    icon: icon,
    title: title ?? context.l10n.emptyTitle,
    body: body ?? context.l10n.emptyBody,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, this.message, this.onRetry, this.error});

  final String? message;
  final VoidCallback? onRetry;

  /// What failed, when the caller has it. A part of the app that the server does not offer yet
  /// says so (and has no pointless "Try again"), instead of blaming the person's connection.
  final Object? error;

  @override
  Widget build(BuildContext context) {
    if (isFeatureUnavailable(error)) {
      return _MessageView(
        icon: Icons.schedule_rounded,
        title: context.l10n.unavailableTitle,
        body: context.l10n.unavailableBody,
      );
    }
    return _MessageView(
      icon: Icons.cloud_off_rounded,
      title: context.l10n.errorTitle,
      body: message ?? context.l10n.errorBody,
      actionLabel: onRetry == null ? null : context.l10n.retry,
      onAction: onRetry,
    );
  }
}

/// Renders an [AsyncValue] with consistent loading/error/empty handling so
/// feature screens only describe their happy path.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    required this.value,
    required this.data,
    super.key,
    this.onRetry,
    this.isEmpty,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final bool Function(T data)? isEmpty;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: (d) => (isEmpty?.call(d) ?? false) ? const EmptyView() : data(d),
      loading: () => const LoadingView(),
      error: (e, _) => ErrorView(error: e, onRetry: onRetry),
    );
  }
}
