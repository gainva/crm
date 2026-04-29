FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/uploads/reports /app/uploads/templates

EXPOSE 9090

CMD ["sh", "-c", "python init_db.py && uvicorn main:app --host 0.0.0.0 --port 9090"]