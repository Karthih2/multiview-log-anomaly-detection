# Build from the repository root: docker build -f backend/Dockerfile .
FROM python:3.10-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 LOGSIGHT_EXPERIMENT_ROOT=/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY engine ./engine
COPY backend ./backend

WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
