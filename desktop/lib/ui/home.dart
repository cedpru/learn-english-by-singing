import 'dart:async';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../api.dart';
import '../models.dart';
import 'common.dart';
import 'theme.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final child = switch (controller.mode) {
      Mode.mic => MicHome(controller: controller),
      Mode.radio => RadioHome(controller: controller),
      Mode.search => SearchHome(controller: controller),
    };
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      layoutBuilder: (current, previous) => Stack(
        fit: StackFit.expand,
        alignment: Alignment.topLeft,
        children: [...previous, ?current],
      ),
      child: KeyedSubtree(key: ValueKey(controller.mode), child: child),
    );
  }
}

Widget _lead(String head, String highlight, String tail) => RichText(
  text: TextSpan(
    style: text(25, weight: FontWeight.w700, height: 1.15, spacing: -0.6),
    children: [
      TextSpan(text: '$head '),
      TextSpan(text: highlight, style: const TextStyle(color: Palette.violet)),
      TextSpan(text: tail),
    ],
  ),
);

// ------------------------------------------------------------------- micro
class MicHome extends StatelessWidget {
  const MicHome({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _MicButton(controller: c),
              const SizedBox(width: 22),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _lead(
                      'Chante juste, même quand tu ne connais pas',
                      'les paroles',
                      '.',
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Le micro reconnaît le morceau qui passe à la radio, à la télé ou sur "
                      "ton enceinte, récupère les paroles synchronisées et les traduit en "
                      "français — sans quitter l'écran des yeux.",
                      style: text(13, color: Palette.inkSoft, height: 1.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              AppButton(
                label: c.micBusy ? 'Écoute en cours…' : 'Écouter 8 s',
                icon: Icons.mic_rounded,
                dark: true,
                busy: c.micBusy,
                onTap: c.micBusy ? null : () => c.listenMic(loop: false),
              ),
              const SizedBox(width: 8),
              AppButton(
                label: 'Écouter en continu',
                pale: true,
                onTap: c.micBusy ? null : () => c.listenMic(),
              ),
              if (c.micLoop) ...[
                const SizedBox(width: 8),
                AppButton(label: 'Arrêter', onTap: c.stopMicLoop),
              ],
            ],
          ),
          if (c.micStatus != null) ...[
            const SizedBox(height: 14),
            Text(c.micStatus!, style: text(12.5, color: Palette.inkSoft)),
          ],
          if (c.micError != null) ...[
            const SizedBox(height: 8),
            Text(
              c.micError!,
              style: text(12.5, color: Palette.coralInk),
            ),
          ],
          const SizedBox(height: 18),
          _MicTestCard(controller: c),
        ],
      ),
    );
  }
}

class _MicButton extends StatelessWidget {
  const _MicButton({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<double>(
      valueListenable: controller.mic.level,
      builder: (context, level, _) {
        final active = controller.micBusy;
        return Container(
          width: 96 + (active ? level * 16 : 0),
          height: 96 + (active ? level * 16 : 0),
          decoration: BoxDecoration(
            color: Palette.lavender,
            shape: BoxShape.circle,
            border: Border.all(
              color: active
                  ? Palette.violet.withValues(alpha: 0.35 + level * 0.5)
                  : Colors.transparent,
              width: 3,
            ),
          ),
          alignment: Alignment.center,
          child: Container(
            width: 70,
            height: 70,
            decoration: const BoxDecoration(
              color: Palette.dark,
              shape: BoxShape.circle,
            ),
            child: active
                ? const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    ),
                  )
                : const Icon(
                    Icons.mic_rounded,
                    color: Colors.white,
                    size: 30,
                  ),
          ),
        );
      },
    );
  }
}

class _MicTestCard extends StatefulWidget {
  const _MicTestCard({required this.controller});

  final AppController controller;

  @override
  State<_MicTestCard> createState() => _MicTestCardState();
}

