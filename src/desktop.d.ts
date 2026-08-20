export {}
declare global {
  interface Window { desktop?: { platform: string; version: string; getApiUrl: () => Promise<string> } }
}
