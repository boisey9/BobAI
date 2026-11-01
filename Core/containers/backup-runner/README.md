# Local backup runner toolchain

This directory defines a `linux/amd64` toolchain candidate for BobCore's disabled testing backup workflow. It contains PostgreSQL client tools, Node/npm, age and the compatible Debian filesystem. It contains no BobAI application source, application dependencies, database URLs, storage credentials or recovery identity. The existing Core lockfile is recorded for later dependency qualification; it is not copied into the image.

The [toolchain manifest](toolchain.json) is the reviewed input record. The [image change record](../../../docs/changes/2026-11-01-backup-runner-image.md) records actual build and qualification outcomes. The commands below describe a local review procedure; their presence is not evidence that a particular image passed. They do not publish an image, install tools on the host, configure secrets or activate a workflow.

## What the pins establish

| Identity | Meaning |
| --- | --- |
| Registry index digest | Identifies the recorded multi-platform input index. Tags are provenance labels and are not the build selector. |
| Platform manifest digest | The Dockerfile's `FROM` selector for each `linux/amd64` input. The manifest also records the corresponding image configuration digest. |
| age archive SHA-256 and length | Bind the public release archive bytes checked before and during the build. They do not replace publisher-signature verification. |
| Local `sha256:…` image ID | The exact identifier reported by the local Docker image store. Depending on that store, this can be a configuration digest or a manifest-backed identifier. The qualifier accepts the exact cached ID and never pulls it. |
| Future `ghcr.io/boisey9/bob-backup-runner@sha256:…` reference | Would identify a separately published registry manifest after authorized publication and readback. A local image ID must not be substituted for this digest. |

