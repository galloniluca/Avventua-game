import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';
import '../widgets/scheda_personaggio.dart';
import 'campaign_create_screen.dart';
import 'play_screen.dart';

/// Scheda del personaggio e sue campagne.
class CharacterScreen extends ConsumerWidget {
  const CharacterScreen({required this.personaggio, super.key});

  final Personaggio personaggio;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final campagne = ref.watch(campagneDelPersonaggioProvider(personaggio.id));
    final inventario = ref.watch(inventarioProvider(personaggio.id));

    return Scaffold(
      appBar: AppBar(title: Text(personaggio.nome)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => CampaignCreateScreen(personaggio: personaggio),
          ),
        ),
        icon: const Icon(Icons.auto_stories),
        label: const Text('Nuova campagna'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(campagneProvider)
            ..invalidate(inventarioProvider(personaggio.id));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 96),
          children: [
            BarraPersonaggio(personaggio: personaggio),
            const SizedBox(height: 20),
            GrigliaCaratteristiche(statistiche: personaggio.statistiche),
            if (personaggio.biografia.isNotEmpty) ...[
              const SizedBox(height: 24),
              _Titolo('Background'),
              const SizedBox(height: 8),
              Text(personaggio.biografia, style: Theme.of(context).textTheme.bodyMedium),
            ],
            const SizedBox(height: 24),
            _Titolo('Inventario'),
            const SizedBox(height: 8),
            inventario.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (oggetti) => oggetti.isEmpty
                  ? _Nota('Lo zaino è vuoto.')
                  : Column(
                      children: [
                        for (final o in oggetti)
                          ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(
                              o.equipaggiato ? Icons.shield : Icons.inventory_2_outlined,
                              size: 20,
                              color: AvventuaTheme.oro.withValues(alpha: 0.8),
                            ),
                            title: Text(o.quantita > 1 ? '${o.nome} ×${o.quantita}' : o.nome),
                            subtitle: Text(o.tipo),
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 28),
            _Titolo('Campagne'),
            const SizedBox(height: 8),
            campagne.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (lista) => lista.isEmpty
                  ? _Nota('Nessuna campagna. Comincia la prima avventura di ${personaggio.nome}.')
                  : Column(
                      children: [
                        for (final c in lista)
                          Card(
                            child: ListTile(
                              title: Text(c.nome),
                              subtitle: Text(
                                c.conclusa
                                    ? 'Conclusa'
                                    : '${c.lunghezzaTarget} · ${c.complessita}',
                              ),
                              trailing: Icon(
                                c.conclusa ? Icons.check_circle_outline : Icons.play_arrow,
                                color: AvventuaTheme.oro,
                              ),
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute<void>(
                                  builder: (_) => PlayScreen(campaignId: c.id),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Titolo extends StatelessWidget {
  const _Titolo(this.testo);

  final String testo;

  @override
  Widget build(BuildContext context) => Text(
        testo.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          letterSpacing: 1.6,
          fontWeight: FontWeight.w700,
          color: AvventuaTheme.oro.withValues(alpha: 0.85),
        ),
      );
}

class _Nota extends StatelessWidget {
  const _Nota(this.testo);

  final String testo;

  @override
  Widget build(BuildContext context) => Text(
        testo,
        style: Theme.of(context)
            .textTheme
            .bodyMedium
            ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.6)),
      );
}
