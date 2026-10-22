import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'api.dart';
import 'audio_engine.dart';
import 'models.dart';
import 'store.dart';

enum Mode { mic, radio, search }

class CurrentTrack {
  const CurrentTrack(this.track, this.startAt);

  final SongRef track;
  final double startAt;
}

/// Everything the window shows: the lyric clock, the radio session, the
/// microphone capture and the currently loaded karaoke.
class AppController extends ChangeNotifier {
  AppController({
    required this.api,
    required this.store,
    required this.audio,
    required this.mic,
  }) {
    volume = store.volume;
    audio.bindVolume(volume);
    audio.playing.addListener(_onAudioPlaying);
    unawaited(_loadPresets());
  }

  final Api api;
  final LocalStore store;
  final RadioAudio audio;
  final MicCapture mic;

  Mode mode = Mode.mic;

  CurrentTrack? current;
  KaraokePayload? payload;
  bool loading = false;
  String? error;
  bool autoSynced = false;
  double shift = 0;
  double volume = 0.8;
  bool muted = false;

  /// lyric clock, updated ten times a second while playing
  final ValueNotifier<double> position = ValueNotifier(0);
  final ValueNotifier<bool> clockPlaying = ValueNotifier(false);

  int _requestId = 0;
  int _anchoredId = -1;
  /// last time lyrics were displayed: a click that lands right after a load is
  /// not a request to move the timings
  int _loadedAt = 0;
  int _syncEpoch = 0;
  Timer? _ticker;
  Timer? _syncTimer;
  String _syncedKey = '';
  int? _pausedAt;
  double _anchorPosition = 0;
  int _anchorTime = 0;

  // ---------------------------------------------------------------- presets
  List<Preset> presets = const [];
  RadioSession? session;
  String radioUrl = '';
  String radioName = '';
  bool startingRadio = false;
  String? radioError;
  Timer? _poll;
  String _lastRadioKey = '';

  /// Some stations publish only their own name ("DANCEBOX") instead of the
  /// artist and title. Without those two the lyrics cannot start, so the app
  /// listens to the stream itself and asks Shazam who is playing.
  bool identifying = false;
  int _identifyAt = 0;
  int _identifyTries = 0;
  static const _maxIdentifyTries = 3;
  int _radioLoadFails = 0;

  // -------------------------------------------------------------------- mic
  bool micBusy = false;
  bool micLoop = false;
  String? micStatus;
  String? micError;
  String? testStatus;
  String? testClipPath;
  bool testing = false;

  bool get radioActive => radioUrl.isNotEmpty;
  bool get isRadioLive => session?.status == 'live';

  /// The stream is live but announces no artist: the song is unknown.
  bool get radioStationOnly =>
      session?.status == 'live' &&
      (session?.title ?? '').isNotEmpty &&
      (session?.artist ?? '').isEmpty;

  /// The user has to type the song for the lyrics to appear.
  bool get radioNeedsManual =>
      session != null &&
      (session!.status == 'no-metadata' ||
          session!.status == 'error' ||
          radioStationOnly);

  bool get identifyGaveUp =>
      radioStationOnly && _identifyTries >= _maxIdentifyTries;
  bool get playingAudio => audio.playing.value;

  Future<void> _loadPresets() async {
    try {
      presets = await api.presets();
      notifyListeners();
    } catch (_) {
      presets = const [];
    }
  }

  void setMode(Mode next) {
    if (mode == next) return;
    mode = next;
    notifyListeners();
  }

  /// Switching source leaves the current song: it belongs to the previous one.
  Future<void> goToMode(Mode next) async {
    if (current != null) await back();
    setMode(next);
  }

  // ------------------------------------------------------------------ clock
  double get clockPosition => position.value;

