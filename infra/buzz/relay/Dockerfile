# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
#
# Repackages exact, published Buzz artifacts into a current minimal runtime.
# It intentionally does not rebuild or patch Buzz source.

ARG UPSTREAM_IMAGE=ghcr.io/block/buzz@sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5
ARG RUNTIME_IMAGE=cgr.dev/chainguard/wolfi-base@sha256:7e62cecd3c5712dba6e52c5260afb8f9d7a23b9bbcdd26ad7508a811e74b766d
ARG SOURCE_DATE_EPOCH=1788236887

FROM ${UPSTREAM_IMAGE} AS upstream
FROM ${RUNTIME_IMAGE}

LABEL org.opencontainers.image.title="Buzz relay for OvernightDesk private pilot" \
      org.opencontainers.image.description="Exact upstream Buzz relay artifacts on a version-frozen Wolfi runtime" \
      org.opencontainers.image.source="https://github.com/block/buzz" \
      org.opencontainers.image.revision="571c1902d0ca55cfd4ccf6b91eeb731909cc10be" \
      org.opencontainers.image.licenses="Apache-2.0"

# Git is a relay runtime dependency. Buzz-generated pre-receive hooks also use
# curl and openssl. Versions are frozen; an unavailable version fails closed
# and requires a new candidate review rather than silently changing the image.
RUN apk add --no-cache \
        ca-certificates-bundle=20260611-r1 \
        curl=8.21.0-r3 \
        cyrus-sasl-heimdal-libs=2.1.28-r55 \
        gdbm=1.26-r6 \
        git=2.55.0-r5 \
        heimdal-libs=7.8.0-r52 \
        keyutils-libs=1.6.3-r40 \
        krb5-conf=1.0-r9 \
        krb5-libs=1.22.2-r3 \
        libbrotlicommon1=1.2.0-r4 \
        libbrotlidec1=1.2.0-r4 \
        libcom_err=1.47.4-r2 \
        libcurl-openssl4=8.21.0-r3 \
        libexpat1=2.8.4-r0 \
        libgcc=16.2.0-r1 \
        libidn2=2.3.8-r9 \
        libldap-2.6=2.6.14-r0 \
        libnghttp2-14=1.70.0-r3 \
        libpcre2-8-0=10.48-r0 \
        libpsl=0.23.3-r1 \
        libunistring=1.4.2-r3 \
        libverto=0.3.2-r8 \
        ncurses=6.6.20260829-r1 \
        ncurses-terminfo-base=6.6.20260829-r1 \
        nghttp3=1.18.0-r1 \
        ngtcp2=1.25.0-r2 \
        openssl=3.6.4-r1 \
        readline=8.3-r3 \
        sqlite-libs=3.53.4-r2 \
    && rm -f /var/cache/ldconfig/aux-cache \
    && addgroup -S -g 1000 buzz \
    && adduser -S -D -H -u 1000 -G buzz -s /sbin/nologin buzz \
    && install -d -o buzz -g buzz /var/lib/buzz /data/git

COPY --from=upstream /usr/local/bin/buzz-relay /usr/local/bin/buzz-relay
COPY --from=upstream /srv/buzz/web /srv/buzz/web

ENV BUZZ_WEB_DIR=/srv/buzz/web \
    HOME=/var/lib/buzz

USER 1000:1000
WORKDIR /var/lib/buzz
ENTRYPOINT ["/usr/local/bin/buzz-relay"]
