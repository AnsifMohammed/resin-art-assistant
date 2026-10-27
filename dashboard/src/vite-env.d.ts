/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_ENABLE_DEMO_LOGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
