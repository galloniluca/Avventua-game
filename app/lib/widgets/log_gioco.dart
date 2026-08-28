import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';

/// Una riga del log di sessione, resa secondo il tipo di evento.
class RigaEvento extends StatelessWidget {
  const RigaEvento({required this.evento, required this.nomePersonaggio, super.key});

  final EventoSessione evento;
  final String nomePersonaggio;

  @override
  Widget build(BuildContext context) {
    return switch (evento.tipo) {
      TipoEvento.narrazione => _Narrazione(testo: evento.contenuto),
      TipoEvento.azione => _Azione(testo: evento.contenuto, nome: nomePersonaggio),
      TipoEvento.tiro => _NotaDiSistema(testo: evento.contenuto, icona: Icons.casino),
      // La richiesta di tiro è già rappresentata dal pannello del dado:
      // ripeterla nel log sarebbe rumore.
      TipoEvento.richiestaTiro => const SizedBox.shrink(),
      TipoEvento.sistema => _NotaDiSistema(testo: evento.contenuto, icona: Icons.info_outline),
    };
  }
}

class _Narrazione extends StatelessWidget {
  const _Narrazione({required this.testo});

  final String testo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text(testo, style: Theme.of(context).textTheme.bodyLarge),
    );
  }
}

class _Azione extends StatelessWidget {
  const _Azione({required this.testo, required this.nome});

  final String testo;
  final String nome;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AvventuaTheme.legno,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: AvventuaTheme.oro.withValues(alpha: 0.6), width: 3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              nome.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w700,
                color: AvventuaTheme.oro.withValues(alpha: 0.85),
              ),
            ),
            const SizedBox(height: 4),
            Text(testo, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class _NotaDiSistema extends StatelessWidget {
  const _NotaDiSistema({required this.testo, required this.icona});

  final String testo;
  final IconData icona;

  @override
  Widget build(BuildContext context) {
    final colore = AvventuaTheme.pergamena.withValues(alpha: 0.55);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icona, size: 15, color: colore),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              testo,
              style: TextStyle(fontSize: 13, height: 1.4, fontStyle: FontStyle.italic, color: colore),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puntini animati mentre si aspetta il Dungeon Master.
class DmStaScrivendo extends StatefulWidget {
  const DmStaScrivendo({super.key});

  @override
  State<DmStaScrivendo> createState() => _DmStaScrivendoState();
}

class _DmStaScrivendoState extends State<DmStaScrivendo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                final fase = (_controller.value - i * 0.18) % 1.0;
                final opacita = 0.25 + 0.75 * (1 - (fase * 2 - 1).abs()).clamp(0.0, 1.0);
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AvventuaTheme.oro.withValues(alpha: opacita),
                    ),
                  ),
                );
              },
            ),
          const SizedBox(width: 8),
          Text(
            'Il Dungeon Master sta narrando…',
            style: TextStyle(
              fontStyle: FontStyle.italic,
              color: AvventuaTheme.pergamena.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}

/// Riga di riepilogo degli effetti meccanici dell'ultimo turno.
class BarraEffetti extends StatelessWidget {
  const BarraEffetti({required this.effetti, super.key});

  final EffettiTurno effetti;

  @override
  Widget build(BuildContext context) {
    if (!effetti.haQualcosaDaMostrare) return const SizedBox.shrink();

    final chip = <Widget>[
      if (effetti.xpGuadagnati > 0)
        _Chip(testo: '+${effetti.xpGuadagnati} XP', colore: AvventuaTheme.oro),
      if (effetti.danni > 0)
        _Chip(testo: '−${effetti.danni} PF', colore: AvventuaTheme.sangue),
      if (effetti.cure > 0)
        _Chip(testo: '+${effetti.cure} PF', colore: AvventuaTheme.verde),
      if (effetti.saliDiLivello)
        _Chip(testo: 'Livello ${effetti.livello}!', colore: AvventuaTheme.oro),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Wrap(spacing: 8, runSpacing: 8, children: chip),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.testo, required this.colore});

  final String testo;
  final Color colore;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colore.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colore.withValues(alpha: 0.5)),
      ),
      child: Text(
        testo,
        style: TextStyle(color: colore, fontWeight: FontWeight.w600, fontSize: 13),
      ),
    );
  }
}
