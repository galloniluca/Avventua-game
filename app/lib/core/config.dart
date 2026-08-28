/// Configurazione di ambiente dell'app.
///
/// L'URL del backend si passa a compile time:
///   flutter run --dart-define=AVVENTUA_API=https://avventua-backend.tuo.workers.dev
class Config {
  const Config._();

  static const String baseUrl = String.fromEnvironment(
    'AVVENTUA_API',
    defaultValue: 'http://10.0.2.2:8787', // localhost del Worker visto dall'emulatore Android
  );

  /// Quanto aspettare una risposta del DM prima di arrendersi.
  ///
  /// Generoso di proposito: con Gemini un turno arriva in pochi secondi, ma un
  /// modello locale via Ollama su CPU può metterci un paio di minuti a
  /// scrivere una scena. È un tetto massimo, non un'attesa: non costa niente
  /// quando il server è veloce.
  static const Duration timeoutTurno = Duration(minutes: 3);
  static const Duration timeoutStandard = Duration(seconds: 20);
}
