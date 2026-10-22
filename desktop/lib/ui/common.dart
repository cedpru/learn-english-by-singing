import 'package:flutter/material.dart';

import 'theme.dart';

class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.color = Palette.card,
    this.radius = cardRadius,
    this.border,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final double radius;
  final BoxBorder? border;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: border,
      ),
      child: child,
    );
    if (onTap == null) return content;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(onTap: onTap, child: content),
    );
  }
}

enum ChipTone { neutral, ok, warn, info }

class Tag extends StatelessWidget {
  const Tag(this.label, {super.key, this.tone = ChipTone.neutral});

  final String label;
  final ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      ChipTone.ok => (Palette.mint, Palette.mintInk),
      ChipTone.warn => (Palette.amber, Palette.amberInk),
      ChipTone.info => (Palette.blueSoft, Palette.blue),
      ChipTone.neutral => (const Color(0xFFF3F3F7), Palette.inkSoft),
    };
    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(9),
      ),
      // widthFactor keeps the pill as wide as its text instead of stretching
      // across the panel.
      child: Center(
        widthFactor: 1,
        child: Text(
          label,
          style: text(11, weight: FontWeight.w600, color: fg, height: 1.2),
        ),
      ),
    );
  }
}

/// Buttons: an ink pill for the main action, an outline-free pale pill for the
/// rest. Flat on purpose — no elevation, no shadow.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onTap,
    this.icon,
    this.dark = false,
    this.pale = false,
    this.danger = false,
    this.expand = false,
    this.busy = false,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final bool dark;
  final bool pale;
  final bool danger;
  final bool expand;
  final bool busy;

  /// Compact pill: exactly the height of a [Tag] (24 px), so an icon never
  /// makes it taller than its neighbours on the same line.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null && !busy;
    final bg = dark
        ? Palette.dark
        : danger
        ? Palette.coral
        : pale
        ? Palette.lavender
        : Palette.hover;
    final fg = dark
        ? Colors.white
        : danger
        ? Palette.coralInk
        : Palette.ink;
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          onTap: enabled ? onTap : null,
          child: Container(
            height: compact ? 24 : 40,
            width: expand ? double.infinity : null,
            padding: EdgeInsets.symmetric(horizontal: compact ? 9 : 16),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(compact ? 9 : 13),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy) ...[
                  SizedBox(
                    width: compact ? 11 : 13,
                    height: compact ? 11 : 13,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: fg,
                    ),
                  ),
                  const SizedBox(width: 7),
                ] else if (icon != null) ...[
                  Icon(icon, size: compact ? 12 : 15, color: fg),
                  SizedBox(width: compact ? 4 : 5),
                ],
                Text(
                  label,
                  style: text(
                    compact ? 11 : 12.5,
                    weight: FontWeight.w600,
                    color: fg,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RoundButton extends StatelessWidget {
  const RoundButton({
    super.key,
    required this.icon,
    this.onTap,
    this.size = 42,
    this.dark = false,
    this.tooltip,
    this.active = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final double size;
  final bool dark;
  final String? tooltip;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final widget = Opacity(
      opacity: enabled ? 1 : 0.4,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: dark
                  ? Palette.dark
                  : active
                  ? Palette.lavenderMid
                  : Palette.hover,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              size: size * 0.42,
              color: dark ? Colors.white : Palette.ink,
            ),
          ),
        ),
      ),
    );
    if (tooltip == null) return widget;
    return Tooltip(message: tooltip!, child: widget);
  }
}

class TextField2 extends StatelessWidget {
  const TextField2({
    super.key,
    required this.controller,
    this.hint,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.height = 42,
    this.icon,
  });

  final TextEditingController controller;
  final String? hint;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final double height;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      padding: EdgeInsets.only(left: icon == null ? 14 : 10, right: 14),
      decoration: BoxDecoration(
        color: Palette.hover,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: Palette.line),
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: Palette.inkFaint),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: TextField(
              controller: controller,
              autofocus: autofocus,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
              style: text(12.5, color: Palette.ink),
              cursorColor: Palette.blue,
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: hint,
                hintStyle: text(12.5, color: Palette.inkFaint),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class Dot extends StatelessWidget {
  const Dot({super.key, required this.color, this.size = 8});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

class Cover extends StatelessWidget {
  const Cover({
    super.key,
    this.url,
    this.size = 48,
    this.radius = 14,
  });

  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Palette.lavender,
        borderRadius: BorderRadius.circular(radius),
      ),
      alignment: Alignment.center,
      child: Text(
        '♪',
        style: text(size * 0.42, weight: FontWeight.w700, color: Palette.violet),
      ),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}

class Spinner extends StatelessWidget {
  const Spinner({super.key, this.size = 26});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: const CircularProgressIndicator(
      strokeWidth: 2.5,
      color: Palette.blue,
      backgroundColor: Palette.blueSoft,
    ),
  );
}
