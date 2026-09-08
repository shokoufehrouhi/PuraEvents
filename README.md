# PuraEvents

Cross-platform (iOS/Android) smart countdown app. Full product spec: [`docs/PROJECT.md`](docs/PROJECT.md).

## Repo layout

- `apps/mobile` — React Native (Expo + expo-router) app. Phase 1 MVP: offline-first event CRUD, local reminders, native share. See `docs/PROJECT.md` §5 for the finalized architecture (tech stack, min OS/device support, backend plan).
- `docs/` — product & technical decisions.

Native widget/Live Activity/Wear OS extensions and the Postgres backend (Phase 3) will get their own directories once that phase starts.

## Getting started (apps/mobile)

```sh
cd apps/mobile
npm install
npm run ios      # or: npm run android / npm run web
```
