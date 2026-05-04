# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install FFmpeg, Node.js (for npx @supabase/mcp-server-supabase), and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    nodejs \
    npm \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Write a custom openssl.cnf with SECLEVEL=1 so Python's ssl module
# can complete the TLS handshake with MongoDB Atlas M0's cipher suites.
RUN printf '%s\n' \
    'openssl_conf = default_conf' \
    '' \
    '[default_conf]' \
    'ssl_conf = ssl_sect' \
    '' \
    '[ssl_sect]' \
    'system_default = system_default_sect' \
    '' \
    '[system_default_sect]' \
    'MinProtocol = TLSv1.2' \
    'CipherString = DEFAULT@SECLEVEL=1' \
    > /etc/ssl/openssl_custom.cnf

ENV OPENSSL_CONF=/etc/ssl/openssl_custom.cnf

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE $PORT

# Command to run the FastAPI application
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
