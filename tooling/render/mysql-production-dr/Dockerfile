FROM mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d

USER root

RUN set -eux; \
    microdnf update -y openssl openssl-libs libevent curl libcurl libxml2; \
    microdnf install -y jq gzip; \
    microdnf clean all

COPY tooling/render/mysql-production-dr/canonical-manifest.tsv /opt/morro-dr/canonical-manifest.tsv
COPY tooling/render/mysql-production-dr/dr-proof.sh /usr/local/bin/morro-production-mysql-dr-proof
RUN chmod 0444 /opt/morro-dr/canonical-manifest.tsv && \
    chmod 0555 /usr/local/bin/morro-production-mysql-dr-proof

ENTRYPOINT []
CMD ["bash", "-lc", "sleep infinity"]
