FROM golang:1.26.8-bookworm@sha256:a688600ca24f8a4d3ca77f95b0dd40704a9fc787c826660eb7ba0b641b8b175d AS gosu-builder

ARG GOSU_COMMIT=6456aaa0f3c854d199d0f037f068eb97515b7513
RUN set -eux; \
    git init /src/gosu; \
    cd /src/gosu; \
    git remote add origin https://github.com/tianon/gosu.git; \
    git fetch --depth 1 origin "${GOSU_COMMIT}"; \
    git checkout --detach FETCH_HEAD; \
    test "$(git rev-parse HEAD)" = "${GOSU_COMMIT}"; \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gosu .; \
    /out/gosu --version; \
    /out/gosu nobody true

FROM mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d

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
COPY tooling/render/mysql-production/readback.sh /usr/local/bin/morro-mysql-readback
COPY tooling/render/mysql-production/runtime-users.sh /usr/local/bin/morro-mysql-runtime-users
RUN chmod 0555 /docker-entrypoint-initdb.d/01-init-databases.sh /usr/local/bin/morro-mysql-readback /usr/local/bin/morro-mysql-runtime-users
