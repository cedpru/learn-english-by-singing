import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import 'api.dart';

/// Starts the local Node server when the window opens, and stops it on exit.
///
/// The server is the part that talks to Shazam, LRCLIB and the translation
/// model; the desktop app is only a client. Starting it here means the user
/// never has to run `npm start` in a terminal before opening the app.
class ServerLauncher extends ChangeNotifier {
  ServerLauncher({required this.api});

  final Api api;

  Process? _process;
  Timer? _poll;
  Timer? _watch;
  int _restarts = 0;
  bool _disposed = false;

  bool ready = false;
  String message = 'Démarrage du serveur…';
  String? error;
  String? rootPath;
  final List<String> _log = [];

  bool get ownsProcess => _process != null;

  /// Last server output lines, shown when startup fails.
  String get logTail => _log.length > 6
      ? _log.sublist(_log.length - 6).join('\n')
      : _log.join('\n');

  Future<void> start() async {
    if (await api.health()) {
      _set(ready: true, message: 'Serveur déjà actif sur le port local');
      return;
    }
    final root = _findProjectRoot();
    rootPath = root;
    if (root == null) {
      _set(error: 'Serveur introuvable (dossier du projet non trouvé).');
      return;
    }
    final serverTs = File(p.join(root, 'server', 'index.ts'));
    final serverJs = File(p.join(root, 'server', 'index.js'));
    final tsxCli = File(p.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'));

    List<String> args;
    if (await serverTs.exists() && await tsxCli.exists()) {
      args = [tsxCli.path, serverTs.path];
    } else if (await serverJs.exists()) {
      args = [serverJs.path];
    } else {
      _set(
        error: 'Code du serveur absent. Lance `npm install` à la racine du projet.',
      );
      return;
    }

    try {
      final process = await Process.start(
        'node',
        args,
        workingDirectory: root,
        runInShell: false,
        // the server watches this pid and exits with the window, so closing the
        // app never leaves an orphan node process holding the port
        environment: {'SINGALONG_PARENT_PID': '$pid'},
      );
      _process = process;
      process.stdout
          .transform(const SystemEncoding().decoder)
          .listen(_onOutput, onError: (_) {});
      process.stderr.transform(const SystemEncoding().decoder).listen(
        _onOutput,
        onError: (_) {},
      );
      unawaited(
        process.exitCode.then((code) {
          if (_disposed || ready) return;
          _set(
            error: code == 0
                ? 'Le serveur s’est arrêté avant d’être prêt.'
                : 'Le serveur n’a pas pu démarrer (code $code).',
          );
        }),
      );
      _set(message: 'Serveur en cours de démarrage…');
      _pollHealth();
    } catch (err) {
      _set(
        error:
            'Node.js est introuvable ou n’a pas pu démarrer. Installe Node.js 20+ ($err).',
      );
    }
  }

  void _onOutput(String chunk) {
    for (final raw in chunk.split(RegExp(r'[\r\n]+'))) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      _log.add(line);
      if (_log.length > 40) _log.removeAt(0);
    }
    if (!_disposed) notifyListeners();
  }

  /// Once ready, keeps an eye on the server: it can die later (a previous
  /// window's process shutting down, a crash), and the window must not keep
  /// claiming "serveur prêt" while every request fails.
  void _watchHealth() {
    _watch?.cancel();
    _watch = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (_disposed) {
        timer.cancel();
        return;
      }
      if (await api.health()) {
        _restarts = 0;
        return;
      }
      timer.cancel();
      if (_restarts >= 2) {
        _set(
          ready: false,
          error: 'Le serveur local ne répond plus. Ferme puis relance l’application.',
        );
        return;
      }
      _restarts += 1;
      _set(ready: false, message: 'Serveur arrêté — redémarrage…');
      _process?.kill();
      _process = null;
      await start();
    });
  }

  void _pollHealth() {
    _poll?.cancel();
    final deadline = DateTime.now().add(const Duration(seconds: 120));
    _poll = Timer.periodic(const Duration(milliseconds: 400), (timer) async {
      if (_disposed) {
        timer.cancel();
        return;
      }
      if (await api.health()) {
        timer.cancel();
        _set(ready: true, message: 'Serveur local prêt');
        return;
      }
      if (DateTime.now().isAfter(deadline)) {
        timer.cancel();
        _set(error: 'Le serveur ne répond pas. Voir ci-dessous.');
      }
    });
  }

  /// `<app build dir>` and its parents are searched so the app works both from
  /// `desktop/build/windows/...` and from a folder next to the sources.
  String? _findProjectRoot() {
    final override = Platform.environment['SINGALONG_ROOT'];
    if (override != null && _hasServer(override)) return override;

    final starts = <String>{
      Directory.current.path,
      p.dirname(Platform.resolvedExecutable),
    };
    for (final start in starts) {
      var dir = p.normalize(start);
      for (var i = 0; i < 8; i += 1) {
        if (_hasServer(dir)) return dir;
        final parent = p.dirname(dir);
        if (parent == dir) break;
        dir = parent;
      }
    }
    return null;
  }

  bool _hasServer(String dir) =>
      File(p.join(dir, 'server', 'index.ts')).existsSync() ||
      File(p.join(dir, 'server', 'index.js')).existsSync();

  void _set({bool? ready, String? message, String? error}) {
    if (ready != null) {
      this.ready = ready;
      if (ready) {
        _watchHealth();
      } else {
        _watch?.cancel();
      }
    }
    if (message != null) this.message = message;
    this.error = error;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _watch?.cancel();
    _process?.kill();
    _process = null;
    super.dispose();
  }
}
