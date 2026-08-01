/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly VITE_CLIENT?: string;
  readonly VITE_PARSE_CAS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
