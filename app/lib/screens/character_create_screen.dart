import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';
import '../widgets/scheda_personaggio.dart';

const _razze = ['Umano', 'Elfo', 'Mezzelfo', 'Nano', 'Halfling', 'Mezzorco', 'Tiefling'];
const _classi = ['Guerriero', 'Ladro', 'Mago', 'Chierico', 'Ranger', 'Barbaro', 'Bardo'];

class CharacterCreateScreen extends ConsumerStatefulWidget {
  const CharacterCreateScreen({super.key});

  @override
  ConsumerState<CharacterCreateScreen> createState() => _CharacterCreateScreenState();
}

class _CharacterCreateScreenState extends ConsumerState<CharacterCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nome = TextEditingController();
  final _biografia = TextEditingController();

  String? _settingId;
  String _razza = _razze.first;
  String _classe = _classi.first;
  Map<String, int>? _statistiche;
  bool _inCorso = false;

  @override
  void dispose() {
    _nome.dispose();
    _biografia.dispose();
    super.dispose();
  }

  Future<void> _tiraStatistiche() async {
    setState(() => _inCorso = true);
    try {
      final tirate = await ref.read(apiProvider).tiraStatistiche();
      if (mounted) setState(() => _statistiche = tirate);
    } on ApiException catch (e) {
      _segnala(e.messaggio);
    } finally {
      if (mounted) setState(() => _inCorso = false);
    }
  }

  Future<void> _salva() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final settingId = _settingId;
    if (settingId == null) {
      _segnala('Scegli un\'ambientazione');
      return;
    }

    setState(() => _inCorso = true);
    try {
      await ref.read(apiProvider).creaPersonaggio(
            settingId: settingId,
            nome: _nome.text.trim(),
            razza: _razza,
            classe: _classe,
            // Senza tiro esplicito si parte da caratteristiche standard.
            statistiche: _statistiche ?? {for (final c in caratteristiche) c: 10},
            biografia: _biografia.text.trim(),
          );
      ref.invalidate(personaggiProvider);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      _segnala(e.messaggio);
    } finally {
      if (mounted) setState(() => _inCorso = false);
    }
  }

  void _segnala(String messaggio) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(messaggio), backgroundColor: AvventuaTheme.sangue),
    );
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Nuovo personaggio')),
      body: settings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Padding(padding: const EdgeInsets.all(32), child: Text('$e'))),
        data: (lista) {
          _settingId ??= lista.isEmpty ? null : lista.first.id;
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
              children: [
                DropdownButtonFormField<String>(
                  value: _settingId,
                  decoration: const InputDecoration(labelText: 'Ambientazione'),
                  items: [
                    for (final s in lista)
                      DropdownMenuItem(value: s.id, child: Text(s.nome)),
                  ],
                  onChanged: (v) => setState(() => _settingId = v),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _nome,
                  decoration: const InputDecoration(labelText: 'Nome'),
                  textCapitalization: TextCapitalization.words,
                  maxLength: 60,
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Serve un nome' : null,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _razza,
                        decoration: const InputDecoration(labelText: 'Razza'),
                        items: [
                          for (final r in _razze) DropdownMenuItem(value: r, child: Text(r)),
                        ],
                        onChanged: (v) => setState(() => _razza = v ?? _razza),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _classe,
                        decoration: const InputDecoration(labelText: 'Classe'),
                        items: [
                          for (final c in _classi) DropdownMenuItem(value: c, child: Text(c)),
                        ],
                        onChanged: (v) => setState(() => _classe = v ?? _classe),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Caratteristiche', style: Theme.of(context).textTheme.titleLarge),
                    TextButton.icon(
                      onPressed: _inCorso ? null : _tiraStatistiche,
                      icon: const Icon(Icons.casino, size: 18),
                      label: Text(_statistiche == null ? 'Tira 4d6' : 'Ritira'),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _statistiche == null
                      ? 'Senza tiro parti da 10 in tutto.'
                      : 'Tirate dal motore di gioco: 4d6, scarta il più basso.',
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.6)),
                ),
                const SizedBox(height: 12),
                GrigliaCaratteristiche(
                  statistiche: _statistiche ?? {for (final c in caratteristiche) c: 10},
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _biografia,
                  decoration: const InputDecoration(
                    labelText: 'Background (facoltativo)',
                    alignLabelWithHint: true,
                    helperText: 'Il Dungeon Master ne terrà conto nella narrazione.',
                  ),
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 2000,
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _inCorso ? null : _salva,
                  child: _inCorso
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Crea il personaggio'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
