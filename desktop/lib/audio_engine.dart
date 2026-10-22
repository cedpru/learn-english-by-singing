import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:media_kit/media_kit.dart';
import 'package:record/record.dart';

/// Plays the radio stream (mp3 / aac over HTTP) with the bundled mpv engine.
///
/// The app owns the audio for radio mode, so pausing freezes both the sound and
/// the lyric clock — exactly like the web player did.
class RadioAudio {
  RadioAudio() {
    _bind(_player.stream.playing, (value) => playing.value = value);
    _bind(_player.stream.buffer, (value) => buffered.value = value);
    _bind(_player.stream.position, (value) => streamPosition.value = value);
    _bind(_player.stream.completed, (value) {
      if (value) playing.value = false;
    });
  }

  final Player _player = Player();
  final ValueNotifier<bool> playing = ValueNotifier(false);
  final ValueNotifier<Duration> buffered = ValueNotifier(Duration.zero);
  final ValueNotifier<Duration> streamPosition = ValueNotifier(Duration.zero);

  final Player _clipPlayer = Player();
  String? url;
  double _volume = 0.8;
  bool _muted = false;

  void _bind<T>(Stream<T> stream, void Function(T) onData) {
    stream.listen(onData, onError: (_) {});
  }

  Future<void> open(String nextUrl) async {
    url = nextUrl;
    await _player.open(Media(nextUrl), play: true);
    await _player.setVolume(_muted ? 0 : _volume * 100);
  }

  Future<void> toggle() async {
    if (_player.state.playing) {
      await _player.pause();
    } else {
      await _player.play();
    }
  }

  Future<void> setVolume(double value) async {
    _volume = value.clamp(0.0, 1.0);
    if (!_muted) await _player.setVolume(_volume * 100);
  }

  Future<void> setMuted(bool value) async {
    _muted = value;
    await _player.setVolume(_muted ? 0 : _volume * 100);
  }

  void bindVolume(double value) {
    _volume = value.clamp(0.0, 1.0);
    unawaited(_player.setVolume(_muted ? 0 : _volume * 100));
  }

  /// Seconds already buffered ahead of the live edge: the listener hears the
  /// stream this much later than the server receives it.
  double bufferedAheadSeconds() {
    final ahead = buffered.value - streamPosition.value;
    final seconds = ahead.inMilliseconds / 1000;
    if (!seconds.isFinite || seconds <= 0) return 0;
    return math.min(12, seconds);
  }

  Future<void> stop() async {
    url = null;
    await _player.stop();
  }

  Future<void> playClip(String path) => _clipPlayer.open(Media(path), play: true);

  Future<void> stopClip() => _clipPlayer.pause();

  Future<void> dispose() async {
    await _player.dispose();
    await _clipPlayer.dispose();
  }
}

/// Records short clips from the default microphone and reports their level.
class MicCapture {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Amplitude>? _levels;

  final ValueNotifier<double> level = ValueNotifier(0);
  double lastLevel = 0;
  bool recording = false;
  String deviceLabel = '';

  /// Maps dBFS to 0…1 for the level meter.
  static double normalizeLevel(double db) {
    if (!db.isFinite || db <= -60) return 0;
    return ((-db) / 55).clamp(0.0, 1.0);
  }

  Future<void> _watchLevels() async {
    _levels ??= _recorder
        .onAmplitudeChanged(const Duration(milliseconds: 100))
        .listen((amplitude) {
          final value = normalizeLevel(amplitude.current);
          level.value = value;
          if (value > lastLevel) lastLevel = value;
        });
    try {
      final device = await _recorder.listInputDevices();
      if (device.isNotEmpty) deviceLabel = device.first.label;
    } catch (_) {
      // device names are a nicety, recording works without them
    }
  }

  /// Records [duration] seconds and returns the raw WAV bytes (null on failure).
  Future<Uint8List?> record(Duration duration) async {
    if (!await _recorder.hasPermission()) throw StateError('MIC_REFUSED');
    await _watchLevels();
    lastLevel = 0;
    level.value = 0;
    final path =
        '${Directory.systemTemp.path}${Platform.pathSeparator}singalong-${DateTime.now().microsecondsSinceEpoch}.wav';
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.wav,
        sampleRate: 44100,
        numChannels: 1,
      ),
      path: path,
    );
    recording = true;
    await Future<void>.delayed(duration);
    recording = false;
    final out = await _recorder.stop();
    level.value = 0;
    if (out == null) return null;
    final file = File(out);
    if (!await file.exists()) return null;
    final bytes = await file.readAsBytes();
    try {
      await file.delete();
    } catch (_) {
      // temp file, cleaned by the OS anyway
    }
    return bytes;
  }

  Future<void> dispose() async {
    await _levels?.cancel();
    await _recorder.dispose();
  }
}
