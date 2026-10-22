import 'package:flutter/material.dart';

/// Flat, light palette: lavender page, white panels, one saturated blue and a
/// single dark card. No gradients anywhere — only solid fills and soft radius.
class Palette {
  static const bg = Color(0xFFB6A8DD);
  static const bgDeep = Color(0xFFA798D2);
  static const card = Color(0xFFFFFFFF);
  static const ink = Color(0xFF15161C);
  static const inkSoft = Color(0xFF6E7180);
  static const inkFaint = Color(0xFFA2A5B3);
  static const line = Color(0xFFEFEFF4);
  static const lavender = Color(0xFFEDE7FB);
  static const lavenderMid = Color(0xFFD8CBF5);
  static const violet = Color(0xFF8E6BE8);
  static const blue = Color(0xFF2E9BF0);
  static const blueSoft = Color(0xFFDCEFFD);
  static const mint = Color(0xFFDAF3DE);
  static const mintInk = Color(0xFF2C7C45);
  static const coral = Color(0xFFF4DCDD);
  static const coralInk = Color(0xFFB3353E);
  static const amber = Color(0xFFF7E6C6);
  static const amberInk = Color(0xFF8A5A12);
  static const dark = Color(0xFF191A22);
  static const hover = Color(0xFFF4F4F8);
}

TextStyle text(
  double size, {
  FontWeight weight = FontWeight.w500,
  Color color = Palette.ink,
  double height = 1.25,
  double spacing = 0,
}) => TextStyle(
  fontSize: size,
  fontWeight: weight,
  color: color,
  height: height,
  letterSpacing: spacing,
  fontFamily: 'Segoe UI',
);

TextStyle get labelCaps => text(
  10.5,
  weight: FontWeight.w700,
  color: Palette.inkFaint,
  spacing: 1.1,
);

const double cardRadius = 26;
const double innerRadius = 16;
