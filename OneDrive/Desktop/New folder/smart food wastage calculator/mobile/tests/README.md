# Mobile Validation

Current minimum checks:

```powershell
Set-Location mobile
npm run typecheck
npx expo install --check
npx expo-doctor
```

A physical-device release checklist is in the parent `docs/android-migration-plan.md` and this app's `README.md`. SQLite and Android ONNX Runtime require a native development build; Expo Go is not a valid test target.
