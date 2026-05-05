# fastapi/worker_health.py
import http.server
import socketserver
import threading
import os
import logging
from rq import Worker
from services.queue_service import redis_conn, render_queue

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker_service")

class HealthCheckHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok", "service": "render-worker"}')
        else:
            self.send_response(404)
            self.end_headers()

def run_health_server():
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting health check server on port {port}...")
    with socketserver.TCPServer(("", port), HealthCheckHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    # 1. Start health server in a background thread to satisfy Cloud Run's port requirement
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()

    # 2. Start the RQ Worker in the main thread
    logger.info("Starting RQ Worker (render_queue)...")
    try:
        worker = Worker([render_queue], connection=redis_conn)
        worker.work()
    except Exception as e:
        logger.error(f"Worker crashed: {e}")
        os._exit(1)
