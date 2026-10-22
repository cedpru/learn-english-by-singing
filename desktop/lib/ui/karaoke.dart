import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../app_controller.dart';
import '../models.dart';
import 'common.dart';
import 'theme.dart';

class KaraokePage extends StatefulWidget {
  const KaraokePage({super.key, required this.controller});

  final AppController controller;

  @override
  State<KaraokePage> createState() => _KaraokePageState();
}

class _KaraokePageState extends State<KaraokePage> {
  int _active = -1;

  AppController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    c.position.addListener(_onClock);
  }

  @override
  void dispose() {
    c.position.removeListener(_onClock);
    super.dispose();
  }

  void _onClock() {
    final payload = c.payload;
    if (payload == null || !payload.synced) {
      if (_active != -1) setState(() => _active = -1);
      return;
    }
    final index = activeLineIndex(payload.lines, c.position.value - c.shift);
    if (index != _active) setState(() => _active = index);
  }

  @override
  Widget build(BuildContext context) {
    final track = c.current!.track;
    final payload = c.payload;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            RoundButton(
              icon: Icons.arrow_back_rounded,
              tooltip: 'Changer de source',
              onTap: () {
                _active = -1;
                c.back();
              },
            ),
            const SizedBox(width: 14),
            Cover(url: track.cover, size: 52, radius: 15),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    track.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text(18, weight: FontWeight.w700, spacing: -0.3),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    track.artist,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text(12.5, color: Palette.inkSoft),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            if (payload != null) _badges(payload),
          ],
        ),
        const SizedBox(height: 16),
        Expanded(child: _body(track, payload)),
      ],
    );
  }

  Widget _badges(KaraokePayload payload) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      alignment: WrapAlignment.end,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (payload.synced) const Tag('synchronisé', tone: ChipTone.ok),
        if (c.autoSynced) const Tag("calé sur l'audio", tone: ChipTone.info),
        // station that names nothing: the next song is being identified
        if (c.identifying) const Tag('écoute du direct…', tone: ChipTone.info),
        if (payload.provider == 'manuel')
          const Tag('paroles maison', tone: ChipTone.neutral),
        if (payload.translation == 'ok')
          const Tag('FR auto', tone: ChipTone.ok),
        if (payload.translation == 'already-target')
          const Tag('déjà en français', tone: ChipTone.neutral),
        if (payload.translation == 'approximate')
          const Tag('FR approximatif', tone: ChipTone.warn),
        if (payload.translation == 'unsupported')
          const Tag('pas de traduction', tone: ChipTone.warn),
        AppButton(
          label: 'paroles',
          icon: Icons.edit_outlined,
          pale: true,
          compact: true,
          onTap: () => _openEditor(payload),
        ),
      ],
    );
  }

  Widget _body(SongRef track, KaraokePayload? payload) {
    if (c.loading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Spinner(),
            const SizedBox(height: 16),
            Text('Recherche des paroles et traduction…', style: text(13.5)),
            const SizedBox(height: 6),
            Text(
              'Le premier morceau télécharge le modèle de traduction (~120 Mo), ensuite tout est local.',
              style: text(11.5, color: Palette.inkFaint),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    if (c.error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              c.error!,
              textAlign: TextAlign.center,
              style: text(13.5, color: Palette.coralInk),
            ),
            const SizedBox(height: 14),
            AppButton(label: 'Réessayer', dark: true, onTap: c.retry),
          ],
        ),
      );
    }

    if (payload == null) return const SizedBox.shrink();

    if (payload.instrumental) {
      return _notice(
        icon: Icons.headphones_rounded,
        title: 'Morceau instrumental',
        body: 'Pas de paroles à chanter sur celui-ci — profite.',
      );
    }

    if (payload.lines.isEmpty) {
      return _notice(
        icon: Icons.lyrics_outlined,
        title: 'Paroles introuvables pour ce titre',
        body:
            '${payload.provider == 'aucun' ? 'LRCLIB' : payload.provider} n’a pas d’entrée pour « ${track.artist} — ${track.title} ». '
            'Colle-les à la main : elles seront gardées pour ce titre.',
        action: AppButton(
          label: 'Ajouter les paroles',
          icon: Icons.add_rounded,
          dark: true,
          onTap: () => _openEditor(payload),
        ),
      );
    }

    return _LyricsList(
      lines: payload.lines,
      active: payload.synced ? _active : -1,
      synced: payload.synced,
      wordSync: payload.wordSync,
      position: c.position,
      shift: c.shift,
      onTapLine: payload.synced
          ? (line) {
              if (line.t != null) c.tapLine(line.t!);
            }
          : null,
    );
  }

  Widget _notice({
    required IconData icon,
    required String title,
    required String body,
    Widget? action,
  }) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Palette.lavender,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: Palette.violet, size: 24),
            ),
            const SizedBox(height: 14),
            Text(title, style: text(15, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(
              body,
              textAlign: TextAlign.center,
              style: text(12.5, color: Palette.inkSoft, height: 1.45),
            ),
            if (action != null) ...[const SizedBox(height: 16), action],
          ],
        ),
      ),
    );
  }

  Future<void> _openEditor(KaraokePayload payload) async {
    final controller = TextEditingController(text: linesToLrc(payload.lines));
    final result = await showDialog<String?>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(48),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 620, maxHeight: 620),
          decoration: BoxDecoration(
            color: Palette.card,
            borderRadius: BorderRadius.circular(24),
          ),
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Paroles de « ${c.current!.track.artist} — ${c.current!.track.title} »',
                style: text(16, weight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(
                'Une ligne par phrase, ou un fichier .lrc collé pour garder les timings. '
                'C’est enregistré sur cet appareil et réutilisé pour ce titre.',
                style: text(12, color: Palette.inkSoft, height: 1.45),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Palette.hover,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Palette.line),
                  ),
                  child: TextField(
                    controller: controller,
                    maxLines: null,
                    expands: true,
                    autofocus: true,
                    style: text(12.5, height: 1.5),
                    cursorColor: Palette.blue,
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      hintText:
                          '[00:12.40]Première ligne\n[00:16.10]Deuxième ligne\n\n… ou juste le texte, sans timings',
                      hintStyle: text(12, color: Palette.inkFaint, height: 1.5),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  AppButton(
                    label: 'Annuler',
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  if (payload.provider == 'manuel')
                    AppButton(
                      label: 'Retirer',
                      danger: true,
                      onTap: () => Navigator.of(context).pop(''),
                    ),
                  const SizedBox(width: 8),
                  AppButton(
                    label: 'Enregistrer et charger',
                    dark: true,
                    onTap: () => Navigator.of(context).pop(controller.text),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    if (result == null) return;
    await c.saveLyrics(result.trim().isEmpty ? null : result);
  }
}

class _LyricsList extends StatefulWidget {
  const _LyricsList({
    required this.lines,
    required this.active,
    required this.synced,
    required this.wordSync,
    required this.position,
    required this.shift,
    this.onTapLine,
  });

  final List<LyricLine> lines;
  final int active;
  final bool synced;
  final bool wordSync;
  final ValueListenable<double> position;
  final double shift;
  final void Function(LyricLine line)? onTapLine;

  @override
  State<_LyricsList> createState() => _LyricsListState();
}

class _LyricsListState extends State<_LyricsList> {
  final ScrollController _scroll = ScrollController();
  final Map<int, GlobalKey> _keys = {};
  int _lastActive = -2;

  @override
  void didUpdateWidget(covariant _LyricsList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.lines, widget.lines)) {
      _keys.clear();
      _lastActive = -2;
      if (_scroll.hasClients) _scroll.jumpTo(0);
      return;
    }
    if (widget.active != _lastActive) {
      _lastActive = widget.active;
      if (widget.active >= 0) _center(widget.active);
    }
  }

  @override
  void initState() {
    super.initState();
    _lastActive = widget.active;
    if (widget.active >= 0) _center(widget.active);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _center(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final context = _keys[index]?.currentContext;
      if (context != null) {
        Scrollable.ensureVisible(
          context,
          alignment: 0.42,
          duration: const Duration(milliseconds: 340),
          curve: Curves.easeOutCubic,
        );
        return;
      }
      // the line is outside the built window: get close, then finish smoothly
      final target = (index * 76.0).clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.jumpTo(target);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final fresh = _keys[index]?.currentContext;
        if (fresh != null) {
          Scrollable.ensureVisible(
            fresh,
            alignment: 0.42,
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic,
          );
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.synced)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Palette.amber,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.schedule_rounded,
                  size: 14,
                  color: Palette.amberInk,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Paroles non synchronisées — affichage complet, défilement libre.',
                    style: text(11.5, color: Palette.amberInk),
                  ),
                ),
              ],
            ),
          ),
        Expanded(
          child: ShaderMask(
            shaderCallback: (rect) => const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.white, Colors.white, Colors.transparent],
              stops: [0, 0.07, 0.9, 1],
            ).createShader(rect),
            blendMode: BlendMode.dstIn,
            child: ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
              child: ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 4),
                scrollCacheExtent: const ScrollCacheExtent.pixels(2600),
                itemCount: widget.lines.length,
                itemBuilder: (context, index) {
                  final line = widget.lines[index];
                  final isActive = index == widget.active;
                  final key = _keys.putIfAbsent(index, () => GlobalKey());
                  return _LyricLineTile(
                    key: key,
                    line: line,
                    active: isActive,
                    past: widget.active >= 0 && index < widget.active,
                    synced: widget.synced,
                    wordSync: widget.wordSync && isActive,
                    position: widget.position,
                    shift: widget.shift,
                    onTap: widget.onTapLine == null
                        ? null
                        : () => widget.onTapLine!(line),
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _LyricLineTile extends StatelessWidget {
  const _LyricLineTile({
    super.key,
    required this.line,
    required this.active,
    required this.past,
    required this.synced,
    required this.wordSync,
    required this.position,
    required this.shift,
    this.onTap,
  });

  final LyricLine line;
  final bool active;
  final bool past;
  final bool synced;
  final bool wordSync;
  final ValueListenable<double> position;
  final double shift;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final english = text(
      active ? 19.5 : 15.5,
      weight: active ? FontWeight.w700 : FontWeight.w500,
      color: active
          ? Palette.ink
          : past
          ? Palette.ink.withValues(alpha: 0.32)
          : Palette.ink.withValues(alpha: 0.62),
      height: 1.3,
      spacing: active ? -0.2 : 0,
    );

    final Widget englishText = wordSync && (line.words?.isNotEmpty ?? false)
        ? ValueListenableBuilder<double>(
            valueListenable: position,
            builder: (context, position, _) {
              final singer = activeWordIndex(line, position - shift);
              return RichText(
                text: TextSpan(
                  children: [
                    for (var i = 0; i < line.words!.length; i += 1)
                      TextSpan(
                        text: '${line.words![i].text} ',
                        style: english.copyWith(
                          color: i <= singer
                              ? Palette.blue
                              : english.color?.withValues(alpha: 0.55),
                        ),
                      ),
                  ],
                ),
              );
            },
          )
        : Text(line.text, style: english);

    return MouseRegion(
      cursor: onTap != null
          ? SystemMouseCursors.click
          : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(vertical: 1),
          padding: const EdgeInsets.fromLTRB(14, 7, 14, 8),
          decoration: BoxDecoration(
            // animate within the same hue: fading from Colors.transparent
            // (transparent black) passes through a grey frame
            color: Palette.lavender.withValues(alpha: active ? 0.55 : 0),
            borderRadius: BorderRadius.circular(14),
            border: Border(
              left: BorderSide(
                color: Palette.violet.withValues(alpha: active ? 1 : 0),
                width: 3,
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              englishText,
              if (line.fr != null && line.fr!.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  line.fr!,
                  style: text(
                    active ? 14 : 12,
                    weight: active ? FontWeight.w600 : FontWeight.w500,
                    color: active
                        ? Palette.violet
                        : Palette.inkSoft.withValues(alpha: past ? 0.4 : 0.75),
                    height: 1.35,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class TransportBar extends StatelessWidget {
  const TransportBar({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final payload = c.payload;
    final total = payload?.track.duration ?? c.current?.track.duration ?? 0;
    final radio = c.radioActive;

    return Row(
      children: [
        ValueListenableBuilder<bool>(
          valueListenable: radio ? c.audio.playing : c.clockPlaying,
          builder: (context, playing, _) => RoundButton(
            icon: playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
            dark: true,
            size: 46,
            onTap: c.togglePlay,
            tooltip: playing ? 'Pause (Ctrl+Espace)' : 'Lecture (Ctrl+Espace)',
          ),
        ),
        const SizedBox(width: 12),
        _ShiftButton(label: '−3 s', onTap: () => c.bumpShift(-3)),
        const SizedBox(width: 6),
        _ShiftButton(label: '+3 s', onTap: () => c.bumpShift(3)),
        const SizedBox(width: 18),
        Expanded(
          child: ValueListenableBuilder<double>(
            valueListenable: c.position,
            builder: (context, position, _) {
              final live = total <= 0 || position > total + 5;
              final fraction = live
                  ? 1.0
                  : (position / total).clamp(0.0, 1.0);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Stack(
                      children: [
                        Container(height: 6, color: const Color(0xFFF0F0F5)),
                        FractionallySizedBox(
                          widthFactor: fraction,
                          child: Container(
                            height: 6,
                            decoration: BoxDecoration(
                              color: live ? Palette.lavenderMid : Palette.blue,
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        const SizedBox(width: 12),
        ValueListenableBuilder<double>(
          valueListenable: c.position,
          builder: (context, position, _) => Text(
            total > 0 && position <= total + 5
                ? '${formatTime(position)} / ${formatTime(total)}'
                : formatTime(position),
            style: text(
              11.5,
              weight: FontWeight.w600,
              color: Palette.inkSoft,
            ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ),
        if (c.shift != 0) ...[
          const SizedBox(width: 10),
          Tag(
            'décalage ${c.shift > 0 ? '+' : ''}${c.shift.toStringAsFixed(1)} s',
            tone: ChipTone.info,
          ),
        ],
        if (radio) ...[
          const SizedBox(width: 14),
          RoundButton(
            icon: c.muted || c.volume == 0
                ? Icons.volume_off_rounded
                : Icons.volume_up_rounded,
            size: 36,
            tooltip: 'Couper le son (Ctrl+M)',
            onTap: c.toggleMute,
          ),
          SizedBox(
            width: 92,
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 3,
                activeTrackColor: Palette.blue,
                inactiveTrackColor: const Color(0xFFE9E9F0),
                thumbColor: Palette.dark,
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              ),
              child: Slider(
                value: c.muted ? 0 : c.volume,
                onChanged: (value) => c.setVolume(value),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _ShiftButton extends StatelessWidget {
  const _ShiftButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: Palette.lavender,
            borderRadius: BorderRadius.circular(11),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: text(11.5, weight: FontWeight.w700, color: Palette.ink),
          ),
        ),
      ),
    );
  }
}
