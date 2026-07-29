# Runtime Contract

- Titus starts with `titus-project-knowledge-data:/opt/data/project-briefs`.
- The mount is read-write and owned by UID/GID `10000:10000`.
- No public port, network call, token, or companion process is introduced.
- Normal Titus volume preparation creates the named volume and seeds it from
  the existing brief directory only when empty.
- Runtime verification checks the mount, skill, and a write/read/delete canary
  without reading note contents.
