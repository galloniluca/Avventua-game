import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';

/// Barra compatta con PF e XP, sempre visibile durante il gioco.
class BarraPersonaggio extends StatelessWidget {
  const BarraPersonaggio({required this.personaggio, this.onTap, super.key});

  final Personaggio personaggio;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final stato = personaggio.stato;
    final coloreP = stato.frazionePf > 0.5
        ? AvventuaTheme.verde
        : stato.frazionePf > 0.25
            ? AvventuaTheme.oro
            : AvventuaTheme.sangue;

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: AvventuaTheme.legno,
          border: Border(bottom: BorderSide(color: AvventuaTheme.oro.withValues(alpha: 0.2))),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    personaggio.nome,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                  Text(
                    personaggio.descrizioneBreve,
                    style: TextStyle(
                      fontSize: 12,
                      color: AvventuaTheme.pergamena.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            _Misuratore(
              etichetta: 'PF ${stato.pf}/${stato.pfMax}',
              frazione: stato.frazionePf,
              colore: coloreP,
            ),
            const SizedBox(width: 12),
            _Misuratore(
              etichetta: personaggio.xpProssimoLivello == null
                  ? 'XP max'
                  : 'XP ${personaggio.xp}',
              frazione: personaggio.progressoLivello,
              colore: AvventuaTheme.oro,
            ),
          ],
        ),
      ),
    );
  }
}

class _Misuratore extends StatelessWidget {
  const _Misuratore({
    required this.etichetta,
    required this.frazione,
    required this.colore,
  });

  final String etichetta;
  final double frazione;
  final Color colore;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 82,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(etichetta, style: TextStyle(fontSize: 11, color: colore)),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: frazione.clamp(0, 1),
              minHeight: 5,
              backgroundColor: AvventuaTheme.inchiostro,
              valueColor: AlwaysStoppedAnimation(colore),
            ),
          ),
        ],
      ),
    );
  }
}

/// Griglia delle sei caratteristiche con il relativo modificatore.
class GrigliaCaratteristiche extends StatelessWidget {
  const GrigliaCaratteristiche({required this.statistiche, super.key});

  final Map<String, int> statistiche;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final c in caratteristiche)
          Container(
            width: 86,
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: AvventuaTheme.legno,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AvventuaTheme.oro.withValues(alpha: 0.25)),
            ),
            child: Column(
              children: [
                Text(
                  abbrevia(c),
                  style: TextStyle(
                    fontSize: 11,
                    letterSpacing: 1.2,
                    color: AvventuaTheme.oro.withValues(alpha: 0.85),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${statistiche[c] ?? 10}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
                ),
                Text(
                  modificatoreFormattato(statistiche[c] ?? 10),
                  style: TextStyle(
                    fontSize: 12,
                    color: AvventuaTheme.pergamena.withValues(alpha: 0.65),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
