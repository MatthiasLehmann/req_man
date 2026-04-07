FROM python:3.12-slim

WORKDIR /app

# System dependencies für doorstop und git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Daten-Verzeichnis vorbereiten (wird per Volume überschrieben)
RUN mkdir -p /data /projects

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
