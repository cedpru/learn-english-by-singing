class LyricWord {
  const LyricWord({required this.t, required this.text});

  final double t;
  final String text;

  factory LyricWord.fromJson(Map<String, dynamic> json) => LyricWord(
    t: (json['t'] as num?)?.toDouble() ?? 0,
    text: json['text'] as String? ?? '',
  );
}

class LyricLine {
  LyricLine({this.t, required this.text, this.words, this.fr});

  final double? t;
  final String text;
  final List<LyricWord>? words;
  String? fr;

  factory LyricLine.fromJson(Map<String, dynamic> json) => LyricLine(
    t: (json['t'] as num?)?.toDouble(),
    text: json['text'] as String? ?? '',
    words: (json['words'] as List<dynamic>?)
        ?.map((e) => LyricWord.fromJson(e as Map<String, dynamic>))
        .toList(),
    fr: json['fr'] as String?,
  );
}

class SongRef {
  const SongRef({
    required this.artist,
    required this.title,
    this.album,
    this.duration,
    this.cover,
    this.isrc,
    this.offset,
  });

  final String artist;
  final String title;
  final String? album;
  final double? duration;
  final String? cover;
  final String? isrc;

  /// position of the recognised clip inside the song, in seconds
  final double? offset;

  factory SongRef.fromJson(Map<String, dynamic> json) => SongRef(
    artist: json['artist'] as String? ?? 'Artiste inconnu',
    title: json['title'] as String? ?? '',
    album: json['album'] as String?,
    duration: (json['duration'] as num?)?.toDouble(),
    cover: json['cover'] as String?,
    isrc: json['isrc'] as String?,
    offset: (json['offset'] as num?)?.toDouble(),
  );

  Map<String, dynamic> toJson() => {
    'artist': artist,
    'title': title,
    if (album != null) 'album': album,
    if (duration != null) 'duration': duration,
    if (cover != null) 'cover': cover,
    if (isrc != null) 'isrc': isrc,
    if (offset != null) 'offset': offset,
  };
}

class KaraokePayload {
  const KaraokePayload({
    required this.track,
    required this.lines,
    required this.synced,
    required this.wordSync,
    required this.instrumental,
    required this.sourceLang,
    required this.translation,
    required this.provider,
  });

  final SongRef track;
  final List<LyricLine> lines;
  final bool synced;
  final bool wordSync;
  final bool instrumental;
  final String sourceLang;

  /// ok | approximate | already-target | unsupported | empty
  final String translation;
  final String provider;

  factory KaraokePayload.fromJson(Map<String, dynamic> json) => KaraokePayload(
    track: SongRef.fromJson(json['track'] as Map<String, dynamic>? ?? const {}),
    lines: (json['lines'] as List<dynamic>? ?? const [])
        .map((e) => LyricLine.fromJson(e as Map<String, dynamic>))
        .toList(),
    synced: json['synced'] as bool? ?? false,
    wordSync: json['wordSync'] as bool? ?? false,
    instrumental: json['instrumental'] as bool? ?? false,
    sourceLang: json['sourceLang'] as String? ?? 'other',
    translation: json['translation'] as String? ?? 'empty',
    provider: json['provider'] as String? ?? 'aucun',
  );
}

class Recognition {
  const Recognition({required this.status, this.track});

  final String status;
  final SongRef? track;

  factory Recognition.fromJson(Map<String, dynamic> json) => Recognition(
    status: json['status'] as String? ?? 'no_match',
    track: json['track'] == null
        ? null
        : SongRef.fromJson(json['track'] as Map<String, dynamic>),
  );
}

class SearchResult {
  const SearchResult({
    required this.id,
    required this.artist,
    required this.title,
    this.album,
    this.duration,
    required this.synced,
    required this.instrumental,
  });

  final int id;
  final String artist;
  final String title;
  final String? album;
  final double? duration;
  final bool synced;
  final bool instrumental;

  factory SearchResult.fromJson(Map<String, dynamic> json) => SearchResult(
    id: (json['id'] as num?)?.toInt() ?? 0,
    artist: json['artist'] as String? ?? '',
    title: json['title'] as String? ?? '',
    album: json['album'] as String?,
    duration: (json['duration'] as num?)?.toDouble(),
    synced: json['synced'] as bool? ?? false,
    instrumental: json['instrumental'] as bool? ?? false,
  );
}

