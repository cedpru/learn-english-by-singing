import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../models.dart';
import '../server_launcher.dart';
import 'common.dart';
import 'home.dart';
import 'karaoke.dart';
import 'theme.dart';

class Shell extends StatelessWidget {
  const Shell({
    super.key,
    required this.controller,
    required this.server,
  });

  final AppController controller;
  final ServerLauncher server;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return Scaffold(
      backgroundColor: Palette.bg,
      // Shortcuts carry a modifier on purpose: the app is full of text fields
      // (search, lyrics editor) and a plain "m" or space must stay a letter.
      body: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.space, control: true): () {
            if (c.current != null) c.togglePlay();
          },
          const SingleActivator(LogicalKeyboardKey.escape): () {
            if (c.current != null) c.back();
          },
          const SingleActivator(LogicalKeyboardKey.keyM, control: true): () {
            c.toggleMute();
          },
          const SingleActivator(LogicalKeyboardKey.arrowLeft, control: true): () {
            if (c.current != null) c.bumpShift(3);
          },
          const SingleActivator(LogicalKeyboardKey.arrowRight, control: true): () {
            if (c.current != null) c.bumpShift(-3);
          },
        },
        child: Focus(
          autofocus: true,
          child: AnimatedBuilder(
            animation: c,
            builder: (context, _) {
              return LayoutBuilder(
                builder: (context, box) {
                  final wide = box.maxWidth > 1140;
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          width: 226,
                          child: Sidebar(controller: c, server: server),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              HeaderCard(controller: c),
                              const SizedBox(width: 12, height: 12),
                              Expanded(
                                child: AppCard(
                                  padding: const EdgeInsets.fromLTRB(
                                    22,
                                    20,
                                    22,
                                    14,
                                  ),
                                  child: c.current != null
                                      ? KaraokePage(controller: c)
                                      : HomePage(controller: c),
                                ),
                              ),
                              if (c.current != null) ...[
                                const SizedBox(height: 12),
                                AppCard(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 18,
                                    vertical: 12,
                                  ),
                                  radius: 22,
                                  child: TransportBar(controller: c),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (wide) ...[
                          const SizedBox(width: 12),
                          SizedBox(
                            width: 292,
                            child: SingleChildScrollView(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  NowCard(controller: c),
                                  const SizedBox(height: 12),
                                  PositionCard(controller: c),
                                  const SizedBox(height: 12),
                                  RadioCard(controller: c),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------- sidebar
class Sidebar extends StatelessWidget {
  const Sidebar({super.key, required this.controller, required this.server});

  final AppController controller;
  final ServerLauncher server;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 20, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Row(
              children: [
                const _LogoMark(),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    'Sing Along',
                    style: text(19, weight: FontWeight.w800, spacing: -0.7),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 26),
          _NavItem(
            icon: Icons.mic_none_rounded,
            label: 'Autour de moi',
            active: controller.mode == Mode.mic && controller.current == null,
            onTap: () => controller.goToMode(Mode.mic),
          ),
          _NavItem(
            icon: Icons.podcasts_rounded,
            label: 'Radio',
            active: controller.mode == Mode.radio && controller.current == null,
            onTap: () => controller.goToMode(Mode.radio),
          ),
          _NavItem(
            icon: Icons.search_rounded,
            label: 'Chercher un titre',
            active: controller.mode == Mode.search && controller.current == null,
            onTap: () => controller.goToMode(Mode.search),
          ),
          if (controller.current != null) ...[
            const SizedBox(height: 6),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              height: 1,
              color: Palette.line,
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text('EN COURS', style: labelCaps),
            ),
            const SizedBox(height: 8),
            _CurrentTile(controller: controller),
          ],
          const Spacer(),
          _ServerCard(server: server),
          const SizedBox(height: 10),
          Center(
            child: Text(
              'desktop · 0.2',
              style: text(10.5, color: Palette.inkFaint),
            ),
          ),
        ],
      ),
    );
  }
}

class _LogoMark extends StatelessWidget {
  const _LogoMark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: 26,
      child: Stack(
        children: [
          Positioned(
            left: 2,
            top: 3,
            child: Container(
              width: 17,
              height: 17,
              decoration: const BoxDecoration(
                color: Palette.lavenderMid,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            left: 13,
            top: 0,
            child: Container(
              width: 11,
              height: 11,
              decoration: const BoxDecoration(
                color: Palette.blue,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            left: 12,
            bottom: 0,
            child: Container(
              width: 13,
              height: 13,
              decoration: const BoxDecoration(
                color: Palette.violet,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.active;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 45,
          margin: const EdgeInsets.only(bottom: 4),
          padding: const EdgeInsets.symmetric(horizontal: 13),
          decoration: BoxDecoration(
            color: active
                ? Palette.dark
                : (_hover ? Palette.hover : Palette.hover.withValues(alpha: 0)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              Icon(
                widget.icon,
                size: 17,
                color: active ? Colors.white : Palette.ink,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  widget.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text(
                    13,
                    weight: active ? FontWeight.w700 : FontWeight.w600,
                    color: active ? Colors.white : Palette.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentTile extends StatelessWidget {
  const _CurrentTile({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final track = controller.current!.track;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Palette.lavender.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Cover(url: track.cover, size: 34, radius: 10),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  track.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text(11.5, weight: FontWeight.w700),
                ),
                Text(
                  track.artist,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text(10.5, color: Palette.inkSoft),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ServerCard extends StatelessWidget {
  const _ServerCard({required this.server});

  final ServerLauncher server;

  @override
  Widget build(BuildContext context) {
    final (dot, label) = server.error != null
        ? (Palette.coralInk, 'Serveur arrêté')
        : server.ready
        ? (Palette.mintInk, 'Serveur prêt')
        : (Palette.amberInk, 'Démarrage…');

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      decoration: BoxDecoration(
        color: Palette.lavender,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Dot(color: dot, size: 8),
              const SizedBox(width: 7),
              Text(
                label,
                style: text(12, weight: FontWeight.w700, color: Palette.ink),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            server.error ??
                (server.ready
                    ? 'Node lancé avec l’application, port local 8787'
                    : server.message),
            style: text(
              10.5,
              color: server.error != null ? Palette.coralInk : Palette.inkSoft,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ header
class HeaderCard extends StatelessWidget {
  const HeaderCard({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final title = c.current != null
        ? 'En écoute'
        : switch (c.mode) {
            Mode.mic => 'Autour de moi',
            Mode.radio => 'Radio',
            Mode.search => 'Chercher un titre',
          };
    final subtitle = c.current != null
        ? switch (c.mode) {
            Mode.mic => 'Reconnu au micro · paroles et traduction en direct',
            Mode.radio => 'Radio en direct · paroles calées sur ce que tu entends',
            Mode.search => 'Chargé depuis la recherche · paroles et traduction',
          }
        : switch (c.mode) {
            Mode.mic => 'Reconnaissance au micro · paroles et traduction en direct',
            Mode.radio => 'Radio en direct · paroles synchronisées sur ce que tu entends',
            Mode.search => 'Chercher un titre · paroles et traduction à la demande',
          };
    final now = c.current;
    final chipTitle = now != null
        ? (c.isRadioLive ? c.session!.name : 'Titre chargé')
        : (c.radioActive ? c.radioName : 'Aucune source');
    final chipValue = now != null
        ? (now.track.title)
        : (c.radioActive ? (c.session?.status == 'live' ? 'en direct' : 'connexion') : 'choisis une source');

    return AppCard(
      padding: const EdgeInsets.fromLTRB(24, 18, 20, 18),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: text(27, weight: FontWeight.w800, spacing: -0.9),
                ),
                const SizedBox(height: 3),
                Text(subtitle, style: text(12, color: Palette.inkSoft)),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Container(
            constraints: const BoxConstraints(maxWidth: 250),
            padding: const EdgeInsets.fromLTRB(16, 11, 16, 12),
            decoration: BoxDecoration(
              color: Palette.lavender,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  chipTitle.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: labelCaps,
                ),
                const SizedBox(height: 3),
                Text(
                  chipValue,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text(14, weight: FontWeight.w700, spacing: -0.2),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// --------------------------------------------------------------- right rail
class NowCard extends StatelessWidget {
  const NowCard({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final track = c.current?.track;
    final payload = c.payload;

    return AppCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('MAINTENANT', style: labelCaps),
              const Spacer(),
              if (c.isRadioLive)
                const Tag('en direct', tone: ChipTone.info),
            ],
          ),
          const SizedBox(height: 12),
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: Palette.lavender,
                borderRadius: BorderRadius.circular(20),
              ),
              clipBehavior: Clip.antiAlias,
              child: track?.cover != null
                  ? Image.network(
                      track!.cover!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const _CoverPlaceholder(),
                      loadingBuilder: (context, child, progress) =>
                          progress == null ? child : const _CoverPlaceholder(),
                    )
                  : const _CoverPlaceholder(),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            track?.title ??
                (c.radioActive ? 'Titre non annoncé' : 'Rien en écoute'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text(14.5, weight: FontWeight.w700, spacing: -0.2),
          ),
          const SizedBox(height: 2),
          Text(
            track?.artist ??
                (c.radioActive
                    ? c.identifying
                          ? 'Reconnaissance du morceau en cours…'
                          : 'La station ne donne pas le nom du morceau'
                    : 'Choisis une source à gauche'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text(11.5, color: Palette.inkSoft),
          ),
          if (payload != null && payload.lines.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 5,
              runSpacing: 5,
              children: [
                if (payload.synced)
                  const Tag('synchronisé', tone: ChipTone.ok),
                if (c.autoSynced)
                  const Tag("calé sur l'audio", tone: ChipTone.info),
                if (payload.translation == 'ok')
                  const Tag('traduction FR', tone: ChipTone.ok),
                Tag('${payload.lines.length} lignes'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        '♪',
        style: text(72, weight: FontWeight.w700, color: Palette.violet),
      ),
    );
  }
}

class PositionCard extends StatelessWidget {
  const PositionCard({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final payload = c.payload;
    final total = payload?.track.duration ?? c.current?.track.duration ?? 0;

    return AppCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('POSITION', style: labelCaps),
          const SizedBox(height: 12),
          Row(
            children: [
              ValueListenableBuilder<double>(
                valueListenable: c.position,
                builder: (context, position, _) {
                  final live = total <= 0 || position > total + 5;
                  final fraction = live ? 0.0 : (position / total).clamp(0.0, 1.0);
                  return SizedBox(
                    width: 92,
                    height: 92,
                    child: CustomPaint(
                      painter: _RingPainter(
                        fraction: live ? 0.999 : fraction,
                        live: live,
                      ),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              formatTime(position),
                              style: text(15, weight: FontWeight.w700),
                            ),
                            Text(
                              live ? 'direct' : formatTime(total),
                              style: text(10, color: Palette.inkSoft),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Décalage', style: text(10.5, color: Palette.inkSoft)),
                    Text(
                      '${c.shift > 0 ? '+' : ''}${c.shift.toStringAsFixed(1)} s',
                      style: text(15, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Text('Lignes', style: text(10.5, color: Palette.inkSoft)),
                    Text(
                      '${payload?.lines.length ?? 0}',
                      style: text(15, weight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (c.shift != 0) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                AppButton(
                  label: 'remettre à zéro',
                  onTap: () => c.setShiftValue(0),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.fraction, required this.live});

  final double fraction;
  final bool live;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 8.0;
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (size.shortestSide - stroke) / 2;
    final background = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = const Color(0xFFF0F0F5);
    canvas.drawCircle(center, radius, background);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = live ? Palette.lavenderMid : Palette.blue;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      math.pi * 2 * fraction,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.fraction != fraction || old.live != live;
}

class RadioCard extends StatelessWidget {
  const RadioCard({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final session = c.session;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.dark,
        borderRadius: BorderRadius.circular(cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'RADIO',
                style: text(
                  10.5,
                  weight: FontWeight.w700,
                  color: Colors.white.withValues(alpha: 0.5),
                  spacing: 1.1,
                ),
              ),
              const Spacer(),
              if (c.radioActive)
                Dot(
                  color: session?.status == 'live'
                      ? const Color(0xFF6FD48B)
                      : const Color(0xFFE9C46A),
                  size: 7,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            session?.name ?? 'Aucune station',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text(14, weight: FontWeight.w700, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            session == null
                ? 'Choisis une station pour lancer le direct.'
                : switch (session.status) {
                    'live' =>
                      session.title == null
                          ? 'métadonnées reçues'
                          : (session.artist ?? '').isEmpty
                          ? 'la station n’annonce pas le morceau'
                          : '${session.artist} — ${session.title}',
                    'no-metadata' => 'pas de titre annoncé',
                    'error' => 'flux injoignable',
                    'connecting' => 'connexion au flux…',
                    _ => session.status,
                  },
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text(
              11,
              color: Colors.white.withValues(alpha: 0.65),
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          if (c.radioActive)
            Row(
              children: [
                _DarkButton(
                  label: c.playingAudio ? 'Pause' : 'Lecture',
                  onTap: c.togglePlay,
                ),
                const SizedBox(width: 6),
                _DarkButton(label: 'Arrêter', onTap: c.stopRadio),
              ],
            )
          else
            _DarkButton(
              label: 'Ouvrir Radio',
              onTap: () => c.goToMode(Mode.radio),
            ),
        ],
      ),
    );
  }
}

class _DarkButton extends StatelessWidget {
  const _DarkButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        // light pill on the dark card: a dark button on dark card read as a hole
        child: Container(
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: text(11.5, weight: FontWeight.w700, color: Palette.ink),
          ),
        ),
      ),
    );
  }
}
