import 'dart:async';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'api.dart';
import 'app_controller.dart';
import 'audio_engine.dart';
import 'server_launcher.dart';
import 'store.dart';
import 'ui/common.dart';
import 'ui/shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  final api = Api();
  final store = await LocalStore.open();
  final launcher = ServerLauncher(api: api);
  unawaited(launcher.start());
  runApp(SingAlongApp(api: api, store: store, launcher: launcher));
}

class SingAlongApp extends StatefulWidget {
  const SingAlongApp({
    super.key,
    required this.api,
    required this.store,
    required this.launcher,
  });

  final Api api;
  final LocalStore store;
  final ServerLauncher launcher;

  @override
  State<SingAlongApp> createState() => _SingAlongAppState();
}

class _SingAlongAppState extends State<SingAlongApp> {
  late final RadioAudio _audio = RadioAudio();
  late final MicCapture _mic = MicCapture();
  late final AppController _controller = AppController(
    api: widget.api,
    store: widget.store,
    audio: _audio,
    mic: _mic,
  );

  @override
  void dispose() {
    _controller.dispose();
    unawaited(_audio.dispose());
    unawaited(_mic.dispose());
    widget.launcher.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sing Along',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: Palette.bg,
        colorSchemeSeed: Palette.violet,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        fontFamily: 'Segoe UI',
      ),
      home: AnimatedBuilder(
        animation: widget.launcher,
        builder: (context, _) {
          if (widget.launcher.ready) {
            return Shell(controller: _controller, server: widget.launcher);
          }
          return _LaunchScreen(launcher: widget.launcher);
        },
      ),
    );
  }
}

/// Shown while the local server boots (a few hundred milliseconds).
class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen({required this.launcher});

  final ServerLauncher launcher;

  @override
  Widget build(BuildContext context) {
    final hasError = launcher.error != null;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: AppCard(
            padding: const EdgeInsets.fromLTRB(30, 30, 30, 26),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Palette.lavender,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.music_note_rounded,
                        color: Palette.violet,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Sing Along',
                      style: text(22, weight: FontWeight.w800, spacing: -0.8),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    if (!hasError) ...[
                      const Spinner(size: 18),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: Text(
                        hasError
                            ? 'Le serveur local n’a pas démarré'
                            : launcher.message,
                        style: text(
                          13,
                          weight: hasError ? FontWeight.w700 : FontWeight.w500,
                          color: hasError ? Palette.coralInk : Palette.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                if (hasError) ...[
                  const SizedBox(height: 8),
                  Text(
                    launcher.error!,
                    style: text(12, color: Palette.inkSoft, height: 1.45),
                  ),
                  if (launcher.logTail.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Palette.hover,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        launcher.logTail,
                        style: text(10.5, color: Palette.inkSoft, height: 1.4),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  AppButton(
                    label: 'Réessayer',
                    dark: true,
                    onTap: () {
                      unawaited(launcher.start());
                    },
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  'Le serveur (Shazam, LRCLIB, traduction) démarre avec l’application '
                  'et s’arrête avec elle.',
                  style: text(11, color: Palette.inkFaint, height: 1.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