The pinned age archive is [v1.3.2 for Linux amd64](https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz), with checksum provenance recorded in the [release metadata](https://api.github.com/repos/FiloSottile/age/releases/tags/v1.3.2). No publisher signature or Sigsum proof has been verified; `publisherProofVerified` remains `false`. Digest pinning and byte checks are not a claim of independent publisher authentication, vulnerability clearance or bit-for-bit reproducible output.

The manifest expects these tools:

| Tool | Exact qualification output |
| --- | --- |
| Node | `v24.22.2` |
| npm | `11.19.1` |
| pg_dump | `pg_dump (PostgreSQL) 18.6 (Debian 18.6-1.pgdg12+2)` |
| age / age-keygen | `v1.3.2` |

The recipe starts its final stage `FROM scratch` and copies the complete PostgreSQL Debian root filesystem. This preserves the libraries and filesystem dependencies needed by the tools, including files and binaries not used by this runner. It discards inherited **image metadata** such as database `VOLUME`, `EXPOSE`, `PGDATA`, service entrypoint and service command; it does not claim to remove every database-related file or package. The input records use PostgreSQL `18.6-bookworm` and full Node `24.22.2-bookworm`, selected by their platform digests. Only Node's executable, npm, selected license material and public CA bundle are copied from the Node input; its full filesystem is not copied. The checked age tools and license come from the archive. No package installation runs in the Dockerfile.

The PostgreSQL input and the initially considered Node slim input do not provide the required system CA bundle. The final recipe copies `/etc/ssl/certs/ca-certificates.crt` and its copyright record from the pinned full Node input, as recorded by `systemCA` in the manifest. This is a public static bundle, not an installed or automatically maintained Debian `ca-certificates` package in the final image. Trust-store refresh requires reviewed source updates and a new image; bundle presence alone does not establish freshness or accepted hosted TLS behavior.

The runtime user is explicitly **`0:0`**. This initial choice avoids assuming that a non-root user can write the GitHub container workspace and temporary paths. It is not a claim of non-root execution or completed hosted ownership acceptance. Local qualification checks this exact UID/GID, drops all capabilities, disables privilege escalation, uses a read-only root and allows only a small `/tmp` tmpfs. The Docker socket is used by the host-side controller and is never mounted into the container.

## Local preparation and build

Use the existing Intel/x86_64 host, an already available Docker daemon, Docker CLI and Node. The host Node only runs the review helpers; the manifest's exact Node24 requirement applies inside the candidate. Do not install a replacement host toolchain for this procedure. The qualifier currently uses `/usr/local/bin/docker` on macOS and `/usr/bin/docker` on Linux.

Start from the BobAI repository root. Set the two input paths below to the already downloaded public age archive and the explicitly approved **canonical local Unix socket**. The socket must be owned by the current user or root, not world-writable, and not a symlink. Do not point these commands at a remote daemon. Use the manifest's source URL only if a separate public artifact fetch is needed and authorized; the sequence below consumes an existing archive and does not fetch it.

```bash
set -euo pipefail
umask 077
if [ -n "${CI:-}${GITHUB_ACTIONS:-}${VERCEL:-}" ]; then
  printf 'This procedure is for an approved local host only.\n' >&2
  exit 1
fi

bob_runner_repo="$(pwd -P)"
bob_runner_manifest="$bob_runner_repo/Core/containers/backup-runner/toolchain.json"
test -f "$bob_runner_manifest"
bob_runner_node="$(command -v node)"
bob_runner_docker="/usr/local/bin/docker" # On Linux: /usr/bin/docker.
bob_runner_socket="/absolute/canonical/path/to/approved-local-docker.sock"
bob_runner_age_archive="/absolute/path/to/age-v1.3.2-linux-amd64.tar.gz"
test -x "$bob_runner_node"
test -x "$bob_runner_docker"
test -f "$bob_runner_age_archive"

bob_runner_node_clean() {
  env -i PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C "$bob_runner_node" "$@"
}
bob_runner_node_clean --input-type=module - "$bob_runner_socket" <<'NODE'
import { lstatSync, realpathSync } from 'node:fs';
const path = process.argv[2], info = lstatSync(path);
if (!info.isSocket() || info.isSymbolicLink() || realpathSync(path) !== path ||
    ![0, process.getuid()].includes(info.uid) || (info.mode & 0o002)) {
  throw new Error('An approved canonical local Docker socket is required.');
}
NODE

bob_runner_work="$(mktemp -d "${TMPDIR:-/tmp}/bob-runner-review-XXXXXX")"
bob_runner_work="$(bob_runner_node_clean -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$bob_runner_work")"
bob_runner_node_clean --input-type=module - "$bob_runner_repo" "$bob_runner_work" <<'NODE'
import { relative, isAbsolute } from 'node:path';
const rel = relative(process.argv[2], process.argv[3]);
if (!(rel === '..' || rel.startsWith('../') || isAbsolute(rel))) {
  throw new Error('The temporary build directory must be outside the checkout.');
}
NODE
mkdir "$bob_runner_work/context" "$bob_runner_work/docker-config"
printf '{}\n' > "$bob_runner_work/docker-config/config.json"

cp "$bob_runner_repo/Core/containers/backup-runner/Dockerfile" "$bob_runner_work/context/Dockerfile"
cp "$bob_runner_repo/Core/containers/backup-runner/.dockerignore" "$bob_runner_work/context/.dockerignore"
cp "$bob_runner_age_archive" "$bob_runner_work/context/age-v1.3.2-linux-amd64.tar.gz"

bob_runner_node_clean --input-type=module - "$bob_runner_manifest" "$bob_runner_work/context" <<'NODE'
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const root = process.argv[3];
const expected = ['.dockerignore', 'Dockerfile', 'age-v1.3.2-linux-amd64.tar.gz'];
if (JSON.stringify(readdirSync(root).sort()) !== JSON.stringify(expected.sort()) ||
    expected.some(name => !lstatSync(join(root, name)).isFile())) {
  throw new Error('The build context must contain only the three reviewed files.');
}
const archive = readFileSync(join(root, 'age-v1.3.2-linux-amd64.tar.gz'));
if (archive.length !== manifest.age.bytes ||
    createHash('sha256').update(archive).digest('hex') !== manifest.age.sha256) {
  throw new Error('The public age archive does not match the reviewed manifest.');
}
console.log('Public archive SHA-256/length and three-file context verified.');
NODE

bob_runner_docker_local() {
  env -i PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C \
    "$bob_runner_docker" --host "unix://$bob_runner_socket" \
    --config "$bob_runner_work/docker-config" "$@"
}

# These inspect existing cached inputs. A missing input requires a separately
# authorized public pull by its platform digest, not a tag substitution.
for bob_runner_source in postgres node; do
  bob_runner_input="$(bob_runner_node_clean --input-type=module -e \
    'import {readFileSync} from "node:fs"; const item=JSON.parse(readFileSync(process.argv[1],"utf8")).registryInputs[process.argv[2]]; process.stdout.write(item.repository+"@"+item.platformDigest);' \
    "$bob_runner_manifest" "$bob_runner_source")"
  bob_runner_docker_local image inspect "$bob_runner_input" \
    > "$bob_runner_work/$bob_runner_source.inspect.json"
  bob_runner_node_clean --input-type=module - "$bob_runner_manifest" \
    "$bob_runner_source" "$bob_runner_work/$bob_runner_source.inspect.json" <<'NODE'
import { readFileSync } from 'node:fs';
const source = process.argv[3];
const input = JSON.parse(readFileSync(process.argv[2], 'utf8')).registryInputs[source];
const inspected = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const official = /^docker\.io\/library\/([a-z0-9-]+)$/.exec(input.repository);
if (!official || !Array.isArray(inspected) || inspected.length !== 1) {
  throw new Error('Unexpected reviewed input or image inspection.');
}
const image = inspected[0];
// Docker may render official-image names in any of these equivalent forms.
const repositories = [input.repository, `library/${official[1]}`, official[1]];
const accepted = new Set(repositories.map(repository => `${repository}@${input.platformDigest}`));
if (image.Os !== 'linux' || image.Architecture !== 'amd64' ||
    !/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
    !Array.isArray(image.RepoDigests) || !image.RepoDigests.some(ref => accepted.has(ref))) {
  throw new Error('Cached input does not match its pinned repository digest and platform.');
}
console.log(JSON.stringify({ source, pinnedPlatformManifest: `${input.repository}@${input.platformDigest}`,
  recordedOCIConfigDigest: input.configDigest, actualLocalImageId: image.Id }));
NODE
done > "$bob_runner_work/input-identities.jsonl"

bob_runner_docker_local build --platform=linux/amd64 --pull=false \
  --network=none --iidfile "$bob_runner_work/image.id" \
  --file "$bob_runner_work/context/Dockerfile" "$bob_runner_work/context" \
  > "$bob_runner_work/build.log" 2>&1
read -r bob_runner_image < "$bob_runner_work/image.id"
printf 'Local candidate image ID: %s\nEvidence directory: %s\n' \
  "$bob_runner_image" "$bob_runner_work"
```

The input check binds `RepoDigests` to the exact pinned official repository/platform digest and verifies `linux/amd64`; it records Docker's reported `.Id` separately. It does not require `.Id` to equal the OCI configuration digest: the local containerd image store can report a manifest-backed ID. The manifest's `configDigest` remains provenance from the fetched OCI configuration, not a second Docker local-ID assertion. Retain the inspection JSON and `input-identities.jsonl` with the build evidence.

The empty Docker configuration prevents using the user's registry credential store or selected Docker context. The explicit Unix socket selects the reviewed local daemon. This does not alter the user's normal Docker configuration. The three-file build context and `.dockerignore` exclude application files, local environment files and credentials. Do not replace it with the repository root as the build context.

`--network=none` disables networking for Dockerfile `RUN` steps. It does **not** disable registry metadata/layer acquisition by the Docker daemon or builder. Base images must already be cached for the stated preparation path; `--pull=false` does not make a missing base available. Separate public input retrieval, if required, remains a distinct reviewed step. The recipe does not require installing Buildx; an existing CLI may use its available builder or legacy fallback. Keep the build log and resulting local ID with the reviewed source pins.

## Qualify that exact cached image

Run the existing local-only controller with the exact ID just produced:

```bash
bob_runner_node_clean "$bob_runner_repo/Core/scripts/qualify-backup-runner-image.mjs" \
  "--image=$bob_runner_image" "--socket=$bob_runner_socket" \
  | tee "$bob_runner_work/qualification.json"
```

The [qualifier](../../scripts/qualify-backup-runner-image.mjs) reads the committed manifest's exact tool versions and `0:0` runtime user. It rejects tags, registry references, wrong platform/user, declared volumes or exposed ports, inherited service entrypoints and unexpected image commands. It creates its own empty private Docker configuration and refuses hosted CI execution. It performs no build, pull, push or workflow activation.

Its container uses `--pull=never`, `--network=none`, a read-only root, no host bind mounts or published ports, all capabilities dropped, no-new-privileges, and bounded process/memory/CPU resources. Application temporary files use a 64 MiB `/tmp` tmpfs with `nosuid,nodev,noexec`. The controller inspects the actual container isolation and ownership before running checks. It supplies a reviewed program over stdin; no checkout, dependency tree, host environment, Docker socket or private recovery key is mounted or copied in.

Checks cover the exact tool paths/versions, a parseable CA certificate in the installed bundle, canonical private temporary directories, exclusive `0600` files, a synthetic age-key generation/encryption/decryption round trip and corruption refusal. The synthetic private key exists only inside that disposable tmpfs. The controller verifies the container's exited state and removes only its own identified container and temporary Docker configuration. A successful result includes confirmed cleanup; interrupted or uncertain cleanup is a failure. The caller's build context, local image and evidence directory are retained separately.

This bounded qualifier does not run the full application test suite, `npm ci`, PostgreSQL restoration, hosted checkout, real TLS or storage/database calls. It verifies the presence and parsing of a CA certificate, not remote certificate validation or CA freshness. Host loss remains outside catchable cleanup guarantees.

## Remaining qualification and activation gates

The change record must supply measured outcomes for the exact final image/source. Until separately recorded, full Linux supervisor/process behavior, locked `npm ci` and application dependency compatibility, and actual hosted checkout/workspace/temp ownership remain unverified. Any separately authorized local Linux checks should retain their own exact source/image evidence; they do not change this qualifier's scope.

The [testing workflow](../../../.github/workflows/backups-testing.yml) retains both literal `false` job conditions. Its [binding](../../scripts/backup-testing-binding.json) remains disabled and unbound. The [runner guard](../../scripts/lib/backup-testing-runner.mjs) eventually requires a reviewed GHCR manifest digest, exact installed versions, lockfile identity, approved published source SHA and testing-only authority. `toolchain.json` is provenance and qualification input; it cannot enable that binding.

Publishing a candidate, establishing a registry digest/access policy, or configuring owner-approved synthetic source/restore/storage targets requires its own authorization and evidence. Hosted TLS, intended account/bucket/prefix, capture/ledger role denials, upload/readback/download, same-bundle restore and revocation remain separate acceptance work. Keep retention disabled for initial testing. Independent current-key/off-device recovery, recurring protection, full hosted RPO/RTO and release configuration/rollback acceptance remain open. Local image qualification does not authorize or establish Production readiness.
