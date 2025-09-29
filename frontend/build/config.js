var x = window.location.href;

if(x.includes('localhost')) {
x = "http://localhost:4005/"
} else
{
x = "http://gad-hosting:8316/"
}

var BACKEND_URL = x;