import 'dart:convert';

import '../domain/chat_stream_event.dart';

/// Décode le flux NDJSON du chat : une ligne JSON par événement. Les morceaux
/// d'octets peuvent couper une ligne (ou un caractère) en deux. Les lignes
/// invalides et les types inconnus ou sans usage mobile (`speech`, `timing`,
/// `learned`) sont ignorés, comme le fait le décodeur du site
/// (`src/lib/chat/stream-protocol.ts`).
Stream<ChatStreamEvent> decodeNdjson(Stream<List<int>> bytes) async* {
  final lines = utf8.decoder.bind(bytes).transform(const LineSplitter());
  await for (final line in lines) {
    final event = parseChatEvent(line);
    if (event != null) yield event;
  }
}

ChatStreamEvent? parseChatEvent(String line) {
  final trimmed = line.trim();
  if (trimmed.isEmpty) return null;
  final Object? value;
  try {
    value = jsonDecode(trimmed);
  } on FormatException {
    return null;
  }
  if (value is! Map) return null;
  final text = value['text'];
  switch (value['type']) {
    case 'meta':
      final id = value['conversationId'];
      return id is String && id.isNotEmpty ? MetaEvent(id) : null;
    case 'delta':
      return text is String ? DeltaEvent(text) : null;
    case 'replace':
      return text is String ? ReplaceEvent(text) : null;
    case 'done':
      return DoneEvent(switch (value['finishReason']) {
        'stop' => FinishReason.stop,
        'length' => FinishReason.length,
        'refusal' => FinishReason.refusal,
        _ => FinishReason.other,
      });
    case 'error':
      final code = value['code'];
      final message = value['message'];
      return ErrorEvent(
        code: code is String ? code : 'internal',
        message: message is String ? message : '',
      );
  }
  return null;
}
