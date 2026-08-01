ARG HERMES_BASE_IMAGE=overnightdesk/hermes-agent:0.19.0-coder
FROM --platform=$BUILDPLATFORM docker.io/library/golang:1.24.4-alpine3.22@sha256:68932fa6d4d4059845c8f40ad7e654e626f3ebd3706eef7846f319293ab5cb7a AS build
ARG TARGETOS=linux
ARG TARGETARCH=arm64
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/titus-meeting-filer ./cmd/titus-meeting-filer

FROM ${HERMES_BASE_IMAGE}
USER root
COPY --from=build --chown=10004:10004 /out/titus-meeting-filer /usr/local/bin/titus-meeting-filer
ENV HOME=/opt/data
USER 10004:10004
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/opt/hermes/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=2).read()"]
ENTRYPOINT ["/usr/local/bin/titus-meeting-filer"]
CMD ["serve", "--config", "/run/secrets/runtime.json", "--listen", ":8090"]
