FROM golang:1.26.8-bookworm AS gosu-builder

ARG GOSU_VERSION=1.19
RUN set -eux; \
    CGO_ENABLED=0 GOBIN=/out go install "github.com/tianon/gosu@v${GOSU_VERSION}"; \
    /out/gosu --version; \
    /out/gosu nobody true

FROM mysql:8.4

# The upstream MySQL image currently ships gosu 1.19 compiled with Go 1.24.6.
# Rebuild the same pinned gosu source with a patched Go toolchain, update the
# fixable OpenSSL packages, and remove mysql-shell because this staging server
# never invokes it. This preserves the official entrypoint/root-to-mysql drop
# while reducing packages that are not part of the staging runtime contract.
COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu
RUN set -eux; \
    chmod 0755 /usr/local/bin/gosu; \
    gosu --version; \
    gosu nobody true; \
    microdnf remove -y mysql-shell; \
    microdnf update -y openssl openssl-libs; \
    microdnf clean all

COPY tooling/render/mysql-staging/01-init-databases.sh /docker-entrypoint-initdb.d/01-init-databases.sh
RUN chmod 0555 /docker-entrypoint-initdb.d/01-init-databases.sh
