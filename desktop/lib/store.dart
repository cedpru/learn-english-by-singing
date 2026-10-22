import 'dart:convert';
import 'dart:io';

import 'models.dart';

/// Small JSON file in the user profile: volume, per-track timing corrections
/// and lyrics typed by hand. Kept local, like the browser's localStorage was.
class LocalStore {
  LocalStore._(this._file, this._data);

  final File _file;
  final Map<String, dynamic> _data;

  static Future<LocalStore> open() async {
    final appData =
        Platform.environment['APPDATA'] ??
        Platform.environment['HOME'] ??
        Directory.current.path;
    final dir = Directory('$appData${Platform.pathSeparator}SingAlong');
    final file = File('${dir.path}${Platform.pathSeparator}settings.json');
    Map<String, dynamic> data = {};
    try {
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString());
        if (decoded is Map<String, dynamic>) data = decoded;
      }
    } catch (_) {
      data = {};
    }
    return LocalStore._(file, data);
  }

  Map<String, dynamic> _map(String key) {
    final value = _data[key];
    if (value is Map<String, dynamic>) return value;
    final fresh = <String, dynamic>{};
    _data[key] = fresh;
    return fresh;
  }

  Future<void> _persist() async {
    try {
      await _file.parent.create(recursive: true);
      await _file.writeAsString(jsonEncode(_data));
    } catch (_) {
      // best effort: the session still works without persistence
    }
  }

  double get volume {
    final value = _data['volume'];
    return value is num ? value.toDouble().clamp(0.0, 1.0) : 0.8;
  }

  Future<void> setVolume(double value) {
    _data['volume'] = value.clamp(0.0, 1.0);
    return _persist();
  }

  String _trackKey(SongRef track) =>
      '${normalize(track.artist)}|${normalize(track.title)}';

  double shiftFor(SongRef track) {
    final value = _map('shifts')[_trackKey(track)];
    return value is num ? value.toDouble() : 0;
  }

  Future<void> setShift(SongRef track, double shift) {
    _map('shifts')[_trackKey(track)] = shift;
    return _persist();
  }

  String? lyricsFor(SongRef track) {
    final value = _map('lyrics')[_trackKey(track)];
    return value is String && value.trim().isNotEmpty ? value : null;
  }

  Future<void> setLyrics(SongRef track, String? raw) {
    if (raw == null || raw.trim().isEmpty) {
      _map('lyrics').remove(_trackKey(track));
    } else {
      _map('lyrics')[_trackKey(track)] = raw;
    }
    return _persist();
  }
}