  void _tick() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      final elapsed = (DateTime.now().millisecondsSinceEpoch - _anchorTime) / 1000;
      position.value = _anchorPosition + elapsed;
    });
  }

  void _clockStart(double from) {
    _anchorPosition = math.max(0, from);
    _anchorTime = DateTime.now().millisecondsSinceEpoch;
    position.value = _anchorPosition;
    clockPlaying.value = true;
    _tick();
  }

  void _clockPause() {
    if (!clockPlaying.value) return;
    _anchorPosition = position.value;
    clockPlaying.value = false;
    _ticker?.cancel();
  }

  void _clockResume() {
    if (clockPlaying.value) return;
    _anchorTime = DateTime.now().millisecondsSinceEpoch;
    clockPlaying.value = true;
    _tick();
  }

  void _clockSeek(double value) {
    _anchorPosition = math.max(0, value);
    _anchorTime = DateTime.now().millisecondsSinceEpoch;
    position.value = _anchorPosition;
  }

  void _clockReset() {
    _ticker?.cancel();
    _anchorPosition = 0;
    position.value = 0;
    clockPlaying.value = false;
  }

  void _onAudioPlaying() {
    if (!radioActive) return;
    if (audio.playing.value) {
      _clockResume();
      final pausedAt = _pausedAt;
      _pausedAt = null;
      // after a long pause the stream jumped back to the live edge while the
      // lyric clock stayed put: capture a fresh anchor
      if (pausedAt != null &&
          DateTime.now().millisecondsSinceEpoch - pausedAt > 10000 &&
          current != null) {
        _syncEpoch += 1;
        _scheduleSync(_requestId);
      }
    } else {
      _pausedAt = DateTime.now().millisecondsSinceEpoch;
      _clockPause();
    }
  }

  // ------------------------------------------------------------------ track
  Future<void> load(SongRef track, double startAt) async {
    final id = ++_requestId;
    final origin = DateTime.now();
    current = CurrentTrack(track, startAt);
    payload = null;
    error = null;
    autoSynced = false;
    shift = store.shiftFor(track);
    loading = true;
    _syncTimer?.cancel();
    notifyListeners();

    try {
      final data = await api.karaoke(track, rawLyrics: store.lyricsFor(track));
      if (id != _requestId) return;
      payload = data;
      if (_anchoredId != id) {
        final elapsed = DateTime.now().difference(origin).inMilliseconds / 1000;
        if (!radioActive) {
          _clockStart(startAt + elapsed);
        } else if (audio.playing.value) {
          _clockStart(startAt + elapsed);
        } else {
          _clockSeek(startAt + elapsed);
        }
      }
      _scheduleSync(id);
    } catch (err) {
      if (id != _requestId) return;
      error = err is ApiException ? err.message : err.toString();
    } finally {
      if (id == _requestId) {
        loading = false;
        _loadedAt = DateTime.now().millisecondsSinceEpoch;
        notifyListeners();
      }
    }
  }

  Future<void> retry() async {
    final track = current?.track;
    if (track == null) return;
    await load(track, clockPosition);
  }

  /// Captures a few seconds of the live stream so Shazam can tell us where the
  /// song already is. The station's metadata stays the reference for *which*
  /// song plays: a mismatched capture is ignored instead of replacing it.
  void _scheduleSync(int id) {
    final track = current?.track;
    final activeSession = session;
    if (track == null || activeSession == null) return;
    if (activeSession.status != 'live') return;
    final key = '${activeSession.id}|${track.artist}|${track.title}|$_syncEpoch';
    if (_syncedKey == key) return;
    _syncedKey = key;
    _syncTimer?.cancel();
    final wait = Duration(
      milliseconds: ((audio.bufferedAheadSeconds() + 2) * 1000).round(),
    );
    _syncTimer = Timer(wait, () async {
      try {
        final result = await api.syncRadio(activeSession.id);
        if (id != _requestId) return;
        final heard = result.track;
        if (result.status != 'matched' || heard == null) return;
        if (!sameSong(heard, track)) return;
        final latency = audio.bufferedAheadSeconds();
        final position = math.max(
          0.0,
          (result.offset ?? 0) +
              (DateTime.now().millisecondsSinceEpoch - result.capturedAt) / 1000 -
              latency,
        );
        _anchoredId = id;
        if (audio.playing.value) {
          _clockStart(position);
        } else {
          _clockSeek(position);
        }
        autoSynced = true;
        notifyListeners();
      } catch (_) {
        // the stream or Shazam can fail: the lyrics still show from the start
      }
    });
  }

  Future<void> back() async {
    _requestId += 1;
    _anchoredId = -1;
    _syncTimer?.cancel();
    current = null;
    payload = null;
    error = null;
    loading = false;
    autoSynced = false;
    shift = 0;
    _clockReset();
    await stopRadio();
    notifyListeners();
  }

  void setShiftValue(double value) {
    shift = (value * 10).round() / 10;
    final track = current?.track;
    if (track != null) unawaited(store.setShift(track, shift));
    notifyListeners();
  }

  void bumpShift(double delta) => setShiftValue(shift + delta);

  void tapLine(double lineTime) {
    final age = DateTime.now().millisecondsSinceEpoch - _loadedAt;
    if (loading || age < 800) return;
    setShiftValue(clockPosition - lineTime);
  }

  Future<void> saveLyrics(String? raw) async {
    final track = current?.track;
    if (track == null) return;
    await store.setLyrics(track, raw);
    setShiftValue(0);
    await load(track, clockPosition);
  }

  // ---------------------------------------------------------------- playback
  Future<void> togglePlay() async {
    if (radioActive) {
      await audio.toggle();
      return;
    }
    if (clockPlaying.value) {
      _clockPause();
    } else {
      _clockResume();
    }
    notifyListeners();
  }

  Future<void> setVolume(double value) async {
    volume = value.clamp(0.0, 1.0);
    await audio.setVolume(volume);
    if (muted && volume > 0) {
      muted = false;
      await audio.setMuted(false);
    }
    await store.setVolume(volume);
    notifyListeners();
  }

  Future<void> toggleMute() async {
    muted = !muted;
    await audio.setMuted(muted);
    notifyListeners();
  }

  // ------------------------------------------------------------------- radio
  Future<void> startRadio(String url, String name) async {
    startingRadio = true;
    radioError = null;
    notifyListeners();
    try {
      if (session != null) await api.stopRadio(session!.id);
      final created = await api.startRadio(url, name);
      session = created;
      radioUrl = url;
      radioName = name;
      _lastRadioKey = '';
      _syncedKey = '';
      _identifyTries = 0;
      _identifyAt = 0;
      _radioLoadFails = 0;
      await audio.open(url);
      _startPolling(created.id);
    } catch (err) {
      radioError = err is ApiException ? err.message : err.toString();
    } finally {
      startingRadio = false;
      notifyListeners();
    }
  }

  void _startPolling(String id) {
    _poll?.cancel();
    Future<void> tick() async {
      try {
        final next = await api.pollRadio(id);
        if (session?.id != id) return;
        session = next;
        notifyListeners();
        final artist = next.artist;
        final title = next.title;
        if (artist == null || title == null) {
          if (next.status == 'live' && current == null) {
            unawaited(_identifyStation(id));
          }
          return;
        }
        final key = '$artist|$title';
        if (key == _lastRadioKey) return;
        _lastRadioKey = key;
        _radioLoadFails = 0;
        final elapsed = math.max(
          0.0,
          (DateTime.now().millisecondsSinceEpoch - (next.changedAt ?? 0)) / 1000,
        );
        await load(SongRef(artist: artist, title: title), elapsed);
        // a hiccup on the lyrics side must not silence the whole song
        if (error != null && _radioLoadFails < 2) {
          _radioLoadFails += 1;
          _lastRadioKey = '';
        }
      } catch (err) {
        final message = err is ApiException ? err.message : err.toString();
        if (message.contains('inconnue') || message.contains('404')) {
          session = null;
          radioUrl = '';
          radioName = '';
          _poll?.cancel();
          notifyListeners();
        }
      }
    }

    unawaited(tick());
    _poll = Timer.periodic(const Duration(milliseconds: 2500), (_) => tick());
  }

  /// Station that never says what it plays: capture the live stream and let
  /// Shazam name the song, so the lyrics start on their own.
  Future<void> _identifyStation(String id) async {
    if (identifying || _identifyTries >= _maxIdentifyTries) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _identifyAt < 12000) return;
    _identifyAt = now;
    _identifyTries += 1;
    identifying = true;
    notifyListeners();
    try {
      final result = await api.syncRadio(id);
      if (session?.id != id || current != null) return;
      final heard = result.track;
      if (result.status != 'matched' || heard == null) return;
      final latency = audio.bufferedAheadSeconds();
      final position = math.max(
        0.0,
        (result.offset ?? 0) +
            (DateTime.now().millisecondsSinceEpoch - result.capturedAt) / 1000 -
            latency,
      );
      _lastRadioKey = 'shazam|${heard.artist}|${heard.title}';
      await load(heard, position);
    } catch (_) {
      // no match (or Shazam down): the manual form stays available
    } finally {
      identifying = false;
      notifyListeners();
    }
  }

  Future<void> stopRadio() async {
    _poll?.cancel();
    _poll = null;
    final id = session?.id;
    session = null;
    radioUrl = '';
    radioName = '';
    _lastRadioKey = '';
    _syncedKey = '';
    _identifyTries = 0;
    identifying = false;
    await audio.stop();
    notifyListeners();
    if (id != null) await api.stopRadio(id);
  }

  // --------------------------------------------------------------------- mic
  /// Windows and the `record` plugin report raw PlatformExceptions: turn them
  /// into something a user can act on.
  String describeMicError(Object err) {
    final message = err.toString();
    if (message.contains('No audio recording device')) {
      return 'Aucun micro détecté sur cet appareil. Branche un micro puis réessaie.';
    }
    if (message.contains('MIC_REFUSED') || message.contains('permission')) {
      return 'Accès au micro refusé. Autorise le micro dans Windows (Confidentialité et sécurité › Microphone).';
    }
    return 'Micro indisponible : $message';
  }

  Future<void> listenMic({bool loop = true}) async {
    if (micBusy) return;
    micBusy = true;
    micLoop = loop;
    micError = null;
    micStatus = 'Écoute… reste près de la source sonore.';
    notifyListeners();
    const attempts = 6;
    try {
      for (var i = 0; i < (loop ? attempts : 1); i += 1) {
        if (i > 0) {
          if (!micLoop) break;
          micStatus = 'Écoute ${i + 1}/$attempts…';
          notifyListeners();
          await Future<void>.delayed(const Duration(milliseconds: 600));
          if (!micLoop) break;
        }
        final startedAt = DateTime.now().millisecondsSinceEpoch;
        Uint8List? clip;
        try {
          clip = await mic.record(const Duration(seconds: 8));
        } catch (err) {
          micError = describeMicError(err);
          micStatus = null;
          notifyListeners();
          break;
        }
        if (clip == null || clip.lengthInBytes < 2000) {
          micStatus = "Rien capté. Vérifie que le micro n'est pas coupé.";
          notifyListeners();
          break;
        }
        if (mic.lastLevel < 0.01) {
          micStatus =
              "Le micro n'entend presque rien. Monte le volume de la source, rapproche le micro, ou vérifie le niveau d'entrée dans Windows.";
          notifyListeners();
          break;
        }
        micStatus = 'Identification en cours…';
        notifyListeners();
        final Recognition result;
        try {
          result = await api.recognize(clip);
        } catch (err) {
          micStatus = 'Reconnaissance impossible : $err';
          notifyListeners();
          break;
        }
        if (result.status != 'matched' || result.track == null) {
          micStatus = 'Morceau non reconnu. Monte un peu le volume et réessaie.';
          notifyListeners();
          continue;
        }
        final track = result.track!;
        final startAt =
            (track.offset ?? 0) +
            (DateTime.now().millisecondsSinceEpoch - startedAt) / 1000;
        micStatus = 'Trouvé : ${track.artist} — ${track.title}';
        await load(track, startAt);
        break;
      }
    } finally {
      micBusy = false;
      micLoop = false;
      notifyListeners();
    }
  }

  void stopMicLoop() {
    micLoop = false;
    notifyListeners();
  }

  /// Records three seconds and keeps them for replay: the fastest way to check
  /// that Windows really hands the sound of the room to the app.
  Future<void> testMicrophone() async {
    if (micBusy) return;
    micBusy = true;
    testing = true;
    testStatus = 'Enregistrement 3 s…';
    testClipPath = null;
    notifyListeners();
    try {
      final clip = await mic.record(const Duration(seconds: 3));
      if (clip == null) {
        testStatus = 'Rien enregistré. Vérifie le périphérique d’entrée.';
        return;
      }
      final path =
          '${DateTime.now().microsecondsSinceEpoch}-mic-test.wav';
      final file = await _writeTemp(path, clip);
      testClipPath = file;
      final loudness = mic.lastLevel;
      testStatus = loudness < 0.005
          ? 'Rien capté. Micro coupé, mauvais périphérique, ou niveau d’entrée à zéro.'
          : loudness < 0.02
          ? 'Signal très faible : rapproche le micro ou monte le volume de la source.'
          : 'Du son arrive dans le micro — réécoute pour vérifier que c’est bien la musique.';
    } catch (err) {
      testStatus = describeMicError(err);
    } finally {
      micBusy = false;
      notifyListeners();
    }
  }

  Future<String> _writeTemp(String name, Uint8List bytes) async {
    final dir = Directory.systemTemp.createTempSync('singalong-clip-');
    final file = File('${dir.path}${Platform.pathSeparator}$name');
    await file.writeAsBytes(bytes);
    return file.path;
  }

  void closeMicTest() {
    testing = false;
    testStatus = null;
    testClipPath = null;
    unawaited(audio.stopClip());
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _poll?.cancel();
    _syncTimer?.cancel();
    audio.playing.removeListener(_onAudioPlaying);
    super.dispose();
  }
}
