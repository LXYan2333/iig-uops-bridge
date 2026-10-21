declare module '*.css' { const css: string; export default css; }
declare function GM_getValue<T>(key: string, fallback?: T): T | undefined;
declare function GM_setValue<T>(key: string, value: T): void;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];
declare function GM_registerMenuCommand(name: string, callback: () => void): string | number | undefined;
declare function GM_unregisterMenuCommand(id: string | number): void;
declare function GM_xmlhttpRequest(options: {
  method: 'GET'; url: string; timeout: number; anonymous: boolean;
  onload(response: { status: number; responseText: string; finalUrl?: string }): void;
  onerror(): void; ontimeout(): void;
}): { abort(): void };
