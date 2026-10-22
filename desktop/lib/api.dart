import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class Api {
  Api({String? base}) : base = base ?? kApiBase;

  final String base;

  Uri _uri(String path) => Uri.parse('$base$path');

  Map<String, dynamic> _decode(http.Response res) {
    dynamic body;
    try {
      body = jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      throw ApiException('réponse illisible (${res.statusCode})');
    }
    if (res.statusCode >= 400) {
      final message = body is Map && body['error'] is String
          ? body['error'] as String
          : 'erreur HTTP ${res.statusCode}';
      throw ApiException(message);
    }
    if (body is! Map<String, dynamic>) throw ApiException('réponse inattendue');
    return body;
  }

  Future<bool> health() async {
    try {
      final res = await http
          .get(_uri('/api/health'))
          .timeout(const Duration(seconds: 2));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<List<Preset>> presets() async {
    final res = await http.get(_uri('/api/presets'));
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (body is! List) throw ApiException('presets indisponibles');
    return body
        .map((e) => Preset.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Recognition> recognize(Uint8List clip) async {
    final res = await http
        .post(
          _uri('/api/recognize'),
          headers: {'Content-Type': 'application/octet-stream'},
          body: clip,
        )
        .timeout(const Duration(seconds: 90));
    final body = _decode(res);
    if (body['error'] is String) throw ApiException(body['error'] as String);
    return Recognition.fromJson(body);
  }

  Future<KaraokePayload> karaoke(SongRef track, {String? rawLyrics}) async {
    final res = await http.post(
      _uri('/api/karaoke'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'track': track.toJson(),
        if (rawLyrics != null && rawLyrics.trim().isNotEmpty) 'rawLyrics': rawLyrics,
      }),
    );
    return KaraokePayload.fromJson(_decode(res));
  }

  Future<List<SearchResult>> search(String query) async {
    final res = await http.get(
      _uri('/api/search?q=${Uri.encodeQueryComponent(query)}'),
    );
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (body is! List) throw ApiException('recherche indisponible');
    return body
        .map((e) => SearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<RadioSession> startRadio(String url, String name) async {
    final res = await http.post(
      _uri('/api/radio'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'url': url, 'name': name}),
    );
    return RadioSession.fromJson(_decode(res));
  }

  Future<RadioSession> pollRadio(String id) async {
    final res = await http.get(_uri('/api/radio/$id'));
    return RadioSession.fromJson(_decode(res));
  }

  Future<StreamSync> syncRadio(String id) async {
    final res = await http
        .post(_uri('/api/radio/$id/sync'))
        .timeout(const Duration(seconds: 60));
    return StreamSync.fromJson(_decode(res));
  }

  Future<void> stopRadio(String id) async {
    try {
      await http.delete(_uri('/api/radio/$id'));
    } catch (_) {
      // the stream is already gone server-side
    }
  }
}
