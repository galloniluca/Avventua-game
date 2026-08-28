/// Modelli di dominio lato app. Rispecchiano il JSON del backend; il parsing è
/// scritto a mano per non trascinarsi dietro build_runner e codegen.
library;

int _int(Object? v, [int fallback = 0]) => switch (v) {
      final int i => i,
      final num n => n.round(),
      final String s => int.tryParse(s) ?? fallback,
      _ => fallback,
    };

double _double(Object? v, [double fallback = 0]) => switch (v) {
      final num n => n.toDouble(),
      _ => fallback,
    };

String _str(Object? v, [String fallback = '']) => v is String ? v : fallback;

bool _bool(Object? v, [bool fallback = false]) => v is bool ? v : fallback;

Map<String, dynamic> _map(Object? v) =>
    v is Map<String, dynamic> ? v : const <String, dynamic>{};

List<Map<String, dynamic>> _listOfMaps(Object? v) => v is List
    ? v.whereType<Map<String, dynamic>>().toList(growable: false)
    : const <Map<String, dynamic>>[];

/// Ambientazione.
class Setting {
  const Setting({
    required this.id,
    required this.nome,
    required this.descrizione,
    required this.ruleset,
    required this.tonoNarrativo,
  });

  factory Setting.fromJson(Map<String, dynamic> j) => Setting(
        id: _str(j['id']),
        nome: _str(j['nome']),
        descrizione: _str(j['descrizione']),
        ruleset: _str(j['ruleset']),
        tonoNarrativo: _str(j['tono_narrativo']),
      );

  final String id;
  final String nome;
  final String descrizione;
  final String ruleset;
  final String tonoNarrativo;
}

const List<String> caratteristiche = [
  'forza',
  'destrezza',
  'costituzione',
  'intelligenza',
  'saggezza',
  'carisma',
];

/// Abbreviazione a tre lettere per le griglie strette della scheda.
String abbrevia(String caratteristica) =>
    caratteristica.substring(0, 3).toUpperCase();

int modificatore(int valore) => ((valore - 10) / 2).floor();

String modificatoreFormattato(int valore) {
  final m = modificatore(valore);
  return m >= 0 ? '+$m' : '$m';
}

class StatoPersonaggio {
  const StatoPersonaggio({
    required this.pf,
    required this.pfMax,
    required this.condizioni,
  });

  factory StatoPersonaggio.fromJson(Map<String, dynamic> j) => StatoPersonaggio(
        pf: _int(j['pf']),
        pfMax: _int(j['pfMax'], 1),
        condizioni: (j['condizioni'] as List?)?.map(_str).toList() ?? const [],
      );

  final int pf;
  final int pfMax;
  final List<String> condizioni;

  double get frazionePf => pfMax <= 0 ? 0 : (pf / pfMax).clamp(0, 1).toDouble();
  bool get svenuto => pf <= 0;
}

class Personaggio {
  const Personaggio({
    required this.id,
    required this.settingId,
    required this.nome,
    required this.razza,
    required this.classe,
    required this.livello,
    required this.xp,
    required this.statistiche,
    required this.stato,
    required this.biografia,
    required this.xpProssimoLivello,
    required this.progressoLivello,
  });

  factory Personaggio.fromJson(Map<String, dynamic> j) => Personaggio(
        id: _str(j['id']),
        settingId: _str(j['setting_id']),
        nome: _str(j['nome']),
        razza: _str(j['razza']),
        classe: _str(j['classe']),
        livello: _int(j['livello'], 1),
        xp: _int(j['xp']),
        statistiche: {
          for (final c in caratteristiche) c: _int(_map(j['statistiche'])[c], 10),
        },
        stato: StatoPersonaggio.fromJson(_map(j['stato'])),
        biografia: _str(j['biografia']),
        xpProssimoLivello:
            j['xp_prossimo_livello'] == null ? null : _int(j['xp_prossimo_livello']),
        progressoLivello: _double(j['progresso_livello']),
      );

  final String id;
  final String settingId;
  final String nome;
  final String razza;
  final String classe;
  final int livello;
  final int xp;
  final Map<String, int> statistiche;
  final StatoPersonaggio stato;
  final String biografia;
  final int? xpProssimoLivello;
  final double progressoLivello;

