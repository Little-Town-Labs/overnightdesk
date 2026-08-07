FROM python:3.12-alpine

WORKDIR /app
COPY server.py /app/server.py

USER nobody
ENTRYPOINT ["python3", "/app/server.py"]
CMD ["--host", "0.0.0.0", "--port", "8080"]
