/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** 'off': sync hidden for everyone. 'labs': hidden unless opened once with ?labs=sync. 'on': available to everyone. */
  readonly VITE_SYNC?: 'off' | 'labs' | 'on';
  /** Address of the sync server, e.g. https://sync.example.com */
  readonly VITE_SYNC_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
