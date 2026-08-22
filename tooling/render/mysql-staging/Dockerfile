FROM mysql:8.4

COPY tooling/render/mysql-staging/01-init-databases.sh /docker-entrypoint-initdb.d/01-init-databases.sh
RUN chmod 0555 /docker-entrypoint-initdb.d/01-init-databases.sh