class _MicTestCardState extends State<_MicTestCard> {
  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.lavender.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.graphic_eq_rounded, size: 16, color: Palette.violet),
              const SizedBox(width: 8),
              Text(
                'Vérifier l’entrée micro',
                style: text(12.5, weight: FontWeight.w700),
              ),
              const Spacer(),
              if (c.testing)
                AppButton(label: 'Fermer', onTap: c.closeMicTest),
              const SizedBox(width: 6),
              AppButton(
                label: c.micBusy
                    ? 'Enregistrement…'
                    : (c.testing ? 'Refaire 3 s' : 'Tester le micro'),
                pale: false,
                busy: c.micBusy,
                onTap: c.micBusy ? null : c.testMicrophone,
              ),
            ],
          ),
          if (c.testing) ...[
            const SizedBox(height: 12),
            ValueListenableBuilder<double>(
              valueListenable: c.mic.level,
              builder: (context, level, _) => ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Stack(
                  children: [
                    Container(height: 8, color: Colors.white),
                    FractionallySizedBox(
                      widthFactor: level.clamp(0.0, 1.0),
                      child: Container(
                        height: 8,
                        decoration: BoxDecoration(
                          color: level > 0.9
                              ? Palette.coralInk
                              : level < 0.08
                              ? Palette.lavenderMid
                              : Palette.violet,
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${c.mic.deviceLabel.isEmpty ? 'Périphérique par défaut' : c.mic.deviceLabel}'
              ' · parle ou mets la musique pour voir le niveau',
              style: text(11.5, color: Palette.inkSoft),
            ),
            if (c.testStatus != null) ...[
              const SizedBox(height: 8),
              Text(c.testStatus!, style: text(12, color: Palette.ink)),
            ],
            if (c.testClipPath != null) ...[
              const SizedBox(height: 10),
              AppButton(
                label: 'Réécouter',
                icon: Icons.play_arrow_rounded,
                pale: false,
                onTap: () => c.audio.playClip(c.testClipPath!),
              ),
            ],
          ] else
            Text(
              'Enregistre trois secondes et réécoute : c’est exactement ce qui part à la reconnaissance.',
              style: text(11.5, color: Palette.inkSoft, height: 1.4),
            ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------- radio
class RadioHome extends StatelessWidget {
  const RadioHome({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('STATIONS', style: labelCaps),
              const Spacer(),
              Dot(
                color: switch (c.session?.status) {
                  'live' => Palette.mintInk,
                  'error' => Palette.coralInk,
                  _ => Palette.inkFaint,
                },
                size: 7,
              ),
              const SizedBox(width: 6),
              Text(
                _statusLabel(c.session),
                style: text(11.5, color: Palette.inkSoft),
              ),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              final columns = width > 620 ? 2 : 1;
              final tileWidth = (width - (columns - 1) * 10) / columns;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final preset in c.presets)
                    SizedBox(
                      width: tileWidth,
                      child: _PresetTile(
                        preset: preset,
                        selected: c.radioUrl == preset.url,
                        busy: c.startingRadio,
                        onTap: () => c.startRadio(preset.url, preset.name),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 18),
          _CustomStream(controller: c),
          if (c.radioError != null) ...[
            const SizedBox(height: 12),
            Text(c.radioError!, style: text(12, color: Palette.coralInk)),
          ],
          if (c.radioStationOnly && c.current == null) ...[
            const SizedBox(height: 14),
            _IdentifyNotice(controller: c),
          ],
          if (c.radioNeedsManual && c.current == null) ...[
            const SizedBox(height: 16),
            _ManualTrack(controller: c),
          ],
          const SizedBox(height: 16),
          Text(
            "Le titre en cours vient des métadonnées du flux : l'app attend que le lecteur "
            "ait rejoint le direct avant d'écouter, pour caler les paroles sur ce que tu entends.",
            style: text(11.5, color: Palette.inkFaint, height: 1.45),
          ),
        ],
      ),
    );
  }

  String _statusLabel(RadioSession? session) {
    if (session == null) return 'aucune station';
    if (session.status == 'live' && (session.artist ?? '').isEmpty) {
      return 'titre non annoncé par la station';
    }
    return switch (session.status) {
      'connecting' => 'connexion au flux…',
      'live' => 'métadonnées reçues',
      'no-metadata' => 'ce flux ne publie pas le titre en cours',
      'error' => 'flux injoignable',
      'stopped' => 'arrêté',
      _ => session.status,
    };
  }
}

class _PresetTile extends StatelessWidget {
  const _PresetTile({
    required this.preset,
    required this.selected,
    required this.busy,
    required this.onTap,
  });

  final Preset preset;
  final bool selected;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      radius: 18,
      color: selected ? Palette.lavender : Palette.hover,
      onTap: busy ? null : onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  preset.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text(13, weight: FontWeight.w700),
                ),
              ),
              if (selected)
                const Icon(
                  Icons.play_circle_fill_rounded,
                  size: 16,
                  color: Palette.violet,
                ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            preset.note,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text(11.5, color: Palette.inkSoft),
          ),
        ],
      ),
    );
  }
}

