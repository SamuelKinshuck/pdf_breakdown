var x = window.location.href;

if(x.includes('localhost')) {
x = "http://localhost:4005/"
} else
{
x = "http://gad-hosting:8316/"
}

var BACKEND_URL = x;

// public/config.js
window.BACKEND_URL = BACKEND_URL;
// optional alias if you want it
window.API_BASE = window.BACKEND_URL;