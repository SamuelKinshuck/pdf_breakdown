var x = window.location.href;
var hostname = window.location.hostname;
var DEVELOPMENT = false

if(x.includes('localhost')) {
  // Local development environment - backend on port 8000
  x = "http://localhost:8000/"
} else if (hostname.includes('.replit.dev') || hostname.includes('replit.app')) {
  // Replit development environment - backend on port 8000
  x = window.location.origin.replace(/:\d+/, ':8000') + "/";
} else if (x.includes('stgadfileshare001')) {
  // stgadfileshare001 environment
  if(DEVELOPMENT) {
    x = "http://gad-hosting:8326/"
  } else {
    x = "http://gad-hosting:8316/"
  }
  
} else {
  if(DEVELOPMENT) {
    x = "http://gad-hosting:8326/"
  } else {
    x = "http://gad-hosting:8316/"
  }
}

var BACKEND_URL = x;

// public/config.js
window.BACKEND_URL = BACKEND_URL;
// optional alias if you want it
window.API_BASE = window.BACKEND_URL;