class Preset {
  const Preset({
    required this.id,
    required this.name,
    required this.url,
    required this.note,
  });

  final String id;
  final String name;
  final String url;
  final String note;

  factory Preset.fromJson(Map<String, dynamic> json) => Preset(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    url: json['url'] as String? ?? '',
    note: json['note'] as String? ?? '',
  );
}

class RadioSession {
  const RadioSession({
    required this.id,
    required this.url,
    required this.name,
    required this.status,
    this.error,
    this.artist,
    this.title,
    this.changedAt,
    required this.connectedAt,
  });

  final String id;
  final String url;
  final String name;

  /// connecting | live | no-metadata | error | stopped
  final String status;
  final String? error;
  final String? artist;
  final String? title;
  final int? changedAt;
  final int connectedAt;

  factory RadioSession.fromJson(Map<String, dynamic> json) => RadioSession(
    id: json['id'] as String? ?? '',
    url: json['url'] as String? ?? '',
    name: json['name'] as String? ?? '',
    status: json['status'] as String? ?? 'connecting',
    error: json['error'] as String?,
    artist: json['artist'] as String?,
    title: json['title'] as String?,
    changedAt: (json['changedAt'] as num?)?.toInt(),
    connectedAt: (json['connectedAt'] as num?)?.toInt() ?? 0,
  );
}

class StreamSync {
  const StreamSync({
    required this.status,
    this.track,
    this.offset,
    required this.capturedAt,
    required this.clipSeconds,
  });

  final String status;
  final SongRef? track;
  final double? offset;
  final int capturedAt;
  final double clipSeconds;

  factory StreamSync.fromJson(Map<String, dynamic> json) => StreamSync(
    status: json['status'] as String? ?? 'no_match',
    track: json['track'] == null
        ? null
        : SongRef.fromJson(json['track'] as Map<String, dynamic>),
    offset: (json['offset'] as num?)?.toDouble(),
    capturedAt: (json['capturedAt'] as num?)?.toInt() ?? 0,
    clipSeconds: (json['clipSeconds'] as num?)?.toDouble() ?? 0,
  );
}

/// Last timed line at or before [position].
int activeLineIndex(List<LyricLine> lines, double position) {
  var index = -1;
  for (var i = 0; i < lines.length; i += 1) {
    final t = lines[i].t;
    if (t != null && t <= position) index = i;
  }
  return index;
}

int activeWordIndex(LyricLine? line, double position) {
  final words = line?.words;
  if (words == null || words.isEmpty) return -1;
  var index = -1;
  for (var i = 0; i < words.length; i += 1) {
    if (words[i].t <= position) index = i;
  }
  return index;
}

String formatTime(num seconds) {
  final s = seconds.isFinite && seconds > 0 ? seconds.floor() : 0;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

const _accents = {'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'œ': 'oe', 'æ': 'ae', 'ø': 'o', 'ß': 'ss'};

String normalize(String value) {
  final buffer = StringBuffer();
  for (final rune in value.toLowerCase().runes) {
    final char = String.fromCharCode(rune);
    buffer.write(_accents[char] ?? char);
  }
  return buffer
      .toString()
      .replaceAll(RegExp('[^a-z0-9]+'), ' ')
      .trim();
}

/// Guards against anchoring the clock on a different song than the announced one.
bool sameSong(SongRef a, SongRef b) {
  final ta = normalize(a.title);
  final tb = normalize(b.title);
  final aa = normalize(a.artist);
  final ab = normalize(b.artist);
  final titleOk = ta.isNotEmpty && tb.isNotEmpty && (ta == tb || ta.contains(tb) || tb.contains(ta));
  final artistOk = aa.isNotEmpty && ab.isNotEmpty && (aa == ab || aa.contains(ab) || ab.contains(aa));
  return titleOk && artistOk;
}

/// Rebuilds an LRC text from the displayed lines, to pre-fill the editor.
String linesToLrc(List<LyricLine> lines) => lines
    .map((line) => line.t == null ? line.text : '${formatLrcStamp(line.t!)}${line.text}')
    .join('\n');

String formatLrcStamp(double seconds) {
  final total = seconds < 0 ? 0.0 : (seconds * 100).round() / 100;
  final min = total ~/ 60;
  final sec = total.floor() % 60;
  final cent = ((total - total.floor()) * 100).round();
  return '[${min.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}.${cent.toString().padLeft(2, '0')}]';
}
