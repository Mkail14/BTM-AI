import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/features/chat/data/ndjson_decoder.dart';
import 'package:tamilya_mobile/features/chat/domain/chat_stream_event.dart';

Future<List<ChatStreamEvent>> _decode(List<List<int>> chunks) =>
    decodeNdjson(Stream.fromIterable(chunks)).toList();

void main() {
  const lines =
      '{"type":"meta","conversationId":"c-1"}\n'
      '{"type":"delta","text":"Salama é"}\n'
      '{"type":"replace","text":"Bonjour"}\n'
      '{"type":"speech","text":"ignoré"}\n'
      'pas du json\n'
      '{"type":"inconnu"}\n'
      '{"type":"done","finishReason":"length"}\n'
      '{"type":"error","code":"rate_limited","message":"Stop"}\n';

  void check(List<ChatStreamEvent> e) {
    expect(e, hasLength(5));
    expect((e[0] as MetaEvent).conversationId, 'c-1');
    expect((e[1] as DeltaEvent).text, 'Salama é');
    expect((e[2] as ReplaceEvent).text, 'Bonjour');
    expect((e[3] as DoneEvent).finishReason, FinishReason.length);
    expect((e[4] as ErrorEvent).code, 'rate_limited');
    expect((e[4] as ErrorEvent).message, 'Stop');
  }

  test('un seul morceau', () async {
    check(await _decode([utf8.encode(lines)]));
  });

  test('morceaux coupant lignes et caractères multi-octets', () async {
    final bytes = utf8.encode(lines);
    check(
      await _decode([
        for (final b in bytes) [b],
      ]),
    );
  });

  test('dernière ligne sans saut de ligne final', () async {
    final e = await _decode([utf8.encode('{"type":"delta","text":"a"}')]);
    expect((e.single as DeltaEvent).text, 'a');
  });
}
