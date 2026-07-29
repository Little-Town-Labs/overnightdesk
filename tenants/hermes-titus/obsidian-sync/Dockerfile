FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

WORKDIR /opt/obsidian-sync

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chmod=0555 bin/entrypoint.sh /usr/local/bin/obsidian-sync-entrypoint
COPY --chmod=0555 bin/healthcheck.sh /usr/local/bin/healthcheck
RUN ln -s /opt/obsidian-sync/node_modules/.bin/ob /usr/local/bin/ob

ENV HOME=/state/home \
    XDG_CONFIG_HOME=/state/config \
    NODE_ENV=production

USER 10000:10000
ENTRYPOINT ["/usr/local/bin/obsidian-sync-entrypoint"]
