FROM --platform=$BUILDPLATFORM docker.io/library/golang:1.24.4-alpine3.22@sha256:68932fa6d4d4059845c8f40ad7e654e626f3ebd3706eef7846f319293ab5cb7a AS build
ARG TARGETOS=linux
ARG TARGETARCH=arm64
WORKDIR /src
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -mod=vendor -trimpath -ldflags="-s -w" -o /out/titus-meeting-processor ./cmd/titus-meeting-processor

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chown=10003:10003 /out/titus-meeting-processor /titus-meeting-processor
USER 10003:10003
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/titus-meeting-processor", "health", "--health", "/data/health.json", "--max-age", "10m"]
ENTRYPOINT ["/titus-meeting-processor"]
CMD ["run", "--config", "/run/secrets/runtime.json", "--state", "/data/state.json", "--brief-state", "/data/meeting-brief-state.json", "--custody-dir", "/custody", "--health", "/data/health.json", "--handoff", "/data/handoff.json"]