/// Shown when the station only announces its own name: say what is happening
/// instead of leaving an empty screen where the lyrics should be.
class _IdentifyNotice extends StatelessWidget {
  const _IdentifyNotice({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final station = c.session?.title;
    final (tone, message) = c.identifying
        ? (
            Palette.lavender,
            'Cette station n’annonce que son nom${station == null ? '' : ' (« $station »)'}. '
                'L’app écoute le direct et demande à Shazam quel morceau passe…',
          )
        : c.identifyGaveUp
        ? (
            Palette.amber,
            'Le morceau n’a pas pu être reconnu à l’écoute. Saisis-le ci-dessous : '
                'les paroles se lanceront dessus.',
          )
        : (
            Palette.lavender,
            'Cette station n’annonce que son nom${station == null ? '' : ' (« $station »)'}. '
                'L’identification du morceau à l’écoute démarre dans un instant.',
          );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (c.identifying) ...[
            const Spinner(size: 15),
            const SizedBox(width: 10),
          ] else ...[
            Icon(
              c.identifyGaveUp
                  ? Icons.help_outline_rounded
                  : Icons.graphic_eq_rounded,
              size: 15,
              color: Palette.inkSoft,
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              message,
              style: text(
                11.5,
                color: c.identifyGaveUp ? Palette.amberInk : Palette.inkSoft,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomStream extends StatefulWidget {
  const _CustomStream({required this.controller});

  final AppController controller;

  @override
  State<_CustomStream> createState() => _CustomStreamState();
}

class _CustomStreamState extends State<_CustomStream> {
  final TextEditingController _url = TextEditingController();

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField2(
            controller: _url,
            hint: 'URL d’un flux radio (mp3 / aac, Icecast ou Shoutcast)',
            icon: Icons.link_rounded,
            onChanged: (_) => setState(() {}),
            onSubmitted: (value) => _start(value),
          ),
        ),
        const SizedBox(width: 8),
        AppButton(
          label: 'Écouter',
          dark: true,
          onTap: RegExp(r'^https?://').hasMatch(_url.text.trim())
              ? () => _start(_url.text)
              : null,
        ),
      ],
    );
  }

  void _start(String value) {
    final url = value.trim();
    if (!RegExp(r'^https?://').hasMatch(url)) return;
    widget.controller.startRadio(url, 'Flux personnalisé');
  }
}

class _ManualTrack extends StatefulWidget {
  const _ManualTrack({required this.controller});

  final AppController controller;

  @override
  State<_ManualTrack> createState() => _ManualTrackState();
}

class _ManualTrackState extends State<_ManualTrack> {
  final TextEditingController _artist = TextEditingController();
  final TextEditingController _title = TextEditingController();

  @override
  void dispose() {
    _artist.dispose();
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _artist.text.trim().isNotEmpty && _title.text.trim().isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.amber.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.controller.session?.status == 'live'
                ? 'Dis-nous ce qui passe : les paroles se calent sur le direct.'
                : 'Ce flux n’annonce pas le morceau : saisis-le à la main pour afficher les paroles.',
            style: text(12, color: Palette.amberInk),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField2(
                  controller: _artist,
                  hint: 'Artiste',
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField2(
                  controller: _title,
                  hint: 'Titre',
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              AppButton(
                label: 'Paroles',
                dark: true,
                onTap: ready
                    ? () => widget.controller.load(
                        SongRef(
                          artist: _artist.text.trim(),
                          title: _title.text.trim(),
                        ),
                        0,
                      )
                    : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ search
class SearchHome extends StatefulWidget {
  const SearchHome({super.key, required this.controller});

  final AppController controller;

  @override
  State<SearchHome> createState() => _SearchHomeState();
}

class _SearchHomeState extends State<SearchHome> {
  final TextEditingController _query = TextEditingController();
  final TextEditingController _artist = TextEditingController();
  final TextEditingController _title = TextEditingController();
  Timer? _debounce;
  List<SearchResult> _results = const [];
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    _artist.dispose();
    _title.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _loading = true);
      try {
        final results = await widget.controller.api.search(query);
        if (!mounted) return;
        setState(() {
          _results = results;
          _error = null;
        });
      } on ApiException catch (err) {
        if (!mounted) return;
        setState(() => _error = err.message);
      } catch (err) {
        if (!mounted) return;
        setState(() => _error = '$err');
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField2(
          controller: _query,
          hint: 'Chercher un morceau : « The Killers Mr Brightside »',
          icon: Icons.search_rounded,
          height: 46,
          autofocus: true,
          onChanged: _onChanged,
        ),
        const SizedBox(height: 12),
        if (_loading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('Recherche…', style: text(12.5, color: Palette.inkSoft)),
          ),
        if (_error != null)
          Text(_error!, style: text(12, color: Palette.coralInk)),
        Expanded(
          child: _results.isEmpty
              ? Center(
                  child: Text(
                    _query.text.trim().length > 1 && !_loading
                        ? 'Rien dans LRCLIB pour cette recherche. Charge le titre ci-dessous pour coller les paroles à la main.'
                        : 'Cherche un titre pour répéter avant de chanter.',
                    textAlign: TextAlign.center,
                    style: text(12.5, color: Palette.inkFaint, height: 1.5),
                  ),
                )
              : ListView.separated(
                  itemCount: _results.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (context, index) {
                    final result = _results[index];
                    return AppCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      radius: 16,
                      color: Palette.hover,
                      onTap: () => widget.controller.load(
                        SongRef(
                          artist: result.artist,
                          title: result.title,
                          album: result.album,
                          duration: result.duration,
                        ),
                        0,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  result.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: text(13, weight: FontWeight.w700),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  result.artist,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: text(11.5, color: Palette.inkSoft),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Tag(
                            result.synced ? 'synchronisé' : 'texte seul',
                            tone: result.synced ? ChipTone.ok : ChipTone.neutral,
                          ),
                          if (result.duration != null) ...[
                            const SizedBox(width: 6),
                            Tag('${(result.duration! / 60).round()} min'),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),
        if (_results.isEmpty && _query.text.trim().length > 1 && !_loading) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField2(
                  controller: _artist,
                  hint: 'Artiste',
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField2(
                  controller: _title,
                  hint: 'Titre',
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              AppButton(
                label: 'Charger',
                pale: true,
                onTap: _artist.text.trim().isEmpty || _title.text.trim().isEmpty
                    ? null
                    : () => widget.controller.load(
                        SongRef(
                          artist: _artist.text.trim(),
                          title: _title.text.trim(),
                        ),
                        0,
                      ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
