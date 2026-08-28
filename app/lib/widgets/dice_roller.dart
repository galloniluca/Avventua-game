import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';

/// Il d20 animato.
///
/// L'animazione è puramente scenografica: i numeri che scorrono sono finti e
/// servono solo a dare il tempo del tiro. Il risultato vero arriva dal backend
/// e viene mostrato quando la rotazione si ferma.
class DiceRoller extends StatefulWidget {
  const DiceRoller({
    required this.richiesta,
    required this.risultato,
    required this.inCorso,
    required this.onTira,
    super.key,
  });

  final RichiestaTiro richiesta;

  /// Null finché il backend non ha risposto.
  final RisultatoTiro? risultato;
  final bool inCorso;
  final VoidCallback onTira;

  @override
  State<DiceRoller> createState() => _DiceRollerState();
}

class _DiceRollerState extends State<DiceRoller> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );
  final _random = math.Random();
  int _facciaVisibile = 20;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      if (!_controller.isAnimating) return;
      // Rallenta lo scorrimento verso la fine: dà la sensazione del dado che si ferma.
      final soglia = 0.05 + _controller.value * 0.25;
      if (_random.nextDouble() < soglia) return;
      setState(() => _facciaVisibile = _random.nextInt(20) + 1);
    });
  }

  @override
  void didUpdateWidget(DiceRoller vecchio) {
    super.didUpdateWidget(vecchio);
    if (widget.inCorso && !vecchio.inCorso) {
      _controller.repeat();
    } else if (!widget.inCorso && vecchio.inCorso) {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.risultato;
    final mostraRisultato = !widget.inCorso && r != null;

    final coloreEsito = switch (r) {
      null => AvventuaTheme.oro,
      final v when v.critico => AvventuaTheme.oro,
      final v when v.fallimentoCritico => AvventuaTheme.sangue,
      final v when v.successo == true => AvventuaTheme.verde,
      final v when v.successo == false => AvventuaTheme.sangue,
      _ => AvventuaTheme.oro,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.richiesta.motivo.isEmpty
                  ? 'Il Dungeon Master chiede un tiro'
                  : widget.richiesta.motivo,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              _sottotitolo(widget.richiesta),
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.7)),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _Dado(
                  numero: mostraRisultato
                      ? (r.tirati.isEmpty ? r.totale : r.tirati.first)
                      : _facciaVisibile,
                  animazione: _controller,
                  colore: mostraRisultato ? coloreEsito : AvventuaTheme.oro,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: mostraRisultato
                      ? _Esito(risultato: r, colore: coloreEsito)
                      : FilledButton.icon(
                          onPressed: widget.inCorso ? null : widget.onTira,
                          icon: const Icon(Icons.casino),
                          label: Text(widget.inCorso ? 'Il dado rotola…' : 'Tira ${widget.richiesta.etichetta}'),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _sottotitolo(RichiestaTiro r) {
    final parti = <String>[
      if (r.caratteristica != 'nessuna') 'prova di ${r.caratteristica}',
      if (r.competenza) 'competenza inclusa',
      if (r.cd != null) 'CD ${r.cd}',
      if (r.vantaggio != 'nessuno') r.vantaggio,
    ];
    return parti.isEmpty ? r.etichetta : '${r.etichetta} · ${parti.join(' · ')}';
  }
}

class _Dado extends StatelessWidget {
  const _Dado({required this.numero, required this.animazione, required this.colore});

  final int numero;
  final Animation<double> animazione;
  final Color colore;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animazione,
      builder: (context, child) {
        return Transform.rotate(
          angle: animazione.value * 2 * math.pi,
          child: child,
        );
      },
      child: Container(
        width: 72,
        height: 72,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AvventuaTheme.inchiostro,
          border: Border.all(color: colore, width: 2),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          '$numero',
          style: TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.bold,
            color: colore,
          ),
        ),
      ),
    );
  }
}

class _Esito extends StatelessWidget {
  const _Esito({required this.risultato, required this.colore});

  final RisultatoTiro risultato;
  final Color colore;

  @override
  Widget build(BuildContext context) {
    final dettaglio = StringBuffer(risultato.tirati.join(' + '));
    if (risultato.modificatore != 0) {
      dettaglio.write(risultato.modificatore > 0 ? ' + ${risultato.modificatore}' : ' − ${-risultato.modificatore}');
    }

    final titolo = switch (risultato) {
      final r when r.critico => 'Colpo critico!',
      final r when r.fallimentoCritico => 'Fallimento critico',
      final r when r.successo == true => 'Successo',
      final r when r.successo == false => 'Fallimento',
      _ => 'Risultato',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$titolo · ${risultato.totale}',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(color: colore),
        ),
        const SizedBox(height: 2),
        Text(
          '$dettaglio = ${risultato.totale}'
          '${risultato.cd != null ? ' contro CD ${risultato.cd}' : ''}',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.7)),
        ),
        if (risultato.scartati.isNotEmpty)
          Text(
            'scartati: ${risultato.scartati.join(', ')}',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.5)),
          ),
      ],
    );
  }
}