  String get descrizioneBreve {
    final parti = [razza, classe].where((s) => s.isNotEmpty);
    return parti.isEmpty ? 'Livello $livello' : '${parti.join(' ')} · livello $livello';
  }
}

class Campagna {
  const Campagna({
    required this.id,
    required this.settingId,
    required this.nome,
    required this.lunghezzaTarget,
    required this.complessita,
    required this.stato,
    required this.incipit,
    this.characterId,
  });

  factory Campagna.fromJson(Map<String, dynamic> j) => Campagna(
        id: _str(j['id']),
        settingId: _str(j['setting_id']),
        nome: _str(j['nome']),
        lunghezzaTarget: _str(j['lunghezza_target'], 'media'),
        complessita: _str(j['complessita'], 'media'),
        stato: _str(j['stato'], 'attiva'),
        incipit: _str(j['incipit']),
        characterId: j['character_id'] == null ? null : _str(j['character_id']),
      );

  final String id;
  final String settingId;
  final String nome;
  final String lunghezzaTarget;
  final String complessita;
  final String stato;
  final String incipit;
  final String? characterId;

  bool get conclusa => stato == 'conclusa';
}

enum TipoEvento { narrazione, azione, richiestaTiro, tiro, sistema }

TipoEvento _tipoEvento(String raw) => switch (raw) {
      'narrazione' => TipoEvento.narrazione,
      'azione' => TipoEvento.azione,
      'richiesta_tiro' => TipoEvento.richiestaTiro,
      'tiro' => TipoEvento.tiro,
      _ => TipoEvento.sistema,
    };

class EventoSessione {
  const EventoSessione({
    required this.id,
    required this.ordine,
    required this.tipo,
    required this.attore,
    required this.contenuto,
    required this.dati,
  });

  factory EventoSessione.fromJson(Map<String, dynamic> j) => EventoSessione(
        id: _str(j['id']),
        ordine: _int(j['ordine']),
        tipo: _tipoEvento(_str(j['tipo'])),
        attore: _str(j['attore']),
        contenuto: _str(j['contenuto']),
        dati: _map(j['dati']),
      );

  final String id;
  final int ordine;
  final TipoEvento tipo;
  final String attore;
  final String contenuto;
  final Map<String, dynamic> dati;

  bool get daDm => attore == 'dm';
}

/// Richiesta di tiro emessa dal DM, con il modificatore già calcolato dal
/// backend a partire dalla scheda: l'app non fa aritmetica di regole.
class RichiestaTiro {
  const RichiestaTiro({
    required this.notazione,
    required this.caratteristica,
    required this.competenza,
    required this.modificatore,
    required this.cd,
    required this.vantaggio,
    required this.motivo,
  });

  factory RichiestaTiro.fromJson(Map<String, dynamic> j) => RichiestaTiro(
        notazione: _str(j['notazione'], '1d20'),
        caratteristica: _str(j['caratteristica'], 'nessuna'),
        competenza: _bool(j['competenza']),
        modificatore: _int(j['modificatore']),
        cd: j['cd'] == null ? null : _int(j['cd']),
        vantaggio: _str(j['vantaggio'], 'nessuno'),
        motivo: _str(j['motivo']),
      );

  final String notazione;
  final String caratteristica;
  final bool competenza;
  final int modificatore;
  final int? cd;
  final String vantaggio;
  final String motivo;

  String get etichetta {
    final segno = modificatore >= 0 ? '+' : '';
    final mod = modificatore == 0 ? '' : '$segno$modificatore';
    return '$notazione$mod';
  }

  Map<String, dynamic> toRequest() => {
        'notazione': notazione,
        'caratteristica': caratteristica,
        'competenza': competenza,
        if (cd != null) 'cd': cd,
        'vantaggio': vantaggio,
        'motivo': motivo,
      };
}

class RisultatoTiro {
  const RisultatoTiro({
    required this.notazione,
    required this.tirati,
    required this.scartati,
    required this.modificatore,
    required this.totale,
    required this.critico,
    required this.fallimentoCritico,
    required this.cd,
    required this.successo,
  });

