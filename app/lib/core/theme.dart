import 'package:flutter/material.dart';

/// Palette da tavolo di gioco: pergamena su legno scuro, oro per gli accenti.
class AvventuaTheme {
  const AvventuaTheme._();

  static const Color inchiostro = Color(0xFF1A1614);
  static const Color pergamena = Color(0xFFE8DCC4);
  static const Color oro = Color(0xFFC9A227);
  static const Color sangue = Color(0xFF8C2F1E);
  static const Color verde = Color(0xFF4F7A4A);
  static const Color legno = Color(0xFF2B2320);

  static ThemeData get scuro {
    const schema = ColorScheme.dark(
      primary: oro,
      onPrimary: inchiostro,
      secondary: sangue,
      onSecondary: pergamena,
      surface: legno,
      onSurface: pergamena,
      error: sangue,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: schema,
      scaffoldBackgroundColor: inchiostro,
      appBarTheme: const AppBarTheme(
        backgroundColor: inchiostro,
        foregroundColor: pergamena,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.2,
          color: pergamena,
        ),
      ),
      // Si usa cardColor invece di cardTheme: il tipo di ThemeData.cardTheme
      // è cambiato fra le versioni di Flutter, questo campo no.
      cardColor: legno,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: legno,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: oro.withValues(alpha: 0.25)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: oro.withValues(alpha: 0.25)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: oro, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: oro,
          foregroundColor: inchiostro,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, letterSpacing: 0.6),
        ),
      ),
      textTheme: const TextTheme(
        // La narrazione è il testo che si legge di più: interlinea larga.
        bodyLarge: TextStyle(fontSize: 16.5, height: 1.6, color: pergamena),
        bodyMedium: TextStyle(fontSize: 14.5, height: 1.5, color: pergamena),
        titleLarge: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: pergamena),
        labelLarge: TextStyle(letterSpacing: 0.8),
      ),
    );
  }
}
