import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';
import 'character_create_screen.dart';
import 'character_screen.dart';

/// Elenco dei personaggi. Ogni personaggio ha le sue campagne e le sue storie,
/// che non si incrociano mai con quelle degli altri.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final personaggi = ref.watch(personaggiProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('AVVENTUA')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute<void>(builder: (_) => const CharacterCreateScreen()),
        ),
        icon: const Icon(Icons.add),
        label: const Text('Nuovo personaggio'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(personaggiProvider),
        child: personaggi.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErroreCaricamento(
            messaggio: '$e',
            onRiprova: () => ref.invalidate(personaggiProvider),
          ),
          data: (lista) => lista.isEmpty
              ? const _Vuoto()
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  itemCount: lista.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) => _CartaPersonaggio(personaggio: lista[i]),
                ),
        ),
      ),
    );
  }
}

class _CartaPersonaggio extends StatelessWidget {
  const _CartaPersonaggio({required this.personaggio});

  final Personaggio personaggio;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        leading: CircleAvatar(
          backgroundColor: AvventuaTheme.oro.withValues(alpha: 0.18),
          child: Text(
            personaggio.nome.isEmpty ? '?' : personaggio.nome.substring(0, 1).toUpperCase(),
            style: const TextStyle(color: AvventuaTheme.oro, fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(personaggio.nome, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(personaggio.descrizioneBreve),
        trailing: const Icon(Icons.chevron_right, color: AvventuaTheme.oro),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => CharacterScreen(personaggio: personaggio),
          ),
        ),
      ),
    );
  }
}

class _Vuoto extends StatelessWidget {
  const _Vuoto();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(Icons.shield_outlined, size: 56, color: AvventuaTheme.oro.withValues(alpha: 0.7)),
        const SizedBox(height: 20),
        Center(
          child: Text('Nessun personaggio', style: Theme.of(context).textTheme.titleLarge),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 48),
          child: Text(
            'Creane uno per cominciare la tua prima campagna.',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.65)),
          ),
        ),
      ],
    );
  }
}

class _ErroreCaricamento extends StatelessWidget {
  const _ErroreCaricamento({required this.messaggio, required this.onRiprova});

  final String messaggio;
  final VoidCallback onRiprova;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 140),
        const Icon(Icons.cloud_off, size: 44, color: AvventuaTheme.sangue),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(messaggio, textAlign: TextAlign.center),
        ),
        const SizedBox(height: 20),
        Center(child: FilledButton(onPressed: onRiprova, child: const Text('Riprova'))),
      ],
    );
  }
}
