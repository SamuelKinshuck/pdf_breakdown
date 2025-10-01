var x = window.location.href;
var hostname = window.location.hostname;

if(x.includes('localhost')) {
  // Local development environment
  x = "http://localhost:4005/"
} else if (hostname.includes('.replit.dev') || hostname.includes('replit.app')) {
  // Replit environment - use same-origin since Flask serves both frontend and backend
  x = window.location.origin + "/";
} else if (x.includes('stgadfileshare001')) {
  // stgadfileshare001 environment
  x = "http://gad-hosting:8316/"
} else {
  // Default fallback
  x = "http://gad-hosting:8316/"
}

var BACKEND_URL = x;

// public/config.js
window.BACKEND_URL = BACKEND_URL;
// optional alias if you want it
window.API_BASE = window.BACKEND_URL;