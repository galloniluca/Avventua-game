import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/models.dart';

/// Identità dell'utente.
///
/// In v1 non c'è autenticazione: si genera un id locale alla prima apertura e
/// lo si manda come header. Quando arriverà il login vero, cambia solo questo
/// provider — il resto dell'app continua a leggere un id da qui.
final utenteIdProvider = FutureProvider<String>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  final esistente = prefs.getString('utente_id');
  if (esistente != null && esistente.isNotEmpty) return esistente;

  final nuovo = 'loc_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
  await prefs.setString('utente_id', nuovo);
  return nuovo;
});

final apiProvider = Provider<ApiClient>((ref) {
  final utenteId = ref.watch(utenteIdProvider).valueOrNull;
  if (utenteId == null) {
    throw StateError('ApiClient richiesto prima che l\'id utente fosse pronto');
  }
  final client = ApiClient(utenteId: utenteId);
  ref.onDispose(client.dispose);
  return client;
});

final settingsProvider = FutureProvider<List<Setting>>(
  (ref) => ref.watch(apiProvider).settings(),
);

final personaggiProvider = FutureProvider<List<Personaggio>>(
  (ref) => ref.watch(apiProvider).personaggi(),
);

final campagneProvider = FutureProvider<List<Campagna>>(
  (ref) => ref.watch(apiProvider).campagne(),
);

/// Campagne di un singolo personaggio: le storie non si mescolano mai.
final campagneDelPersonaggioProvider =
    FutureProvider.family<List<Campagna>, String>((ref, characterId) async {
  final tutte = await ref.watch(campagneProvider.future);
  return tutte.where((c) => c.characterId == characterId).toList();
});

final inventarioProvider = FutureProvider.family<List<Oggetto>, String>(
  (ref, characterId) => ref.watch(apiProvider).inventario(characterId),
);
