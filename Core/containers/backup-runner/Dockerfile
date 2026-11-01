# Build only the linux/amd64 toolchain. No application, credentials or activation.
# Tags in toolchain.json explain provenance; FROM always uses platform digests.
FROM docker.io/library/postgres@sha256:41a369edc91d9bdd7a58be6bc71ea0f8f7a3f49e82818a9f0829021ea7840b7c AS postgres
FROM docker.io/library/node@sha256:8544b46b91d1a8c8bf8fc0d53ae9f276ed07d0ffa9098dc4a9c2f627363a13a0 AS node

FROM postgres AS age
COPY age-v1.3.2-linux-amd64.tar.gz /tmp/age.tar.gz
RUN printf '%s  %s\n' 'cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10' /tmp/age.tar.gz | sha256sum -c - \
    && mkdir /out \
    && tar -xzf /tmp/age.tar.gz --directory /out --strip-components=1 age/age age/age-keygen age/LICENSE \
    && chmod 0755 /out/age /out/age-keygen

# Copy the complete compatible Debian root filesystem, without inheriting the
# database image's VOLUME, EXPOSE, PGDATA, ENTRYPOINT or service CMD metadata.
FROM scratch
COPY --from=postgres / /
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /usr/local/share/licenses/node/LICENSE
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
# The PostgreSQL and Node slim images have no system CA bundle. Keep the public
# Bookworm trust bundle from the same pinned full Node input for libpq TLS.
COPY --from=node /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=node /usr/share/doc/ca-certificates/copyright /usr/local/share/licenses/ca-certificates/copyright
COPY --from=age /out/age /out/age-keygen /usr/local/bin/
COPY --from=age /out/LICENSE /usr/local/share/licenses/age/LICENSE
ENV PATH="/usr/local/bin:/usr/bin:/bin:/usr/lib/postgresql/18/bin" LANG=C LC_ALL=C
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && test -s /etc/ssl/certs/ca-certificates.crt \
    && /usr/local/bin/node --version \
    && /usr/local/bin/npm --version \
    && /usr/bin/pg_dump --version \
    && /usr/local/bin/age --version
WORKDIR /
# Matches GitHub container workspace ownership; this is not a non-root claim.
USER 0:0
ENTRYPOINT []
CMD ["/usr/local/bin/node", "--version"]
