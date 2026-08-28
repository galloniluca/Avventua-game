import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';
import 'play_screen.dart';

const _lunghezze = {
  'breve': 'Poche sessioni, storia che converge in fretta',
  'media': 'Qualche sottotrama, obiettivo sempre visibile',
  'lunga': 'Sottotrame, PNG ricorrenti, respiro ampio',
};

const _complessita = {
  'semplice': 'Obiettivi chiari, poche fazioni',
  'media': 'Ambiguità morale, interessi contrapposti',
  'articolata': 'Fazioni multiple, informazioni inaffidabili',
};

class CampaignCreateScreen extends ConsumerStatefulWidget {
  const CampaignCreateScreen({required this.personaggio, super.key});

  final Personaggio personaggio;

  @override
  ConsumerState<CampaignCreateScreen> createState() => _CampaignCreateScreenState();
}

class _CampaignCreateScreenState extends ConsumerState<CampaignCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nome = TextEditingController();
  final _incipit = TextEditingController();

  String _lunghezza = 'media';
  String _complessita = 'media';
  bool _inCorso = false;

  @override
  void dispose() {
    _nome.dispose();
    _incipit.dispose();
    super.dispose();
  }

  Future<void> _crea() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _inCorso = true);
    try {
      final campagna = await ref.read(apiProvider).creaCampagna(
            characterId: widget.personaggio.id,
            nome: _nome.text.trim(),
            lunghezzaTarget: _lunghezza,
            complessita: _complessita,
            incipit: _incipit.text.trim(),
          );
      ref.invalidate(campagneProvider);
      if (!mounted) return;
      // Si sostituisce la schermata di creazione: tornare indietro qui non ha senso.
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(builder: (_) => PlayScreen(campaignId: campagna.id)),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.messaggio), backgroundColor: AvventuaTheme.sangue),
        );
      }
    } finally {
      if (mounted) setState(() => _inCorso = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nuova campagna')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
          children: [
            TextFormField(
              controller: _nome,
              decoration: const InputDecoration(labelText: 'Titolo della campagna'),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 100,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Serve un titolo' : null,
            ),
            const SizedBox(height: 16),
            _Scelta(
              titolo: 'Lunghezza',
              opzioni: _lunghezze,
              selezionata: _lunghezza,
              onCambio: (v) => setState(() => _lunghezza = v),
            ),
            const SizedBox(height: 20),
            _Scelta(
              titolo: 'Complessità',
              opzioni: _complessita,
              selezionata: _complessita,
              onCambio: (v) => setState(() => _complessita = v),
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _incipit,
              decoration: const InputDecoration(
                labelText: 'Da dove parte la storia? (facoltativo)',
                alignLabelWithHint: true,
                helperText: 'Lascia vuoto e il Dungeon Master inventerà l\'aggancio.',
              ),
              minLines: 3,
              maxLines: 6,
              maxLength: 1000,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _inCorso ? null : _crea,
              child: _inCorso
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Crea e comincia'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Scelta extends StatelessWidget {
  const _Scelta({
    required this.titolo,
    required this.opzioni,
    required this.selezionata,
    required this.onCambio,
  });

  final String titolo;
  final Map<String, String> opzioni;
  final String selezionata;
  final ValueChanged<String> onCambio;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          titolo.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            letterSpacing: 1.6,
            fontWeight: FontWeight.w700,
            color: AvventuaTheme.oro.withValues(alpha: 0.85),
          ),
        ),
        const SizedBox(height: 8),
        for (final voce in opzioni.entries)
          RadioListTile<String>(
            value: voce.key,
            groupValue: selezionata,
            onChanged: (v) => onCambio(v ?? selezionata),
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(voce.key[0].toUpperCase() + voce.key.substring(1)),
            subtitle: Text(
              voce.value,
              style: TextStyle(
                fontSize: 12,
                color: AvventuaTheme.pergamena.withValues(alpha: 0.6),
              ),
            ),
          ),
      ],
    );
  }
}
