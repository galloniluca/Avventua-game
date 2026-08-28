import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'config.dart';

/// Errore di rete o di backend, già in forma mostrabile all'utente.
class ApiException implements Exception {
  ApiException(this.messaggio, {this.stato});

  final String messaggio;
  final int? stato;

  bool get quotaEsaurita => stato == 429;

  @override
  String toString() => messaggio;
}

/// Unico punto di contatto con il backend.
class ApiClient {
  ApiClient({required this.utenteId, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? Config.baseUrl;

  final String utenteId;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        'x-utente-id': utenteId,
      };

  Future<Map<String, dynamic>> _invia(
    String metodo,
    String percorso, {
    Object? corpo,
    Duration? timeout,
  }) async {
    final uri = Uri.parse('$_baseUrl$percorso');
    try {
      final richiesta = http.Request(metodo, uri)
        ..headers.addAll(_headers)
        ..body = corpo == null ? '' : jsonEncode(corpo);

      final streamed = await _client
          .send(richiesta)
          .timeout(timeout ?? Config.timeoutStandard);
      final risposta = await http.Response.fromStream(streamed);

      final decodificato = risposta.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(utf8.decode(risposta.bodyBytes));

      if (decodificato is! Map<String, dynamic>) {
        throw ApiException('Risposta inattesa dal server', stato: risposta.statusCode);
      }

      if (risposta.statusCode >= 400) {
        throw ApiException(
          decodificato['errore'] as String? ?? 'Errore ${risposta.statusCode}',
          stato: risposta.statusCode,
        );
      }
      return decodificato;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException('Nessuna connessione al server di gioco');
    } on FormatException {
      throw ApiException('Il server ha risposto in un formato non valido');
    } catch (e) {
      throw ApiException('Comunicazione con il server fallita: $e');
    }
  }

  // --- Ambientazioni ---------------------------------------------------------

  Future<List<Setting>> settings() async {
    final j = await _invia('GET', '/settings');
    return (j['settings'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Setting.fromJson)
        .toList();
  }

  // --- Personaggi ------------------------------------------------------------

  Future<List<Personaggio>> personaggi() async {
    final j = await _invia('GET', '/characters');
    return (j['personaggi'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Personaggio.fromJson)
        .toList();
  }

  Future<Personaggio> creaPersonaggio({
    required String settingId,
    required String nome,
    required String razza,
    required String classe,
    required Map<String, int> statistiche,
    String biografia = '',
  }) async {
    final j = await _invia('POST', '/characters', corpo: {
      'setting_id': settingId,
      'nome': nome,
      'razza': razza,
      'classe': classe,
      'statistiche': statistiche,
      'biografia': biografia,
    });
    return Personaggio.fromJson(j['personaggio'] as Map<String, dynamic>);
  }

  /// Anche i dadi della creazione nascono nel backend.
  Future<Map<String, int>> tiraStatistiche() async {
    final j = await _invia('POST', '/characters/roll-stats');
    final grezze = j['statistiche'] as Map<String, dynamic>? ?? {};
    return {
      for (final c in caratteristiche) c: (grezze[c] as num?)?.round() ?? 10,
    };
  }

  Future<List<Oggetto>> inventario(String characterId) async {
    final j = await _invia('GET', '/characters/$characterId/inventory');
    return (j['inventario'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Oggetto.fromJson)
        .toList();
  }

  // --- Campagne --------------------------------------------------------------

  Future<List<Campagna>> campagne() async {
    final j = await _invia('GET', '/campaigns');
    return (j['campagne'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Campagna.fromJson)
        .toList();
  }

  Future<Campagna> creaCampagna({
    required String characterId,
    required String nome,
    required String lunghezzaTarget,
    required String complessita,
    String incipit = '',
  }) async {
    final j = await _invia('POST', '/campaigns', corpo: {
      'character_id': characterId,
      'nome': nome,
      'lunghezza_target': lunghezzaTarget,
      'complessita': complessita,
      'incipit': incipit,
    });
    return Campagna.fromJson(j['campagna'] as Map<String, dynamic>);
  }

  Future<StatoPartita> statoPartita(String campaignId) async {
    final j = await _invia('GET', '/campaigns/$campaignId');
    return StatoPartita.fromJson(j);
  }

  // --- Turni di gioco ---------------------------------------------------------

  Future<Turno> avvia(String campaignId) async {
    final j = await _invia(
      'POST',
      '/campaigns/$campaignId/start',
      timeout: Config.timeoutTurno,
    );
    return Turno.fromJson(j['turno'] as Map<String, dynamic>);
  }

  Future<Turno> agisci(String campaignId, String azione) async {
    final j = await _invia(
      'POST',
      '/campaigns/$campaignId/action',
      corpo: {'azione': azione},
      timeout: Config.timeoutTurno,
    );
    return Turno.fromJson(j['turno'] as Map<String, dynamic>);
  }

  Future<Turno> tira(String campaignId, RichiestaTiro richiesta) async {
    final j = await _invia(
      'POST',
      '/campaigns/$campaignId/roll',
      corpo: richiesta.toRequest(),
      timeout: Config.timeoutTurno,
    );
    return Turno.fromJson(j['turno'] as Map<String, dynamic>);
  }

  Future<void> chiudiSessione(String campaignId) => _invia(
        'POST',
        '/campaigns/$campaignId/end-session',
        timeout: Config.timeoutTurno,
      );

  Future<String> racconto(String campaignId) async {
    final j = await _invia(
      'POST',
      '/campaigns/$campaignId/novel',
      timeout: Config.timeoutTurno,
    );
    return j['racconto'] as String? ?? '';
  }

  void dispose() => _client.close();
}
