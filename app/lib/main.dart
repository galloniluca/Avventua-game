import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'screens/home_screen.dart';
import 'state/providers.dart';

void main() {
  runApp(const ProviderScope(child: AvventuaApp()));
}

class AvventuaApp extends StatelessWidget {
  const AvventuaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Avventua',
      debugShowCheckedModeBanner: false,
      theme: AvventuaTheme.scuro,
      home: const _Avvio(),
    );
  }
}

/// L'id utente arriva da SharedPreferences: nulla può partire prima che sia
/// pronto, perché ogni chiamata al backend lo porta in header.
class _Avvio extends ConsumerWidget {
  const _Avvio();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(utenteIdProvider).when(
          loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
          error: (e, _) => Scaffold(
            body: Center(
              child: Padding(padding: const EdgeInsets.all(32), child: Text('$e')),
            ),
          ),
          data: (_) => const HomeScreen(),
        );
  }
}
