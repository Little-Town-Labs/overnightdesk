# overnightdesk/hermes-agent:0.20.0-coder
# Thin derived image: immutable upstream Hermes + approved platform worker tooling.
FROM nousresearch/hermes-agent@sha256:16788311e2fa3035456bdc1bafb8ec2b1777db64ebf020af9bb7eb73c3712c9e

USER root

ARG GH_VERSION=2.98.0

# The upstream image includes docker-cli, but tenant runtimes have no Docker
# socket or remote daemon. Remove that unused host-control surface.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "gh=${GH_VERSION}" \
 && apt-get purge -y docker-cli \
 && ! command -v docker \
 && rm -rf /var/lib/apt/lists/*

# Pre-set the repository identity used by platform_code_worker.
RUN su hermes -c 'git config --global user.name "poorlyordered" && git config --global user.email "netgleb@gmail.com"'

# Least-authority Production Guardian -> Walter task intake. These overlays use
# Hermes's exact-path bearer-token seam and expose no general Kanban authority.
COPY --chown=hermes:hermes \
  plugins/dashboard_auth/platform_task_intake/ \
  /opt/hermes/plugins/dashboard_auth/platform_task_intake/
COPY --chown=hermes:hermes \
  plugins/platform_task_intake/ \
  /opt/hermes/plugins/platform_task_intake/

USER root
