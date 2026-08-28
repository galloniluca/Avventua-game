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

  /// Quanto aspettare una risposta del DM prima di arrendersi: la chiamata al
  /// modello può essere lenta, molto più di una normale richiesta REST.
  static const Duration timeoutTurno = Duration(seconds: 90);
  static const Duration timeoutStandard = Duration(seconds: 20);
}
