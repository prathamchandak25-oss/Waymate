import os
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ensure JavaScript ES modules and CSS are served with proper MIME types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")

class WaymateRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        # Health check endpoint for cloud hosting / Render
        if self.path == "/healthz" or self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status": "healthy", "service": "waymate"}')
            return
        
        # Route clean root to index.html
        if self.path == "/" or self.path == "":
            self.path = "/index.html"
            
        return super().do_GET()

    def end_headers(self):
        # Add basic security & cache headers
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, WaymateRequestHandler)
    print(f"Waymate server running at http://0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    run()
