FROM golang:1.26.8-bookworm AS gosu-builder

ARG GOSU_VERSION=1.19
ARG GOSU_RELEASE_COMMIT=6456aaa
RUN set -eux; \
    git clone --depth 1 --branch "${GOSU_VERSION}" https://github.com/tianon/gosu.git /src/gosu; \
    test "$(git -C /src/gosu rev-parse --short=7 HEAD)" = "${GOSU_RELEASE_COMMIT}"; \
    cd /src/gosu; \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gosu .; \
    /out/gosu --version; \
    /out/gosu nobody true

FROM mysql:8.4

COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu
RUN set -eux; \
    chmod 0755 /usr/local/bin/gosu; \
    gosu --version; \
    gosu nobody true; \
    microdnf remove -y mysql-shell; \
    microdnf update -y openssl openssl-libs libevent curl libcurl libxml2; \
    microdnf clean all

COPY tooling/render/mysql-production/morro-memory.cnf /etc/mysql/conf.d/99-morro-memory.cnf
RUN mysqld --verbose --help >/dev/null

COPY tooling/render/mysql-production/01-init-databases.sh /docker-entrypoint-initdb.d/01-init-databases.sh
RUN chmod 0555 /docker-entrypoint-initdb.d/01-init-databases.sh
