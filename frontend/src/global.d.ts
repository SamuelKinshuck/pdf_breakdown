export {};

declare global {
  interface Window {
    BACKEND_URL: string;
    API_BASE?: string; // if you still want this alias
  }
}