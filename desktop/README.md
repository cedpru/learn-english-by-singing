# Sing Along — application desktop

Client Flutter (Windows) de Sing Along : il démarre le serveur Node du dépôt au lancement,
affiche les paroles synchronisées et leur traduction, et s'arrête avec lui.

```bash
flutter pub get
flutter run -d windows          # développement
flutter build windows --release  # exécutable dans build/windows/x64/runner/Release/
```

Documentation complète, architecture et limites connues : [`../README.md`](../README.md).