  factory RisultatoTiro.fromJson(Map<String, dynamic> j) => RisultatoTiro(
        notazione: _str(j['notazione']),
        tirati: (j['tirati'] as List?)?.map(_int).toList() ?? const [],
        scartati: (j['scartati'] as List?)?.map(_int).toList() ?? const [],
        modificatore: _int(j['modificatore']),
        totale: _int(j['totale']),
        critico: _bool(j['critico']),
        fallimentoCritico: _bool(j['fallimentoCritico']),
        cd: j['cd'] == null ? null : _int(j['cd']),
        successo: j['successo'] is bool ? j['successo'] as bool : null,
      );

  final String notazione;
  final List<int> tirati;
  final List<int> scartati;
  final int modificatore;
  final int totale;
  final bool critico;
  final bool fallimentoCritico;
  final int? cd;
  final bool? successo;
}

class EffettiTurno {
  const EffettiTurno({
    required this.xpGuadagnati,
    required this.saliDiLivello,
    required this.livello,
    required this.danni,
    required this.cure,
    required this.pf,
    required this.pfMax,
    required this.svenuto,
  });

  factory EffettiTurno.fromJson(Map<String, dynamic> j) => EffettiTurno(
        xpGuadagnati: _int(j['xpGuadagnati']),
        saliDiLivello: _bool(j['saliDiLivello']),
        livello: _int(j['livello'], 1),
        danni: _int(j['danni']),
        cure: _int(j['cure']),
        pf: _int(j['pf']),
        pfMax: _int(j['pfMax'], 1),
        svenuto: _bool(j['svenuto']),
      );

  final int xpGuadagnati;
  final bool saliDiLivello;
  final int livello;
  final int danni;
  final int cure;
  final int pf;
  final int pfMax;
  final bool svenuto;

  bool get haQualcosaDaMostrare =>
      xpGuadagnati > 0 || danni > 0 || cure > 0 || saliDiLivello;
}

class Turno {
  const Turno({
    required this.eventi,
    required this.narrazione,
    required this.richiestaTiro,
    required this.personaggio,
    required this.effetti,
    required this.campagnaConclusa,
    required this.fineSessioneSuggerita,
    required this.tiro,
  });

  factory Turno.fromJson(Map<String, dynamic> j) => Turno(
        eventi: _listOfMaps(j['eventi']).map(EventoSessione.fromJson).toList(),
        narrazione: _str(j['narrazione']),
        richiestaTiro: j['richiestaTiro'] == null
            ? null
            : RichiestaTiro.fromJson(_map(j['richiestaTiro'])),
        personaggio: Personaggio.fromJson(_map(j['personaggio'])),
        effetti: EffettiTurno.fromJson(_map(j['effetti'])),
        campagnaConclusa: _bool(j['campagnaConclusa']),
        fineSessioneSuggerita: _bool(j['fineSessioneSuggerita']),
        tiro: j['tiro'] == null ? null : RisultatoTiro.fromJson(_map(j['tiro'])),
      );

  final List<EventoSessione> eventi;
  final String narrazione;
  final RichiestaTiro? richiestaTiro;
  final Personaggio personaggio;
  final EffettiTurno effetti;
  final bool campagnaConclusa;
  final bool fineSessioneSuggerita;
  final RisultatoTiro? tiro;
}

class Oggetto {
  const Oggetto({
    required this.id,
    required this.nome,
    required this.tipo,
    required this.quantita,
    required this.equipaggiato,
  });

  factory Oggetto.fromJson(Map<String, dynamic> j) => Oggetto(
        id: _str(j['id']),
        nome: _str(j['nome']),
        tipo: _str(j['tipo'], 'vario'),
        quantita: _int(j['quantita'], 1),
        equipaggiato: _bool(j['equipaggiato']),
      );

  final String id;
  final String nome;
  final String tipo;
  final int quantita;
  final bool equipaggiato;
}

/// Stato completo di una partita in corso, come restituito da GET /campaigns/:id.
class StatoPartita {
  const StatoPartita({
    required this.campagna,
    required this.personaggio,
    required this.eventi,
    required this.riassunto,
  });

  factory StatoPartita.fromJson(Map<String, dynamic> j) => StatoPartita(
        campagna: Campagna.fromJson(_map(j['campagna'])),
        personaggio: Personaggio.fromJson(_map(j['personaggio'])),
        eventi: _listOfMaps(j['eventi']).map(EventoSessione.fromJson).toList(),
        riassunto: _str(j['riassunto']),
      );

  final Campagna campagna;
  final Personaggio personaggio;
  final List<EventoSessione> eventi;
  final String riassunto;
}
