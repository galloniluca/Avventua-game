import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import 'providers.dart';

/// Stato della schermata di gioco.
class StatoGioco {
  const StatoGioco({
    required this.campagna,
    required this.personaggio,
    required this.eventi,
    this.tiroInSospeso,
    this.ultimoTiro,
    this.ultimiEffetti,
    this.dmStaScrivendo = false,
    this.erroreTurno,
  });

  final Campagna campagna;
  final Personaggio personaggio;
  final List<EventoSessione> eventi;

  /// Tiro chiesto dal DM e non ancora eseguito: blocca l'input libero.
  final RichiestaTiro? tiroInSospeso;
  final RisultatoTiro? ultimoTiro;
  final EffettiTurno? ultimiEffetti;

  /// True mentre si aspetta il modello: la chiamata può durare parecchi secondi.
  final bool dmStaScrivendo;

  /// Errore dell'ultimo turno: mostrato senza distruggere la partita in corso.
  final String? erroreTurno;

  bool get puoAgire =>
      !dmStaScrivendo && tiroInSospeso == null && !campagna.conclusa;

  bool get partitaIniziata => eventi.isNotEmpty;

  StatoGioco copyWith({
    Campagna? campagna,
    Personaggio? personaggio,
    List<EventoSessione>? eventi,
    RichiestaTiro? tiroInSospeso,
    bool azzeraTiroInSospeso = false,
    RisultatoTiro? ultimoTiro,
    EffettiTurno? ultimiEffetti,
    bool? dmStaScrivendo,
    String? erroreTurno,
    bool azzeraErrore = false,
  }) {
    return StatoGioco(
      campagna: campagna ?? this.campagna,
      personaggio: personaggio ?? this.personaggio,
      eventi: eventi ?? this.eventi,
      tiroInSospeso: azzeraTiroInSospeso ? null : (tiroInSospeso ?? this.tiroInSospeso),
      ultimoTiro: ultimoTiro ?? this.ultimoTiro,
      ultimiEffetti: ultimiEffetti ?? this.ultimiEffetti,
      dmStaScrivendo: dmStaScrivendo ?? this.dmStaScrivendo,
      erroreTurno: azzeraErrore ? null : (erroreTurno ?? this.erroreTurno),
    );
  }
}

/// Orchestratore della partita: carica lo stato e applica i turni.
class PartitaController extends FamilyAsyncNotifier<StatoGioco, String> {
  ApiClient get _api => ref.read(apiProvider);
  String get _campaignId => arg;

  @override
  Future<StatoGioco> build(String arg) async {
    final stato = await _api.statoPartita(arg);
    return StatoGioco(
      campagna: stato.campagna,
      personaggio: stato.personaggio,
      eventi: stato.eventi,
      tiroInSospeso: _tiroPendente(stato.eventi),
    );
  }

  /// Se l'ultimo evento è una richiesta di tiro mai soddisfatta, va ripristinata:
  /// l'app può essere stata chiusa proprio lì in mezzo.
  static RichiestaTiro? _tiroPendente(List<EventoSessione> eventi) {
    for (final e in eventi.reversed) {
      if (e.tipo == TipoEvento.tiro) return null;
      if (e.tipo == TipoEvento.richiestaTiro) return RichiestaTiro.fromJson(e.dati);
    }
    return null;
  }

  StatoGioco? get _corrente => state.valueOrNull;

  /// Esegue un turno gestendo attesa, errori e aggiornamento dello stato in un
  /// solo posto: le tre azioni di gioco differiscono solo per la chiamata.
  Future<void> _turno(Future<Turno> Function() chiamata) async {
    final attuale = _corrente;
    if (attuale == null) return;

    state = AsyncData(
      attuale.copyWith(dmStaScrivendo: true, azzeraErrore: true),
    );

    try {
      final turno = await chiamata();
      final aggiornato = _corrente ?? attuale;
      state = AsyncData(
        aggiornato.copyWith(
          eventi: [...aggiornato.eventi, ...turno.eventi],
          personaggio: turno.personaggio,
          tiroInSospeso: turno.richiestaTiro,
          azzeraTiroInSospeso: turno.richiestaTiro == null,
          ultimoTiro: turno.tiro,
          ultimiEffetti: turno.effetti,
          dmStaScrivendo: false,
          campagna: turno.campagnaConclusa
              ? Campagna(
                  id: aggiornato.campagna.id,
                  settingId: aggiornato.campagna.settingId,
                  nome: aggiornato.campagna.nome,
                  lunghezzaTarget: aggiornato.campagna.lunghezzaTarget,
                  complessita: aggiornato.campagna.complessita,
                  stato: 'conclusa',
                  incipit: aggiornato.campagna.incipit,
                  characterId: aggiornato.campagna.characterId,
                )
              : null,
        ),
      );
    } on ApiException catch (e) {
      final aggiornato = _corrente ?? attuale;
      state = AsyncData(
        aggiornato.copyWith(
          dmStaScrivendo: false,
          erroreTurno: e.quotaEsaurita
              ? 'Il Dungeon Master ha bisogno di una pausa: quota giornaliera esaurita. Riprova più tardi.'
              : e.messaggio,
        ),
      );
    }
  }

  Future<void> avvia() => _turno(() => _api.avvia(_campaignId));

  Future<void> agisci(String azione) {
    final testo = azione.trim();
    if (testo.isEmpty) return Future.value();
    return _turno(() => _api.agisci(_campaignId, testo));
  }

  Future<void> tira() {
    final richiesta = _corrente?.tiroInSospeso;
    if (richiesta == null) return Future.value();
    return _turno(() => _api.tira(_campaignId, richiesta));
  }

  Future<void> chiudiSessione() async {
    final attuale = _corrente;
    if (attuale == null) return;
    state = AsyncData(attuale.copyWith(dmStaScrivendo: true, azzeraErrore: true));
    try {
      await _api.chiudiSessione(_campaignId);
      ref.invalidateSelf();
    } on ApiException catch (e) {
      state = AsyncData(
        attuale.copyWith(dmStaScrivendo: false, erroreTurno: e.messaggio),
      );
    }
  }

  void ignoraErrore() {
    final attuale = _corrente;
    if (attuale != null) state = AsyncData(attuale.copyWith(azzeraErrore: true));
  }
}

final partitaProvider =
    AsyncNotifierProvider.family<PartitaController, StatoGioco, String>(
  PartitaController.new,
);
