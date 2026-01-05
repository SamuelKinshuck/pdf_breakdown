// Central API configuration for all environments
// This ensures consistent backend URL detection across the app

export function getBackendURL(): string {
  // Check for explicit environment variable first (set via .env.local)
  if (process.env.REACT_APP_API_BASE) {
    return process.env.REACT_APP_API_BASE;
  }

  // Check if window.BACKEND_URL was set by config.js
  if (typeof window !== 'undefined' && (window as any).BACKEND_URL) {
    return (window as any).BACKEND_URL;
  }

  // Fallback: detect environment from window.location
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const href = window.location.href;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000/';
    }

    // Replit environment
    if (hostname.includes('.replit.dev') || hostname.includes('replit.app')) {
      // In Replit, backend runs on port 8000
      return window.location.origin.replace(/:\d+/, ':8000') + '/';
    }

    // stgadfileshare001 environment
    if (href.includes('stgadfileshare001')) {
      return 'http://gad-hosting:8316/';
    }
  }

  // Final fallback: same-origin (for production build served by Flask)
  return '/';
}


// Join BACKEND_URL + path safely (no missing slash, no double slash)
export function apiUrl(path: string): string {
  const base = getBackendURL(); // keep existing behavior
  const cleanBase =
    base === '/' ? '' : String(base).replace(/\/+$/, ''); // '/' -> '' so we can prefix later
  const cleanPath = String(path).replace(/^\/+/, '');

  // Same-origin case
  if (!cleanBase) return `/${cleanPath}`;

  return `${cleanBase}/${cleanPath}`;
}

// Optional convenience wrapper
export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
