/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly VITE_CLIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
