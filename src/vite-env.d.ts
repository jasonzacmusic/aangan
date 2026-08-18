/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_LIVE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
