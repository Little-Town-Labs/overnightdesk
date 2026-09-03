# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
#
# Retains the exact Docker Official PostgreSQL 17.11 ARM64 artifact while
# replacing only its known-fixed OpenSSL runtime packages.

ARG UPSTREAM_IMAGE=docker.io/library/postgres@sha256:f2924e77eb4939843396c157a86e5545f8b5d7568c35a80eca7dfdb3a0fe764b
ARG SOURCE_DATE_EPOCH=1786643439

FROM ${UPSTREAM_IMAGE}

LABEL org.opencontainers.image.title="PostgreSQL 17 for OvernightDesk Buzz private pilot" \
      org.opencontainers.image.description="Exact Docker Official PostgreSQL 17.11 ARM64 image with fixed OpenSSL runtime packages" \
      org.opencontainers.image.source="https://github.com/docker-library/postgres" \
      org.opencontainers.image.revision="2603e26e245e558218728ee14e0a42dcb020dc7f" \
      org.opencontainers.image.licenses="PostgreSQL"

RUN apk add --no-cache \
        libcrypto3=3.5.8-r0 \
        libssl3=3.5.8-r0

USER 70:70
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
