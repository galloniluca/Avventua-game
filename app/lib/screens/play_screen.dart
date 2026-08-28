import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../state/game_controller.dart';
import '../widgets/dice_roller.dart';
import '../widgets/log_gioco.dart';
import '../widgets/scheda_personaggio.dart';

/// La schermata di gioco: log narrativo, campo d'azione libera, pannello dado.
class PlayScreen extends ConsumerStatefulWidget {
  const PlayScreen({required this.campaignId, super.key});

  final String campaignId;

  @override
  ConsumerState<PlayScreen> createState() => _PlayScreenState();
}

class _PlayScreenState extends ConsumerState<PlayScreen> {
  final _controllerTesto = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controllerTesto.dispose();
    _scroll.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _scorriInFondo() {
    // Un frame di ritardo: la ListView deve aver già disposto i nuovi eventi.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _invia() async {
    final testo = _controllerTesto.text.trim();
    if (testo.isEmpty) return;
    _controllerTesto.clear();
    _scorriInFondo();
    await ref.read(partitaProvider(widget.campaignId).notifier).agisci(testo);
    _scorriInFondo();
    if (mounted) _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final partita = ref.watch(partitaProvider(widget.campaignId));

    ref.listen(partitaProvider(widget.campaignId), (_, nuovo) {
      final errore = nuovo.valueOrNull?.erroreTurno;
      if (errore == null || !mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          SnackBar(
            content: Text(errore),
            backgroundColor: AvventuaTheme.sangue,
            action: SnackBarAction(
              label: 'Ok',
              textColor: AvventuaTheme.pergamena,
              onPressed: () =>
                  ref.read(partitaProvider(widget.campaignId).notifier).ignoraErrore(),
            ),
          ),
        );
      _scorriInFondo();
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(partita.valueOrNull?.campagna.nome ?? 'Avventura'),
        actions: [
          if (partita.valueOrNull?.partitaIniziata ?? false)
            PopupMenuButton<String>(
              onSelected: (voce) {
                if (voce == 'chiudi') _confermaChiusuraSessione();
              },
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'chiudi',
                  child: Text('Termina la sessione'),
                ),
              ],
            ),
        ],
      ),
      body: partita.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Errore(messaggio: '$e', onRiprova: () => ref.invalidate(partitaProvider(widget.campaignId))),
        data: (stato) => _Corpo(
          stato: stato,
          campaignId: widget.campaignId,
          scroll: _scroll,
          controllerTesto: _controllerTesto,
          focus: _focus,
          onInvia: _invia,
          onScorri: _scorriInFondo,
        ),
      ),
    );
  }

  Future<void> _confermaChiusuraSessione() async {
    final conferma = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Terminare la sessione?'),
        content: const Text(
          'Il Dungeon Master scriverà il riassunto di quanto accaduto e la '
          'prossima volta ripartirete da lì.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Termina'),
          ),
        ],
      ),
    );
    if (conferma ?? false) {
      await ref.read(partitaProvider(widget.campaignId).notifier).chiudiSessione();
    }
  }
}

class _Corpo extends ConsumerWidget {
  const _Corpo({
    required this.stato,
    required this.campaignId,
    required this.scroll,
    required this.controllerTesto,
    required this.focus,
    required this.onInvia,
    required this.onScorri,
  });

  final StatoGioco stato;
  final String campaignId;
  final ScrollController scroll;
  final TextEditingController controllerTesto;
  final FocusNode focus;
  final Future<void> Function() onInvia;
  final VoidCallback onScorri;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(partitaProvider(campaignId).notifier);

    if (!stato.partitaIniziata) {
      return _Incipit(
        campagna: stato.campagna,
        inCorso: stato.dmStaScrivendo,
        onAvvia: () async {
          await controller.avvia();
          onScorri();
        },
      );
    }

    return Column(
      children: [
        BarraPersonaggio(personaggio: stato.personaggio),
        Expanded(
          child: ListView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 8),
            children: [
              for (final evento in stato.eventi)
                RigaEvento(evento: evento, nomePersonaggio: stato.personaggio.nome),
              if (stato.ultimiEffetti != null) BarraEffetti(effetti: stato.ultimiEffetti!),
              if (stato.dmStaScrivendo) const DmStaScrivendo(),
              if (stato.campagna.conclusa) const _FineCampagna(),
              const SizedBox(height: 8),
            ],
          ),
        ),
        if (stato.tiroInSospeso != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: DiceRoller(
              richiesta: stato.tiroInSospeso!,
              risultato: stato.ultimoTiro,
              inCorso: stato.dmStaScrivendo,
              onTira: () async {
                await controller.tira();
                onScorri();
              },
            ),
          ),
        if (!stato.campagna.conclusa)
          _CampoAzione(
            controller: controllerTesto,
            focus: focus,
            abilitato: stato.puoAgire,
            suggerimento: stato.tiroInSospeso != null
                ? 'Prima tira il dado…'
                : 'Cosa fai?',
            onInvia: onInvia,
          ),
      ],
    );
  }
}

class _Incipit extends StatelessWidget {
  const _Incipit({
    required this.campagna,
    required this.inCorso,
    required this.onAvvia,
  });

  final Campagna campagna;
  final bool inCorso;
  final Future<void> Function() onAvvia;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.auto_stories, size: 56, color: AvventuaTheme.oro.withValues(alpha: 0.8)),
            const SizedBox(height: 20),
            Text(
              campagna.nome,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 10),
            Text(
              'Campagna ${campagna.lunghezzaTarget}, complessità ${campagna.complessita}.',
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.65)),
            ),
            const SizedBox(height: 32),
            if (inCorso)
              const Column(
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Il Dungeon Master prepara la scena…'),
                ],
              )
            else
              FilledButton.icon(
                onPressed: onAvvia,
                icon: const Icon(Icons.play_arrow),
                label: const Text('Comincia l\'avventura'),
              ),
          ],
        ),
      ),
    );
  }
}

class _CampoAzione extends StatelessWidget {
  const _CampoAzione({
    required this.controller,
    required this.focus,
    required this.abilitato,
    required this.suggerimento,
    required this.onInvia,
  });

  final TextEditingController controller;
  final FocusNode focus;
  final bool abilitato;
  final String suggerimento;
  final Future<void> Function() onInvia;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focus,
                enabled: abilitato,
                minLines: 1,
                maxLines: 5,
                maxLength: 2000,
                textInputAction: TextInputAction.newline,
                keyboardType: TextInputType.multiline,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: suggerimento,
                  counterText: '',
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: abilitato ? onInvia : null,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.all(16),
                shape: const CircleBorder(),
              ),
              child: const Icon(Icons.send, size: 20),
            ),
          ],
        ),
      ),
    );
  }
}

class _FineCampagna extends StatelessWidget {
  const _FineCampagna();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Divider(color: AvventuaTheme.oro.withValues(alpha: 0.4)),
          const SizedBox(height: 12),
          Text('Fine della campagna', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(
            'La storia è conclusa. Puoi farne scrivere il racconto dalla schermata della campagna.',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: AvventuaTheme.pergamena.withValues(alpha: 0.65)),
          ),
        ],
      ),
    );
  }
}

class _Errore extends StatelessWidget {
  const _Errore({required this.messaggio, required this.onRiprova});

  final String messaggio;
  final VoidCallback onRiprova;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 44, color: AvventuaTheme.sangue),
            const SizedBox(height: 16),
            Text(messaggio, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton(onPressed: onRiprova, child: const Text('Riprova')),
          ],
        ),
      ),
    );
  }
}
