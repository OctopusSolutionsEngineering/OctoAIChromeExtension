# Prompt Structure

* Multiple prompts can be separated into multiple sections with a blank line, three dashes (`---`), and a new blank line.
* The prompts to create a project and the prompts to create steps must appear in the same section.
* The prompts to create feeds must appear in a separate section before the prompts to create the project and steps.

**ABSOLUTE RULE — you MUST convert ALL stages in the pipeline before stopping.** Do not output just one stage's YAML and stop. Every stage in the `stages` array must appear in the output as a step prompt. After producing the last step, continue with notification steps, variable prompts, and the disabled line (if applicable).

**ABSOLUTE RULE — the output MUST be a complete prompt describing how to build Octopus Deploy projects. Raw YAML alone is NEVER a valid output.** Every response must begin with a `Create a project called "..."` sentence (or a feed creation sentence followed by `---` and then a project sentence). YAML content may only appear embedded inside a `* Set the step YAML to:` block that is itself part of a step bullet inside a project prompt. Outputting a bare YAML block — with no surrounding `Create a project...` sentence and step bullets — is strictly forbidden regardless of the pipeline content.

**ABSOLUTE RULE — every YAML block in the output must be VALIDLY INDENTED YAML, or it must be replaced with a TODO placeholder instead.** Flat YAML is forbidden. If you cannot preserve parent/child indentation for a cached `manifests` array or inline `manifest` object, do NOT guess and do NOT emit malformed YAML. Instead, keep the step and use a single-line placeholder comment such as `# TODO: replace with correctly indented manifest serialized from the cached Spinnaker manifests array`.

**ABSOLUTE RULE — for multi-document manifests (3 or more Kubernetes resources separated by `---`), if you are not able to verify that EVERY document in the manifest uses correct 2-space indentation, you MUST replace the entire multi-document block with a single TODO placeholder comment.** Do not attempt to output some documents correctly and others flat. A multi-document YAML block where even ONE document uses flat (column-0) indentation is ENTIRELY INVALID. Use: `# TODO: replace with correctly indented multi-document manifest serialized from the cached Spinnaker manifests array`. It is far better to produce a placeholder that engineers can fill in than to produce malformed YAML that will fail at deployment time.

**ABSOLUTE RULE — pipeline `name` fields and stage `name` fields are resource identifiers, NEVER secrets, and MUST NEVER be redacted.** The pipeline's top-level `name` property (e.g., `"[PROD] api-syncer canary"`, `"deploy-to-prod"`, `"run-job-load-service-cr-tag"`) and every stage's `name` property (e.g., `"Deploy api-syncer"`, `"Delete api-sync-job"`, `"Scale Down Canary"`) are deployment resource identifiers. Words such as `api`, `key`, `token`, `service`, `auth`, `credential`, and similar terms that appear in these name fields are part of service and component names — they are NOT secrets, API keys, or credentials. NEVER replace ANY portion of a pipeline name or stage name with `*****` or any other anonymization placeholder unless the source JSON already contains `*****` at that exact location.

**CRITICAL — the Spinnaker pipeline JSON provided to you has ALREADY been pre-anonymized.** Actual secrets such as the Kubernetes cluster name and repository owner have been replaced with specific placeholders like `<redacted-cluster>`, `<redacted-owner>`, and `<redacted-secret-name>`. All other values — including service names like `api-syncer`, `bq-syncer`, `publisher`, `server`, `auth-service`, `key-manager` — are intentionally preserved and are safe to use verbatim. Do NOT apply additional redaction to any value that was not already anonymized in the source JSON with a `<redacted-*>` placeholder.

**Negative example — pipeline name containing "api" incorrectly redacted (FORBIDDEN)**:
```
Pipeline name: "[PROD] api-syncer canary" → WRONG: "[PROD] ***** canary"
Stage name: "Deploy org-0004-api-syncer" → WRONG: "Deploy org-0004-*****"
```
**Correct output** (names must be preserved verbatim):
```
Pipeline name: "[PROD] api-syncer canary"  ← CORRECT
Stage name: "Deploy org-0004-api-syncer"   ← CORRECT
```

**ABSOLUTE RULE — Kubernetes Secret and ConfigMap reference names are NEVER secrets, and MUST NEVER be redacted.** The values of `envFrom[].secretRef.name`, `envFrom[].configMapRef.name`, `volumes[].secret.secretName`, `volumes[].configMap.name`, and `imagePullSecrets[].name` are the NAMES of Kubernetes objects, not the secret data itself. Names like `double-api-token`, `launch-darkly-sdk`, `registry-credentials`, and `api-key-config` identify WHICH object to mount — they are resource identifiers. The presence of words like `token`, `key`, `secret`, `api`, or `credential` in these names does NOT make them confidential. NEVER replace ANY portion of such a name with `*****`. If the JSON has `"secretRef": {"name": "double-api-token"}`, the output MUST contain `name: double-api-token` verbatim.

**Negative example — Kubernetes Secret reference name incorrectly redacted (FORBIDDEN)**:
```yaml
envFrom:
  - secretRef:
      name: double-*****     ← WRONG: "double-api-token" was in the source JSON; the full name must appear verbatim.
```
**Correct output**:
```yaml
envFrom:
  - secretRef:
      name: double-api-token   ← CORRECT: verbatim resource reference name.
```

**CRITICAL — a placeholder comment is better than malformed YAML.** Invalid YAML breaks the migration output. When choosing between flattened YAML and a TODO placeholder, always choose the TODO placeholder.

**CRITICAL — YAML indentation must use exactly 2 spaces per level.** All keys nested under a parent must be indented 2 spaces more than the parent. YAML list items (`-`) must be indented 2 spaces under their list key, and the fields of each list item must be indented 2 additional spaces beyond the dash. For example, the `containers` key under `spec` must be at 4 spaces, each `- ` marker at 6 spaces, and fields of each container at 8 spaces. If the Spinnaker stage's `manifests` array is stored as JSON objects, you MUST re-serialize them with proper YAML indentation — do NOT flatten all keys to column 0.

**CRITICAL — YAML serialization depth-tracking algorithm**: When serializing a JSON manifest to YAML, track the nesting depth of each key explicitly. Assign depth 0 to top-level keys (`apiVersion`, `kind`, `metadata`, `spec`). Each level of nesting adds 1 to the depth; each depth level corresponds to 2 spaces of indentation. For list items under a key at depth N, the dash `-` is at depth N+1 (indented 2*(N+1) spaces) and the child fields of each list item are at depth N+2 (indented 2*(N+2) spaces). Example depths for a Deployment:
* `apiVersion` → depth 0 → 0 spaces
* `metadata` → depth 0 → 0 spaces
* `metadata.labels` → depth 1 → 2 spaces
* `metadata.labels.app` → depth 2 → 4 spaces
* `spec.template.spec` → depth 3 → 6 spaces (spec=0, template=1, spec=2, BUT nested spec under template is depth 3 from root)
* `spec.template.spec.containers` → depth 4 → 8 spaces  
* `spec.template.spec.containers[-]` (list item dash) → depth 4 → 8 spaces (the dash itself is at 8 spaces)
* `spec.template.spec.containers[0].name` → depth 5 → 10 spaces
* `spec.template.spec.containers[0].envFrom` → depth 5 → 10 spaces
* `spec.template.spec.containers[0].envFrom[-]` (list item dash) → depth 5 → 10 spaces
* `spec.template.spec.containers[0].envFrom[0].secretRef` → depth 6 → 12 spaces
* `spec.template.spec.containers[0].envFrom[0].secretRef.name` → depth 7 → 14 spaces

**CronJob-specific YAML depths**: A CronJob has an extra nesting level (`spec.jobTemplate.spec`) compared to a Deployment. Apply the depth-tracking algorithm carefully:
* `spec` → depth 1 → 2 spaces
* `spec.schedule` → depth 2 → 4 spaces  ← not nested under jobTemplate
* `spec.jobTemplate` → depth 2 → 4 spaces
* `spec.jobTemplate.spec` → depth 3 → 6 spaces
* `spec.jobTemplate.spec.template` → depth 4 → 8 spaces
* `spec.jobTemplate.spec.template.spec` → depth 5 → 10 spaces
* `spec.jobTemplate.spec.template.spec.containers` → depth 6 → 12 spaces
* `spec.jobTemplate.spec.template.spec.containers[-]` (dash) → depth 6 → 12 spaces
* `spec.jobTemplate.spec.template.spec.containers[0].name` → depth 7 → 14 spaces
* `spec.jobTemplate.spec.template.spec.containers[0].env[-]` (dash) → depth 7 → 14 spaces
* `spec.jobTemplate.spec.template.spec.containers[0].env[0].name` → depth 8 → 16 spaces

**NEVER collapse multiple depth levels to the same column.** If you find two or more keys at the same column that have a parent-child relationship in the JSON, the YAML is wrong and must be rewritten.

**CRITICAL — the section separator `---` must appear on its own line with a blank line before and after it (`\n\n---\n\n`).** This is critical because Kubernetes YAML manifests also use `---` as a multi-document separator. Within a `Set the step YAML to:` block, `---` is a YAML document separator and must NOT be interpreted as a section separator. A `---` line is only a section separator when it appears with blank lines on both sides (i.e., it is the entire content of its line AND is surrounded by blank lines).

**Negative example — raw YAML as the entire output (FORBIDDEN)**:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: derive-baseline-
  ...
```
← WRONG: This is raw YAML with no enclosing project prompt. It is never a valid response.

**CORRECT** — YAML must always appear inside a complete step prompt:
```
Create a project called "my-service" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Derive baseline deployment from main Deployment". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to Kubernetes. Set the step namespace to org-0001-spinnaker-cj-prod. Set the step description to "Original Spinnaker stage type: deriveBaselineProd. This step derives a baseline state from the main deployment by running a Kubernetes Job."
* Set the step YAML to:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: derive-baseline-
  ...
```
```

# Feeds

The following snippet is an example of an artifact in Spinnaker that is expected to be produced by another pipeline:

```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": {
        "customKind": true,
        "id": "********"
      },
      "displayName": "Docker image",
      "id": "******",
      "matchArtifact": {
        "artifactAccount": "docker-registry",
        "id": "*******",
        "name": "gcr.io/test-prod/test",
        "type": "docker/image"
      },
      "useDefaultArtifact": false,
      "usePriorArtifact": false
    }
  ],
  "name": "Find Artifacts From Execution",
  "pipeline": "******",
  "refId": "1",
  "requisiteStageRefIds": [],
  "type": "findArtifactFromExecution"
}
```

* A feed in Octopus must be created to represent the expected artifact in Spinnaker.
* When the `matchArtifact.type` property is `docker/image`, a feed must be created based on the `matchArtifact.name` property.
* If the `matchArtifact.name` property starts with `gcr.io/`, a feed must be created with the "Google Container Registry" feed type in Octopus:

```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".
```

**CRITICAL — "Google Container Registry" is NOT "GitHub Container Registry"**: When you see `Create a feed called "Google Container Registry"`, this refers to **Google's** container registry at `https://gcr.io/v2/` — NOT GitHub's container registry at `https://ghcr.io`. Do NOT create a feed with the URL `https://ghcr.io` or name it "GitHub Container Registry". The correct feed URL is always `https://gcr.io/v2/` and the correct feed name is always `"Google Container Registry"` for gcr.io registries.

* For other values of `matchArtifact.name` (i.e., when the name does NOT start with `gcr.io/`), a **Docker Feed** must be created. Extract the registry host from the `matchArtifact.name` property (the part before the first `/`) and use it as the feed URL. For example, if the `matchArtifact.name` property is `myregistry.com/myimage`, the feed URL would be `https://myregistry.com`:

```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "<url>".
```

* **CRITICAL**: Do NOT use the pipeline's Docker trigger `registry` field to determine the feed type or URL when `expectedArtifacts` has `docker/image` entries. The `matchArtifact.name` field in `expectedArtifacts` is the ONLY source for the feed URL in that case. The trigger `registry` field must be completely ignored.

**Negative example — wrong vs correct feed when expectedArtifacts has a custom registry:**

Given a pipeline with:
```json
{
  "expectedArtifacts": [
    {
      "matchArtifact": {
        "name": "registry.example.invalid/image-0001",
        "type": "docker/image"
      }
    }
  ],
  "triggers": [
    {
      "registry": "gcr.io",
      "type": "docker"
    }
  ]
}
```

The **WRONG** output (uses Docker trigger registry instead of expectedArtifacts):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".
```

The **CORRECT** output (uses matchArtifact.name from expectedArtifacts):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```

* Feed prompts must appear before the base project prompt in the output.
* You must separate the prompts for feeds with a blank line, three dashes (`---`), and a new blank line.
* Each unique feed URL must only be created once in the output, even if multiple pipelines reference the same registry. Do not emit duplicate feed creation prompts for the same feed URL.

**CRITICAL — deduplication applies ACROSS ALL three feed sources within a single pipeline**: When scanning the three feed sources (1. `expectedArtifacts` docker/image entries, 2. Docker trigger registry fallback, 3. Pubsub trigger `payloadConstraints.tag`), all three sources may produce registry URLs. If two or more sources produce the SAME registry URL for a single pipeline, only ONE feed section must be generated for that URL. Track which URLs have already been emitted and skip any source that would produce a duplicate.

**Worked example — `expectedArtifacts` docker/image AND Pubsub trigger both pointing to the same registry**:

Given a pipeline with:
- `expectedArtifacts` containing `{ "matchArtifact": { "name": "registry.example.invalid/image-0559", "type": "docker/image" } }`
- A Pubsub trigger with `{ "payloadConstraints": { "tag": "registry.example.invalid/image-0562" }, "type": "pubsub" }`

Source 1 produces `https://registry.example.invalid`. Source 3 also produces `https://registry.example.invalid`. Both resolve to the same URL — only ONE feed section must be emitted.

The **WRONG** output (duplicate feed section — FORBIDDEN):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```
← WRONG: The same feed URL was emitted twice from two different sources.

The **CORRECT** output (only ONE feed section):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```


* When a pipeline has NO `expectedArtifacts` entries of `type: "docker/image"` but does have a Docker trigger with a `registry` property, create a feed from that trigger's `registry` value:
  * If `registry` is `gcr.io`, create the "Google Container Registry" feed: `Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".`
  * For any other `registry` value, create a Docker Feed using that value as the host URL: `Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://<registry>".`
* **NOTE**: An `expectedArtifacts` array that is present but empty (`[]`) satisfies the condition "NO `docker/image` entries". A pipeline with `"expectedArtifacts": []` and a Docker trigger **must still** have feed creation applied from the Docker trigger's `registry` field. Do not skip feed creation just because `expectedArtifacts` is an empty array rather than absent.
* **NOTE**: When `expectedArtifacts` is **absent entirely** (the key does not exist in the pipeline JSON), treat it identically to an empty array `[]`. A pipeline with no `expectedArtifacts` key at all and a Docker trigger **must still** have feed creation applied from the Docker trigger's `registry` field.
* **NOTE**: When `expectedArtifacts` contains entries of types OTHER than `docker/image` (e.g., `"github/file"`, `"gcs/object"`) but NO entries of type `"docker/image"`, this still satisfies the condition "NO `docker/image` entries". A pipeline where `expectedArtifacts` has only github/file or gcs/object entries AND has a Docker trigger **must still** have feed creation applied from the Docker trigger's `registry` field.

**ABSOLUTE RULE — `expectedArtifacts: []` (empty array) with Docker trigger MUST produce a feed section**: When the pipeline has `"expectedArtifacts": []` (empty array — NOT absent, but explicitly empty) and a Docker trigger with a `registry` field, a feed section MUST be generated from the Docker trigger's `registry` field. The empty array means there are no docker/image entries, so the fallback to the Docker trigger applies.

**Worked example — `expectedArtifacts: []` (empty) with gcr.io Docker trigger AND pubsub trigger**: The following pipeline has `expectedArtifacts: []` (empty), a Docker trigger with `registry: "gcr.io"`, AND a Pubsub trigger with `payloadConstraints.tag: "registry.example.invalid/image-0504"`. TWO separate feed sections MUST be produced:

```json
{
  "name": "[dev] my-service",
  "disabled": true,
  "expectedArtifacts": [],
  "stages": [
    {
      "account": "<redacted-cluster>",
      "manifestArtifact": { "reference": "gs://example-bucket/storage-1058", "type": "gcs/object" },
      "name": "Deploy (Manifest)",
      "type": "deployManifest"
    }
  ],
  "triggers": [
    { "registry": "gcr.io", "type": "docker", "enabled": false },
    { "payloadConstraints": { "tag": "registry.example.invalid/image-0504" }, "type": "pubsub", "enabled": true }
  ]
}
```

The **CORRECT** output (TWO feed sections — one for GCR from Docker trigger, one for Docker Feed from Pubsub trigger):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a project called "[dev] my-service" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-1058`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-1058. The manifest must be inlined or the step must be reconfigured to read from a supported source."
* The project must be disabled.
```

The **WRONG** output (only ONE feed section — GCR feed is missing because `expectedArtifacts: []` was incorrectly treated as preventing feed creation from Docker trigger):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a project called "[dev] my-service" in the "Default Project Group" project group with no steps.
* The project must be disabled.
```

**Worked example — `expectedArtifacts` with only github/file entries and gcr.io Docker trigger**: The following pipeline has `expectedArtifacts` with only github/file entries but no docker/image entries, and a Docker trigger with `registry: "gcr.io"`. A GCR feed section **MUST** be produced:

```json
{
  "name": "my-service deploy to prod",
  "expectedArtifacts": [
    {
      "defaultArtifact": { "type": "github/file", "reference": "https://example.invalid/url-0001" },
      "matchArtifact": { "type": "github/file" }
    }
  ],
  "stages": [
    {
      "manifestArtifactId": "artifact-github",
      "type": "deployManifest",
      "account": "<redacted-cluster>",
      "name": "Deploy (Manifest)"
    }
  ],
  "triggers": [
    { "registry": "gcr.io", "type": "docker", "enabled": false }
  ]
}
```

**CORRECT output** (GCR feed section is REQUIRED because there are no docker/image entries in expectedArtifacts):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a project called "my-service deploy to prod" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy (Manifest)". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "https://example.invalid/url-0001". Set the File Paths to the resolved artifact name. Set the target tag to Kubernetes.
```

**WRONG output** (no GCR feed section — this is a common mistake when expectedArtifacts has non-docker entries):
```
Create a project called "my-service deploy to prod" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step...
```

**Worked example — absent `expectedArtifacts` key with gcr.io Docker trigger**: The following pipeline has no `expectedArtifacts` key at all and a Docker trigger with `registry: "gcr.io"`. A GCR feed section **MUST** be produced as a separate section before the project prompt:

```json
{
  "name": "my-service deploy to dev",
  "stages": [
    {
      "account": "<redacted-cluster>",
      "cloudProvider": "kubernetes",
      "manifestArtifact": {
        "reference": "gs://example-bucket/manifest.yaml",
        "type": "gcs/object"
      },
      "name": "Deploy (Manifest)",
      "type": "deployManifest"
    }
  ],
  "triggers": [
    {
      "registry": "gcr.io",
      "type": "docker"
    }
  ]
}
```

**CORRECT output** (two separate sections — note the GCR feed section is REQUIRED because `expectedArtifacts` key is absent):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a project called "my-service deploy to dev" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy (Manifest)". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/manifest.yaml`. Set the target tag to Kubernetes. Set the step description to "This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/manifest.yaml. The manifest must be inlined or the step must be reconfigured to read from a supported source."
```

**WRONG output** (no GCR feed section — this is a common mistake when `expectedArtifacts` is absent):
```
Create a project called "my-service deploy to dev" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step...
```

* **IMPORTANT**: Feed prompts are ONLY generated from `expectedArtifacts[].matchArtifact.type == "docker/image"` entries, from Docker trigger `registry` fields, OR from the registry host embedded in Pubsub trigger `payloadConstraints.tag` values. The `manifestArtifact` property on individual stages (regardless of its `type`) does NOT generate any feed prompt. In particular, `manifestArtifact` entries with `"type": "gcs/object"` or `"type": "github/file"` must NEVER trigger feed creation — those are artifact source types for the Kubernetes manifest itself, not Docker container registries.

**CRITICAL — stage-level `requiredArtifacts` and `requiredArtifactIds` MUST NEVER generate feed prompts**: Stages may have a `requiredArtifacts` property (containing artifact objects directly, distinct from `requiredArtifactIds` which contains ID references) that reference Docker images. These are binding hints telling Spinnaker which images must be available before the stage runs. They are NOT feed sources. Feeding from stage-level `requiredArtifacts` or `requiredArtifactIds` is FORBIDDEN — even if the artifact has `"type": "docker/image"` and a recognisable registry hostname. Octopus has no equivalent for the `requiredArtifacts` or `requiredArtifactIds`.

**ALGORITHM — exactly three valid feed sources (scan ONLY these, ignore everything else)**:
1. **`expectedArtifacts[]`** (pipeline-level array): entries where `matchArtifact.type == "docker/image"` → use `matchArtifact.name` to derive the registry host
2. **Docker trigger `registry` field**: used ONLY when `expectedArtifacts` has NO `docker/image` entries (absent, empty `[]`, or contains only non-docker types)
3. **Pubsub trigger `payloadConstraints.tag`**: extract the hostname from the tag value

**Everything else is NOT a feed source**, including:
- `manifestArtifact` on stages
- `requiredArtifacts` on stages
- `requiredArtifactIds` on stages
- `triggers[].expectedArtifactIds`
- Any artifact reference inside a stage's `manifests` property

**CRITICAL — Google Cloud Storage (GCS) paths MUST NEVER be used as Docker registry feed URLs**: GCS paths begin with `gs://` and have the format `gs://<bucket>/<path>`. The bucket name (e.g., `example-bucket` in `gs://example-bucket/storage-0052`) is a Google Cloud Storage bucket identifier — it is NOT a Docker registry hostname and MUST NEVER be used as a feed URL. If you see a `gs://` path anywhere in the pipeline JSON (`expectedArtifacts`, `manifestArtifact`, `manifestArtifactId`-resolved entries, etc.), treat it purely as a Kubernetes manifest source — never derive a Docker feed URL from it.

**Negative example — GCS bucket name extracted as Docker registry (FORBIDDEN)**:

Given a pipeline with `expectedArtifacts` containing only `gcs/object` entries and a Pubsub trigger:
```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": { "reference": "gs://example-bucket/storage-0052", "type": "gcs/object" },
      "matchArtifact": { "reference": "gs://example-bucket/storage-0052", "type": "gcs/object" }
    }
  ],
  "triggers": [
    { "type": "pubsub", "payloadConstraints": { "tag": "registry.example.invalid/image-0022" } }
  ]
}
```

The **WRONG** output (bucket name incorrectly used as feed URL — FORBIDDEN):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://example-bucket".
```

The **CORRECT** output (registry host extracted from `payloadConstraints.tag`, NOT from the GCS path):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```

**CRITICAL — when `expectedArtifacts` has BOTH `gcs/object` AND `docker/image` entries, ONLY the `docker/image` entries determine feeds; the Docker trigger's `registry` field is STILL ignored**: Even when `expectedArtifacts` has a MIX of types (both `gcs/object` and `docker/image` entries), the ONLY feed sources are the `docker/image` entries in `expectedArtifacts`. The Docker trigger's `registry` field must still be completely ignored — it is NOT used as a fallback even when `expectedArtifacts` also contains non-docker entries.

**Negative example — GCR feed incorrectly created from Docker trigger when `expectedArtifacts` has mixed `gcs/object` + `docker/image` entries (COMMON MISTAKE)**:

Given a pipeline with:
```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": { "reference": "gs://example-bucket/storage-0113", "type": "gcs/object" },
      "id": "gcs-artifact-id"
    },
    {
      "matchArtifact": { "name": "registry.example.invalid/image-0037", "type": "docker/image" },
      "id": "docker-artifact-id"
    }
  ],
  "triggers": [
    { "registry": "gcr.io", "type": "docker", "enabled": false }
  ]
}
```

The **WRONG** output (GCR feed incorrectly created from Docker trigger — the presence of `gcs/object` entries does NOT activate the Docker trigger's registry fallback):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```

The **CORRECT** output (ONE feed ONLY from the `docker/image` entry; GCR feed from the Docker trigger is NOT created):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".
```

# Base Project Prompt

This is an example of a pipeline in Spinnaker:

```json
{
  "appConfig": {},
  "application": "app-0001",
  "disabled": true,
  "id": "d8af8c03-39fe-4e9f-8bf8-774614d8315d",
  "index": 2,
  "keepWaitingPipelines": false,
  "lastModifiedBy": "johnsmith",
  "limitConcurrent": true,
  "name": "My Project",
  "roles": [
    "org-0001"
  ],
  "schema": "1",
  "stages": [],
  "triggers": [],
  "updateTs": "1604917677484"
}
```

Pipelines are represented by a project. This is the base prompt to create an empty project in Octopus Deploy with the same name as the Spinnaker application:

```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

The project name MUST be the exact verbatim value of the pipeline `name` field. **CRITICAL — do NOT redact or anonymize the pipeline `name` when using it as the project name**: Words such as `api`, `key`, `token`, `service`, `syncer`, `auth`, or `credential` in the pipeline name are microservice names and deployment identifiers — they are NOT secrets or API keys. For example, a pipeline `"name": "[PROD] api-syncer canary"` must produce `Create a project called "[PROD] api-syncer canary"` verbatim. NEVER replace any portion of the pipeline name with `*****`.

The `limitConcurrent` property of the Spinnaker pipeline has no equivalent setting in Octopus. This value MUST be ignored.  

Other prompts are then appended to the base prompt to create the equivalent project in Octopus Deploy, for example:

```
Create a project called "My Project" in the "Default Project Group" project group with no steps, and then:
* Add a project trigger that runs on a schedule with the following cron expression: "0 0 12 1/1 * ? *". The trigger must be enabled.
* etc
```

If the `description` property of the Spinnaker pipeline is present and non-empty, add the following sentence immediately after the opening "Create a project…" line (before any step bullets):

```
* Set the project description to "<description>".
```

Replace `<description>` with the value of the `description` property in the Spinnaker pipeline.

If the `description` property is absent, `null`, or an empty string (`""`), do **NOT** add `* Set the project description to "".` or any other description line. Only output the description line when the description value is a non-empty string.

**WRONG output** (NEVER add a description line when description is absent or empty):
```
* Set the project description to "".
```

**CORRECT output** for a pipeline with no `description` key or an empty description (the description line is simply absent):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

**CRITICAL — do NOT omit the description line when the description IS present and non-empty**: When the pipeline JSON has a `description` property with a non-empty value, the description line MUST appear in the output. Silently omitting it is a common mistake.

**WRONG output** (description present but omitted — COMMON MISTAKE):
Given a pipeline with `"description": "Manually run the auto exporter to dev"`:
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```
← WRONG: The description line is missing despite the pipeline having a non-empty description.

**CORRECT output** (description present and included):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
* Set the project description to "Manually run the auto exporter to dev".
```

If the `disabled` property of the Spinnaker pipeline is `true`, add the following sentence to the end of the prompt:

```
* The project must be disabled.
```

If the `disabled` property is `false`, absent, or `null`, do **NOT** add `* The project must be disabled.` — only add this line when `disabled` is explicitly `true`.

**IMPORTANT**: The `disabled` property must only be read from the top-level pipeline JSON object. Do not infer project disabled status from any other field (e.g., trigger `enabled` state, stage state, or presence of other flags). A pipeline JSON that has no `disabled` key at all must produce a project that is **not** disabled.

**ABSOLUTE RULE — before writing `* The project must be disabled.`, verify the literal text `"disabled": true` exists as a direct top-level key of the pipeline JSON object**: You must be able to point to `"disabled": true` at the root JSON object level. If you cannot directly locate it, do NOT write the disabled line. None of the following are sufficient substitutes:
* A trigger with `"enabled": false` — this only disables the trigger, not the project
* A stage condition or boolean expression evaluating to false
* A parameter named `suspend`, `disabled`, or similar
* The pipeline name containing words like "disabled" or "inactive"
* The absence of triggers or stages

**Negative example — `disabled: true` incorrectly inferred from Docker trigger `enabled: false` (COMMON MISTAKE)**:

A pipeline may have one or more triggers with `"enabled": false`. This means those triggers are disabled — NOT the project. Given a pipeline with no top-level `"disabled": true` but with a trigger where `"enabled": false`, the following output is **WRONG**:
```
* The project must be disabled.
```
← WRONG: The project must NOT be disabled just because a trigger has `"enabled": false`. The disabled flag must come ONLY from `"disabled": true` at the **top level** of the pipeline JSON object.

The **CORRECT** output for a pipeline with `"triggers": [{"type": "docker", "enabled": false}]` but no top-level `"disabled": true` (the disabled line is simply absent):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

**CRITICAL — do NOT infer disabled status from `parameterConfig` variable names or values**: A pipeline may contain `parameterConfig` entries with names like `cronjob_suspend` or values of `"false"`. These are deployment parameters — they have NOTHING to do with whether the Octopus project itself is disabled. The only source of truth for project disabled status is presence of `"disabled": true` at the **top level** of the pipeline JSON object.

**Negative example — `parameterConfig` with `suspend` values should NEVER trigger the disabled line**:
Given a pipeline with no top-level `disabled` key but with `parameterConfig` entries like:
```json
{
  "name": "deploy-to-prod",
  "parameterConfig": [
    { "name": "cronjob_suspend", "default": "false" },
    { "name": "feature_suspend", "default": "false" }
  ]
}
```
The **WRONG** output (inferring disabled from parameter names — FORBIDDEN):
```
* The project must be disabled.
```
The **CORRECT** output (no disabled line because `"disabled": true` is absent):
```
Create a project called "deploy-to-prod" in the "Default Project Group" project group with no steps.
* Add a project variable called "cronjob_suspend"...
```

Example — pipeline WITHOUT `disabled` field: when the pipeline JSON contains no `disabled` key (e.g., `{"name": "My Project", "stages": [...], "triggers": [...]}`), the output must NOT include `* The project must be disabled.`

**WRONG output** (this line must NEVER appear when `disabled` is absent or `false` from the JSON):
```
* The project must be disabled.
```

**CORRECT output** for a pipeline with no `disabled` key (the disabled line is simply absent — it does not matter whether the pipeline name suggests it is for production, development, or any other environment):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

**Negative example — `disabled: false` (explicitly false) still triggers the disabled line (COMMON MISTAKE)**:

Given a pipeline with `"disabled": false` (the property is present and explicitly set to `false`), the following output is **WRONG**:
```
* The project must be disabled.
```
← WRONG: `disabled: false` means the pipeline is NOT disabled. The `* The project must be disabled.` line MUST appear ONLY when `disabled` is explicitly `true`. It must NEVER appear for `disabled: false`, even though the key is present.

The **CORRECT** output for `"disabled": false` (the disabled line is absent, just as for the absent case):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

**ABSOLUTE RULE — `disabled: true` does NOT skip stage conversion**: Setting `"disabled": true` on a pipeline means ONLY that the project must be disabled in Octopus (i.e., `* The project must be disabled.` is appended). It does NOT affect stage conversion in any way. ALL stages MUST still be converted to their equivalent Octopus steps regardless of whether `disabled` is `true`. Do NOT omit any stage or use "with no steps" just because the pipeline is disabled.

**Negative example — disabled pipeline's stages silently dropped (COMMON MISTAKE)**:

Given a pipeline with `"disabled": true` and one `deployManifest` stage:
```json
{
  "name": "[dev] my-service",
  "disabled": true,
  "expectedArtifacts": [],
  "stages": [
    {
      "account": "<redacted-cluster>",
      "manifestArtifact": { "reference": "gs://example-bucket/storage-1058", "type": "gcs/object" },
      "name": "Deploy (Manifest)",
      "type": "deployManifest"
    }
  ]
}
```

The **WRONG** output (stages silently dropped because `disabled: true` — FORBIDDEN):
```
Create a project called "[dev] my-service" in the "Default Project Group" project group with no steps.
* The project must be disabled.
```

The **CORRECT** output (stage IS converted AND the project is disabled):
```
Create a project called "[dev] my-service" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-1058`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-1058. The manifest must be inlined or the step must be reconfigured to read from a supported source."
* The project must be disabled.
```

**CRITICAL — `* The project must be disabled.` must appear regardless of stage type**: The `disabled: true` flag applies to the project itself. It MUST appear as the very last line regardless of which stage types the pipeline contains (`deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `wait`, `deleteManifest`, `scaleManifest`, etc.) or how many stages there are. A common mistake is to correctly convert all stages but then silently omit the disabled line.

**Negative example — `disabled: true` flag missing when pipeline contains `runJobManifest` stages (CRITICAL MISTAKE)**:

Given a pipeline with `"disabled": true` and one `runJobManifest` stage:
```json
{
  "name": "app-0368-job",
  "disabled": true,
  "expectedArtifacts": [],
  "stages": [
    {
      "account": "<redacted-cluster>",
      "name": "Run Job (Manifest)",
      "refId": "1",
      "requisiteStageRefIds": [],
      "manifestArtifact": {
        "reference": "gs://example-bucket/storage-0042",
        "type": "gcs/object"
      },
      "type": "runJobManifest"
    }
  ]
}
```

The **WRONG** output (disabled line missing even though stage is correctly converted):
```
Create a project called "app-0368-job" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-0042`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Run Job (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-0042. The manifest must be inlined or the step must be reconfigured to read from a supported source."
```
← WRONG: `* The project must be disabled.` is missing despite `"disabled": true` in the pipeline JSON.

The **CORRECT** output (stage IS converted AND the project is disabled):
```
Create a project called "app-0368-job" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-0042`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Run Job (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-0042. The manifest must be inlined or the step must be reconfigured to read from a supported source."
* The project must be disabled.
```

If the pipeline has `"type": "templatedPipeline"`, the following rules apply:

* **DO convert any `stages` from the JSON** — convert all stages using exactly the same rules as for a regular pipeline.
* **DO convert any `notifications` from the JSON** — notification steps are project-level and must be preserved. Notifications in a `templatedPipeline` must be converted using exactly the same rules as for a regular pipeline (see the Notifications section). The `when` array and `message` text must be inspected and Slack Notification steps must be generated for all applicable events.
* DO apply the `disabled` status — add `* The project must be disabled.` when `disabled: true`.
* A template-backed pipeline reference may appear either at `template.reference` or at `_templateRef` on execution-resolved JSON. Treat either non-empty field as the authoritative template reference for placeholder instructions.
* If a `templatedPipeline` has top-level `expectedArtifacts` or top-level `triggers`, process those collections using the normal feed and trigger rules. Do NOT suppress feed creation or trigger conversion merely because the pipeline `type` is `templatedPipeline`.
* Only when a `templatedPipeline` truly has no top-level `expectedArtifacts` entries and no top-level `triggers` should feed and trigger prompts be omitted for that reason.
* If a `templatedPipeline` has a template reference (`template.reference` or `_templateRef`) but the concrete JSON has no non-notification stages, do NOT assume the visible JSON fully describes the deployment behavior. After the notification steps and project variables, add a placeholder step to preserve the missing template-supplied behavior:

```
* Add a "Run a Script" step with the name "Review template-derived pipeline behavior" to the deployment process. Set the script to the following inline PowerShell code: `# TODO: expand the Spinnaker pipeline template "<template reference>" using the templatedPipeline variables before considering this conversion complete.`
```

* Replace `<template reference>` with the verbatim value of the non-empty template reference field (`template.reference` if present, otherwise `_templateRef`).
* If the template-backed pipeline exposes variables that clearly describe automated trigger or feed behaviour (for example `enableAutomatedTrigger`, `dockerRegistryAcc`, `dockerRegistryOrg`, `dockerRegistryRepo`, `pubsubName`, or `tag`) but no concrete trigger entries are present in the JSON, the placeholder step above is REQUIRED even when the execution-resolved JSON already contains concrete deployment stages. Do NOT silently output a deployment-only project and imply that hidden template-supplied trigger/feed behavior has been converted.
* **CRITICAL — execution-resolved `templatedPipeline` JSON may be incomplete even when `stages` are present**: When `_resolvedFrom` indicates an execution-derived view and a template reference is present, the visible `stages` array may describe only the resolved deployment steps while template-defined trigger/feed behavior remains hidden. In that case, if trigger-related templated variables are present but `triggers` is absent or empty, you MUST add the placeholder step after the variables to preserve that missing behavior for manual review.

**IMPORTANT — `templatedPipeline` notifications are REQUIRED**: When a `templatedPipeline` has a `notifications` array, you MUST generate Slack notification steps for it. Do NOT skip notifications just because the pipeline `type` is `templatedPipeline`. The Finish and Complete steps must appear in the correct order: all Slack Notification - Start steps first (if `pipeline.starting` is in `when`), followed by the deployment steps, then Slack Notification - Finish steps (if `pipeline.failed` is in `when`), then Slack Notification - Complete steps (if `pipeline.complete` is in `when`), then the `variables` prompts.

* A `templatedPipeline` entry may contain a `variables` object with deployment configuration. These are added as variables to the project.
* If the `variables` property is absent or empty, do not output any project variable prompts.
* **CRITICAL — copy the `templatedPipeline` project name and every `variables` value verbatim with no anonymization**: Service names and component identifiers such as `api-server`, `auth-service`, `worker`, `backend`, `frontend`, `key-manager`, and similar values are ordinary deployment identifiers, not secrets. Never replace any portion of the pipeline `name` or any templated variable value with `*****` or any other placeholder.
* **ABSOLUTE RULE — the generated output must NEVER introduce `*****` into ANY pipeline or stage name unless the source JSON already contains `*****` at that exact location.** This applies to ALL pipeline types, not just `templatedPipeline`. If the source pipeline name is `Deploy api-server to org-0003-2g-prod-tokyo-01`, the output project name must also contain `api-server`. If `variables.dockerImageName` is `api-server`, the output variable value must also be `api-server`.
* **CRITICAL — templated manifest URL helper variables are authoritative fallbacks when execution-resolved artifact metadata is incomplete**: Execution-resolved `templatedPipeline` JSON often omits the matching `expectedArtifacts` entry for a `manifestArtifactId`. When a `deployManifest` or `runJobManifest` stage has a `manifestArtifactId` that cannot be resolved from the visible JSON, you MUST look for stage-specific helper variables in `variables` before falling back to an opaque artifact-id placeholder.
* Use the following helper-variable fallback order when `manifestArtifactId` cannot be resolved:
  * For `deployManifest`: prefer `deploymentManifestURL`, then `manifestURL`. Also check for stage-name-specific variables that embed the environment or stage in their name: `devManifestURL`, `stgManifestURL`, `stagingManifestURL`, `prodManifestURL`, `productionManifestURL`, `canaryProdManifestURL`, `canaryManifestURL`. Match the helper variable name to the deployment stage name by substring (e.g., a stage named "Deploy Staging" → try `stgManifestURL` or `stagingManifestURL`; a stage named "Deploy Dev" → try `devManifestURL`; a stage named "Deploy Prod (Canary)" → try `canaryProdManifestURL` or `canaryManifestURL`; a stage named "Deploy Prod" → try `prodManifestURL`).
  * For `runJobManifest`: prefer `jobManifestURL`, then `manifestURL`.
* If one of those helper variables is present and its value is a non-empty, non-null string other than the literal `"null"`, treat its value as the authoritative manifest reference for the stage. For example, `gs://...` values use the existing GCS placeholder or cached-manifest rules, while `https://...` values use the existing `github/file` rules.
* **ABSOLUTE RULE — never emit a TODO placeholder that says `downloaded from manifestArtifactId <id>` when a templated manifest URL helper variable is available**. Prefer the concrete helper-variable URL. The opaque artifact ID is not actionable enough for a migration prompt.
* **CRITICAL — when the resolved manifest URL helper variable has the string literal value `"null"` (or a JSON null)**, the stage's manifest URL is not configured in this template instance. In that case: set the YAML Source to "Inline YAML", set the YAML content to `# TODO: manifest URL not configured — set variable to a valid GCS or GitHub path`, set the step description to "The manifest URL for this stage is not configured in this pipeline template instance (variable resolved to null). Configure the manifest URL variable and update the YAML source before deploying.", and **add `The step must be disabled.`** to the step prompt. Do NOT write "loaded from Google Cloud Storage at null" — the word "null" is not a valid GCS path.
* For each key-value pair in `variables`, all values must be converted to quoted strings in the output, including booleans (e.g., `true` → `"true"`, `false` → `"false"`) and numbers (e.g., `3` → `"3"`).
* This is an example of the prompt added to the project to define a project variable.
* Replace `<variable name>` with the name of the variable and `<variable value>` with the string value of the variable:

```
* Add a project variable called "<variable name>" with the value "<variable value>".
```

* The following is a full example of a `templatedPipeline` JSON entry and its expected output:

```json
{
  "application": "app-0015",
  "disabled": true,
  "name": "Deploy cronjob example to dev",
  "notifications": [
    {
      "address": "#pj-example-channel",
      "level": "pipeline",
      "message": {
        "pipeline.complete": { "text": "${execution.name} has completed." },
        "pipeline.failed":   { "text": "${execution.name} has failed." },
        "pipeline.starting": { "text": "${execution.name} has started." }
      },
      "type": "slack",
      "when": ["pipeline.starting", "pipeline.failed", "pipeline.complete"]
    }
  ],
  "stages": [],
  "type": "templatedPipeline",
  "variables": {
    "enableAutomatedTrigger": false,
    "manifestURL": "gs://example-bucket/storage-0420"
  }
}
```

The equivalent prompt for this entry is:

```
Create a project called "Deploy cronjob example to dev" in the "Default Project Group" project group with no steps.
* Add a community step template step with the name "Slack Notification - Start" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the start of the deployment process. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "#pj-example-channel". Set the "ssn_Message" property to "${execution.name} has started."
* Add a community step template step with the name "Slack Notification - Finish" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Only run the step when the previous step has failed. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "#pj-example-channel". Set the "ssn_Message" property to "${execution.name} has failed."
* Add a community step template step with the name "Slack Notification - Complete" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Always run the step. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "#pj-example-channel". Set the "ssn_Message" property to "${execution.name} has completed."
* Add a project variable called "enableAutomatedTrigger" with the value "false".
* Add a project variable called "manifestURL" with the value "gs://example-bucket/storage-0420.
* The project must be disabled.
```

# Triggers

## Cron Triggers

The following snippet is an example of a cron trigger in Spinnaker:

```json
{
  "triggers": [
    {
      "cronExpression": "0 0 12 1/1 * ? *",
      "enabled": true,
      "id": "*****",
      "runAsUser": "*****@managed-service-account",
      "type": "cron"
    }
  ]
}
```

* The equivalent trigger in an Octopus Deploy project is created with the prompt.
* Replace `<cron>` with the value of the `cronExpression` property in the Spinnaker trigger.

```
Add a schedule trigger with the following cron expression: "<cron>". The trigger must be enabled.
```

* There is no equivalent of the `runAsUser` or `id` properties in Octopus Deploy, so they are not included in the prompt.
* **CRITICAL**: A schedule trigger prompt is ONLY generated from a trigger whose `"type"` is `"cron"`. Docker triggers, Pubsub triggers, and Pipeline triggers do NOT generate a schedule trigger prompt. Do NOT fabricate or invent a cron expression — if no `type: "cron"` trigger exists in the pipeline, no schedule trigger prompt is emitted.

## Docker Triggers

The following snippet is an example of a Docker trigger in Spinnaker:

```json
{
  "triggers": [
    {
      "account": "org-0004-appboy-worker-us-dev",
      "enabled": true,
      "organization": "org-0004-appboy-worker-us-dev",
      "registry": "gcr.io",
      "repository": "org-0004-appboy-worker-us-dev/appboy-integration",
      "runAsUser": "b6e10dff-ceaf-4f30-8d85-8bd56e88a3b9@managed-service-account",
      "type": "docker"
    }
}
```

The equivalent trigger in an Octopus Deploy project is created with the prompt:

```
Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be enabled.
```

* If the Docker trigger has `"enabled": false` AND there is no other enabled trigger (such as a pubsub trigger with `"enabled": true`) that also watches for Docker image pushes, use `The trigger must be disabled.` instead of `The trigger must be enabled.` See the **combined Docker + Pubsub worked example** later in this section for the correct behavior when both trigger types are present.
* **CRITICAL — an "Application" channel prompt MUST ALWAYS be included immediately before every external feed trigger prompt**: Without an explicit channel instruction, the Terraform generator will fall back to a hard-coded channel ID (`"Channels-1"`) which is invalid. You MUST always emit the channel line.
  * If the Docker trigger has a **non-empty `tag`** value, determine whether the qualifying stages have actual Docker image package steps:
    * **If at least one qualifying stage has inline Docker image packages** (e.g., a `runJob` stage with `containers[].imageDescription`, or a `deployManifest` stage with a rendered `manifests` array containing `image:` fields referencing Docker images as packages), emit the channel instruction with a version rule:
      ```
      * Add a channel called "Application" to the project and configure a version rule that matches the regex "<tag>" for every step that deploys a Docker image.
      ```
      Replace `<tag>` with the exact verbatim value of the Docker trigger's `tag` property. Do not modify the regex, do not strip anchors like `^` or `$`, and do not add or remove escaping.
    * **CRITICAL EXCEPTION — If ALL qualifying stages are `runJobManifest` or `deployManifest` stages with GCS/GitHub manifest artifacts and qualify for Docker ONLY via runtime-bound artifacts (`requiredArtifactIds`/`requiredArtifacts` resolving to `docker/image`)**, emit the channel instruction WITHOUT a version rule even when the trigger has a non-empty `tag`:
      ```
      * Add a channel called "Application" to the project.
      ```
      These stages produce `Octopus.KubernetesDeployRawYaml` steps that have no package references. Octopus requires channel version rules to reference a package step (`action_package`). Since there are no package steps, a version rule cannot be created and must be omitted to avoid the API error "Version rules must specify a package step".
  * If the Docker trigger has **no `tag`** (the property is absent, `null`, or an empty string `""`), emit the channel instruction without a version rule:
    ```
    * Add a channel called "Application" to the project.
    ```

**Negative example — external feed trigger emitted without the preceding "Application" channel instruction (COMMON MISTAKE)**:

```
* Add a "Deploy Kubernetes YAML" step ...
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be disabled.
```
← WRONG: The "Application" channel instruction is missing. This causes the Terraform generator to use `channel_id = "Channels-1"` which is invalid.

**CORRECT output** (channel instruction always precedes the trigger):

```
* Add a "Deploy Kubernetes YAML" step ...
* Add a channel called "Application" to the project.
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be disabled.
```

* Place the external feed trigger prompt **after** all deployment step prompts (including Slack notification steps) and all variable prompts, but **before** the `* The project must be disabled.` line.

* **CRITICAL**: A Docker trigger in the pipeline JSON does NOT automatically mean the external feed trigger prompt should be generated. The external feed trigger is only valid when at least one deployment step in the project actually deploys a Docker image. Before emitting the external feed trigger prompt, check every deployment stage (`deployManifest`, `runJobManifest`, `runJob`) in the pipeline:
  * A `runJob` stage qualifies if its `containers` array contains an `imageDescription` field.
  * A `deployManifest` or `runJobManifest` stage qualifies if its manifest artifact has `type: "docker/image"`.
  * A `deployManifest` or `runJobManifest` stage ALSO qualifies when the stage has a non-empty cached `manifests` array (or an inline `manifest` object) and the rendered Kubernetes YAML contains at least one container image reference, for example `image: registry.example.invalid/my-app:1.2.3` or `image: gcr.io/my-project/my-app`. This remains true even when the source artifact type is `"gcs/object"` or `"github/file"` because the rendered manifest that Octopus will deploy clearly references a Docker image.
  * If a `deployManifest` or `runJobManifest` stage resolves a `manifestArtifactId` to `gcs/object` or `github/file`, and the stage has a non-empty cached `manifests` array with `image:` fields, it still qualifies as deploying a Docker image. The artifact source describes where the YAML came from; the rendered `manifests` content describes what will actually be deployed.
  * If no qualifying Docker-image steps are found, omit the external feed trigger prompt entirely — even if the pipeline has Docker or Pubsub triggers.
* **CRITICAL — runtime-bound Docker artifacts DO qualify a stage as deploying a Docker image**: A `deployManifest` or `runJobManifest` stage may reference Docker image artifacts through `requiredArtifactIds` or `requiredArtifacts`. If any referenced artifact resolves to `type: "docker/image"`, the stage MUST be treated as deploying a Docker image for external feed trigger purposes, even when the manifest itself comes from `gcs/object` or `github/file`. This preserves the original Spinnaker behaviour where the manifest source and the image source are separate artifacts that are bound together at runtime.

* **CRITICAL — `requiredArtifactIds` / `requiredArtifacts` only qualify when they resolve to Docker images**: Do not treat every required artifact as a Docker image deployment. The stage qualifies only when at least one required artifact resolves to a Docker image artifact. If the required artifacts are empty or resolve only to non-Docker artifacts, the stage does NOT qualify.

* **IMPORTANT**: Creating a feed from a Docker trigger's `registry` field (because `expectedArtifacts` is absent or empty) does **NOT** imply that an external feed trigger should be generated. The two decisions are independent. Even when a GCR or Docker feed is created solely from the trigger's `registry` field, you must still verify that at least one deployment stage qualifies as deploying a Docker image before emitting the external feed trigger prompt.

**ABSOLUTE RULE — omit the external feed trigger when no step deploys or binds a Docker image**: If every `deployManifest`, `runJobManifest`, and `runJob` stage lacks rendered `image:` content, lacks `containers[].imageDescription`, and lacks any `requiredArtifactIds` / `requiredArtifacts` that resolve to `docker/image`, the external feed trigger prompt **MUST NOT** appear in the output — even when a Docker or Pubsub trigger is present, and even when a feed creation prompt is emitted for that trigger.

**IMPORTANT — external feed trigger IS generated even when ALL qualifying stages produce TODO YAML steps**: When stages qualify for the external feed trigger via `requiredArtifactIds` / `requiredArtifacts` resolving to `docker/image` (rather than via inline manifests with `image:` fields), the resulting Octopus steps will have TODO YAML placeholder content and will be disabled. Despite this, the external feed trigger **MUST STILL BE GENERATED** — it acts as a placeholder that preserves the original Spinnaker intent to trigger on Docker image pushes. The trigger will become functional once the TODO steps are resolved and re-enabled.

**Worked example — GCS manifest source with runtime-bound Docker image**:

```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": {
        "reference": "gs://example-bucket/storage-3012",
        "type": "gcs/object"
      },
      "id": "manifest-artifact"
    },
    {
      "matchArtifact": {
        "name": "registry.example.invalid/orders-api",
        "type": "docker/image"
      },
      "id": "docker-artifact"
    }
  ],
  "stages": [
    {
      "type": "deployManifest",
      "name": "Deploy Orders",
      "manifestArtifactId": "manifest-artifact",
      "requiredArtifactIds": ["docker-artifact"]
    }
  ],
  "triggers": [
    { "type": "docker", "registry": "gcr.io", "tag": "^master.*", "enabled": false }
  ]
}
```

The **CORRECT** output preserves the trigger because the stage still binds a Docker image at runtime. However, because the only qualifying stage is a GCS manifest stage (producing a `KubernetesDeployRawYaml` step with no package references), the channel must be created **without a version rule** even though the Docker trigger has a non-empty `tag`:
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a project called "Deploy Orders" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step...
* Add a channel called "Application" to the project.
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be disabled.
```

← Note: The channel has **no version rule** because the `KubernetesDeployRawYaml` step has no package references. Octopus requires version rules to reference a package step (`action_package`). A channel without a version rule is valid and avoids the API error "Version rules must specify a package step".

**Negative example — GCS-only stage with no rendered images and no runtime-bound Docker artifacts**:

```json
{
  "name": "Deploy Workers",
  "stages": [
    {
      "type": "deployManifest",
      "manifestArtifact": {
        "type": "gcs/object",
        "reference": "gs://bucket/worker.yaml"
      }
    }
  ],
  "triggers": [
    {
      "type": "docker",
      "registry": "gcr.io",
      "enabled": false
    }
  ]
}
```

The **CORRECT** output for this pipeline has **no external feed trigger prompt** because no step deploys or binds a Docker image.

## Pubsub Triggers

The following snippet is an example of a Google Pub/Sub trigger in Spinnaker that fires when a Docker image is published:

```json
{
  "triggers": [
    {
      "enabled": true,
      "payloadConstraints": {
        "action": "INSERT",
        "tag": "registry.example.invalid/image-0001"
      },
      "pubsubSystem": "google",
      "runAsUser": "...",
      "subscriptionName": "resource-0001",
      "type": "pubsub"
    }
  ]
}
```

* When a `pubsub` trigger has a `payloadConstraints.tag` value that references a Docker image, treat it as equivalent to a Docker trigger.

**CRITICAL — Pubsub feed URL MUST be extracted from `payloadConstraints.tag`, NOT from any `registry` field**: Unlike Docker triggers, Pubsub triggers have NO `registry` field. The Docker registry for a Pubsub trigger is derived from `payloadConstraints.tag`, which is a full Docker image reference in the format `<registry-host>/<image-path>`. Extract ONLY the hostname (the part before the first `/`) to form the feed URL. For example:
* `payloadConstraints.tag: "registry.example.invalid/image-0022"` → registry host: `registry.example.invalid` → feed URL: `https://registry.example.invalid` → `Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".`
* `payloadConstraints.tag: "gcr.io/my-project/my-image"` → registry host: `gcr.io` → GCR feed: `Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".`

**CRITICAL — when Docker and Pubsub triggers reference DIFFERENT registries, create SEPARATE feed sections**: If a pipeline has both a Docker trigger (`registry: "gcr.io"`) AND a Pubsub trigger (`payloadConstraints.tag: "registry.example.invalid/image-0022"`), these are TWO different registries and each requires its own feed section separated by `---`.

**Worked example — Docker trigger (gcr.io) AND Pubsub trigger (registry.example.invalid) with gcs/object-only expectedArtifacts**:

```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": { "reference": "gs://example-bucket/storage-0052", "type": "gcs/object" },
      "matchArtifact": { "type": "gcs/object" }
    }
  ],
  "triggers": [
    { "type": "docker", "registry": "gcr.io", "enabled": false },
    { "type": "pubsub", "payloadConstraints": { "tag": "registry.example.invalid/image-0022" }, "enabled": true }
  ],
  "stages": [
    { "type": "deployManifest", "manifestArtifact": { "type": "gcs/object", "reference": "gs://example-bucket/storage-0052" }, "name": "Deploy to dev" }
  ]
}
```

The **CORRECT** output (two feed sections — one per unique registry, GCS path is NEVER a feed URL):
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a project called "<pipeline name>" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step...
```

The **WRONG** output (single feed with GCS bucket as URL — FORBIDDEN):
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://example-bucket".
```
* If a pipeline already has a Docker trigger that produces an external feed trigger prompt, do not add a second external feed trigger prompt for the pubsub trigger — they combine into a single prompt:

```
Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be enabled.
```

* Apply the same enabled/disabled rule as for Docker triggers: if the Pubsub trigger has `"enabled": false`, use `The trigger must be disabled.` instead of `The trigger must be enabled.`
* **CRITICAL — combined trigger enabled state when Docker and Pubsub triggers are merged**: When a pipeline has BOTH a Docker trigger AND a Pubsub trigger, and they are combined into a single external feed trigger prompt, use the following rule to determine the enabled state:
  * If **at least one** of the contributing triggers has `"enabled": true`, use `The trigger must be enabled.`
  * Only use `The trigger must be disabled.` when **ALL** contributing triggers have `"enabled": false`.
  * Example: Docker trigger with `"enabled": false` + Pubsub trigger with `"enabled": true` → combined trigger prompt uses `The trigger must be enabled.`
  * Example: Docker trigger with `"enabled": false` + Pubsub trigger with `"enabled": false` → combined trigger prompt uses `The trigger must be disabled.`
* The same **CRITICAL** check applies: only emit the external feed trigger prompt when at least one deployment step actually deploys a Docker image (see the Docker Triggers section above for the qualifying criteria).
* **CRITICAL — just like Docker triggers, a Pubsub-only external feed trigger MUST also be preceded by the "Application" channel instruction** (see the Docker Triggers section for the full rule). When a Pubsub trigger generates the external feed trigger prompt and there is no Docker trigger with a `tag`, emit `* Add a channel called "Application" to the project.` immediately before the external feed trigger prompt.
* There is no equivalent of the `runAsUser`, `subscriptionName`, or `pubsubSystem` properties in Octopus Deploy, so they are not included in the prompt.

**Worked example — combined Docker (disabled, no tag) + Pubsub (enabled) triggers with GCS-manifest stage qualifying via `requiredArtifactIds`**:

Given a pipeline with:
- Docker trigger: `"enabled": false`, `"tag": ""`, `"expectedArtifactIds": ["abc-123"]`
- Pubsub trigger: `"enabled": true`, `"payloadConstraints": {"tag": "registry.example.invalid/image-0050"}, "expectedArtifactIds": ["abc-123"]`
- `expectedArtifacts`: one docker/image artifact with id "abc-123", name "registry.example.invalid/image-0050"
- Stage: `runJobManifest`, `source: "artifact"`, `manifestArtifact.type: "gcs/object"`, `requiredArtifactIds: ["abc-123"]`, no `manifests` array

The stage qualifies for external feed trigger because `requiredArtifactIds` contains the docker/image artifact "abc-123" (per the runtime-bound Docker artifacts rule). The combined trigger is **enabled** because the Pubsub trigger is enabled. The Docker trigger has no tag so the channel has no version rule.

The **CORRECT** output is:
```
Create a feed called "Docker Feed" in Octopus Deploy with a feed URL of "https://registry.example.invalid".

---

Create a project called "<pipeline name>" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-0050`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Run Job (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-0050. The manifest must be inlined or the step must be reconfigured to read from a supported source. NOTE: This step originally required the following Docker images to be bound at runtime by Spinnaker: registry.example.invalid/image-0050." The step must be disabled.
* Add a channel called "Application" to the project.
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be enabled.
```

Key observations:
1. The step is **disabled** because it has TODO YAML content — it cannot deploy successfully until the TODO is resolved
2. The channel has **no version rule** because the Docker trigger has an empty `tag`
3. The external feed trigger is **enabled** because the Pubsub trigger is enabled (at least one contributing trigger is enabled)
4. The external feed trigger IS generated despite the step being a placeholder — it preserves the original Spinnaker intent to trigger on Docker image pushes

## Pipeline Triggers

The following snippet is an example of a pipeline trigger in Spinnaker that fires when another named pipeline completes:

```json
{
  "triggers": [
    {
      "application": "app-0030",
      "enabled": true,
      "pipeline": "1838ff8c-a3d0-416d-94f6-e600003be5f9",
      "runAsUser": "ee3d44f7-3985-4c17-82d9-08d6405fe1c1@managed-service-account",
      "status": [
        "successful",
        "failed",
        "canceled"
      ],
      "type": "pipeline"
    }
  ]
}
```

* Pipeline triggers have no equivalent in Octopus Deploy and must be **completely ignored**. Do not generate any prompt output from a trigger whose `"type"` is `"pipeline"`.
* Do not add any external feed trigger prompt, schedule trigger prompt, or any other trigger-related output for a `"type": "pipeline"` trigger entry.

## Unknown or Missing Trigger Type

If a trigger entry in the `triggers` array has a `type` property that is **absent**, **`null`**, or any value not documented in this file (i.e., not `"cron"`, `"docker"`, `"pubsub"`, or `"pipeline"`), the trigger must be **completely ignored**. Do not generate any schedule trigger, external feed trigger, or any other output for it.

**Example — trigger with no `type` field**:
```json
{ "enabled": true }
```
This trigger entry has no `type` key — it must be silently ignored. Do not infer a trigger type from any other field.

**Example — trigger with an unrecognised `type` value**:
```json
{ "type": "git", "branch": "main", "enabled": true }
```
Because `"git"` is not a documented trigger type, this entry must be silently ignored.


# Notifications

The following snippet is an example of a Slack notification in Spinnaker:

```json
{
  "notifications": [
    {
      "address": "pj-test-service-dev-spinnaker-log",
      "level": "pipeline",
      "message": {
        "pipeline.failed": {
          "text": "Please rerun the pipeline."
        }
      },
      "type": "slack",
      "when": [
        "pipeline.starting",
        "pipeline.failed",
        "pipeline.complete"
      ]
    }
  ]
}
```

* Only process notifications where the `level` property is `"pipeline"`. Notifications with `"level": "stage"` are stage-level and must be completely ignored — do not generate any Slack notification steps from them.
* **IMPORTANT**: The `message.pipeline.starting.text`, `message.pipeline.failed.text`, and `message.pipeline.complete.text` values must be copied verbatim from the Spinnaker pipeline JSON into the `ssn_Message` property. Do not modify, truncate, redact, summarize, or reword the text in any way. Copy the exact string character-for-character. In particular, do NOT add or remove trailing punctuation such as periods (`.`) — if the original text does not end with a period, the output must not end with a period either.

  **Verbatim copy example**: If `message.pipeline.starting.text` is `"deployment started"` (no trailing period), the output MUST be `Set the "ssn_Message" property to "deployment started".` — NOT `Set the "ssn_Message" property to "deployment started.".` (with an added period).

  **CRITICAL — do NOT redact or anonymize notification message text**: Words such as "api", "dev", "prod", "key", "token", "service", or similar terms that appear in notification messages are part of service names and deployment status descriptions — they are NOT secrets, API keys, or credentials. The notification messages must be copied character-for-character with no replacements. Never replace any portion of a notification message with asterisks (`*`) or other anonymization placeholders.

  **Negative example — redaction of service names is FORBIDDEN**: If the original text is `"reviews-api-dev deployment started"`, the output MUST be `Set the "ssn_Message" property to "reviews-api-dev deployment started".` — NOT `Set the "ssn_Message" property to "reviews-***** deployment started".`
* A notification step is ONLY generated for an event if that event appears in the `when` array. If `pipeline.starting` is not in `when`, do not generate a Start step. If `pipeline.failed` is not in `when`, do not generate a Finish step. If `pipeline.complete` is not in `when`, do not generate a Complete step.
* **CRITICAL — `pipeline.completed` and `pipeline.complete` are equivalent event names**: Some Spinnaker pipelines use `"pipeline.completed"` (with a trailing `d`) instead of `"pipeline.complete"` in the `when` array and as message keys. You MUST treat `"pipeline.completed"` as identical to `"pipeline.complete"`. If the `when` array contains `"pipeline.completed"`, generate the Complete step exactly as you would for `"pipeline.complete"`. When looking up the message text, check BOTH `message.pipeline.complete.text` and `message.pipeline.completed.text` — use whichever key is present.

  **Worked example — `pipeline.completed` in `when` array**: Given `"when": ["pipeline.starting", "pipeline.failed", "pipeline.completed"]` and `"message": {"pipeline.completed": {"text": "Done."}}`, you MUST generate all three steps: Start, Finish, and Complete. The Complete step must use `"Done."` as its message text. Do NOT skip the Complete step because the key uses `pipeline.completed` instead of `pipeline.complete`.
* **CRITICAL**: The presence or absence of message text determines ONLY whether the `ssn_Message` property is included inside the step prompt — it does **NOT** determine whether the step itself is generated. If `pipeline.starting` is in `when`, always generate the Start step (with or without `ssn_Message`). If `pipeline.failed` is in `when`, always generate the Finish step. If `pipeline.complete` is in `when`, always generate the Complete step. Do NOT skip a step because its corresponding message text is missing or because only some events have message text defined.
* When the `notifications` array contains multiple pipeline-level entries, each entry independently generates its own set of Start, Finish, and Complete steps. Process every entry in the array — do not stop at the first entry.
* If the `message` property is absent entirely from the notification object, all notification steps are generated without any `ssn_Message` property.
* **IMPORTANT — empty string message text must NOT generate `ssn_Message`**: When `message.pipeline.starting.text`, `message.pipeline.failed.text`, or `message.pipeline.complete.text` is present but is an empty string `""`, treat it the same as absent text — do NOT include `ssn_Message` in the step prompt for that event. An empty `text` value provides no useful notification content and must not be passed through as `ssn_Message = ""`.

**CRITICAL — when `message` is absent, ALL steps in `when` are STILL generated (without `ssn_Message`)**. The absence of `message` only removes the `ssn_Message` line — it does NOT reduce the number of steps generated. If `when` contains `pipeline.starting`, `pipeline.failed`, AND `pipeline.complete`, you MUST still generate all three steps (Start, Finish, Complete), just without any `ssn_Message`. Dropping Finish and/or Complete because `message` is absent is a **common mistake** and is strictly forbidden.

**Negative example — Finish and Complete dropped because `message` is absent (COMMON MISTAKE)**:

Given a notification with `"when": ["pipeline.starting", "pipeline.complete", "pipeline.failed"]` but NO `message` property:
```json
{
  "address": "pj-myteam-spinnaker-log",
  "level": "pipeline",
  "type": "slack",
  "when": ["pipeline.starting", "pipeline.complete", "pipeline.failed"]
}
```

The **WRONG** output (only Start generated — Finish and Complete silently dropped because message is absent):
```
* Add a community step template step with the name "Slack Notification - Start" ... Set the "ssn_Channel" property to "pj-myteam-spinnaker-log".
[Finish and Complete steps MISSING — wrong because pipeline.failed and pipeline.complete are in the when array]
```

The **CORRECT** output (all three steps generated WITHOUT `ssn_Message` since message property is absent):
```
* Add a community step template step with the name "Slack Notification - Start" ... Set the "ssn_Channel" property to "pj-myteam-spinnaker-log".
[... deployment stages ...]
* Add a community step template step with the name "Slack Notification - Finish" ... Only run the step when the previous step has failed. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-myteam-spinnaker-log".
* Add a community step template step with the name "Slack Notification - Complete" ... Always run the step. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-myteam-spinnaker-log".
```
← Note: no `Set the "ssn_Message" property to ...` lines are present (because message is absent), but the steps themselves ARE generated.

**CRITICAL — when `pipeline.starting` is NOT in `when`, no Start step is generated, but Finish and/or Complete steps ARE generated if those events appear in `when`**: A common mistake is to skip ALL notification steps when `pipeline.starting` is absent. Only the Start step is skipped — Finish and Complete steps are still generated based on their presence in `when`.

**Negative example — Finish and Complete silently skipped because `pipeline.starting` is absent (COMMON MISTAKE)**:

Given a notification with `"when": ["pipeline.failed", "pipeline.complete"]` (no `pipeline.starting`) and no `message` property:
```json
{
  "address": "us-sre-alert",
  "level": "pipeline",
  "type": "slack",
  "when": ["pipeline.complete", "pipeline.failed"]
}
```

The **WRONG** output (ALL notification steps skipped because `pipeline.starting` is not in `when`):
```
[no notification steps at all — FORBIDDEN]
```
← WRONG: `pipeline.failed` and `pipeline.complete` ARE in `when`, so Finish and Complete steps MUST be generated.

The **CORRECT** output (NO Start step, but Finish AND Complete ARE generated after deployment stages):
```
[... deployment stages ...]
* Add a community step template step with the name "Slack Notification - Finish" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Only run the step when the previous step has failed. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "us-sre-alert".
* Add a community step template step with the name "Slack Notification - Complete" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Always run the step. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "us-sre-alert".
```
← Note: No Start step (correct — `pipeline.starting` is not in `when`). Finish and Complete steps ARE present (correct — `pipeline.failed` and `pipeline.complete` are in `when`).

* **IMPORTANT — `ssn_Channel` verbatim copy**: The `ssn_Channel` value must be the exact verbatim string from the `address` field of the notification object. Copy it character-for-character with no modification. In particular:
  * If the `address` value begins with `#` (e.g., `"#pj-example-channel"`), the output MUST preserve the `#` prefix.
  * If the `address` value does NOT begin with `#` (e.g., `"ft-architect_jb-productivity"`), the output MUST NOT add a `#` prefix.
  * Do not add, remove, or modify the `#` character or any other part of the channel name.

  **Verbatim copy example**: If `address` is `"ft-architect_jb-productivity"`, the output MUST be `Set the "ssn_Channel" property to "ft-architect_jb-productivity".` — NOT `Set the "ssn_Channel" property to "#ft-architect_jb-productivity".`

The equivalent step in an Octopus Deploy project that replicates the `pipeline.starting` event is created with the prompt:

```
* Add a community step template step with the name "Slack Notification - Start" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the start of the deployment process. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-test-service-dev-spinnaker-log".
```

* If `message.pipeline.starting.text` is present and non-empty, add `Set the "ssn_Message" property to "<text>".` to the end of the Start step prompt, where `<text>` is the value of `message.pipeline.starting.text`. If `message.pipeline.starting.text` is absent or empty, omit the `ssn_Message` property entirely.

* **CRITICAL — Spinnaker SpEL expressions in notification message text**: Spinnaker notification messages may contain Spring Expression Language (SpEL) expressions such as `${trigger.user}`, `${#triggerResolvedArtifactByType("docker/image")["reference"]}`, or `${execution.name}`. These expressions use the `${...}` syntax, which is also used for Terraform string interpolation. When such message text is embedded in Terraform string values, the `$` character MUST be escaped as `$$` to prevent Terraform from attempting to evaluate the expression. The downstream Terraform generator MUST produce `$${ trigger.user }` rather than `${ trigger.user }`. Copy the message text verbatim into the prompt (including all SpEL expressions), but add a parenthetical note `(NOTE: Contains Spinnaker SpEL expressions — convert to Octopus variable syntax, e.g. #{Octopus.Deployment.Trigger.Name}, before use)` appended to the message text.

The equivalent step in an Octopus Deploy project that replicates the `pipeline.failed` event is created with the prompt:

```
* Add a community step template step with the name "Slack Notification - Finish" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Only run the step when the previous step has failed. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-test-service-dev-spinnaker-log". Set the "ssn_Message" property to "Please rerun the pipeline."
```

* The `ssn_Message` value for the Finish step must come from `notifications[].message.pipeline.failed.text`. If `message.pipeline.failed.text` is absent or empty, omit the `ssn_Message` property entirely.

The equivalent step in an Octopus Deploy project that replicates the `pipeline.complete` event is created with the prompt:

```
* Add a community step template step with the name "Slack Notification - Complete" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Always run the step. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-test-service-dev-spinnaker-log". Set the "ssn_Message" property to "Deployment completed."
```

* **IMPORTANT — `pipeline.complete` condition depends on whether `pipeline.failed` is also present**:
  * If BOTH `pipeline.complete` AND `pipeline.failed` are in the `when` array, use `Always run the step.` for the Complete step. This matches the Spinnaker behaviour where the complete notification fires on success and the failed notification fires on failure — so the Complete step should run in all cases.
  * If `pipeline.complete` is in `when` but `pipeline.failed` is **NOT** in `when`, use `Only run the step when the deployment is successful.` instead of `Always run the step.` The Spinnaker `pipeline.complete` event fires only on **success**; using `Always` would incorrectly send the notification on failure too.

* The `ssn_Message` value for the Complete step must come from `notifications[].message.pipeline.complete.text` OR `notifications[].message.pipeline.completed.text` (whichever is present — they are equivalent). If both are absent or empty, omit the `ssn_Message` property entirely. Do NOT fall back to the `pipeline.failed` message text.

* The name of notification steps must be unique. Append a counter the end of step names, like `Slack Notification - Complete 2`, to ensure step names are unique.
* If one or more pipeline-level Slack notification steps are generated for the project, add exactly one variable prompt after the Slack notification steps and before any external feed trigger prompt: `* Add a sensitive project variable called "Project.Slack.WebhookUrl" with the description "Slack webhook URL used by migrated Spinnaker notification steps.".` Do not generate this variable when the pipeline has no qualifying pipeline-level Slack notifications.
* **ABSOLUTE RULE — `Slack Notification - Complete` is NOT the last line when Slack steps exist.** After the final Slack notification step is emitted, you MUST immediately continue with `* Add a sensitive project variable called "Project.Slack.WebhookUrl" ...` unless there were no qualifying pipeline-level Slack notifications. Do not stop the output at the Complete step.
* **ABSOLUTE RULE — when a project has pipeline-level Slack notifications, zero `parameterConfig` entries, no external feed trigger, and `disabled` is false or absent, the Slack webhook variable MUST be the final line of the project block.** In this common case, the correct ending is: Finish step, Complete step, webhook variable. Nothing may be omitted between the Complete step and the end of the project block.

**CRITICAL — the Slack webhook variable is required even when ALL Slack notification steps omit `ssn_Message`**: The decision to create `Project.Slack.WebhookUrl` depends ONLY on whether one or more qualifying pipeline-level Slack notification steps were generated. It does NOT depend on whether any notification has a `message` object or whether any `ssn_Message` property is emitted. If Start, Finish, or Complete Slack steps exist, the sensitive project variable MUST also exist exactly once.

**Negative example — Slack steps generated but webhook variable omitted because `message` is absent (COMMON MISTAKE)**:

Given a pipeline-level Slack notification with:
```json
{
  "address": "mp-fe-deployment",
  "level": "pipeline",
  "type": "slack",
  "when": ["pipeline.starting", "pipeline.complete", "pipeline.failed"]
}
```

The **WRONG** output omits the required sensitive variable:
```
* Add a community step template step with the name "Slack Notification - Start" ... Set the "ssn_Channel" property to "mp-fe-deployment".
* Add a "Deploy Kubernetes YAML" step ...
* Add a community step template step with the name "Slack Notification - Finish" ... Set the "ssn_Channel" property to "mp-fe-deployment".
* Add a community step template step with the name "Slack Notification - Complete" ... Set the "ssn_Channel" property to "mp-fe-deployment".
```
← WRONG: once any pipeline-level Slack notification steps are generated, the output MUST also include `* Add a sensitive project variable called "Project.Slack.WebhookUrl" ...` exactly once.

The **CORRECT** output includes the variable after the Slack steps even though no `ssn_Message` properties are present:
```
* Add a community step template step with the name "Slack Notification - Start" ... Set the "ssn_Channel" property to "mp-fe-deployment".
* Add a "Deploy Kubernetes YAML" step ...
* Add a community step template step with the name "Slack Notification - Finish" ... Set the "ssn_Channel" property to "mp-fe-deployment".
* Add a community step template step with the name "Slack Notification - Complete" ... Set the "ssn_Channel" property to "mp-fe-deployment".
* Add a sensitive project variable called "Project.Slack.WebhookUrl" with the description "Slack webhook URL used by migrated Spinnaker notification steps.".
```

# Stages

## Stage Enabled Rules

* If `stageEnabled.expression` is the boolean `false` or the exact case-insensitive string `"false"`, the stage is hard-disabled and the corresponding Octopus steps must be set to disabled.
* If `stageEnabled.expression` is the boolean `true` or the exact case-insensitive string `"true"`, the stage is always enabled and the corresponding Octopus steps must be set to enabled.
* Only after those exact boolean checks are done may any remaining string-valued `stageEnabled.expression` be treated as a SpEL-style manual-review condition.

## Runtime Artifact Binding Notes

* If a `deployManifest` or `runJobManifest` stage has non-empty `requiredArtifactIds` or `requiredArtifacts` entries that resolve to one or more `docker/image` artifacts, append the following note to the step description: `NOTE: This step originally required the following Docker images to be bound at runtime by Spinnaker: <image 1>, <image 2>, ...`.
* Resolve `requiredArtifactIds` by matching them to `expectedArtifacts[].id`. Resolve `requiredArtifacts` directly from the artifact objects embedded on the stage.
* Build the comma-separated image list from the exact verbatim Docker image names or references present in the artifact definition. Prefer `matchArtifact.name`, then `defaultArtifact.name`, then `matchArtifact.reference`, then `defaultArtifact.reference`.
* If the step already has a description for another reason (for example, the stage name contained special characters or the manifest came from GCS), append the runtime-binding note to the existing description text, separated by a single space. Do not create a second independent step description instruction.

## Deploy Manifest Kubernetes Stage

* The following snippet is an example of a Kubernetes (defined by the `cloudProvider` setting set to `kubernetes`) "Deploy Manifest" stage in Spinnaker:

```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": {
        "id": "d4d013f3-8dc1-4a66-9701-a45ab76534b4",
        "name": "job/batch-generate-listing-suggest-index-dev.yaml",
        "reference": "https://example.invalid/url-0068",
        "type": "github/file",
        "version": "kannan-batch-generate-listing-index"
      },
      "displayName": "job/batch-generate-listing-suggest-index-dev.yaml",
      "id": "462d6bdc-be1d-4479-804b-a0fed60a168a",
      "matchArtifact": {
        "id": "4177409b-33d6-4d35-9647-593a0d3d9feb",
        "name": "job/batch-generate-listing-suggest-index-dev.yaml",
        "type": "github/file"
      },
      "useDefaultArtifact": true,
      "usePriorArtifact": false
    }
  ],
  "stages": [
    {
      "account": "<redacted-cluster>",
      "cloudProvider": "kubernetes",
      "manifestArtifactAccount": "org-0001-ci",
      "manifestArtifactId": "462d6bdc-be1d-4479-804b-a0fed60a168a",
      "moniker": {
        "app": "app-0001"
      },
      "name": "Deploy (Manifest)",
      "refId": "1",
      "relationships": {
        "loadBalancers": [],
        "securityGroups": []
      },
      "requiredArtifactIds": [
        "3a4d16c4-1f46-4165-936e-e71e436ae450"
      ],
      "requisiteStageRefIds": [],
      "skipExpressionEvaluation": false,
      "source": "artifact",
      "type": "deployManifest"
    }
  ]
}
```

* The equivalent step in an Octopus Deploy project is created with the prompt.
* Replace `<reference>` with the `reference` property of the `defaultArtifact` in the Spinnaker stage.
* Replace `<name>` with the `name` property of the `defaultArtifact` in the Spinnaker stage.
* Replace `<account>` with the value of the `account` property in the Spinnaker stage.
* **IMPORTANT**: The `<stage name>` placeholder must be replaced with the exact value of the `name` property from the Spinnaker stage, taking into account the Octopus limitation that step names can only contain letters, numbers, periods, commas, dashes, underscores or hashes. If the stage name contains parentheses `()` or square brackets `[]`, replace them with dashes `-` (e.g., `Deploy (Manifest)` becomes `Deploy -Manifest-`). For every step where the stage name contained parentheses or other special characters, also set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.
* **CRITICAL — do NOT redact or anonymize the stage `name` value when generating the step name**: Words such as `api`, `dev`, `prod`, `key`, `token`, `service`, `syncer`, `auth`, `credential`, or similar terms in stage names are microservice and deployment identifiers — they are NOT secrets. For example, `"Deploy org-0004-api-syncer"` must produce the step name `"Deploy org-0004-api-syncer"` verbatim. NEVER replace any portion of a stage name with `*****`.

**CRITICAL — use dashes `-` NOT underscores `_` when replacing parentheses**: Although underscores are technically valid Octopus step name characters, they are also Markdown formatting characters (e.g., `_text_` renders as italic and strips the underscores). Using underscores in step names that are generated as part of Markdown text causes the underscores to be silently stripped. You MUST use dashes `-` instead. For example, `Deploy (Manifest)` MUST become `Deploy -Manifest-` (with dashes), NOT `Deploy _Manifest_` (with underscores).

**CRITICAL — duplicate step names must be made unique**: Spinnaker allows multiple stages to share the same `name` within a pipeline, but Octopus requires every step name to be unique. After applying the special-character replacement rules to each stage's `name`, scan the generated step names for duplicates. If two or more stages would produce the same step name, append ` 2`, ` 3`, etc. to the second and subsequent occurrences (in the topological/output order) to make them unique. For example, if three stages are each named `Deploy (Manifest)`, the generated Octopus steps must be named `Deploy -Manifest-`, `Deploy -Manifest- 2`, and `Deploy -Manifest- 3`. Apply the same deduplication for all stage types (`deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `wait`, `deleteManifest`, `scaleManifest`, etc.).

* **IMPORTANT — Repository Branch from `defaultArtifact.version`**: When the `defaultArtifact` of the resolved `expectedArtifacts` entry has a `version` field that is non-empty, include `Set the Repository Branch to "<version>".` in the step prompt. This preserves the exact git branch that the Spinnaker pipeline was configured to pull the manifest from. If `defaultArtifact.version` is absent, null, or an empty string, omit the Repository Branch instruction and let the step use the default branch (`main`).

**Worked example — `deployManifest` stage with `defaultArtifact.version` set**:

Given an `expectedArtifacts` entry:
```json
{
  "defaultArtifact": {
    "name": "job/batch-generate-listing-suggest-index-dev.yaml",
    "reference": "https://example.invalid/url-0068",
    "type": "github/file",
    "version": "kannan-batch-generate-listing-index"
  }
}
```

The **CORRECT** step prompt includes the branch:
```
* Add a "Deploy Kubernetes YAML" step ... Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "https://example.invalid/url-0068". Set the File Paths to "job/batch-generate-listing-suggest-index-dev.yaml". Set the Repository Branch to "kannan-batch-generate-listing-index". Set the target tag to Kubernetes.
```

The **WRONG** step prompt omits the branch (defaulting to "main" — FORBIDDEN when the original was a different branch):
```
* Add a "Deploy Kubernetes YAML" step ... Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "https://example.invalid/url-0068". Set the File Paths to "job/batch-generate-listing-suggest-index-dev.yaml". Set the target tag to Kubernetes.
```

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "<reference>". Set the File Paths to "<name>". Set the Repository Branch to "<version>" (only if defaultArtifact.version is non-empty). Set the target tag to <account>.
```

Some `deployManifest` stages do not use `manifestArtifactId` to reference an entry in `expectedArtifacts`. Instead, they embed the artifact directly in a `manifestArtifact` property on the stage itself. For example:

```json
{
  "stages": [
    {
      "account": "<redacted-cluster>",
      "cloudProvider": "kubernetes",
      "manifestArtifact": {
        "artifactAccount": "org-0001-ci",
          "id": "f49fc8fc-48de-4874-b822-92dbe6bb602a",
          "name": "resource-0786",
          "reference": "https://example.invalid/url-1054",
          "type": "github/file"
      },
      "name": "Deploy user-profile worker (dev)",
      "refId": "1",
      "requisiteStageRefIds": [],
      "source": "artifact",
      "type": "deployManifest"
    }
  ]
}
```

* When a stage has a `manifestArtifact` property directly (instead of `manifestArtifactId`), use the `reference` field of `manifestArtifact` as the Repository URL and the `name` field of `manifestArtifact` as the File Paths. If `manifestArtifact.name` is absent, empty, or `null`, use `"custom-resource.yaml"` as the File Paths value.
* **IMPORTANT — Repository Branch from `manifestArtifact.version`**: When the `manifestArtifact` has a `version` field that is non-empty, include `Set the Repository Branch to "<version>".` in the step prompt. This preserves the exact git branch that Spinnaker was configured to pull the manifest from. If `manifestArtifact.version` is absent, null, or an empty string, omit the Repository Branch instruction.
* **GCS artifacts**: When `manifestArtifact.type` is `"gcs/object"`, the artifact reference is a Google Cloud Storage path (e.g., `gs://bucket/path`). GCS paths are NOT valid Git repository URLs and cannot be used as the Repository URL in a "Deploy Kubernetes YAML" step with the "Files from a Git repository" source. Use the following logic:
  * If the stage has a non-empty `manifests` array (a cached copy of the Kubernetes manifest from a previous execution), serialize those manifests to YAML and use that content as the inline YAML for the step. This avoids requiring manual intervention to supply the manifest. The manifest YAML content must be serialized verbatim — do NOT redact, anonymize, or replace any values (names, namespaces, image references, environment variable values, etc.) with asterisks or placeholders. Service names, namespaces, and deployment names that appear in the manifest are Kubernetes resource identifiers, not secrets.
  * **CRITICAL — ConfigMap `data` maps and resource names must remain verbatim too**: Keys and values under `data`, `stringData`, `metadata.name`, `metadata.labels`, `spec.selector`, and `spec.template.metadata.labels` are part of the Kubernetes manifest and MUST be copied exactly as they appear in the JSON. Names like `app-0305-api-v2-prod`, `config-app-0305-prod`, `api`, `service`, `key`, and `token` inside these manifest fields are ordinary identifiers, not secrets, and MUST NEVER be replaced with `*****`.
  * **CRITICAL — Kubernetes reference names in `envFrom`, `volumes`, `volumeMounts`, and `imagePullSecrets` are resource identifiers, NOT secrets**: The values of `envFrom[].secretRef.name`, `envFrom[].configMapRef.name`, `volumes[].secret.secretName`, `volumes[].configMap.name`, `volumeMounts[].name`, and `imagePullSecrets[].name` are Kubernetes object reference names (e.g., `double-api-token`, `app-config`, `registry-credentials`). These names identify which Kubernetes Secret or ConfigMap to mount — they are not the secret data itself. NEVER replace any portion of these reference names with `*****` or any other placeholder. If the source JSON has `"secretRef": {"name": "double-api-token"}`, the output YAML must also have `secretRef:\n  name: double-api-token`, verbatim.
  * **ABSOLUTE RULE — if you cannot preserve a cached manifest verbatim without redacting any field, do NOT emit partially redacted YAML.** Instead, replace the entire YAML body for that step with a single TODO placeholder comment describing that the cached manifest could not be serialized faithfully.
  * When the `manifests` array contains more than one item, serialize the ENTIRE array into a SINGLE multi-document YAML payload for that ONE step. Keep the manifests in their original array order and separate each YAML document with a standalone line containing exactly `---` inside the same fenced `yaml` block.
  * **CRITICAL — `---` between cached manifest documents is a YAML document separator, NOT a prompt-section separator**: When writing the step prompt, keep all documents inside the same `* Set the step YAML to:` block for the same step. Do NOT split the project prompt into multiple prompt sections, and do NOT start a new Octopus step merely because the inline YAML contains `---`.
  * When serializing a `manifests` array or inline `manifest` object to YAML, the YAML block itself MUST use valid 2-space indentation and preserve the JSON nesting exactly. Nested maps like `metadata.annotations`, `spec.template.spec`, and `containers[].env[]` must remain nested in the YAML output. Flat YAML where nested keys are moved to column 0 is invalid and forbidden.
  * **CRITICAL — top-level map values under `data:` or `stringData:` must be indented beneath their parent key**: For a ConfigMap, entries such as `ADMIN_MS_API_SERVICE_ADDR`, `EVENT_LOG_PUBSUB_PROJECT`, and similar keys must appear two spaces under `data:`. They must NEVER be emitted flush-left at column 0.
  * **CRITICAL — after every `---` document separator, the next YAML document must restart at column 0**: Top-level keys such as `apiVersion`, `kind`, `metadata`, and `spec` must begin at column 0 for EACH document in the multi-document payload, while nested keys inside each document must remain indented relative to their own parent.
  * **ABSOLUTE RULE — for cached `manifests` arrays, serialize from the JSON tree depth, not from key encounter order.** Every child key must be indented deeper than its parent. If `metadata` contains `labels`, then `labels` must appear under `metadata`; if `containers[0]` contains `env`, then the `env` list must appear under that container item, not at column 0.
  * **Negative example — cached `manifests` array flattened into invalid YAML (FORBIDDEN)**:

  The **WRONG** output for a deployment manifest with `metadata.annotations`, `metadata.labels`, and `spec.template.spec.containers` is:
  ```yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
  annotations:
  artifact.spinnaker.io/location: app-0101-prod
  labels:
  app: app-0101
  spec:
  template:
  spec:
  containers:
  - name: app-0101
  image: registry.example.invalid/image-0453
  ```
  ← WRONG: `annotations`, `labels`, `template`, `containers`, and `image` lost their nesting and indentation.

  The **CORRECT** output preserves the nesting:
  ```yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    annotations:
      artifact.spinnaker.io/location: app-0101-prod
    labels:
      app: app-0101
  spec:
    template:
      spec:
        containers:
          - name: app-0101
            image: registry.example.invalid/image-0453
  ```
  * **Worked example — cached `manifests` array with a Deployment document followed by a HorizontalPodAutoscaler document**:

  The **WRONG** output is flattened and therefore invalid:
  ```yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
  labels:
  resource-0410: LOW
  name: offer
  namespace: app-0190-dev
  spec:
  template:
  spec:
  containers:
  - env:
  - name: DEBUG
  value: "true"
  image: registry.example.invalid/image-0492
  ---
  apiVersion: autoscaling/v2
  kind: HorizontalPodAutoscaler
  metadata:
  name: offer-hpa
  namespace: app-0190-dev
  spec:
  maxReplicas: 6
  ```

  The **CORRECT** output preserves nesting in BOTH documents:
  ```yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    labels:
      resource-0410: LOW
    name: offer
    namespace: app-0190-dev
  spec:
    template:
      spec:
        containers:
          - env:
              - name: DEBUG
                value: "true"
            image: registry.example.invalid/image-0492
  ---
  apiVersion: autoscaling/v2
  kind: HorizontalPodAutoscaler
  metadata:
    name: offer-hpa
    namespace: app-0190-dev
  spec:
    maxReplicas: 6
  ```
  * **Negative example — ConfigMap `data` and Service metadata flattened to column 0 (FORBIDDEN)**:

  The **WRONG** output is flattened and redacted:
  ```yaml
  apiVersion: v1
  data:
  ADMIN_MS_API_SERVICE_ADDR: <redacted-internal-endpoint>
  EVENT_LOG_PUBSUB_PROJECT: org-0002-dataplatform-jp-prod
  kind: ConfigMap
  metadata:
  labels:
  app: config-app-0305-prod
  name: config-app-0305-prod
  namespace: app-0305-prod
  ---
  apiVersion: v1
  kind: Service
  metadata:
  name: app-0305-*****-prod
  namespace: app-0305-prod
  ```

  The **CORRECT** output preserves both indentation and verbatim names:
  ```yaml
  apiVersion: v1
  data:
    ADMIN_MS_API_SERVICE_ADDR: <redacted-internal-endpoint>
    EVENT_LOG_PUBSUB_PROJECT: org-0002-dataplatform-jp-prod
  kind: ConfigMap
  metadata:
    labels:
      app: config-app-0305-prod
    name: config-app-0305-prod
    namespace: app-0305-prod
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: app-0305-api-v2-prod
    namespace: app-0305-prod
  ```
  * **VERIFICATION RULE — before finalizing any cached-manifest YAML block, inspect at least one nested path from EACH document and confirm the child key is indented deeper than its parent.** For example, verify `metadata.labels` and `spec.template.spec.containers` in the Deployment document, and verify `metadata.name` or `spec.maxReplicas` in the HorizontalPodAutoscaler document. If a child key sits flush with its parent, the YAML must be rewritten.
    * **CRITICAL — preserve list indentation inside cached manifests**: When serializing a `manifests` array or inline `manifest` object that contains lists such as `containers`, `env`, `envFrom`, `volumeMounts`, `imagePullSecrets`, `ports`, or `args`, the list dash `-` must be indented under the parent key and the list item's child properties must be indented two spaces deeper than the dash. For example, under `containers:` the first item must appear as `        - name: ...`, and under `envFrom:` the first item must appear as `            - configMapRef:`. Do NOT emit list items flush with their parent object.
    * **Negative example — CronJob manifest with flattened list indentation (FORBIDDEN)**:

    The **WRONG** output for a cached CronJob manifest is:
    ```yaml
    spec:
      jobTemplate:
        spec:
          template:
            spec:
              containers:
              - envFrom:
                - configMapRef:
                    name: shared-config
                image: registry.example.invalid/image-0872
              imagePullSecrets:
              - name: <redacted-secret-name>
    ```
    ← WRONG: the list items under `containers`, `envFrom`, and `imagePullSecrets` are not indented beneath their parent keys.

    The **CORRECT** output preserves the list nesting:
    ```yaml
    spec:
      jobTemplate:
        spec:
          template:
            spec:
              containers:
                - envFrom:
                    - configMapRef:
                        name: shared-config
                  image: registry.example.invalid/image-0872
              imagePullSecrets:
                - name: <redacted-secret-name>
    ```
    * **ABSOLUTE RULE — after writing the YAML block, visually verify that every nested key is indented deeper than its parent and that every list item is indented under its list key.** If any nested key such as `metadata.name`, `spec.concurrencyPolicy`, `jobTemplate.spec`, `containers`, `envFrom`, or `imagePullSecrets` appears at the same indentation level as its parent key, the YAML is wrong and must be rewritten before finalizing the output.
  * **Negative example — Deployment manifest with `envFrom.secretRef.name` flattened and redacted (FORBIDDEN)**:

    Given a stage with a `manifests` array containing:
    ```json
    {
      "apiVersion": "apps/v1",
      "kind": "Deployment",
      "metadata": { "name": "gateway", "namespace": "app-0126-dev" },
      "spec": {
        "template": {
          "spec": {
            "containers": [
              {
                "name": "gateway",
                "image": "registry.example.invalid/image-0200",
                "envFrom": [
                  { "secretRef": { "name": "double-api-token" } }
                ]
              }
            ]
          }
        }
      }
    }
    ```

    The **WRONG** output flattens indentation AND redacts the secret reference name:
    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
    name: gateway
    namespace: app-0126-dev
    spec:
    template:
    spec:
    containers:
    - name: gateway
    image: registry.example.invalid/image-0200
    envFrom:
    - secretRef:
    name: double-*****
    ```
    ← WRONG: All keys flattened to column 0, and `double-api-token` redacted to `double-*****`.

    The **CORRECT** output preserves full nesting and copies the secret reference name verbatim:
    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: gateway
      namespace: app-0126-dev
    spec:
      template:
        spec:
          containers:
            - name: gateway
              image: registry.example.invalid/image-0200
              envFrom:
                - secretRef:
                    name: double-api-token
    ```
  * When the inline YAML produced from a `manifests` array or inline `manifest` object contains a single clear `metadata.namespace` value, append `Set the step namespace to "<namespace>".` to the step prompt even when `namespaceOverride` is absent. Use the namespace from the rendered manifest, not from the artifact reference.
  * If the stage does NOT have a `manifests` array (or it is empty), set the YAML Source to **"Inline YAML"** and set the YAML content to a placeholder comment `# TODO: replace with manifest downloaded from <reference>`. Set the step description to "This step originally loaded its manifest from Google Cloud Storage at <reference>. The manifest must be inlined or the step must be reconfigured to read from a supported source." If the step already has a step description (because the stage name contained special characters), append this GCS note to the existing description text, separated by a space. **Additionally, add `The step must be disabled.` to the step prompt.** A TODO YAML placeholder is not valid Kubernetes YAML and will fail at deployment time if the step is enabled.
* Do NOT generate a feed prompt from `manifestArtifact` GCS references.
* If the stage has `"source": "text"` and an inline `manifest` object (with no `manifestArtifactId` or `manifestArtifact` reference), serialize the `manifest` object to YAML and use that YAML content as the inline value on the step.
* Replace `<account>` with the value of the `account` property in the stage.

**GCS artifacts via `manifestArtifactId`**: When a stage uses `manifestArtifactId` to reference an entry in `expectedArtifacts`, you MUST:
1. Find the `expectedArtifacts` entry whose `id` matches the stage's `manifestArtifactId` value.
2. Check the `defaultArtifact.type` of that entry.
3. If `defaultArtifact.type` is `"gcs/object"`, **STOP** — do NOT use "Files from a Git repository". Apply the **GCS inline YAML rules** instead.
4. If `defaultArtifact.type` is `"github/file"`, use **"Files from a Git repository"** — use `defaultArtifact.reference` as the Repository URL and `defaultArtifact.name` as the File Paths. If `defaultArtifact.name` is absent, empty, or `null`, use `"custom-resource.yaml"` as the File Paths value. NEVER use "Inline YAML" for a `github/file` artifact. If `defaultArtifact.version` is present and non-empty, also include `Set the Repository Branch to "<version>".` in the step prompt to preserve the configured git branch.

**CRITICAL — check EVERY `deployManifest` stage for `defaultArtifact.version` — do NOT check only the first stage (COMMON MISTAKE)**: When a pipeline has multiple `deployManifest` stages, EACH stage must be checked independently. For each stage, look up its `manifestArtifactId` in `expectedArtifacts`, then check whether the resolved `defaultArtifact.version` is non-empty. If it is, include `Set the Repository Branch to "<version>".` for THAT step. Do NOT stop after processing the first stage — every subsequent stage must be individually inspected.

**Negative example — branch omitted for a later stage (COMMON MISTAKE)**:

Given a pipeline with two `deployManifest` stages:
- Stage A resolves to `defaultArtifact.version = "master"` → branch **included** ✓
- Stage B resolves to `defaultArtifact.version = "master"` → branch **omitted** ✗ ← WRONG

The **WRONG** output (branch checked for Stage A but skipped for Stage B):
```
* Add a "Deploy Kubernetes YAML" step ... "Stage A" ... Set the Repository Branch to "master". ...
* Add a "Deploy Kubernetes YAML" step ... "Stage B" ... Set the File Paths to "path/b.yaml". Set the target tag to Kubernetes.
```
← WRONG: Stage B has `defaultArtifact.version = "master"` but the branch instruction was omitted.

The **CORRECT** output (branch checked and set for BOTH stages):
```
* Add a "Deploy Kubernetes YAML" step ... "Stage A" ... Set the Repository Branch to "master". ...
* Add a "Deploy Kubernetes YAML" step ... "Stage B" ... Set the File Paths to "path/b.yaml". Set the Repository Branch to "master". Set the target tag to Kubernetes.
```

**CRITICAL — `github/file` artifacts ALWAYS use "Files from a Git repository"**: Whether the artifact is referenced via `manifestArtifactId` (resolving to an `expectedArtifacts` entry) or directly via `manifestArtifact`, if `type` is `"github/file"`, the step MUST ALWAYS use `YAML Source: "Files from a Git repository"`. NEVER use "Inline YAML" for a `github/file` artifact. The URL `https://...` in a `github/file` reference is a GitHub URL, NOT a Google Cloud Storage path — do NOT treat it as GCS, do NOT generate a GCS TODO placeholder, and do NOT append a "Google Cloud Storage" NOTE.

**Negative example — `manifestArtifactId` resolving to `github/file` incorrectly treated as GCS (COMMON MISTAKE)**:

Given a stage with `manifestArtifactId` resolving to:
```json
{
  "defaultArtifact": {
    "name": "resource-0018",
    "reference": "https://example.invalid/url-0034",
    "type": "github/file"
  }
}
```

The **WRONG** output (treats `github/file` as GCS — FORBIDDEN):
```
* Add a "Deploy Kubernetes YAML" step ... Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from https://example.invalid/url-0034`. Set the step description to "This step originally loaded its manifest from Google Cloud Storage at "https://example.invalid/url-0034". ...
```
← WRONG: `https://` URLs are GitHub URLs, not GCS paths. `gcs/object` artifacts use `gs://` paths. NEVER confuse the two.

The **CORRECT** output (`github/file` → "Files from a Git repository"):
```
* Add a "Deploy Kubernetes YAML" step ... Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "https://example.invalid/url-0034". Set the File Paths to "resource-0018". ...
```

If the `defaultArtifact.type` of the resolved entry is `"gcs/object"`, apply the **same GCS inline YAML rules** as for a direct `manifestArtifact.type: "gcs/object"` stage:
* Use `defaultArtifact.reference` as the GCS path.
* If the stage has a non-empty `manifests` array, serialize those manifests to YAML as the inline YAML content.
* If there is no `manifests` array (or it is empty), set the YAML Source to **"Inline YAML"** and set the YAML content to `# TODO: replace with manifest downloaded from <reference>`. Set the step description using the same GCS note as for direct GCS stages. **Additionally, add `The step must be disabled.` to the step prompt**, since the TODO placeholder is not valid Kubernetes YAML and will fail at deployment time if the step is enabled.
* If the stage has a non-empty `manifests` array with a single clear `metadata.namespace`, append `Set the step namespace to "<namespace>".` using the namespace from the rendered manifest.
* **CRITICAL**: A stage that resolves via `manifestArtifactId` to a `gcs/object` expected artifact DOES qualify as deploying a Docker image if ANY of the following are true: (a) its rendered `manifests` array contains one or more `image:` fields, OR (b) it has non-empty `requiredArtifactIds` or `requiredArtifacts` entries that resolve to `docker/image` artifacts (consistent with the global rule at the Docker Triggers section above). In case (b), the resulting Octopus step will have TODO YAML content and should be marked as disabled — but the external feed trigger IS still generated to preserve the original Spinnaker intent.

**ABSOLUTE RULE — `manifestArtifactId` resolving to GCS MUST NEVER produce "Files from a Git repository"**: Regardless of whether the artifact is referenced via `manifestArtifactId` or directly via `manifestArtifact`, a `gcs/object` artifact reference MUST ALWAYS produce an "Inline YAML" step — never a "Files from a Git repository" step. The `gs://` paths are Google Cloud Storage paths, not Git repository URLs, and using them as Repository URLs is incorrect and will cause deployment failures.

**Negative example — `manifestArtifactId` resolving to GCS (COMMON MISTAKE)**:

Given a pipeline with:
```json
{
  "expectedArtifacts": [
    {
      "defaultArtifact": {
        "name": "gs://example-bucket/storage-2091",
        "reference": "gs://example-bucket/storage-2091",
        "type": "gcs/object"
      },
      "id": "artifact-dev"
    }
  ],
  "stages": [
    {
      "account": "<redacted-cluster>",
      "manifestArtifactId": "artifact-dev",
      "name": "Deploy Dev",
      "type": "deployManifest"
    }
  ]
}
```

The **WRONG** output (uses "Files from a Git repository" with a `gs://` URL — this will fail):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Dev". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "gs://example-bucket/storage-2091. Set the File Paths to "gs://example-bucket/storage-2091. Set the target tag to Kubernetes.
```

The **CORRECT** output (resolves via `manifestArtifactId` to GCS → inline YAML):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Dev". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-2091`. Set the target tag to Kubernetes. Set the step description to "This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-2091. The manifest must be inlined or the step must be reconfigured to read from a supported source."
```

## Namespace Override for Deploy Manifest Stages

Some `deployManifest` stages include a `namespaceOverride` property that overrides the Kubernetes namespace for the deployed manifest:

```json
{
  "type": "deployManifest",
  "name": "Deploy (Manifest)",
  "namespaceOverride": "org-0001-product-catalog-jp-dev",
  "manifestArtifact": { "type": "gcs/object", "reference": "gs://example-bucket/storage-2053" }
}
```

* If the `namespaceOverride` property is present and non-empty, append `Set the step namespace to "<namespaceOverride>".` to the step prompt. Replace `<namespaceOverride>` with the value of the `namespaceOverride` property.
* If the `namespaceOverride` property is absent, `null`, or an empty string, do NOT add any namespace annotation.

**Example — `deployManifest` stage with `namespaceOverride`**:

The **CORRECT** output for a stage with `"namespaceOverride": "org-0001-product-catalog-jp-dev"`:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-2053`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest). This step originally loaded its manifest from Google Cloud Storage at gs://example-bucket/storage-2053. The manifest must be inlined or the step must be reconfigured to read from a supported source." Set the step namespace to "org-0001-product-catalog-jp-dev".
```

The **WRONG** output (namespace annotation silently omitted):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_". Set the YAML Source to "Inline YAML". ...
[Missing: Set the step namespace to "org-0001-product-catalog-jp-dev".]
```

## Run Job Manifest Stage

Stages with `"type": "runJobManifest"` represent Kubernetes job executions and must be converted using exactly the same rules as `deployManifest` stages. Apply the artifact reference logic identically:

* If the stage has a `manifestArtifactId` property, look up the matching entry in `expectedArtifacts` by `id` and use `defaultArtifact.reference` as the Repository URL and `defaultArtifact.name` as the File Paths. If `defaultArtifact.name` is absent, empty, or `null`, use `"custom-resource.yaml"` as the File Paths value. If `defaultArtifact.version` is present and non-empty, include `Set the Repository Branch to "<version>".` in the step prompt.
* If the stage has a direct `manifestArtifact` property, use `manifestArtifact.reference` as the Repository URL and `manifestArtifact.name` as the File Paths. If `manifestArtifact.name` is absent, empty, or `null`, use `"custom-resource.yaml"` as the File Paths value. If `manifestArtifact.version` is present and non-empty, include `Set the Repository Branch to "<version>".` in the step prompt.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).

The resulting prompt must follow exactly the same rules as a `deployManifest` stage, including the stage name transformation rules.

**IMPORTANT**: The `<stage name>` placeholder must follow the same rules as `deployManifest` stages: if the stage name contains parentheses `()`, replace them with dashes `-` (e.g., `Run Job (Manifest)` becomes `Run Job -Manifest-`). For every step where the stage name contained parentheses or other special characters, also set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.

**Negative example — `runJobManifest` stage name with parentheses not converted to dashes (COMMON MISTAKE)**:

Given a `runJobManifest` stage with `"name": "Run Job (Manifest)"`, the **WRONG** output preserves the parentheses:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job (Manifest)". ...
```

The **CORRECT** output converts parentheses to dashes and adds a step description:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job -Manifest-". ... Set the step description to "Original Spinnaker stage name: Run Job (Manifest)".
```

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "<reference>". Set the File Paths to "<name>". Set the target tag to <account>.
```

## Manual Judgment Stage

The following is an example of a `manualJudgment` stage in Spinnaker:

```json
{
  "stages": [
    {
      "failPipeline": true,
      "judgmentInputs": [],
      "name": "Manual Judgment",
      "notifications": [],
      "refId": "3",
      "requisiteStageRefIds": [],
      "type": "manualJudgment"
    }
  ]
}
```

* A `manualJudgment` stage represents a human approval gate. The equivalent step in an Octopus Deploy project is a "Manual Intervention" step:

```
* Add a "Manual Intervention" step with the name "<stage name>" to the deployment process. Set the instructions to "<instructions>".
```

* Replace `<stage name>` with the `name` property of the stage after applying the same step-name character rules as other stages. If the original `manualJudgment` stage name contains parentheses `()` or square brackets `[]`, replace them with dashes `-` in the generated step name and add `Set the step description to "Original Spinnaker stage name: <original name>".` to preserve the original name.
* Replace `<instructions>` with the `instructions` property of the stage. If the `instructions` property is absent or empty, use `"Please review and approve."` as the default instructions text.
* **IMPORTANT — `stageTimeoutMs` preservation**: When a `manualJudgment` stage has a `stageTimeoutMs` property, convert the value from milliseconds to minutes (divide by 60000) and append `NOTE (migration): The original Spinnaker stage had a timeout of <N> minutes (stageTimeoutMs: <value>). Configure a Manual Intervention timeout in Octopus if required.` to the step description. If the stage already has a description (because the name contained special characters), append this note after the existing description text, separated by a space. For example, a `stageTimeoutMs` of `1800000` (30 minutes) becomes: `NOTE (migration): The original Spinnaker stage had a timeout of 30 minutes (stageTimeoutMs: 1800000). Configure a Manual Intervention timeout in Octopus if required.`

**Negative example — `manualJudgment` stage name keeps invalid parentheses (COMMON MISTAKE)**:

Given a `manualJudgment` stage with `"name": "Manual Judgment (Canary)"`, the **WRONG** output preserves the invalid step name:
```
* Add a "Manual Intervention" step with the name "Manual Judgment (Canary)" to the deployment process. Set the instructions to "Please review and approve.".
```

The **CORRECT** output uses the dash-replaced name and preserves the original in the description:
```
* Add a "Manual Intervention" step with the name "Manual Judgment -Canary-" to the deployment process. Set the instructions to "Please review and approve.". Set the step description to "Original Spinnaker stage name: Manual Judgment (Canary)".
```

* If the `judgmentInputs` array is non-empty, append the judgment options to the instructions text. Extract the `value` property from each entry and list them as a comma-separated note. For example, if `judgmentInputs` is `[{"value": "Continue"}, {"value": "Rollback"}]`, append ` Available options: Continue, Rollback.` to the instructions text.

  **Example — `judgmentInputs` with options**:

  Given:
  ```json
  {
    "instructions": "Review the deployment.",
    "judgmentInputs": [{"value": "Continue"}, {"value": "Rollback"}]
  }
  ```

  The instructions must be:
  ```
  Set the instructions to "Review the deployment. Available options: Continue, Rollback."
  ```

  If `instructions` is absent or empty and `judgmentInputs` is non-empty:
  ```
  Set the instructions to "Please review and approve. Available options: Continue, Rollback."
  ```

**IMPORTANT — Spinnaker SpEL expressions in `instructions`**: Spinnaker's pipeline expression language uses the syntax `${ ... }` (e.g., `${ trigger['tag'] }`, `${ parameters['key'] }`, `${execution.name}`). These expressions are Spinnaker-specific and do NOT evaluate in Octopus Deploy. When the `instructions` property contains such patterns, copy the text verbatim AND append a parenthetical note so the operator knows to convert them. For example:

**Original Spinnaker instructions**: `"Image: ${ trigger['tag'] }"`

**WRONG** (copied verbatim with no warning — the expression will not evaluate in Octopus):
```
Set the instructions to "Image: ${ trigger['tag'] }".
```

**CORRECT** (verbatim copy with conversion notice appended):
```
Set the instructions to "Image: ${ trigger['tag'] } (NOTE: Contains Spinnaker SpEL expressions — convert to Octopus variable syntax, e.g. #{Octopus.Deployment.Trigger.Name}, before use)".
```

**CRITICAL — `judgmentInputs` are strictly stage-specific — never copy options from one `manualJudgment` stage to another**: When generating the instructions text for a `manualJudgment` step, read `judgmentInputs` EXCLUSIVELY from that stage's own JSON object. A stage with `"judgmentInputs": []` (empty array) or without a `judgmentInputs` key MUST receive NO "Available options:" suffix in its instructions — even if another `manualJudgment` stage in the SAME pipeline has non-empty `judgmentInputs`.

**Negative example — judgment options from stage B incorrectly applied to stage A (COMMON MISTAKE)**:

Given a pipeline with two `manualJudgment` stages where only refId 4 has judgment options:

```json
{
  "stages": [
    {
      "name": "Manual Judgment",
      "refId": "2",
      "judgmentInputs": [],
      "requisiteStageRefIds": [],
      "type": "manualJudgment"
    },
    {
      "name": "Manual Judgment (Deploy All)",
      "refId": "4",
      "judgmentInputs": [{"value": "Deploy all"}, {"value": "Delete canary deployment"}],
      "requisiteStageRefIds": ["3"],
      "type": "manualJudgment"
    }
  ]
}
```

The **WRONG** output (refId 2's step incorrectly shows the options from refId 4):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ... Set the instructions to "Please review and approve. Available options: Deploy all, Delete canary deployment."
← WRONG: refId 2 has judgmentInputs: [] — it must NOT show any "Available options:" text
```

The **CORRECT** output (each stage uses only its own `judgmentInputs`):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ... Set the instructions to "Please review and approve."
← CORRECT: refId 2 has empty judgmentInputs — no options text
...
* Add a "Manual Intervention" step with the name "Manual Judgment -Deploy All-" ... Set the instructions to "Please review and approve. Available options: Deploy all, Delete canary deployment."
← CORRECT: refId 4 has non-empty judgmentInputs — options listed only here
```

## Kubernetes Run Job Stage

* The following snippet is an example of a Kubernetes (defined by the `cloudProvider` setting set to `kubernetes`) "Run Job" stage in Spinnaker:

```json
{
    "stages": [
      {
        "account": "BOREALIS",
        "annotations": {},
        "application": "app-0001",
        "cloudProvider": "kubernetes",
        "cloudProviderType": "kubernetes",
        "containers": [
          {
            "args": [],
            "command": [],
            "envFrom": [],
            "envVars": [
              {
                "name": "BOREALIS_APP_ID_PRODUCTION",
                "value": "6102AREHZ4"
              },
              {
                "envSource": {
                  "secretSource": {
                    "key": "dev-write-api-key",
                    "optional": true,
                    "secretName": "org-0004-BOREALIS-integration-secrets"
                  }
                },
                "name": "BOREALIS_API_KEY_PRODUCTION"
              },
              {
                "name": "BOREALIS_INDEX_NAME_PRODUCTION",
                "value": "custom_generated_listing_suggestions_v1"
              },
              {
                "name": "GCS_BUCKET",
                "value": "org-0004-BOREALIS-integration-dev"
              },
              {
                "name": "FOLDER_NAME",
                "value": "listing-name-suggestions-dev-2020-04-15"
              },
              {
                "name": "FOLDER_DESTINATION",
                "value": "listing-name-suggestions-dev-completed-2020-04-15"
              },
              {
                "name": "BUFFER_SIZE",
                "value": "100"
              },
              {
                "name": "JOB_SIZE",
                "value": "1000"
              },
              {
                "name": "CHUNK_SIZE",
                "value": "500"
              },
              {
                "name": "WAIT_TIME",
                "value": "1ms"
              },
              {
                "name": "DRY_RUN",
                "value": "false"
              }
            ],
            "imageDescription": {
              "account": "resource-0033",
              "imageId": "registry.example.invalid/image-0078",
              "registry": "gcr.io",
              "repository": "org-0004-artifacts/BOREALIS-batch-copy-suggestions-from-gcs",
              "tag": "pr-222"
            },
            "imagePullPolicy": "ALWAYS",
            "limits": {},
            "name": "batch-for-copy-suggestions-from-gcs",
            "ports": [
              {
                "containerPort": 80,
                "name": "http",
                "protocol": "TCP"
              }
            ],
            "requests": {},
            "volumeMounts": []
          }
        ],
        "dnsPolicy": "ClusterFirst",
        "labels": {},
        "name": "copy-suggestions-from-gcs",
        "namespace": "org-0004-BOREALIS-worker",
        "nodeSelector": {},
        "overrideTimeout": true,
        "refId": "1",
        "requisiteStageRefIds": [],
        "stageTimeoutMs": 36000000,
        "type": "runJob",
        "volumeSources": []
      }
    ]
}
```

* The equivalent step in an Octopus Deploy project is created with the following prompt.
* You must replace `<Kubernetes manifest from Spinnaker stage>` with the `containers` array in the Spinnaker stage converted to a Kubernetes manifest format, complete with the `apiVersion`, `kind`, `metadata`, and `spec` fields.
* You must replace `<account>` with the value of the `account` property in the Spinnaker stage.
* You must replace the `<namespace>` with the value of the `namespace` property in the Spinnaker stage.

````
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "copy-suggestions-from-gcs". Set the "YAML" property to the Kubernetes manifest in the Spinnaker stage. Only run the step when the previous step has succeeded, with the target tag of <account>.
* Set the step namespace to <namespace>
* Set the step YAML to:

```yaml
<Kubernetes manifest from Spinnaker stage>
```
````

**ABSOLUTE RULE — `runJob` stages with a `containers` array MUST ALWAYS use inline YAML**: A `runJob` stage whose manifest is defined by its `containers` array (i.e., it has NO `manifestArtifactId` and NO `manifestArtifact` property) must ALWAYS serialize the `containers` array to a Kubernetes Job manifest and output it as inline YAML in the step prompt. NEVER use "Files from a Git repository" for such a stage. NEVER use the pipeline's trigger `repository` field or any other unrelated source as the YAML source. The Kubernetes manifest must be generated from the `containers` array, wrapped in a `Job` manifest structure (`apiVersion: batch/v1`, `kind: Job`, `metadata`, `spec`).

**Negative example — `runJob` with containers converted to "Files from a Git repository" (FORBIDDEN)**:

Given a `runJob` stage with:
```json
{
  "containers": [
    {
      "imageDescription": { "registry": "gcr.io", "repository": "my-org/my-image" },
      "name": "my-job-container"
    }
  ],
  "name": "Run Job",
  "namespace": "my-namespace",
  "account": "my-cluster",
  "type": "runJob"
}
```

The **WRONG** output (uses "Files from a Git repository" — this is forbidden for `runJob` stages):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "my-org/my-image". ...
```

The **CORRECT** output (converts containers to a Kubernetes Job manifest inline):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job". Only run the step when the previous step has succeeded, with the target tag of my-cluster.
* Set the step namespace to my-namespace
* Set the step YAML to:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: run-job
  namespace: my-namespace
spec:
  template:
    spec:
      containers:
        - name: my-job-container
          image: gcr.io/my-org/my-image
      restartPolicy: Never
```
```

**CRITICAL — runJob YAML MUST be properly indented**: The Kubernetes manifest generated from a `runJob` stage's `containers` array MUST use correct YAML indentation (2 spaces per level). Malformed or flat YAML (where all keys appear at column 0 without proper nesting) is INVALID and will cause deployment failures. The following rules apply:

* `apiVersion`, `kind`, `metadata`, and `spec` are top-level keys (0 indent)
* `metadata.name` and `metadata.namespace` are indented 2 spaces
* `spec.template` is indented 2 spaces
* `spec.template.spec` is indented 4 spaces  
* `spec.template.spec.containers` is indented 6 spaces
* Each container entry starts with `- name:` at 8 spaces
* Container properties (`image`, `env`, etc.) are at 10 spaces
* `spec.template.spec.restartPolicy` is at 8 spaces

**Negative example — runJob YAML with malformed (flat) indentation (FORBIDDEN)**:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
name: my-job
namespace: my-namespace
spec:
template:
spec:
containers:
- name: my-container
image: registry.example.com/my-image:latest
restartPolicy: Never
```
← WRONG: All keys are at the same indentation level. This is invalid YAML.

The **CORRECT** output (proper 2-space indentation at every level):
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: my-job
  namespace: my-namespace
spec:
  template:
    spec:
      containers:
        - name: my-container
          image: registry.example.com/my-image:latest
      restartPolicy: Never
```

## Run Pipeline Stage

* The following snippet is an example of a "Run Pipeline" stage in Spinnaker:

```json
{
    "stages": [
      {
          "application": "<service-name>",
          "failPipeline": true,
          "name": "Run \"[DEV] Deploy Sandbox API\"",
          "pipeline": "1067496e-afd0-4260-be13-d388586ae53c",
          "pipelineParameters": {},
          "refId": "2",
          "requisiteStageRefIds": [
            "1"
          ],
          "restrictExecutionDuringTimeWindow": false,
          "type": "pipeline",
          "waitForCompletion": true
        }
    ]
}
```

* The equivalent step in an Octopus Deploy project is created with the prompt:

```
* Add a "Deploy a Release" step to the deployment process. Set the "Project" property to "[DEV] Deploy Sandbox API". Set the "Wait for deployment to complete" property to true. Only run the step when the previous step has succeeded.
```

* You must attempt to extract the name of the child project from the `name` property of the stage. In the example above, the child project name is "[DEV] Deploy Sandbox API".

* For every child project that the "Deploy a Release" step depends on, add the following prompt at the start of the output:

```
Create a project called "<child project name>" in Octopus Deploy with no steps.
```

* You must separate the prompts for each child project with a blank line, three dashes (`---`), and a new blank line.

## Wait Stage

* The following snippet is an example of a "Run Pipeline" stage in Spinnaker:

```json
{
    "stages": [
      {
        "name": "Wait for dev deployments (13min)",
        "refId": "5",
        "type": "wait",
        "waitTime": 780
      }
    ]
}
```

* The equivalent step in an Octopus Deploy project is created with the following prompt.
* Replace `<seconds>` with the `waitTime` property in the Spinnaker stage.
* Replace `<name>` with the `name` property in the Spinnaker stage after applying the same special-character replacement rules as `deployManifest` stages. If the wait stage name contains parentheses `()` or square brackets `[]`, replace them with dashes `-` in the generated step name.
* If the original wait stage name contained parentheses or square brackets, also append `Set the step description to "Original Spinnaker stage name: <original name>".` to preserve the original name.

```
* Add a "Run a Script" step with the name "<name>" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds <seconds>`
```

**Negative example — wait step name keeps parentheses (COMMON MISTAKE)**:

Given:
```json
{
  "type": "wait",
  "name": "Wait (15min)",
  "waitTime": 900
}
```

The **WRONG** output preserves the invalid step name characters:
```
* Add a "Run a Script" step with the name "Wait (15min)" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds 900`
```

The **CORRECT** output uses the dash-replaced step name and preserves the original in the description:
```
* Add a "Run a Script" step with the name "Wait -15min-" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds 900`. Set the step description to "Original Spinnaker stage name: Wait (15min)".
```

## Stage Conditions (`stageEnabled`)

Some Spinnaker stages have a `stageEnabled` property that controls whether the stage executes based on a condition:

```json
{
  "stageEnabled": {
    "expression": "${ #judgment(\"Manual Judgment\").equals(\"Continue\")}",
    "type": "expression"
  }
}
```

* When `stageEnabled.expression` is `false` (a boolean literal, not a string), the stage is hard-disabled. **Convert the stage, but mark the corresponding Octopus step as disabled.** Do not drop the stage from the dependency graph.
* When `stageEnabled.expression` is `true` (a boolean literal), the stage is always enabled — treat it as a normal stage.
* **ABSOLUTE RULE — before treating any string-valued `stageEnabled.expression` as a SpEL expression, first check for the exact case-insensitive string values `"true"` and `"false"`.** These exact string values are NOT manual-review expressions. They are hard boolean outcomes.
* When `stageEnabled.expression` is the exact string `"false"` or `"False"` with no surrounding expression syntax, treat it the same as the boolean literal `false`: the stage is hard-disabled and the corresponding Octopus steps must be disabled.
* When `stageEnabled.expression` is the exact string `"true"` or `"True"` with no surrounding expression syntax, treat it the same as the boolean literal `true`: the stage is always enabled and must be converted normally.
* When `stageEnabled.expression` resolves to false (either the boolean literal or the exact string forms above), the corresponding Octopus steps must be disabled.
* **CRITICAL — hard-disabled stages still participate in dependency ordering and parallel grouping**: A disabled stage still occupies its original place in the stage graph. It can be part of a parallel root group, and later stages may still need `Set the start trigger to "Wait for all previous steps to complete, then start"` because they depend on a disabled stage. Do NOT remove hard-disabled stages from the dependency graph when computing output order or start-trigger annotations.
* When `stageEnabled.expression` is any other **string** (for example a SpEL expression like `${ ... }`), there is no direct Octopus Deploy equivalent. **Convert the stage normally** but append the following NOTE to the step description. If the step already has a description, append this text to the existing description separated by a single space; do NOT emit a second independent description instruction:

  ```
  Set the step description to include: `This step has a Spinnaker conditional execution condition that has no direct Octopus Deploy equivalent: stageEnabled.expression = "<expression>". Manually review whether this step should be conditionally disabled or use an Octopus run condition.`
  ```

  Replace `<expression>` with the verbatim value of `stageEnabled.expression`.

**Example — `stageEnabled.expression` as the exact string `"false"`**:

Given:
```json
{
  "stages": [
    {
      "name": "MigrarteDB(Manifest)",
      "refId": "1",
      "requisiteStageRefIds": [],
      "stageEnabled": {
        "expression": "false",
        "type": "expression"
      },
      "type": "deployManifest"
    },
    {
      "name": "Deploy (Manifest)",
      "refId": "2",
      "requisiteStageRefIds": ["1"],
      "type": "deployManifest"
    }
  ]
}
```

The **CORRECT** output creates a disabled step:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "MigrarteDB-Manifest-". The step must be disabled.
```

The **WRONG** output converts the hard-disabled stage and merely adds a manual-review note:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "MigrarteDB-Manifest-". ... Set the step description to include: `This step has a Spinnaker conditional execution condition ... stageEnabled.expression = "false" ...`
```
← WRONG: the exact string `"false"` is a hard-disabled stage and must be skipped.

**Example — `stageEnabled` with SpEL expression**:

Given a `deployManifest` stage with:
```json
{
  "name": "Deploy Prod",
  "stageEnabled": {
    "expression": "${ #judgment(\"Manual Judgment\").equals(\"Continue\")}",
    "type": "expression"
  }
}
```

The **CORRECT** output appends the conditional NOTE:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Prod". Set the step description to include: `This step has a Spinnaker conditional execution condition that has no direct Octopus Deploy equivalent: stageEnabled.expression = "${ #judgment(\"Manual Judgment\").equals(\"Continue\")}". Manually review whether this step should be conditionally disabled or use an Octopus run condition.`
```

**CRITICAL — `stageEnabled` only applies to the SPECIFIC stage that contains it**: Each stage's `stageEnabled` property must be read EXCLUSIVELY from that stage's own JSON object. You MUST NOT carry forward, copy, or infer a `stageEnabled` condition from a neighbouring stage (or any other stage) to a stage that has no `stageEnabled` property. A stage that does NOT have a `stageEnabled` key in its JSON must NEVER receive a stageEnabled description note.

**Negative example — `stageEnabled` from stage A incorrectly applied to stage B (COMMON MISTAKE)**:

Given a pipeline with two stages where only stage A (refId 6) has `stageEnabled` but stage B (refId 2) does NOT:

```json
{
  "stages": [
    {
      "name": "Canary: manual judgment",
      "refId": "2",
      "requisiteStageRefIds": ["6"],
      "type": "manualJudgment"
    },
    {
      "name": "Deploy Canary",
      "refId": "6",
      "requisiteStageRefIds": ["4"],
      "stageEnabled": {
        "expression": "${ #judgment(\"Start: manual judgment\").equals(\"Continue\")}",
        "type": "expression"
      },
      "type": "deployManifest"
    }
  ]
}
```

The **WRONG** output (stageEnabled from refId 6 incorrectly applied to refId 2 — FORBIDDEN):
```
* Add a "Manual Intervention" step with the name "Canary: manual judgment" ... Set the step description to include: `This step has a Spinnaker conditional execution condition ... stageEnabled.expression = "${ #judgment(\"Start: manual judgment\").equals(\"Continue\")}"...`
← WRONG: refId 2 has NO stageEnabled. This description was copied from refId 6 and must not appear here.
```

The **CORRECT** output (stageEnabled note only on refId 6, not on refId 2):
```
* Add a "Manual Intervention" step with the name "Canary: manual judgment" ...
[No stageEnabled note — the manualJudgment stage has no stageEnabled property]
...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Canary" ... Set the step description to include: `This step has a Spinnaker conditional execution condition ... stageEnabled.expression = "${ #judgment(\"Start: manual judgment\").equals(\"Continue\")}"...`
[stageEnabled note appears here because refId 6 IS the stage with stageEnabled]
```

**VERIFICATION RULE — before outputting any step with a stageEnabled note, confirm that the stage JSON object for that step actually contains a `stageEnabled` property.** If you cannot find `"stageEnabled"` in the specific stage's JSON object, do NOT add the note. The note only belongs to the stage whose JSON object contains the `stageEnabled` key.

**Negative example — `stageEnabled` from the second of two similar-type stages incorrectly applied to the first (COMMON MISTAKE when stages of the same type appear in sequence)**:

This mistake arises when a pipeline contains two stages of the SAME type (e.g., two `deployManifest` stages): the one that outputs EARLIER has NO `stageEnabled` but the one that outputs LATER DOES. The AI may swap the note — applying the `stageEnabled` description to the FIRST stage and omitting it from the SECOND.

Given a pipeline with two `deployManifest` stages where only refId 5 has `stageEnabled`:

```json
{
  "stages": [
    {
      "name": "Deploy (canary)",
      "refId": "3",
      "requisiteStageRefIds": ["1"],
      "type": "deployManifest"
    },
    {
      "name": "Deploy",
      "refId": "5",
      "requisiteStageRefIds": ["4"],
      "stageEnabled": {
        "expression": "${#judgment(\"Manual Judgment (Deploy All)\").equals(\"Deploy all\")}",
        "type": "expression"
      },
      "type": "deployManifest"
    }
  ]
}
```

The **WRONG** output (stageEnabled from refId 5 incorrectly applied to refId 3; refId 5 missing its note):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ... Set the step description to include: `This step has a Spinnaker conditional execution condition ... stageEnabled.expression = "${#judgment(\"Manual Judgment (Deploy All)\").equals(\"Deploy all\")}"...`
← WRONG: refId 3 has NO stageEnabled — this note must NOT appear here
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ...
← WRONG: refId 5 HAS stageEnabled but the note is missing
```

The **CORRECT** output (`stageEnabled` note only on refId 5, which actually has it):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ...
← CORRECT: no stageEnabled note (refId 3 has no stageEnabled property)
...
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ... Set the step description to include: `This step has a Spinnaker conditional execution condition ... stageEnabled.expression = "${#judgment(\"Manual Judgment (Deploy All)\").equals(\"Deploy all\")}"...`
← CORRECT: stageEnabled note here only, because refId 5 is the stage with stageEnabled
```

## Time Window Restrictions (`restrictedExecutionWindow`)

Some Spinnaker stages have a `restrictExecutionDuringTimeWindow` property combined with a `restrictedExecutionWindow` schedule:

```json
{
  "restrictExecutionDuringTimeWindow": true,
  "restrictedExecutionWindow": {
    "days": [1, 2, 3, 4],
    "whitelist": [
      {
        "startHour": 13,
        "startMin": 0,
        "endHour": 2,
        "endMin": 0
      }
    ]
  }
}
```

* Octopus Deploy has no equivalent time-window restriction for individual steps. When a stage has `"restrictExecutionDuringTimeWindow": true`, convert the stage normally but append the following text to the step description. If the step already has a description, append this text separated by a single space; do NOT emit a second independent description instruction:

  ```
  Set the step description to include: `This step originally had a Spinnaker execution time window restriction. Days: <days>. Window: <startHour>:<startMin>-<endHour>:<endMin>. Replicate this restriction manually in Octopus if required.`
  ```

  Replace `<days>` with the numeric day numbers from `restrictedExecutionWindow.days` (1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday) and `<startHour>:<startMin>-<endHour>:<endMin>` from the first whitelist entry.

  If `restrictExecutionDuringTimeWindow` is `false` or absent, do NOT append any NOTE.

## Continue-on-Failure (`continuePipeline`)

Some Spinnaker stages have `"continuePipeline": true` which means the pipeline continues to run even if the stage fails. Octopus Deploy does not have an exact equivalent for this behavior at the step level.

* When a stage has `"continuePipeline": true`, convert the stage normally but append the following text to the step description. If the step already has a description, append this text separated by a single space; do NOT emit a second independent description instruction:

  ```
  Set the step description to include: `NOTE (migration): The original Spinnaker stage had continuePipeline=true, meaning the pipeline continued even on failure. Manually review whether this step should use an Octopus run condition to replicate this behavior.`
  ```

* When `continuePipeline` is `false` (the default) or absent, do NOT append any NOTE. The default pipeline failure behavior in Octopus Deploy already stops the deployment on step failure.

* **IMPORTANT**: Do NOT add `continuePipeline` notes for EVERY stage. Only add the note when `"continuePipeline": true` is explicitly set in the stage JSON. A stage with no `continuePipeline` key must NOT receive the note.

## Ignored Stage Types

The following stage types represent Spinnaker-internal operations or metadata lookups that have no equivalent in Octopus Deploy. When any of these stage types is encountered, **skip it entirely** — do not generate any step prompt, comment, or placeholder for it:

* `findArtifactFromExecution` — looks up artifacts produced by another pipeline execution. This is a Spinnaker-specific mechanism for passing artifacts between pipelines and has no Octopus Deploy equivalent.
* `evaluateVariables` — evaluates SpEL expressions to set pipeline variables. Skip it entirely.
* `checkPreconditions` — checks pipeline preconditions. Skip it entirely. **HOWEVER**, when a `checkPreconditions` stage has `preconditions` items with `type: "stageStatus"`, preserve the condition information by appending a NOTE to each downstream step that directly follows the `checkPreconditions` stage in dependency order. The NOTE should describe what condition was originally being enforced. Example: if the precondition checks that stage "Manual Judgment" has status `SUCCEEDED`, append the text `NOTE (migration): This step originally ran only when the "Manual Judgment" stage had SUCCEEDED.` to the step description. If multiple `checkPreconditions` stages with **different** `stageStatus` values (e.g., one for SUCCEEDED and one for TERMINAL/CANCELLED) both depend on the same upstream stage, their respective downstream steps now run in parallel — include a NOTE on each downstream step explaining its original conditional branch (e.g., `NOTE (migration): This step was originally on the SUCCESS branch after "Manual Judgment". In this migration, both branches now run in parallel.` and `NOTE (migration): This step was originally on the CANCELLED/TERMINAL branch after "Manual Judgment". In this migration, both branches now run in parallel.`).
* `setPipelineParameters` — sets parameters for a running pipeline. Skip it entirely.

**IMPORTANT**: If a pipeline has only ignored stages (e.g., only `findArtifactFromExecution` and `checkPreconditions` stages), the project creation prompt must still be generated with no steps (use `"with no steps"` in the project prompt). Do not omit the project creation prompt just because all stages are of ignored types.

**CRITICAL — stages depending on an ignored stage use that ignored stage's predecessors as their effective dependency**: When performing topological sort, ignored stages are removed from the dependency graph entirely. Any stage that directly depends on an ignored stage must be treated as if that ignored stage's own `requisiteStageRefIds` are its dependencies instead. This preserves the full dependency chain through the removed stage.

**Example**: If stage 5 (`checkPreconditions`, ignored) has `requisiteStageRefIds: ["4"]`, then any stage with `requisiteStageRefIds: ["5"]` should be treated as having `requisiteStageRefIds: ["4"]` for ordering purposes — as though stage 5 never existed.

**ABSOLUTE RULE — every non-ignored stage MUST appear in the output exactly once**: Before finalizing the output, verify that every stage in the pipeline's `stages` array that is NOT an ignored type is represented by exactly one step. Silently omitting a non-ignored stage is a critical error, even when that stage is deep in a dependency chain that passes through an ignored stage.

**Negative example — non-ignored stages dropped when dependency chain passes through an ignored stage (COMMON MISTAKE)**:

Given a pipeline where `checkPreconditions` (refId 5, ignored) sits in the chain between stages 4 and 7:

| refId | type | requisiteStageRefIds |
|---|---|---|
| 2 | manualJudgment | `["9"]` |
| 3 | deployManifest | `["2"]` |
| 4 | manualJudgment | `["3"]` |
| 5 | checkPreconditions **(SKIP)** | `["4"]` |
| 6 | deleteManifest | `["4"]` |
| 7 | manualJudgment | `["5"]` → effectively `["4"]` since 5 is skipped |
| 8 | deployManifest | `["7"]` |

The **WRONG** output (stages 3 and 4 silently dropped — FORBIDDEN):
```
* Add a "Manual Intervention" step ... (refId 2) ✓
* Add a "Run a kubectl script" step ... (refId 6) ✗ WRONG: placed before stages 3 and 4 appear
* Add a "Manual Intervention" step ... (refId 7) ✗
* Add a "Deploy Kubernetes YAML" step ... (refId 8) ✗
[stages 3 and 4 are MISSING — they were silently dropped]
```

The **CORRECT** output (ALL non-ignored stages included in proper dependency order):
```
* Add a "Manual Intervention" step ... (refId 2)
* Add a "Deploy Kubernetes YAML" step ... (refId 3) ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Manual Intervention" step ... (refId 4) ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Run a kubectl script" step ... (refId 6) ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Manual Intervention" step ... (refId 7) ... Set the start trigger to "Run in parallel with the previous step".  ← effectively depends on 4 (since 5 is ignored); parallel with 6
* Add a "Deploy Kubernetes YAML" step ... (refId 8) ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**CRITICAL — when MULTIPLE stages depend on the same ignored stage, those stages become PARALLEL with each other**: When two or more non-ignored stages both depend on the same ignored stage (or different ignored stages that ultimately share the same non-ignored predecessor), those stages are in the SAME parallel dependency group. The first of these stages in JSON order is the "first in its group" (no parallel annotation); subsequent stages get `"Run in parallel with the previous step"`.

**Worked example — multiple branches through different ignored stages becoming parallel**:

Given a pipeline where two separate `checkPreconditions` stages (11 and 5) both depend on stage 4, and two non-ignored stages (6 and 13) depend on those two ignored stages:

| refId | type | requisiteStageRefIds | effective deps (after ignoring) |
|---|---|---|---|
| 3 | deployManifest | `[]` | ROOT |
| 4 | manualJudgment | `["3"]` | `["3"]` |
| 5 | checkPreconditions **(SKIP)** | `["4"]` | — |
| 6 | deployManifest | `["5"]` → effectively `["4"]` | `["4"]` |
| 11 | checkPreconditions **(SKIP)** | `["4"]` | — |
| 13 | deployManifest | `["11"]` → effectively `["4"]` | `["4"]` |
| 7 | manualJudgment | `["6"]` | `["6"]` |

After removing ignored stages: stages 6 and 13 BOTH effectively depend on stage 4 → they are in the SAME parallel group. Stage 6 comes first in JSON order (position 4 vs position 10) → no parallel annotation; stage 13 gets `"Run in parallel with the previous step"`.

The **WRONG** output (stage 13 placed after stage 7 with "Wait for all previous steps" — FORBIDDEN):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -internal-" ...  ← refId 3, ROOT, no annotation ✓
* Add a "Manual Intervention" step ... "Judge -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Manual Intervention" step ... "Judge -main-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Run a kubectl script" step ... "Rollback -internal-" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← WRONG: placed after stage 7; should be parallel with "Deploy -canary-"
```
← WRONG: Stage 13 (Rollback -internal-) effectively depends on stage 4 (like stage 6). It MUST be parallel with stage 6, not placed after stage 7.

The **CORRECT** output (stages 6 and 13 are parallel, both effectively depend on 4):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -internal-" ...  ← refId 3, ROOT, no annotation ✓
* Add a "Manual Intervention" step ... "Judge -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".    ← refId 4
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← refId 6, FIRST in {6,13} parallel group
* Add a "Run a kubectl script" step ... "Rollback -internal-" ... Set the start trigger to "Run in parallel with the previous step".            ← refId 13, SECOND in {6,13} parallel group ✓
* Add a "Manual Intervention" step ... "Judge -main-" ... Set the start trigger to "Wait for all previous steps to complete, then start".      ← refId 7, depends on 6
```

Stages with `"type": "shiftTrafficProd"` (and the analogous `"type": "shiftTrafficStaging"`) represent canary traffic-shifting operations that run a Kubernetes Job to redistribute traffic between service versions. The stage carries a fully-formed Kubernetes `Job` manifest in its `manifest` property.

The following snippet is an example of a `shiftTrafficProd` stage in Spinnaker:

```json
{
  "type": "shiftTrafficProd",
  "name": "Canary stage 1",
  "refId": "10",
  "requisiteStageRefIds": ["4"],
  "account": "<redacted-cluster>",
  "cloudProvider": "kubernetes",
  "manifest": {
    "apiVersion": "batch/v1",
    "kind": "Job",
    "metadata": {
      "generateName": "shift-traffic-",
      "namespace": "org-0001-spinnaker-cj-prod"
    },
    "spec": {
      "backoffLimit": 0,
      "template": {
        "spec": {
          "containers": [
            {
              "command": [
                "shift-traffic",
                "-n",
                "$(NAMESPACE)",
                "$(VIRTUALSERVICE_NAME)",
                "$(DEPLOYMENT_NAME)",
                "$(CANARY_WEIGHT)",
                "$(EXECUTION_ID)"
              ],
              "env": [
                {"name": "VIRTUALSERVICE_NAME", "value": "server"},
                {"name": "DEPLOYMENT_NAME", "value": "server"},
                {"name": "NAMESPACE", "value": "app-0203-prod"},
                {"name": "CANARY_WEIGHT", "value": "5%"},
                {"name": "EXECUTION_ID", "value": "01K98X5GWZP388E72WV19DQARE"},
                {
                  "name": "CJ_NAMESPACE",
                  "valueFrom": {
                    "fieldRef": {
                      "fieldPath": "metadata.namespace"
                    }
                  }
                }
              ],
              "image": "registry.example.invalid/image-0434",
              "name": "shift-traffic"
            }
          ],
          "imagePullSecrets": [{"name": "<redacted-secret-name>"}],
          "restartPolicy": "Never",
          "serviceAccountName": "spinnaker-custom-job"
        }
      }
    }
  }
}
```

Convert a `shiftTrafficProd` (or `shiftTrafficStaging`) stage to a "Deploy Kubernetes YAML" step as follows:

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages (replace `()` and `[]` with dashes `-`; add a step description when the original name contained those characters).
* Replace `<account>` with the `account` property of the stage, applying the standard placeholder substitution (`<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<namespace>` with `manifest.metadata.namespace`.
* Replace `<manifest yaml>` with the full contents of the `manifest` property serialised as properly indented YAML (2 spaces per level). Copy the manifest exactly — do **not** replace `generateName` with `name` or alter any field values.
* Add a step description that identifies the original Spinnaker stage type and describes the traffic-shifting purpose of the step.


```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to <account>. Set the step namespace to <namespace>. Set the step description to "Original Spinnaker stage type: shiftTrafficProd. This step shifts canary traffic by running a Kubernetes Job."
* Set the step YAML to:

```yaml
<manifest yaml>
```
```

**Example** — converting the stage above produces:

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Canary stage 1". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to Kubernetes. Set the step namespace to org-0001-spinnaker-cj-prod. Set the step description to "Original Spinnaker stage type: shiftTrafficProd. This step shifts canary traffic by running a Kubernetes Job."
* Set the step YAML to:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: shift-traffic-
  namespace: org-0001-spinnaker-cj-prod
spec:
  backoffLimit: 0
  template:
    spec:
      containers:
        - command:
            - shift-traffic
            - -n
            - $(NAMESPACE)
            - $(VIRTUALSERVICE_NAME)
            - $(DEPLOYMENT_NAME)
            - $(CANARY_WEIGHT)
            - $(EXECUTION_ID)
          env:
            - name: VIRTUALSERVICE_NAME
              value: server
            - name: DEPLOYMENT_NAME
              value: server
            - name: NAMESPACE
              value: app-0203-prod
            - name: CANARY_WEIGHT
              value: 5%
            - name: EXECUTION_ID
              value: 01K98X5GWZP388E72WV19DQARE
            - name: CJ_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
          image: registry.example.invalid/image-0434
          name: shift-traffic
      imagePullSecrets:
        - name: <redacted-secret-name>
      restartPolicy: Never
      serviceAccountName: spinnaker-custom-job
```
```

## Restore Stage

Stages with `"type": "restoreProd"` represent restore operations that run a Kubernetes Job to restore a named deployment to a prior state. The stage carries a fully-formed Kubernetes `Job` manifest in its `manifest` property.

The following snippet is an example of a `restoreProd` stage in Spinnaker:

```json
{
  "type": "restoreProd",
  "name": "Restore",
  "refId": "14",
  "requisiteStageRefIds": ["9"],
  "account": "<redacted-cluster>",
  "cloudProvider": "kubernetes",
  "manifest": {
    "apiVersion": "batch/v1",
    "kind": "Job",
    "metadata": {
      "generateName": "restore-",
      "namespace": "org-0001-spinnaker-cj-prod"
    },
    "spec": {
      "backoffLimit": 0,
      "template": {
        "spec": {
          "containers": [
            {
              "command": [
                "restore",
                "-n",
                "$(NAMESPACE)",
                "$(DEPLOYMENT_NAME)",
                "$(EXECUTION_ID)"
              ],
              "env": [
                {"name": "DEPLOYMENT_NAME", "value": "server"},
                {"name": "NAMESPACE", "value": "app-0203-prod"},
                {"name": "EXECUTION_ID", "value": "01K98X5GWZP388E72WV19DQARE"},
                {
                  "name": "CJ_NAMESPACE",
                  "valueFrom": {
                    "fieldRef": {
                      "fieldPath": "metadata.namespace"
                    }
                  }
                }
              ],
              "image": "registry.example.invalid/image-0434",
              "name": "restore"
            }
          ],
          "imagePullSecrets": [{"name": "<redacted-secret-name>"}],
          "restartPolicy": "Never",
          "serviceAccountName": "spinnaker-custom-job"
        }
      }
    }
  }
}
```

Convert a `restoreProd` stage to a "Deploy Kubernetes YAML" step as follows:

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages (replace `()` and `[]` with dashes `-`; add a step description when the original name contained those characters).
* Replace `<account>` with the `account` property of the stage, applying the standard placeholder substitution (`<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<namespace>` with `manifest.metadata.namespace`.
* Replace `<manifest yaml>` with the full contents of the `manifest` property serialised as properly indented YAML (2 spaces per level). Copy the manifest exactly — do **not** replace `generateName` with `name` or alter any field values.
* Add a step description that identifies the original Spinnaker stage type and describes the restore purpose of the step.


```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to <account>. Set the step namespace to <namespace>. Set the step description to "Original Spinnaker stage type: restoreProd. This step restores a Kubernetes deployment by running a Kubernetes Job."
* Set the step YAML to:

```yaml
<manifest yaml>
```
```

**Example** — converting the stage above produces:

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Restore". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to Kubernetes. Set the step namespace to org-0001-spinnaker-cj-prod. Set the step description to "Original Spinnaker stage type: restoreProd. This step restores a Kubernetes deployment by running a Kubernetes Job."
* Set the step YAML to:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: restore-
  namespace: org-0001-spinnaker-cj-prod
spec:
  backoffLimit: 0
  template:
    spec:
      containers:
        - command:
            - restore
            - -n
            - $(NAMESPACE)
            - $(DEPLOYMENT_NAME)
            - $(EXECUTION_ID)
          env:
            - name: DEPLOYMENT_NAME
              value: server
            - name: NAMESPACE
              value: app-0203-prod
            - name: EXECUTION_ID
              value: 01K98X5GWZP388E72WV19DQARE
            - name: CJ_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
          image: registry.example.invalid/image-0434
          name: restore
      imagePullSecrets:
        - name: <redacted-secret-name>
      restartPolicy: Never
      serviceAccountName: spinnaker-custom-job
```
```

## Derive Baseline Stage

Stages with `"type": "deriveBaselineProd"` represent derive-baseline operations that run a Kubernetes Job to derive a baseline state from the main deployment. The stage carries a fully-formed Kubernetes `Job` manifest in its `manifest` property.

The following snippet is an example of a `deriveBaselineProd` stage in Spinnaker:

```json
{
  "type": "deriveBaselineProd",
  "name": "Derive baseline deployment from main Deployment",
  "refId": "2",
  "requisiteStageRefIds": [],
  "account": "<redacted-cluster>",
  "cloudProvider": "kubernetes",
  "manifest": {
    "apiVersion": "batch/v1",
    "kind": "Job",
    "metadata": {
      "generateName": "derive-baseline-",
      "namespace": "org-0001-spinnaker-cj-prod"
    },
    "spec": {
      "backoffLimit": 0,
      "template": {
        "spec": {
          "containers": [
            {
              "command": [
                "derive-baseline",
                "-n",
                "$(NAMESPACE)",
                "$(DEPLOYMENT_NAME)"
              ],
              "env": [
                {
                  "name": "DEPLOYMENT_NAME",
                  "value": "server"
                },
                {
                  "name": "NAMESPACE",
                  "value": "app-0203-prod"
                }
              ],
              "image": "registry.example.invalid/image-0434",
              "name": "derive-baseline"
            }
          ],
          "imagePullSecrets": [
            {
              "name": "<redacted-secret-name>"
            }
          ],
          "restartPolicy": "Never",
          "serviceAccountName": "spinnaker-custom-job"
        }
      }
    }
  },
  "failPipeline": true,
  "continuePipeline": false,
  "completeOtherBranchesThenFail": false
}
```

Convert a `deriveBaselineProd` stage to a "Deploy Kubernetes YAML" step as follows:

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages (replace `()` and `[]` with dashes `-`; add a step description when the original name contained those characters).
* Replace `<account>` with the `account` property of the stage, applying the standard placeholder substitution (`<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<namespace>` with `manifest.metadata.namespace`.
* Replace `<manifest yaml>` with the full contents of the `manifest` property serialised as properly indented YAML (2 spaces per level). Copy the manifest exactly — do **not** replace `generateName` with `name` or alter any field values.
* Add a step description that identifies the original Spinnaker stage type and describes the derive-baseline purpose of the step.


```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to <account>. Set the step namespace to <namespace>. Set the step description to "Original Spinnaker stage type: deriveBaselineProd. This step derives a baseline state from the main deployment by running a Kubernetes Job."
* Set the step YAML to:

```yaml
<manifest yaml>
```
```

**Example** — converting the stage above produces:

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Derive baseline deployment from main Deployment". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to Kubernetes. Set the step namespace to org-0001-spinnaker-cj-prod. Set the step description to "Original Spinnaker stage type: deriveBaselineProd. This step derives a baseline state from the main deployment by running a Kubernetes Job."
* Set the step YAML to:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: derive-baseline-
  namespace: org-0001-spinnaker-cj-prod
spec:
  backoffLimit: 0
  template:
    spec:
      containers:
        - command:
            - derive-baseline
            - -n
            - $(NAMESPACE)
            - $(DEPLOYMENT_NAME)
          env:
            - name: DEPLOYMENT_NAME
              value: server
            - name: NAMESPACE
              value: app-0203-prod
          image: registry.example.invalid/image-0434
          name: derive-baseline
      imagePullSecrets:
        - name: <redacted-secret-name>
      restartPolicy: Never
      serviceAccountName: spinnaker-custom-job
```
```

## Derive Canary Stage

Stages with `"type": "deriveCanaryProd"` represent derive-canary operations that run a Kubernetes Job to derive a canary deployment from manifests. The stage carries a fully-formed Kubernetes `Job` manifest in its `manifest` property.

The following snippet is an example of a `deriveCanaryProd` stage in Spinnaker:

```json
{
  "type": "deriveCanaryProd",
  "name": "Derive canary deployment from manifests",
  "refId": "3",
  "requisiteStageRefIds": [],
  "account": "<redacted-cluster>",
  "cloudProvider": "kubernetes",
  "manifest": {
    "apiVersion": "batch/v1",
    "kind": "Job",
    "metadata": {
      "generateName": "derive-canary-",
      "namespace": "org-0001-spinnaker-cj-prod"
    },
    "spec": {
      "backoffLimit": 0,
      "template": {
        "spec": {
          "containers": [
            {
              "command": [
                "derive-canary",
                "-n",
                "$(NAMESPACE)",
                "$(MANIFEST_URL)",
                "$(DEPLOYMENT_NAME)",
                "$(IMAGE)"
              ],
              "env": [
                {
                  "name": "DEPLOYMENT_NAME",
                  "value": "server"
                },
                {
                  "name": "NAMESPACE",
                  "value": "app-0203-prod"
                },
                {
                  "name": "MANIFEST_URL",
                  "value": "gs://example-bucket/storage-2356"
                },
                {
                  "name": "IMAGE",
                  "value": "registry.example.invalid/image-0980"
                }
              ],
              "image": "registry.example.invalid/image-0434",
              "name": "derive-canary"
            }
          ],
          "imagePullSecrets": [
            {
              "name": "<redacted-secret-name>"
            }
          ],
          "restartPolicy": "Never",
          "serviceAccountName": "spinnaker-custom-job"
        }
      }
    }
  },
  "failPipeline": true,
  "continuePipeline": false,
  "completeOtherBranchesThenFail": false
}
```

Convert a `deriveCanaryProd` stage to a "Deploy Kubernetes YAML" step as follows:

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages (replace `()` and `[]` with dashes `-`; add a step description when the original name contained those characters).
* Replace `<account>` with the `account` property of the stage, applying the standard placeholder substitution (`<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<namespace>` with `manifest.metadata.namespace`.
* Replace `<manifest yaml>` with the full contents of the `manifest` property serialised as properly indented YAML (2 spaces per level). Copy the manifest exactly — do **not** replace `generateName` with `name` or alter any field values.
* Add a step description that identifies the original Spinnaker stage type and describes the derive-canary purpose of the step.


```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to <account>. Set the step namespace to <namespace>. Set the step description to "Original Spinnaker stage type: deriveCanaryProd. This step derives a canary deployment from manifests by running a Kubernetes Job."
* Set the step YAML to:

```yaml
<manifest yaml>
```
```

**Example** — converting the stage above produces:

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Derive canary deployment from manifests". Set the YAML Source to "Inline YAML". Set the YAML content to the manifest below. Set the target tag to Kubernetes. Set the step namespace to org-0001-spinnaker-cj-prod. Set the step description to "Original Spinnaker stage type: deriveCanaryProd. This step derives a canary deployment from manifests by running a Kubernetes Job."
* Set the step YAML to:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  generateName: derive-canary-
  namespace: org-0001-spinnaker-cj-prod
spec:
  backoffLimit: 0
  template:
    spec:
      containers:
        - command:
            - derive-canary
            - -n
            - $(NAMESPACE)
            - $(MANIFEST_URL)
            - $(DEPLOYMENT_NAME)
            - $(IMAGE)
          env:
            - name: DEPLOYMENT_NAME
              value: server
            - name: NAMESPACE
              value: app-0203-prod
            - name: MANIFEST_URL
              value: gs://example-bucket/storage-2356
            - name: IMAGE
              value: registry.example.invalid/image-0980
          image: registry.example.invalid/image-0434
          name: derive-canary
      imagePullSecrets:
        - name: <redacted-secret-name>
      restartPolicy: Never
      serviceAccountName: spinnaker-custom-job
```
```

## Undo Rollout Manifest Stage

Stages with `"type": "undoRolloutManifest"` represent a Kubernetes rollback operation — rolling a named deployment back to a previous revision. Convert them to a "Run a kubectl script" step using `kubectl rollout undo`:

The following snippet is an example of an `undoRolloutManifest` stage in Spinnaker:

```json
{
  "account": "<redacted-cluster>",
  "cloudProvider": "kubernetes",
  "location": "app-0112-prod",
  "manifestName": "deployment dmp-market-web-internal",
  "mode": "static",
  "name": "Rollback (internal)",
  "numRevisionsBack": 1,
  "refId": "13",
  "requisiteStageRefIds": ["11"],
  "type": "undoRolloutManifest"
}
```

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages (replace `()` and `[]` with dashes `-`; add a step description when the original name contained those characters).
* Replace `<account>` with the `account` property of the stage, applying the standard placeholder substitution (`<redacted-cluster>` or empty string → `Kubernetes`).
* Parse `manifestName` into `<kind>/<name>` (e.g., `"deployment dmp-market-web-internal"` → `deployment/dmp-market-web-internal`). The first token is the Kubernetes resource kind; the second token is the resource name.
* Replace `<namespace>` with the `location` property of the stage (the Kubernetes namespace).
* `numRevisionsBack` is informational only — the generated command always uses `kubectl rollout undo <kind>/<name> -n <namespace>` (rolling back one revision). If `numRevisionsBack > 1`, add a note in the step description.

```
* Add a "Run a kubectl script" step to the deployment process and name the step "<stage name>". Set the script to inline Bash with the code `kubectl rollout undo <kind>/<name> -n <namespace>`. Set the target tag to <account>. Set the step description to "Original Spinnaker stage type: undoRolloutManifest. This step rolls back <kind>/<name> to the previous revision in namespace <namespace>."
```

**Example** — converting the stage above produces:

```
* Add a "Run a kubectl script" step to the deployment process and name the step "Rollback -internal-". Set the script to inline Bash with the code `kubectl rollout undo deployment/dmp-market-web-internal -n app-0112-prod`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage type: undoRolloutManifest. This step rolls back deployment/dmp-market-web-internal to the previous revision in namespace app-0112-prod."
```

## Unknown Stage Types

If a stage has a `type` value that is not listed in this document (i.e., not `deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `pipeline`, `wait`, `deleteManifest`, `scaleManifest`, `undoRolloutManifest`, `shiftTrafficProd`, `shiftTrafficStaging`, `restoreProd`, `deriveBaselineProd`, `deriveCanaryProd`, or an ignored type), generate a placeholder "Run a Script" step for it so that it is not silently lost:

```
* Add a "Run a Script" step with the name "<stage name>" to the deployment process. Set the script to the following inline PowerShell code: `# TODO: convert Spinnaker stage of type "<type>" — this stage type has no direct Octopus Deploy equivalent and requires manual conversion.`
```

Replace `<stage name>` and `<type>` with the actual values from the stage.

## Delete Manifest Stage

The following snippet is an example of a `deleteManifest` stage in Spinnaker:

```json
{
  "account": "<redacted-cluster>",
  "app": "app-0028",
  "cloudProvider": "kubernetes",
  "location": "app-0028-prod",
  "manifestName": "cronJob houjinsearchjp-update-corporations-prod",
  "mode": "static",
  "name": "Delete (Manifest)",
  "options": {
    "cascading": true
  },
  "refId": "2",
  "requisiteStageRefIds": ["1"],
  "type": "deleteManifest"
}
```

A `deleteManifest` stage represents the deletion of a named Kubernetes resource. The equivalent step in an Octopus Deploy project is a "Delete Kubernetes Resource" step:

* Replace `<stage name>` with the `name` property of the stage.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<code>` with a Bash script to call `kubectl` to delete the resource in the `manifestName` field.
* The `manifestName` field contains the Kubernetes resource kind and name separated by a space (e.g., `"job my-job"` → `kubectl delete job my-job`). Parse the kind and name from this field.
* If the stage has a `location` field, it represents the Kubernetes namespace. Include `-n <location>` in the kubectl command. For example, if `manifestName` is `"job job-denpyo-checker"` and `location` is `"app-0251-dev"`, the command is `kubectl delete job job-denpyo-checker -n app-0251-dev`.
* **`mode: "label"` deleteManifest stages**: When the `mode` field is `"label"` (instead of `"static"`), the stage uses `labelSelectors` to identify resources to delete rather than a specific `manifestName`. In this case, build the kubectl command using `-l` label selectors. Iterate over the `labelSelectors.selectors` array and convert each selector to a label expression (e.g., `{key: "app", kind: "EQUALS", values: ["server"]}` → `app=server`). Combine multiple selectors with commas. Also use the `kinds` array to specify the resource types to delete. For example, a stage with `kinds: ["deployment", "replicaSet", "pod"]` and selectors `app=server,stack=canary,version=v1` in namespace `app-0220-prod` generates: `kubectl delete deployment,replicaSet,pod -l app=server,stack=canary,version=v1 -n app-0220-prod`. The `kinds` list should be comma-joined with no spaces.
* **CRITICAL — Spinnaker SpEL expressions in `deleteManifest` label selector values must be converted to Octopus variable syntax**: Label selector `values` may contain Spinnaker Spring Expression Language (SpEL) expressions such as `${ parameters.model_version }` that reference pipeline parameters. These Spinnaker SpEL expressions do NOT evaluate in Octopus Deploy. You MUST convert them to Octopus variable syntax by replacing `${ parameters.<name> }` with `#{<name>}`. For example, `${ parameters.model_version }` becomes `#{model_version}` in the generated kubectl command. If any such conversions are made, append the following parenthetical note to the step's description: `(NOTE: Spinnaker SpEL parameter references were converted to Octopus variable syntax, e.g. #{model_version}.)`. The pipeline's `parameterConfig` entries (if any) should correspond to Octopus project variables that provide the runtime values.

**Negative example — `deleteManifest` with SpEL parameter reference passed verbatim (COMMON MISTAKE)**:

Given a `deleteManifest` stage with `mode: "label"` and a selector `values: ["${ parameters.model_version }"]`:
```
* Add a "Run a kubectl script" step ... Set the script to inline Bash with the code `kubectl delete deployment,pod -l model-version=${ parameters.model_version } -n app-prod`. Set the target tag to Kubernetes.
```
← WRONG: The Spinnaker SpEL expression `${ parameters.model_version }` will NOT evaluate in Octopus. This must be converted to `#{model_version}`.

The **CORRECT** output converts the SpEL expression to Octopus variable syntax:
```
* Add a "Run a kubectl script" step ... Set the script to inline Bash with the code `kubectl delete deployment,pod -l model-version=#{model_version} -n app-prod`. Set the target tag to Kubernetes. Set the step description to "(NOTE: Spinnaker SpEL parameter references were converted to Octopus variable syntax, e.g. #{model_version}.)".
```
* **IMPORTANT — step name special character replacement and step description**: The same rules as `deployManifest` stages apply. If the stage `name` contains parentheses `()` or square brackets `[]`, replace them with dashes `-` in the step name (e.g., `Delete (canary)` → `Delete -canary-`). For every `deleteManifest` step where the stage name contained parentheses or other special characters, ALSO set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.

**Negative example — `deleteManifest` stage with parentheses and no step description (COMMON MISTAKE)**:

Given a `deleteManifest` stage with `"name": "Delete (canary)"`, the **WRONG** output omits the step description:
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Delete _canary_". Set the script to inline Bash with the code `kubectl delete deployment ...`. Set the target tag to Kubernetes.
```
← WRONG: The step description is MISSING. The original name "Delete (canary)" had parentheses, so the description must be added.

The **CORRECT** output (step description added to preserve original name with parentheses):
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Delete -canary-". Set the script to inline Bash with the code `kubectl delete deployment ...`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Delete (canary)".
```

```
* Add a "Run a kubectl script" step to the deployment process and name the step "<stage name>". Set the script to inline Bash with the code `<code>`. Set the target tag to <account>.
```

## Scale Manifest Stage

Stages with `"type": "scaleManifest"` represent scaling of a Kubernetes resource to a target replica count (e.g., scaling to zero to effectively stop a deployment). Convert them using the same prompt as `deleteManifest` stages:

* Replace `<stage name>` with the `name` property of the stage, applying the same special-character replacement rules as `deployManifest` stages. **CRITICAL**: if the stage `name` contains parentheses `()` or square brackets `[]`, replace them with dashes `-` in the step name (e.g., `Scale (Manifest)` → `Scale -Manifest-`). When the original name contained those characters, append `Set the step description to "Original Spinnaker stage name: <original name>".` to preserve the original name.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<code>` with a Bash script to call `kubectl` to scale the resource in the `manifestName` field to the value in the `replicas` field (which may be a string or a number — use it as-is).

**Negative example — `scaleManifest` stage name with parentheses not converted (COMMON MISTAKE)**:

Given a `scaleManifest` stage with `"name": "Scale (Manifest)"`, the following is **WRONG**:
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Scale (Manifest)". ...
```

The **CORRECT** output (parentheses replaced with dashes, step description added):
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Scale -Manifest-". Set the script to inline Bash with the code `kubectl scale ...`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Scale (Manifest)".
```

```
* Add a "Run a kubectl script" step to the deployment process and name the step "<stage name>". Set the script to inline Bash with the code `<code>`. Set the target tag to <account>.
```

# Parameter Config

* The following snippet is an example of a Spinnaker pipeline with parameter configuration:

```json
{
    "appConfig": {},
    "application": "app-0002",
    "id": "b6e10dff-ceaf-4f30-8d85-8bd56e88a3b9",
    "index": 7,
    "keepWaitingPipelines": false,
    "lastModifiedBy": "<redacted-owner>",
    "limitConcurrent": true,
    "name": "[DEV] Custom Event Backfill",
    "parameterConfig": [
      {
        "default": "org-0004-de-us-dev",
        "description": "The BQ project ID",
        "hasOptions": false,
        "label": "bq_project_id",
        "name": "bq_project_id",
        "options": [
          {
            "value": ""
          }
        ],
        "pinned": false,
        "required": false
      },
      {
        "default": "us-west1",
        "description": "The location of the query. The default value is US.",
        "hasOptions": false,
        "label": "query_location",
        "name": "query_location",
        "options": [
          {
            "value": ""
          }
        ],
        "pinned": false,
        "required": false
      },
      {
        "default": "",
        "description": "The query to run. This must return 4 columns: `user_id`, `time`, `event_name`, `properties`",
        "hasOptions": false,
        "label": "custom_query",
        "name": "custom_query",
        "options": [
          {
            "value": ""
          }
        ],
        "pinned": false,
        "required": true
      },
      {
        "default": "50",
        "description": "The # of events/attributes to include in each call to Braze. Max 75. Default value is 75.",
        "hasOptions": false,
        "label": "braze_api_batch_size",
        "name": "braze_api_batch_size",
        "options": [
          {
            "value": ""
          }
        ],
        "pinned": false,
        "required": false
      },
      {
        "default": "",
        "description": "Prefix to prepend to custom event name when performing the backfill",
        "hasOptions": false,
        "label": "custom_event_prefix",
        "name": "custom_event_prefix",
        "options": [
          {
            "value": ""
          }
        ],
        "pinned": false,
        "required": false
      }
    ]
  }
```

* For each parameter in the `parameterConfig` property of the Spinnaker pipeline, add the following prompt to the output.
* Replace `<parameter name>` with the `name` property of the parameter in the Spinnaker pipeline.
* Replace `<parameter default>` with the `default` property of the parameter in the Spinnaker pipeline. If the `default` property is absent or null, use an empty string `""` as the default value.
* Replace `<parameter description>` with the `description` property of the parameter in the Spinnaker pipeline. If the `description` property is absent, use an empty string `""`.
* Replace `<parameter label>` with the `label` property of the parameter in the Spinnaker pipeline. If the `label` property is absent or an empty string (`""`), use the `name` property as the label.

```
* Add a project variable called "<parameter name>", with a default value of "<parameter default>", the description "<parameter description>", and the label "<parameter label>". The variable must be prompted for when creating a release.
```

* If the `required` property of the parameter in the Spinnaker pipeline is `true`, add the following sentence to the end of the prompt:

```
The variable must be required.
```

* If the `required` property of the parameter in the Spinnaker pipeline is `false`, add the following sentence to the end of the prompt:

```
The variable must not be required.
```

* If `hasOptions` is `true` and the `options` array contains one or more non-empty `value` entries, append the following sentence to the end of the variable prompt: `The variable must have the following selectable options: <option1>, <option2>, ...`.
* Copy the selectable option values verbatim from `options[].value`, preserve their original order, and omit any option entries whose `value` is absent or the empty string.

* **CRITICAL — the `required` flag MUST always be applied**: When `required` is `true`, the phrase "The variable must be required." MUST be appended to the variable prompt. Do not omit this phrase even when other fields like `default` or `label` are missing. Both "The variable must be prompted for when creating a release." and "The variable must be required." (or "must not be required.") are ALWAYS required parts of every `parameterConfig` variable prompt.

**Example — `parameterConfig` item with missing `default` and `label`, and `required: true`**:

Given:
```json
{
  "description": "PVC to download the model into",
  "name": "ModelPVC",
  "required": true
}
```

The **CORRECT** output (uses name as label, empty string as default, AND includes required):
```
* Add a project variable called "ModelPVC", with a default value of "", the description "PVC to download the model into", and the label "ModelPVC". The variable must be prompted for when creating a release. The variable must be required.
```

The **WRONG** output (missing "The variable must be required." — this is a common mistake):
```
* Add a project variable called "ModelPVC", with a default value of "", the description "PVC to download the model into", and the label "ModelPVC". The variable must be prompted for when creating a release.
```

* **IMPORTANT**: Generating `parameterConfig` variable prompts does **not** replace or cancel stage generation. After processing all `parameterConfig` entries, you **must** continue and convert every entry in the `stages` array to its equivalent Octopus step prompt. Do not stop after outputting variables — all deployment stages must be converted even when `parameterConfig` is present.

**ABSOLUTE RULE — `parameterConfig` variables and deployment stages MUST appear in the SAME project creation section**: When a pipeline has both `parameterConfig` entries AND `stages`, the variable prompts and step prompts MUST all appear together in a SINGLE `Create a project...` block. NEVER create two separate `Create a project...` sections for the same pipeline — one for variables and one for stages. This is strictly forbidden. A pipeline may only generate ONE project creation prompt block, which contains ALL variables AND ALL steps in the correct order per the Notification Step Ordering rules.

**Negative example — `parameterConfig` and stages split into TWO separate project blocks (FORBIDDEN)**:

Given a pipeline with `parameterConfig` entries AND `stages`, the following output is completely **WRONG**:
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
* Add a project variable called "batch_size", with a default value of "50"...
* Add a project variable called "timeout", with a default value of "30"...

---

Create a project called "My Project" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step ...
```
← WRONG: Two separate `Create a project...` blocks for the same project are FORBIDDEN.

The **CORRECT** output (all variables and steps in ONE project creation block):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-" ...
* Add a project variable called "batch_size", with a default value of "50"...
* Add a project variable called "timeout", with a default value of "30"...
```

**ABSOLUTE RULE — `parameterConfig` variable prompts must follow the Notification Step Ordering rules exactly**: There are only two valid placements for `parameterConfig` variables inside a project block:
1. If the pipeline has one or more pipeline-level notification steps, place the `parameterConfig` variable prompts AFTER the Slack Notification - Complete steps and before the external feed trigger / disabled line.
2. If the pipeline has NO pipeline-level notification steps, place the `parameterConfig` variable prompts BEFORE all stage steps.

**Negative example — `parameterConfig` variables placed BEFORE deployment stages (COMMON MISTAKE)**:

Given a pipeline with both `parameterConfig` entries, `stages`, and pipeline-level notifications, the following output has the WRONG ordering with variables before stages:
```
Create a project called "Check SSL dev" in the "Default Project Group" project group with no steps.
* Add a project variable called "AlertDays", with a default value of "3"...
* Add a project variable called "WarnDays", with a default value of "5"...
* Add a "Deploy Kubernetes YAML" step to the deployment process ...
← WRONG: Variables appear BEFORE stages. They must appear AFTER all deployment steps.
```

The **CORRECT** output has deployment steps and notification steps FIRST, then variables:
```
Create a project called "Check SSL dev" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process ...
[... all other deployment stages ...]
* Add a community step template step ... "Slack Notification - Finish" ...
* Add a community step template step ... "Slack Notification - Complete" ...
* Add a project variable called "AlertDays", with a default value of "3"...
* Add a project variable called "WarnDays", with a default value of "5"...
```

## Running steps in parallel

> **ABSOLUTE RULE — JSON position is irrelevant to execution order.** A stage's topological group is determined **exclusively** by its `requisiteStageRefIds` value. A stage with `"requisiteStageRefIds": []` is **always** in the root group, even if it appears as the last item in the JSON array. Never use the position of a stage in the JSON array to decide its topological group or whether it runs before or after another stage. When you identify the root group, scan the **entire** `stages` array and collect ALL stages whose `requisiteStageRefIds` is empty or absent regardless of where they appear in the JSON.

* First, topologically sort all deployment stages by their `requisiteStageRefIds` dependency graph. Treat each `refId` as a node and each entry in `requisiteStageRefIds` as a directed edge from prerequisite to dependent. Stages with an empty or absent `requisiteStageRefIds` array have no prerequisites and must appear first in the sorted order; stages that depend only on those come next; and so on, until all stages are ordered.
* **CRITICAL: Perform the topological sort based purely on `requisiteStageRefIds` values — NOT on the position of the stage in the JSON array.** A stage that appears late in the JSON array but has `"requisiteStageRefIds": []` must still be placed in the first (root) group, even if the JSON places it after a stage that depends on it.
* Disabled stages still count when building dependency groups. If two stages share the same `requisiteStageRefIds` value, and one of them is disabled, they are STILL in the same parallel group for annotation purposes.
* When the topologically-sorted execution order differs from the original JSON array order (i.e., at least one stage must be moved when converting from JSON order to topological order):
  * Append `Set the start trigger to "Wait for all previous steps to complete, then start"` to every subsequent NON-PARALLEL stage's step prompt — i.e., every stage that is the FIRST in its dependency group (except the root group which has already been handled). Parallel siblings (2nd, 3rd, etc. stages within the same dependency group) continue to use `"Run in parallel with the previous step"` as before.
* **IMPORTANT**: The `"Wait for all previous steps to complete, then start"` annotation is ONLY added when the topological sort changes the execution order relative to the JSON array order. If the pipeline's stages are already in topological order in the JSON (i.e., no stage must be moved), do NOT add this annotation — the default sequential execution in Octopus is assumed. In a simple sequential pipeline where stages appear in JSON order as stage-1, stage-2, stage-3 (each depending on the previous), NO start trigger annotations of any kind are needed.

**ABSOLUTE RULE — the ROOT stage (the first stage in topological order, i.e., the stage with `"requisiteStageRefIds": []` that appears first in the output) MUST NEVER receive any start trigger annotation.** Even when the topological sort changes the execution order relative to the JSON array order, the root stage appears first in the output and has no prior stages to wait for. Adding `"Wait for all previous steps to complete, then start"` to the root stage is always wrong.

**Negative example — root stage incorrectly annotated when topological order differs from JSON (COMMON MISTAKE)**:

Given a pipeline where refId 3 (root) appears at JSON position 1 but refId 6 at JSON position 4 depends on it through ignored checkPreconditions:

| JSON position | refId | type | requisiteStageRefIds |
|---|---|---|---|
| 1 | 3 | deployManifest | `[]` ← ROOT |
| 2 | 4 | manualJudgment | `["3"]` |
| 3 | 5 | checkPreconditions **(SKIP)** | `["4"]` |
| 4 | 6 | deployManifest | `["5"]` → effectively `["4"]` |

Topological order (after ignoring stage 5): 3 → 4 → 6. Order differs from JSON only for stage 6 (was at JSON pos 4, moves to topo pos 3). Annotations are required for stages after the root.

The **WRONG** output (root stage 3 INCORRECTLY receives "Wait for all previous steps"):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -internal-" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← WRONG: refId 3 is ROOT
* Add a "Manual Intervention" step ... "Judge -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```
← WRONG: The ROOT stage (refId 3, first in topological order) must NEVER receive any start trigger annotation.

The **CORRECT** output (root stage has no annotation; annotations only on stages 4 and 6):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy -internal-" ...   ← refId 3, ROOT — no annotation ✓
* Add a "Manual Intervention" step ... "Judge -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**CRITICAL — when the topological order differs from JSON order, EVERY non-root, non-parallel stage in the ENTIRE chain MUST receive the "Wait for all previous steps" annotation**: It is NOT sufficient to annotate only the last sequential stage before a parallel group. EVERY stage that is the first (or only) stage in its dependency group must receive the annotation — from the second topological level onward, throughout the entire depth of the chain.

**Negative example — partially annotated chain (annotation missing on intermediate stage — VERY COMMON MISTAKE)**:

Given a pipeline where JSON order is [1, 2, 3, 4] but topological order is [2 (root), 3 (depends on 2), 1 (depends on 3), 4 (depends on 3, parallel with 1)]:

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `["3"]` | Deploy Prod |
| 2 | 2 | `[]` | Deploy Prod Canary (ROOT) |
| 3 | 3 | `["2"]` | Manual Judgment |
| 4 | 4 | `["3"]` | Scale Down Canary |

The topological order changes from JSON order (stage 2 moves from JSON position 2 to topological position 1). Therefore annotations ARE required for ALL non-root, non-parallel stages.

The **WRONG** output (annotation missing on Manual Judgment at topological position 2 — FORBIDDEN):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod Canary" ...   ← root, no annotation ✓
* Add a "Manual Intervention" step ... "Manual Judgment" ...          ← WRONG: Missing "Wait for all previous steps"!
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← correct for position 3
* Add a "Run a kubectl script" step ... "Scale Down Canary" ... Set the start trigger to "Run in parallel with the previous step".           ← correct
```
← WRONG: "Manual Judgment" is the first stage in its dependency group {depends on 2}, so it MUST receive the annotation. Annotating only "Deploy Prod" but skipping "Manual Judgment" is incorrect.

The **CORRECT** output (annotation on EVERY non-root, non-parallel stage — annotate Manual Judgment too):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod Canary" ...                                                                              ← root, no annotation
* Add a "Manual Intervention" step ... "Manual Judgment" ... Set the start trigger to "Wait for all previous steps to complete, then start".   ← stage 3, first in its group
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Wait for all previous steps to complete, then start".     ← stage 1, first in its group
* Add a "Run a kubectl script" step ... "Scale Down Canary" ... Set the start trigger to "Run in parallel with the previous step".              ← stage 4, parallel with stage 1
```

**KEY RULE**: For every non-root sequential stage (stages that are the first or only stage in their dependency group, at ANY depth in the chain), the annotation MUST be present if the topological sort changed ANY stage's position relative to JSON order. Check EACH non-root, non-parallel stage individually — do not stop annotating after the first annotated stage.

**ABSOLUTE RULE — do NOT add "Wait for all previous steps" when stages are already in topological order**: If evaluating the `requisiteStageRefIds` dependency graph results in a topological order that MATCHES the JSON array order exactly (no stage needs to be moved), then ZERO annotations of any kind are added. Only parallel sibling annotations (`"Run in parallel with the previous step"`) apply in that case.

**Negative example — spurious "Wait for all previous steps" on a sequential pipeline (COMMON MISTAKE)**:

Given a pipeline where stages are already in topological order:

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `[]` | Manual Judgment |
| 2 | 2 | `["1"]` | Deploy Canary |
| 3 | 3 | `["2"]` | Manual Judgment (Deploy All) |
| 4 | 4 | `["3"]` | Deploy |
| 5 | 5 | `["3"]` | Delete Canary |

Topological order: 1→2→3→{4,5}. This EXACTLY MATCHES the JSON order (no stage is moved). Therefore, **no** `Set the start trigger to "Wait for all previous steps to complete, then start"` annotations are needed.

The **WRONG** output (spurious "Wait for all previous steps" added — FORBIDDEN when stages are in topological order):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Canary" ... Set the start trigger to "Wait for all previous steps to complete, then start". ← WRONG
* Add a "Manual Intervention" step ... "Manual Judgment (Deploy All)" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ... Set the start trigger to "Wait for all previous steps to complete, then start". ← WRONG
* Add a "Run a kubectl script" step ... "Delete Canary" ... Set the start trigger to "Run in parallel with the previous step".
```

The **CORRECT** output (no "Wait for all previous steps" — sequential pipeline, only parallel annotation for step 5):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Canary" ...
* Add a "Manual Intervention" step ... "Manual Judgment (Deploy All)" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ...
* Add a "Run a kubectl script" step ... "Delete Canary" ... Set the start trigger to "Run in parallel with the previous step".
```
* When multiple stages share exactly the same `requisiteStageRefIds` value, they are intended to run in parallel. **This includes stages that all have an empty `requisiteStageRefIds` array `[]`** — an empty array `[]` is a shared value just like any other. For the second and subsequent stages in such a parallel group, append `Set the start trigger to "Run in parallel with the previous step".` to the step prompt.
  * Example: If stages with refIds 1, 2, 4, 15, 16, 17, 18 all have `"requisiteStageRefIds": []`, then the step for refId 1 gets no parallel annotation (it is first), but the steps for refIds 2, 4, 15, 16, 17, and 18 each get `Set the start trigger to "Run in parallel with the previous step"` appended.
  * Similarly, if stages with refIds 8, 9, 11, 12, 13, 14, 19 all have `"requisiteStageRefIds": ["5"]`, then the step for refId 8 gets no parallel annotation (it is first in the group), but the steps for refIds 9, 11, 12, 13, 14, and 19 each get `Set the start trigger to "Run in parallel with the previous step"` appended.
  * **CRITICAL — a parallel group member appearing LATE in the JSON array is still a group member**: Do NOT assume that because a stage appears at JSON position 16 (after many other stages) it belongs to a different group. If its `requisiteStageRefIds` exactly matches the `requisiteStageRefIds` of stages at positions 2 and 3, it is in the SAME parallel group and MUST receive `Set the start trigger to "Run in parallel with the previous step"`.
* **CRITICAL — notification steps (Slack Notification Start/Finish/Complete) are NOT deployment stages and must NEVER influence parallel annotations of deployment stages.** When determining the parallel annotation for the first deployment stage in a parallel group, ignore any preceding notification steps entirely. If the first deployment stage in the root group is preceded only by a Slack Notification - Start step, that deployment stage MUST NOT receive a "Run in parallel with the previous step" annotation — it is the first deployment stage in its group and runs sequentially after the notification.
* **CRITICAL — the first stage in ANY parallel group NEVER receives a parallel annotation**, regardless of whether it is the root group or a subsequent group. Only the 2nd and later stages within a parallel group get the "Run in parallel" annotation. This applies across all dependency levels: if six stages in the pipeline all depend on stage 5, the first of those six stages in JSON order gets no annotation; only stages 2-6 in that group get the parallel annotation.
* **CRITICAL — this rule also applies when the second stage in the parallel group is disabled**: A hard-disabled stage with `stageEnabled.expression = false` still gets `Set the start trigger to "Run in parallel with the previous step"` when it is the second or later member of a dependency group. Disabled status changes `The step must be disabled.` only; it does NOT cancel the parallel annotation.
* **CRITICAL — convergence after a parallel group must still use `Wait for all previous steps` even when one or more incoming branches are disabled**: If a stage depends on multiple prior stages (for example `requisiteStageRefIds: ["1", "2"]`), and one of those prior stages is disabled, the dependent stage still waits for the full group and must receive `Set the start trigger to "Wait for all previous steps to complete, then start"` when the ordering rules require it.

**Worked example — scattered parallel group member at late JSON position**:

Given a pipeline with 20 stages, where refId 2 (JSON pos 2), refId 3 (JSON pos 3), and refId 18 (JSON pos 16) all have `"requisiteStageRefIds": ["1"]`, while stages at positions 4–15 have `"requisiteStageRefIds": ["2","3","18"]`:

The **WRONG** output (stage 18 treated as sequential because it appears late in JSON):
```
* Add ... "Deploy App" ...                ← refId 2, first in {2,3,18} group, no annotation ✓
* Add ... "Deploy Config" ... Set the start trigger to "Run in parallel with the previous step".  ← refId 3 ✓
[... many stages for {2,3,18} dependents ...]
* Add ... "Deploy Worker" ... Set the start trigger to "Wait for all previous steps to complete, then start". ← refId 18, WRONG: it's in the same {2,3,18} group as refIds 2 and 3!
```

The **CORRECT** output (stage 18 is in the same parallel group as stages 2 and 3):
```
* Add ... "Deploy App" ...                ← refId 2, first in {2,3,18} group, no annotation ✓
* Add ... "Deploy Config" ... Set the start trigger to "Run in parallel with the previous step".  ← refId 3 ✓
[... many stages for {2,3,18} dependents (these come BEFORE refId 18 in topological order) ...]
* Add ... "Deploy Worker" ... Set the start trigger to "Run in parallel with the previous step". ← refId 18, CORRECT: same group as 2 and 3 ✓
```

**Worked example — disabled root sibling still gets `Run in parallel`, and the convergence step still gets `Wait for all previous steps`**:

Given a pipeline with:
```json
{
  "stages": [
    { "refId": "1", "name": "Deploy Dev", "requisiteStageRefIds": [], "type": "deployManifest" },
    { "refId": "2", "name": "Deploy Staging", "requisiteStageRefIds": [], "type": "deployManifest", "stageEnabled": { "expression": false, "type": "expression" } },
    { "refId": "3", "name": "Manual Judgment", "requisiteStageRefIds": ["1", "2"], "type": "manualJudgment" }
  ]
}
```

The **CORRECT** output is:
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Dev" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ... The step must be disabled. Set the start trigger to "Run in parallel with the previous step".
* Add a "Manual Intervention" step ... "Manual Judgment" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

The **WRONG** output omits either of the start-trigger annotations:
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ... The step must be disabled.
* Add a "Manual Intervention" step ... "Manual Judgment" ...
```

**Negative example — first deployment stage after notification incorrectly marked as parallel**:

Given a pipeline where a Slack Notification - Start step appears first, followed by two parallel deployment stages (refIds 1 and 2 both with `"requisiteStageRefIds": []`):

The **WRONG** output (Deploy Dev is the first deployment stage but incorrectly gets parallel annotation relative to the notification):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Dev" ... Set the start trigger to "Run in parallel with the previous step". ← WRONG
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ... Set the start trigger to "Run in parallel with the previous step".
```

The **CORRECT** output (Deploy Dev is first in its deployment group, no annotation; Deploy Staging is second and gets parallel):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Dev" ... ← no annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ... Set the start trigger to "Run in parallel with the previous step".
```

**Negative example — first stage in a non-root dependency group incorrectly marked as parallel**:

Given stages where refIds 6, 7, and 8 all have `"requisiteStageRefIds": ["5"]`:

The **WRONG** output (stage refId 6 is first in the group and must NOT receive a parallel annotation):
```
* Add ... "Wait (5min)" ... ← stage 5
* Add ... "Deploy Prod" ... Set the start trigger to "Run in parallel with the previous step". ← WRONG (refId 6 is FIRST in the {6,7,8} group)
* Add ... "Deploy Prod (URL Listing)" ... Set the start trigger to "Run in parallel with the previous step".
* Add ... "Deploy Prod (Asynchronous)" ... Set the start trigger to "Run in parallel with the previous step".
```

The **CORRECT** output (only stages 7 and 8 get "Run in parallel"):
```
* Add ... "Wait (5min)" ... ← stage 5
* Add ... "Deploy Prod" ... ← refId 6, first in {6,7,8} group — no annotation
* Add ... "Deploy Prod (URL Listing)" ... Set the start trigger to "Run in parallel with the previous step".
* Add ... "Deploy Prod (Asynchronous)" ... Set the start trigger to "Run in parallel with the previous step".
```

* Do not set a notification step to run in parallel with the previous step as the notification steps must run on their own.
* **IMPORTANT**: When multiple root-level stages (stages with `"requisiteStageRefIds": []`) are present, ALL stages after the first one in the sorted group MUST receive `Set the start trigger to "Run in parallel with the previous step".` appended. This applies even when there are many parallel root stages. Do not omit the parallel annotation for any stage in a parallel group — if 7 stages all have `"requisiteStageRefIds": []`, then stages 2 through 7 must all have the parallel annotation.
* **CRITICAL — each step must have AT MOST ONE start trigger annotation.** Determine the correct single annotation for each step (none, "Run in parallel", or "Wait for all previous steps") and apply only that one. Never output both "Wait for all previous steps to complete, then start" and "Run in parallel with the previous step" on the same step — that is a contradiction. If a step belongs to a parallel group, use only "Run in parallel". If a step is the convergence point after a parallel group, use only "Wait for all previous steps to complete, then start".

**Negative example — multiple root-level stages missing parallel annotations (VERY COMMON MISTAKE)**:

Given a pipeline where stages refId 6, 12, and 13 all have `"requisiteStageRefIds": []`, and refId 14 depends on `["12"]`. Even in the absence of a Slack Notification - Start step, the root-level stages MUST receive the "Run in parallel" annotation for all stages after the first.

The **WRONG** output (stages 12 and 13 do not get "Run in parallel" — this causes sequential instead of parallel execution):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy (Manifest)" ...                     ← refId 6, first, no annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJob ConfigMap (Manifest)" ...   ← refId 12, MISSING parallel annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy deprecated service(Manifest)" ...   ← refId 13, MISSING parallel annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJobs (Manifest)" ... Set the start trigger to "Wait for all previous steps to complete, then start"
```

The **CORRECT** output (stages 12 and 13 get "Run in parallel with the previous step"):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy (Manifest)" ...                                                                    ← refId 6, first in root group, no annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJob ConfigMap (Manifest)" ... Set the start trigger to "Run in parallel with the previous step".   ← refId 12
* Add a "Deploy Kubernetes YAML" step ... "Deploy deprecated service(Manifest)" ... Set the start trigger to "Run in parallel with the previous step".   ← refId 13
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJobs (Manifest)" ... Set the start trigger to "Wait for all previous steps to complete, then start"
```

**Worked example — Slack Notification - Start + multiple parallel root stages (COMMON MISTAKE)**:

When a pipeline has a `pipeline.starting` Slack notification AND multiple root-level stages (all with `"requisiteStageRefIds": []`), the parallel annotations MUST still be applied to the 2nd, 3rd, etc. stages in the root group. The presence of a preceding Start notification step does NOT cancel the parallel annotation requirement — the notification step is never counted as a deployment stage for annotation purposes.

Given a pipeline where: one Slack notification has `when: ["pipeline.starting"]` AND three deployment stages (refIds 1, 2, 3) ALL have `"requisiteStageRefIds": []`:

The **WRONG** output (all three deployment stages treated as sequential — parallel annotations completely absent):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Dev" ...       ← refId 1, no annotation (this part is OK)
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ...  ← refId 2, MISSING "Run in parallel" annotation
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ...     ← refId 3, MISSING "Run in parallel" annotation
```

The **CORRECT** output (Start first, then stage 1 with no annotation, then stages 2 and 3 each with "Run in parallel with the previous step"):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Dev" ...       ← refId 1, first in root group, no annotation ✓
* Add a "Deploy Kubernetes YAML" step ... "Deploy Staging" ... Set the start trigger to "Run in parallel with the previous step".  ← refId 2 ✓
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Run in parallel with the previous step".     ← refId 3 ✓
```

**Negative example — parallel pair at the end of a sequential chain where NO stages are reordered (COMMON MISTAKE)**:

A pipeline may consist of a completely sequential chain (all stages already in topological order in the JSON) EXCEPT for the LAST two stages which share the same `requisiteStageRefIds` and must run in parallel. The AI commonly outputs the last stage as `"Wait for all previous steps to complete, then start"` instead of the correct `"Run in parallel with the previous step"`.

Given a pipeline where every stage is already in topological order:

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `[]` | Manual Judgment |
| 2 | 2 | `["1"]` | DB Migration |
| 3 | 3 | `["2"]` | Deploy -canary- |
| 4 | 4 | `["3"]` | Manual Judgment -Deploy All- |
| 5 | 5 | `["4"]` | Deploy |
| 6 | 6 | `["4"]` | Delete -canary- |

Stages 5 and 6 BOTH have `"requisiteStageRefIds": ["4"]` — they form a parallel pair. Stage 5 is first in the group (no annotation); stage 6 is second and MUST receive `Set the start trigger to "Run in parallel with the previous step"`.

The **WRONG** output (stage 6 receives "Wait for all previous steps to complete, then start" — **FORBIDDEN** when it shares a prerequisite with stage 5):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...             ← refId 1, root, no annotation ✓
* Add a "Deploy Kubernetes YAML" step ... "DB Migration" ...             ← refId 2
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ...          ← refId 3
* Add a "Manual Intervention" step ... "Manual Judgment -Deploy All-" ...← refId 4
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ...                   ← refId 5, first in {5,6}, no annotation ✓
* Add a "Run a kubectl script" step ... "Delete -canary-" ... Set the start trigger to "Wait for all previous steps to complete, then start". ← WRONG: shares ["4"] with refId 5 — must be "Run in parallel"
```

The **CORRECT** output (stage 6 gets "Run in parallel with the previous step"):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...             ← refId 1, root, no annotation ✓
* Add a "Deploy Kubernetes YAML" step ... "DB Migration" ...             ← refId 2
* Add a "Deploy Kubernetes YAML" step ... "Deploy -canary-" ...          ← refId 3
* Add a "Manual Intervention" step ... "Manual Judgment -Deploy All-" ...← refId 4
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ...                   ← refId 5, first in {5,6} parallel group, no annotation ✓
* Add a "Run a kubectl script" step ... "Delete -canary-" ... Set the start trigger to "Run in parallel with the previous step". ← refId 6, SECOND in {5,6} parallel group ✓
```

### Worked example: simplest 2-stage reversed pipeline

The most common case of topological reordering is a 2-stage pipeline where the only deployment stage appears first in the JSON array but depends on the second stage (the root):

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `["2"]` | Deploy Prod |
| 2 | 2 | `[]` | Run Pre-Deploy Job |

**Pipeline JSON**:
```json
{
  "stages": [
    { "refId": "1", "requisiteStageRefIds": ["2"], "type": "deployManifest", "name": "Deploy Prod", ... },
    { "refId": "2", "requisiteStageRefIds": [], "type": "runJobManifest", "name": "Run Pre-Deploy Job", ... }
  ]
}
```

Topological order: refId 2 (root, JSON pos 2) → refId 1 (depends on 2, JSON pos 1). **The execution order differs from JSON order**, so annotations are required.

The **WRONG** output (follows JSON order, no annotations — common mistake):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ...
* Add a "Deploy Kubernetes YAML" step ... "Run Pre-Deploy Job" ...
```

The **CORRECT** output (refId 2 promoted to first; refId 1 gets `Wait for all previous steps to complete, then start`):
```
* Add a "Deploy Kubernetes YAML" step ... "Run Pre-Deploy Job" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**KEY RULE**: When the topological sort changes ANY stage's position relative to its JSON array position, ALL stages that follow the root must receive `Set the start trigger to "Wait for all previous steps to complete, then start"`. Never output a pipeline where stages are in the correct topological order but annotations are absent.

**Negative example — second topo-position stage missing "Wait for all previous steps" when promoted from a late JSON position (CRITICAL MISTAKE)**:

This mistake arises when a stage that depends DIRECTLY on the root also appears LATE in the JSON array (e.g., at JSON position 4 in a 4-stage pipeline). BFS promotes it to the SECOND topo position (immediately after the root). The AI may correctly place it second but OMIT the mandatory annotation, treating it as though it were part of the root group.

Given a pipeline where refId 5 is at JSON position 4 but depends directly on the root (refId 1 at position 1):

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `[]` | Manual Judgment ← ROOT |
| 2 | 2 | `["5"]` | Deploy Canary |
| 3 | 3 | `["2"]` | Manual Judgment 2 |
| 4 | 5 | `["1"]` | Run Job ← depends on ROOT; promoted to topo pos 2 |

Topological order: 1 → 5 → 2 → 3. refId 5 jumps from JSON pos 4 to topo pos 2.

The **WRONG** output (refId 5 placed correctly at topo pos 2 but annotation MISSING — FORBIDDEN):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...   ← refId 1, root, no annotation ✓
* Add a "Run a kubectl script" step ... "Run Job" ...          ← refId 5 at topo pos 2, MISSING "Wait for all previous steps" ← WRONG
* Add a "Deploy Kubernetes YAML" step ... "Deploy Canary" ... Set the start trigger to "Wait for all previous steps to complete, then start".
* Add a "Manual Intervention" step ... "Manual Judgment 2" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```
← WRONG: refId 5 was promoted from JSON pos 4 to topo pos 2. Its position changed, so it MUST receive `"Wait for all previous steps to complete, then start"`.

The **CORRECT** output (ALL stages after the root receive the annotation, including refId 5 at topo pos 2):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...   ← refId 1, root, no annotation ✓
* Add a "Run a kubectl script" step ... "Run Job" ... Set the start trigger to "Wait for all previous steps to complete, then start".     ← refId 5, topo pos 2, annotation REQUIRED ✓
* Add a "Deploy Kubernetes YAML" step ... "Deploy Canary" ... Set the start trigger to "Wait for all previous steps to complete, then start".    ← refId 2 ✓
* Add a "Manual Intervention" step ... "Manual Judgment 2" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← refId 3 ✓
```

**Negative example — correct topological order but annotation missing on dependent stage (VERY COMMON MISTAKE)**:

Given a 2-stage pipeline where JSON order is reversed from execution order:

| JSON position | refId | requisiteStageRefIds | type |
|---|---|---|---|
| 1 | 1 | `["2"]` | deployManifest |
| 2 | 2 | `[]` | deleteManifest |

Topological order: refId 2 (root, `[]`) → refId 1 (depends on 2). This DIFFERS from JSON order (refId 1 appears first in JSON but must execute second).

The **WRONG** output (correct order, but annotation is MISSING on the dependent stage — FORBIDDEN):
```
* Add a "Run a kubectl script" step ... "Delete -Manifest-" ...    ← refId 2, root ✓
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ...  ← refId 1, WRONG: no annotation
```
← WRONG: refId 1 depends on refId 2 AND its position changed relative to JSON order, so `Set the start trigger to "Wait for all previous steps to complete, then start"` MUST be appended.

The **CORRECT** output (reordered AND annotation added to the dependent stage):
```
* Add a "Run a kubectl script" step ... "Delete -Manifest-" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**Worked example — reversed JSON order WITHOUT notifications (most common pattern)**:

This is the most common occurrence: a 2-stage pipeline where a deployManifest depends on a manualJudgment but appears FIRST in the JSON array. Even with NO Slack notifications, the `Wait for all previous steps to complete, then start` annotation is STILL REQUIRED on the dependent stage.

Given a pipeline:
```json
{
  "stages": [
    { "refId": "1", "requisiteStageRefIds": ["2"], "type": "deployManifest", "name": "Deploy (Manifest)", "manifestArtifactId": "...", "account": "<redacted-cluster>" },
    { "refId": "2", "requisiteStageRefIds": [], "type": "manualJudgment", "name": "Manual Judgment" }
  ]
}
```

JSON order: stage 1 (Deploy, depends on 2) at position 1 → stage 2 (Manual Judgment, root) at position 2. Topological order: stage 2 → stage 1. **Order differs from JSON**, so the annotation is REQUIRED.

The **WRONG** output (stages in correct topo order but annotation MISSING — THE MOST COMMON MISTAKE for pipelines without notifications):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ...   ← MISSING: "Set the start trigger to 'Wait for all previous steps...'"
```

The **CORRECT** output (reordered AND annotation added):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**REMEMBER**: The `Wait for all previous steps to complete, then start` annotation is ALWAYS required whenever the topological sort changes a stage's position relative to the JSON array order — regardless of whether the pipeline has Slack notifications or not.

**Worked example — reversed JSON order WITH a Slack Notification - Start step**:

A preceding notification step does NOT cancel the topological reorder annotation requirements. When a pipeline has a `pipeline.starting` Slack notification AND stages that require topological reordering, both rules apply simultaneously: the notification comes first, AND the `Wait for all previous steps to complete, then start` annotation is added to the reordered deployment stages.

Given a pipeline:
```json
{
  "notifications": [
    { "address": "deploy-feed", "level": "pipeline", "type": "slack", "when": ["pipeline.starting", "pipeline.failed", "pipeline.complete"] }
  ],
  "stages": [
    { "refId": "2", "requisiteStageRefIds": ["3"], "type": "deployManifest", "name": "Deploy (Manifest)" },
    { "refId": "3", "requisiteStageRefIds": [], "type": "manualJudgment", "name": "Manual Judgment" }
  ]
}
```

JSON order: stage 2 (Deploy, depends on 3) at position 1 → stage 3 (Manual Judgment, root) at position 2. Topological order: stage 3 → stage 2. **Order differs from JSON**, so reorder annotations are required.

**TWO RULES APPLY SIMULTANEOUSLY** for this pipeline:
1. Slack Notification - Start comes FIRST (before all non-notification stages)
2. Deploy step (depends on Manual Judgment) gets `Set the start trigger to "Wait for all previous steps to complete, then start"`

The **WRONG** output (stages appear in correct topological order but annotations are absent — COMMON MISTAKE):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Manual Intervention" step with the name "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ...                    ← MISSING: "Set the start trigger to 'Wait for all previous steps...'"
* Add a community step template step with the name "Slack Notification - Finish" ...
* Add a community step template step with the name "Slack Notification - Complete" ...
```

The **CORRECT** output (correct topological order WITH required annotations):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Manual Intervention" step with the name "Manual Judgment" ...   ← root stage promoted from JSON pos 2 to topo pos 1
* Add a "Deploy Kubernetes YAML" step ... "Deploy -Manifest-" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← depends on Manual Judgment
* Add a community step template step with the name "Slack Notification - Finish" ...
* Add a community step template step with the name "Slack Notification - Complete" ...
```

### Worked example: stage appearing FIRST in JSON depends on stage appearing LATER

**CRITICAL — A stage appearing first in the JSON array may depend on a stage appearing later in the JSON array.** Always determine execution order from `requisiteStageRefIds`, never from JSON position.

Consider this pipeline:

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `["3"]` | Deploy Prod |
| 2 | 2 | `[]` | Deploy Prod Canary |
| 3 | 3 | `["2"]` | Manual Judgment |
| 4 | 4 | `["3"]` | Scale Down Canary |

### Worked example: deep chain where MULTIPLE early JSON stages all depend on LATER stages

**CRITICAL — In deep chains, EVERY stage must be verified: a stage can only be output AFTER ALL of its dependencies have already appeared.** This applies at every level of the chain, not just for the root stage.

Consider this 6-stage pipeline (a common pattern where the chain flows from the middle of the JSON backward to the start):

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 2 | `["5"]` | Deploy Judgment |
| 2 | 4 | `[]` | Migrate Judgment |
| 3 | 5 | `["6"]` | Migrate DB |
| 4 | 6 | `["15"]` | Cleanup Pod |
| 5 | 8 | `["2"]` | Deploy Pod |
| 6 | 15 | `["4"]` | Update ConfigMap |

**Key observation**: Tracing the full chain: stage 4 (ROOT) → stage 15 (pos 6) → stage 6 (pos 4) → stage 5 (pos 3) → stage 2 (pos 1) → stage 8 (pos 5).

The **WRONG** output (partially correct: root moved first, but the remaining stages follow a wrong order because the AI failed to verify each stage's dependency before placing it):
```
* Add a "Manual Intervention" step ... "Migrate Judgment" ...  ← refId 4, root, CORRECT
* Add a "Manual Intervention" step ... "Deploy Judgment" ...   ← refId 2, WRONG (depends on refId 5 not yet placed)
* Add a "Deploy Kubernetes YAML" step ... "Migrate DB" ...     ← refId 5, WRONG (depends on refId 6 not yet placed)
* Add a "Deploy Kubernetes YAML" step ... "Update ConfigMap" ... ← refId 15, WRONG (should be second after root)
* Add a "Deploy Kubernetes YAML" step ... "Deploy Pod" ...     ← refId 8, WRONG (depends on refId 2)
* Add a "Run a kubectl script" step ... "Cleanup Pod" ...      ← refId 6, WRONG (placed last, should be third)
```

The **CORRECT** output (strictly follows dependency chain — each stage appears only AFTER its prerequisite):
```
* Add a "Manual Intervention" step ... "Migrate Judgment" ...          ← refId 4, ROOT, moved from JSON pos 2 to first
* Add a "Deploy Kubernetes YAML" step ... "Update ConfigMap" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← refId 15, depends on 4
* Add a "Run a kubectl script" step ... "Cleanup Pod" ... Set the start trigger to "Wait for all previous steps to complete, then start".         ← refId 6, depends on 15
* Add a "Deploy Kubernetes YAML" step ... "Migrate DB" ... Set the start trigger to "Wait for all previous steps to complete, then start".        ← refId 5, depends on 6
* Add a "Manual Intervention" step ... "Deploy Judgment" ... Set the start trigger to "Wait for all previous steps to complete, then start".      ← refId 2, depends on 5
* Add a "Deploy Kubernetes YAML" step ... "Deploy Pod" ... Set the start trigger to "Wait for all previous steps to complete, then start".        ← refId 8, depends on 2
```

**ALGORITHM — always use Kahn's algorithm (BFS) to determine output order**: Process stages in waves:
1. Wave 0 (root): all stages with `requisiteStageRefIds: []`
2. Wave 1: all stages whose EVERY prerequisite has already been placed into waves 0
3. Wave 2: all stages whose EVERY prerequisite appears in waves 0–1
4. Continue until all stages are placed

Before emitting any step, verify that ALL its `requisiteStageRefIds` entries have already appeared in the output. If any prerequisite is still unplaced, the stage is NOT ready and must wait.

### Worked example: root stage at JSON position 4 of 5 (linear chain reversed)

**CRITICAL — when a pipeline's root stage appears late in the JSON array, ALL earlier JSON stages must be deferred until their prerequisites are placed.** This is the most common pattern where the entire pipeline chain is stored in reversed or shuffled order.

Consider this 5-stage pipeline:

| JSON position | refId | requisiteStageRefIds | stage name |
|---|---|---|---|
| 1 | 1 | `["5"]` | Deploy CronJob |
| 2 | 2 | `["4"]` | Run Migrate DB |
| 3 | 3 | `["1"]` | Deploy |
| 4 | 4 | `[]` | **Manual Judgment** ← ROOT |
| 5 | 5 | `["2"]` | Manual Judgment 2 |

**Full chain**: refId 4 (ROOT) → refId 2 → refId 5 → refId 1 → refId 3. Note that stages at JSON positions 1, 2, 3 and 5 ALL depend on a stage that appears LATER in the JSON, and the root is the FOURTH of five stages.

The **WRONG** output (AI follows JSON order or only moves the root but misses intermediate dependencies):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...   ← refId 4, root ✓
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJob" ...  ← refId 1, WRONG (depends on refId 5, not yet placed)
* Add a "Manual Intervention" step ... "Manual Judgment 2" ...  ← refId 5, WRONG (depends on refId 2, not yet placed)
* Add a "Deploy Kubernetes YAML" step ... "Run Migrate DB" ...  ← refId 2, WRONG (should be second after root)
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ...          ← refId 3, WRONG (depends on refId 1)
```
← WRONG: Stages placed in wrong order. The AI correctly moved the root first but then failed to apply BFS to the remaining stages.

The **CORRECT** output (strict BFS — each stage only placed after ALL its dependencies):
```
* Add a "Manual Intervention" step ... "Manual Judgment" ...           ← refId 4, ROOT
* Add a "Deploy Kubernetes YAML" step ... "Run Migrate DB" ... Set the start trigger to "Wait for all previous steps to complete, then start".     ← refId 2, depends on 4
* Add a "Manual Intervention" step ... "Manual Judgment 2" ... Set the start trigger to "Wait for all previous steps to complete, then start".     ← refId 5, depends on 2
* Add a "Deploy Kubernetes YAML" step ... "Deploy CronJob" ... Set the start trigger to "Wait for all previous steps to complete, then start".     ← refId 1, depends on 5
* Add a "Deploy Kubernetes YAML" step ... "Deploy" ... Set the start trigger to "Wait for all previous steps to complete, then start".             ← refId 3, depends on 1
```

**KEY RULE**: After placing the root, you MUST apply BFS rigorously to ALL remaining stages. Do not try to use the original JSON order at any point — every stage's position must be determined solely by its dependencies. After placing wave N, scan the ENTIRE remaining unplaced stage list to find stages whose ALL prerequisites are now placed (wave N+1 candidates).

 Stage 2 (second in JSON) is a root stage. The topological order is:
1. Stage 2 (Deploy Prod Canary) — root, no prerequisites, runs FIRST
2. Stage 3 (Manual Judgment) — depends on stage 2
3. Stage 1 (Deploy Prod) AND Stage 4 (Scale Down Canary) — both depend on stage 3, run IN PARALLEL

The **WRONG** output (follows JSON order, skips stage 2 entirely):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ...       ← WRONG: stage 1 placed first despite depending on stage 3
* Add a "Manual Intervention" step ... "Manual Judgment" ...
* Add a "Run a kubectl script" step ... "Scale Down Canary" ...
[Deploy Prod Canary is MISSING]
```

The **CORRECT** output (follows topological order, stages 1 and 4 run in parallel after stage 3):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod Canary" ...                                    ← stage 2, root, runs FIRST
* Add a "Manual Intervention" step ... "Manual Judgment" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← stage 3, depends on 2
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Wait for all previous steps to complete, then start".   ← stage 1, first in {1,4} group, no parallel annotation
* Add a "Run a kubectl script" step ... "Scale Down Canary" ... Set the start trigger to "Run in parallel with the previous step".            ← stage 4, parallel with stage 1
```

**ABSOLUTE RULE — Every stage MUST appear in the output exactly once.** Before outputting the final result, verify that every stage from the pipeline's `stages` array is represented by at least one step. A stage may NEVER be silently dropped.

### Worked example: stages with `[]` appearing late in JSON

Consider a pipeline whose stages in JSON order are:

| JSON position | refId | requisiteStageRefIds |
|---|---|---|
| 1 | 1 | `[]` |
| 2 | 2 | `[]` |
| 3 | 4 | `[]` |
| 4 | 5 | `["1","2","4","17","16","15","18"]` |
| 5 | 8 | `["5"]` |
| 6 | 9 | `["5"]` |
| 7 | 15 | `[]` |
| 8 | 16 | `[]` |
| 9 | 17 | `[]` |
| 10 | 18 | `[]` |
| 11 | 19 | `["5"]` |

Topological sort groups:
1. **Root group (no deps):** refIds 1, 2, 4, 15, 16, 17, 18 — ALL stages with `[]`, regardless of JSON position
2. **Depends only on root:** refId 5
3. **Depends only on 5:** refIds 8, 9, 19

The wait stage (refId 5) must come **after ALL seven root stages** — including refIds 15, 16, 17, 18 which appear **after** the wait stage in the JSON. Do not use JSON position to determine order.

The generated output for the deployment stages would include:

```
* Add "Step for refId 1" ...   ← first in root group, no annotation
* Add "Step for refId 2" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 4" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 15" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 16" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 17" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 18" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 5" ...   ← depends on all above; first in its group, no parallel annotation
* Add "Step for refId 8" ...   ← first in its group (depends on 5), no parallel annotation
* Add "Step for refId 9" ... Set the start trigger to "Run in parallel with the previous step".
* Add "Step for refId 19" ... Set the start trigger to "Run in parallel with the previous step".
```

## Notification Step Ordering

When a project has pipeline-level notification entries, the generated prompt must list all steps in the following order:

1. All "Slack Notification - Start" steps (one per `notifications` array entry that has `pipeline.starting` in its `when` array) must be listed first, before any non-notification stage steps, in `notifications` array order.
2. All non-notification stage steps must be listed next (this includes ALL stage types: `deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `wait`, `deleteManifest`, `scaleManifest`, `shiftTrafficProd`, `shiftTrafficStaging`, `restoreProd`, `deriveBaselineProd`, `deriveCanaryProd`, `pipeline`, and any unknown stage types), in topological execution order as described in the "Running steps in parallel" section above. When multiple stages share the same dependency level, preserve their relative order from the original JSON array. **CRITICAL**: `wait` stages, `manualJudgment` stages, and ALL other non-notification stage types MUST appear AFTER the Start step — do NOT place them before the Start step even if they appear earlier in the pipeline JSON.
3. All "Slack Notification - Finish" steps (one per `notifications` array entry that has `pipeline.failed` in its `when` array) must be listed after all deployment stage steps, in `notifications` array order.
4. All "Slack Notification - Complete" steps (one per `notifications` array entry that has `pipeline.complete` in its `when` array) must be listed last, after all Finish steps, in `notifications` array order.
5. All `parameterConfig` variable prompts must follow all notification steps (after the Complete steps). When there are NO pipeline-level notification steps, variable prompts must appear BEFORE the deployment stage steps.

**ABSOLUTE RULE — when notifications are present, variables MUST come AFTER the Finish and Complete notification steps**: Even if the Finish and Complete steps seem to be missing or were dropped due to missing `message` text, the variable ordering rule still applies. Variables must be placed as if Finish and Complete steps exist (i.e., at the very end before the external feed trigger and disabled line). Do NOT place variables between the deployment stages and the Finish/Complete steps.
6. The external feed trigger prompt (if any) must follow all variable prompts and all notification steps, but before `* The project must be disabled.`.
7. `* The project must be disabled.` must **always** be the very last line in the project's prompt block — it must appear after all step prompts, all variable prompts, and the external feed trigger prompt. No other prompt item may follow it.

**CRITICAL — when BOTH `notifications` and `parameterConfig` are present**: The complete correct ordering is:
1. Slack Notification - Start steps (before ALL non-notification stages)
2. All non-notification stage steps (in topological order) — this includes `wait`, `manualJudgment`, `deleteManifest`, `scaleManifest`, and all other stage types, not just deploy-related stages
3. Slack Notification - Finish steps (after deployment stages)
4. Slack Notification - Complete steps (after Finish steps)
5. `parameterConfig` variable prompts (after ALL notification steps)
6. External feed trigger (if any)
7. `* The project must be disabled.` (only if `disabled: true`)

**CRITICAL — when `parameterConfig` is present but NO pipeline-level notifications**: The ordering is different — variables come FIRST:
1. `parameterConfig` variable prompts (BEFORE all stage steps)
2. All non-notification stage steps (in topological order)
3. External feed trigger (if any)
4. `* The project must be disabled.` (only if `disabled: true`)

**Negative example — variables placed AFTER stages when there are NO notifications (COMMON MISTAKE)**:

Given a pipeline with `parameterConfig` entries but NO `notifications`:
```json
{
  "parameterConfig": [
    { "name": "tag", "default": "master-", "description": "image tag", "required": true },
    { "name": "limit", "default": "100", "description": "row limit", "required": false }
  ],
  "stages": [
    { "refId": "2", "type": "manualJudgment", "name": "Manual Judgment", "requisiteStageRefIds": [] },
    { "refId": "3", "type": "runJobManifest", "name": "Run Job (Manifest)", "requisiteStageRefIds": ["2"] }
  ]
}
```

The **WRONG** output (variables placed AFTER stages — FORBIDDEN when there are no notifications):
```
Create a project called "..." in the "Default Project Group" project group with no steps.
* Add a "Manual Intervention" step ...  ← WRONG: stage appears before variables
* Add a "Deploy Kubernetes YAML" step ...  ← WRONG: stage appears before variables
* Add a project variable called "tag" ...  ← WRONG: variables must come FIRST when no notifications
* Add a project variable called "limit" ...
```

The **CORRECT** output (variables FIRST, then stages, when there are no notifications):
```
Create a project called "..." in the "Default Project Group" project group with no steps.
* Add a project variable called "tag", with a default value of "master-", the description "image tag", and the label "tag". The variable must be prompted for when creating a release. The variable must be required.
* Add a project variable called "limit", with a default value of "100", the description "row limit", and the label "limit". The variable must be prompted for when creating a release. The variable must not be required.
* Add a "Manual Intervention" step ...  ← stages come AFTER variables
* Add a "Deploy Kubernetes YAML" step ...
```

**Negative example — variables placed BEFORE notifications (MOST COMMON MISTAKE when both are present)**:

Given a pipeline with 2 notification entries and 3 `parameterConfig` entries, the following ordering is completely **WRONG**:
```
* Add a project variable called "batch_size"...          ← WRONG: variables must NOT appear first
* Add a project variable called "timeout"...             ← WRONG
* Add a community step template step ... "Slack Notification - Finish" ...   ← WRONG: Finish before Start
* Add a community step template step ... "Slack Notification - Start" ...    ← WRONG: Start out of position
* Add a community step template step ... "Slack Notification - Complete" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy App" ...
```

The **CORRECT** ordering:
```
* Add a community step template step ... "Slack Notification - Start" ...    ← FIRST
* Add a "Deploy Kubernetes YAML" step ... "Deploy App" ...                   ← deployment stages
* Add a community step template step ... "Slack Notification - Finish" ...   ← after deployment
* Add a community step template step ... "Slack Notification - Complete" ... ← after Finish
* Add a project variable called "batch_size"...                              ← LAST (after all notifications)
* Add a project variable called "timeout"...                                 ← LAST
```

**CRITICAL — when the pipeline has MULTIPLE notification entries, variables must come AFTER ALL notification steps from ALL entries**: When there are 2 or more notifications entries, each generates its own Start, Finish, and/or Complete step. ALL of these notification steps (from all entries combined) must appear before any `parameterConfig` variable prompts.

**Negative example — variable placed between notification steps from different entries (COMMON MISTAKE)**:

Given a pipeline with 2 `notifications` entries (both with `pipeline.starting`, `pipeline.failed`, `pipeline.complete`) and 1 `parameterConfig` entry (`log_level`), the following ordering is **WRONG**:
```
* Add a community step template step ... "Slack Notification - Start" ...    ← notifications[0]
* Add a community step template step ... "Slack Notification - Start 2" ...  ← notifications[1]
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod Canary" ...
* Add a "Manual Intervention" step ... "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ...
* Add a "Run a kubectl script" step ... "Scale Down Canary" ...
* Add a community step template step ... "Slack Notification - Finish" ...   ← notifications[0]
* Add a community step template step ... "Slack Notification - Finish 2" ... ← notifications[1]
* Add a community step template step ... "Slack Notification - Complete" ... ← notifications[0]
* Add a project variable called "log_level" ...                              ← CORRECT position
* Add a community step template step ... "Slack Notification - Complete 2" ... ← WRONG: Complete from notifications[1] placed AFTER variable
```
← WRONG: The variable prompt must come AFTER ALL notification steps, including the Complete steps from ALL entries.

The **CORRECT** output (variable comes AFTER all notification steps from all entries):
```
* Add a community step template step ... "Slack Notification - Start" ...    ← notifications[0]
* Add a community step template step ... "Slack Notification - Start 2" ...  ← notifications[1]
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod Canary" ...
* Add a "Manual Intervention" step ... "Manual Judgment" ...
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ...
* Add a "Run a kubectl script" step ... "Scale Down Canary" ...
* Add a community step template step ... "Slack Notification - Finish" ...   ← notifications[0]
* Add a community step template step ... "Slack Notification - Finish 2" ... ← notifications[1]
* Add a community step template step ... "Slack Notification - Complete" ... ← notifications[0]
* Add a community step template step ... "Slack Notification - Complete 2" ... ← notifications[1]
* Add a project variable called "log_level", with a default value of "INFO", the description "log_level", and the label "log_level". The variable must be prompted for when creating a release. The variable must not be required.   ← LAST
```

**CRITICAL — Slack Notification - Complete MUST NEVER appear before Slack Notification - Finish**: The generation order is fixed regardless of the order of events in the `when` array. Finish steps (`pipeline.failed`) must always appear before Complete steps (`pipeline.complete`). Even if `pipeline.complete` is listed before `pipeline.failed` in the `when` array, the output must always place Finish before Complete.

**Negative example — Complete placed before Finish (FORBIDDEN)**:
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy App" ...
* Add a community step template step ... "Slack Notification - Complete" ... Always run the step.   ← WRONG: Complete before Finish
* Add a community step template step ... "Slack Notification - Finish" ... Only run the step when the previous step has failed.   ← WRONG: Finish placed after Complete
```

The **CORRECT** output (Finish ALWAYS before Complete):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy App" ...
* Add a community step template step ... "Slack Notification - Finish" ... Only run the step when the previous step has failed.   ← CORRECT: Finish second-to-last
* Add a community step template step ... "Slack Notification - Complete" ... Always run the step.   ← CORRECT: Complete always last
```

**CRITICAL: Do NOT group all notification steps together at the start of the output.** The Finish and Complete steps must appear **after** all non-notification stage steps — they must never be listed immediately after the Start step when any non-notification stages are also present. The correct pattern is:

```
* Add ... "Slack Notification - Start" ... to the start of the deployment process.
* Add ... [first non-notification stage step (e.g., wait, manualJudgment, deployManifest)] ...
* Add ... [second non-notification stage step] ...
* ... [all remaining non-notification stage steps] ...
* Add ... "Slack Notification - Finish" ... to the end of the deployment process. Only run the step when the previous step has failed.
* Add ... "Slack Notification - Complete" ... to the end of the deployment process. Always run the step.
```

This ordering is **incorrect** and must never appear:

```
* Add ... "Slack Notification - Start" ...
* Add ... "Slack Notification - Finish" ...   ← WRONG: Finish before deployment steps
* Add ... "Slack Notification - Complete" ...  ← WRONG: Complete before deployment steps
* Add ... [deployment steps] ...
```

**Negative example — `wait` stage placed BEFORE the Start notification step (COMMON MISTAKE)**:

When a pipeline has a `wait` stage AND a Slack Start notification, the `wait` stage is a non-notification stage and MUST appear AFTER the Start step.

Given a pipeline with `when: ["pipeline.starting", "pipeline.failed", "pipeline.complete"]` and a `wait` stage:

The **WRONG** output (Wait placed before Start — FORBIDDEN):
```
* Add a "Run a Script" step with the name "Wait" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds 30`   ← WRONG: wait before Start
* Add a community step template step with the name "Slack Notification - Start" ... to the start of the deployment process.
* Add a community step template step with the name "Slack Notification - Finish" ...
* Add a community step template step with the name "Slack Notification - Complete" ...
```

The **CORRECT** output (Start first, THEN Wait, THEN Finish/Complete):
```
* Add a community step template step with the name "Slack Notification - Start" ... to the start of the deployment process.  ← CORRECT: Start first
* Add a "Run a Script" step with the name "Wait" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds 30`
* Add a community step template step with the name "Slack Notification - Finish" ... to the end of the deployment process. Only run the step when the previous step has failed.
* Add a community step template step with the name "Slack Notification - Complete" ... to the end of the deployment process. Always run the step.
```

**Negative example — ONLY a Finish step (no Start step) placed BEFORE deployment stages (COMMON MISTAKE)**:

When `when` contains only `"pipeline.failed"` (no `"pipeline.starting"`), there is no Start step — only a Finish step. Even in this case, the Finish step MUST appear AFTER all deployment stages. Do NOT place the Finish step before deployment stages just because there is no Start step.

Given a pipeline with `when: ["pipeline.failed"]` (Finish step only) and one deployment stage:

The **WRONG** output (Finish step placed before deployment stage):
```
* Add a community step template step with the name "Slack Notification - Finish" ...  ← WRONG: before deployment
* Add a "Deploy Kubernetes YAML" step ... "Deploy my-service" ...
```

The **CORRECT** output (Finish step placed AFTER deployment stage):
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy my-service" ...
* Add a community step template step with the name "Slack Notification - Finish" ... to the end of the deployment process. Only run the step when the previous step has failed.  ← CORRECT: after deployment
```

**CRITICAL — when a pipeline has `"disabled": true`, the `* The project must be disabled.` line MUST still be the last line even when notifications are present**: Do not omit the `* The project must be disabled.` line when the pipeline has both `notifications` and `"disabled": true`. The correct ordering for a pipeline with both is: deployment stages → Finish/Complete notification steps → `* The project must be disabled.` (last).

**Negative example — `disabled: true` flag missing when notifications are present (COMMON MISTAKE)**:

Given a pipeline with `disabled: true` and a Finish notification, the **WRONG** output omits the disabled line:
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy my-service" ...
* Add a community step template step with the name "Slack Notification - Finish" ...
[Missing: * The project must be disabled.]
```

The **CORRECT** output always includes `* The project must be disabled.` as the last line:
```
* Add a "Deploy Kubernetes YAML" step ... "Deploy my-service" ...
* Add a community step template step with the name "Slack Notification - Finish" ...
* The project must be disabled.  ← ALWAYS LAST
```

**Negative example — ALL notifications grouped before deployment stages (THE MOST COMMON MISTAKE with multiple notifications)**:

Given a pipeline with 2 `notifications` entries: one with `when: ["pipeline.failed"]` (address `dev-feed`) and one with `when: ["pipeline.starting", "pipeline.complete", "pipeline.failed"]` (address `service-release`), plus several deployment stages, the following ordering is **COMPLETELY WRONG**:
```
* Add ... "Slack Notification - Finish" ... "dev-feed"       ← WRONG: Finish as first step
* Add ... "Slack Notification - Start" ... "service-release"  ← WRONG: Start out of order
* Add ... "Slack Notification - Finish 2" ... "service-release" ← WRONG: all notifications together before stages
* Add ... "Slack Notification - Complete" ... "service-release"
* Add a "Manual Intervention" step ... "Approve" ...         ← deployment stages AFTER all notifications
* Add a "Deploy Kubernetes YAML" step ...
```

The **CORRECT** ordering (Start first, deployment stages next, Finish/Complete last — in notifications array order):
```
* Add ... "Slack Notification - Start" ... "service-release"  ← FIRST: only entry with pipeline.starting
* Add a "Manual Intervention" step ... "Approve" ...           ← deployment stages
* Add a "Deploy Kubernetes YAML" step ...
* Add ... "Slack Notification - Finish" ... "dev-feed"        ← AFTER stages, in array order (dev-feed is notifications[0])
* Add ... "Slack Notification - Finish 2" ... "service-release" ← AFTER stages, in array order (service-release is notifications[1])
* Add ... "Slack Notification - Complete" ... "service-release"
```

# Replacing placeholder values

* A value like `redacted-cluster` for a target tag must be replaced with the generic tag `Kubernetes`
* An empty string (`""`) for a target tag must also be replaced with the generic tag `Kubernetes`

**IMPORTANT — scope of the `<redacted-cluster>` replacement**: This placeholder replacement applies **only** to the `account` property of deployment stages (`deployManifest`, `runJobManifest`, `runJob`, `shiftTrafficProd`, `shiftTrafficStaging`, `restoreProd`, `deriveBaselineProd`, `deriveCanaryProd`) when it appears in the `Set the target tag to <account>` instruction in the generated output prompt. It does NOT apply to:
* Variable values in `templatedPipeline` `variables` objects (those should be converted to their string representations as-is)
* Stage properties other than `account` (e.g., `namespace`, `location`, `manifestName`)
* Any other property in the pipeline JSON

For example, if a `templatedPipeline` has a variable `"clusterAccount": "<redacted-cluster>"`, the output MUST be:
```
* Add a project variable called "clusterAccount" with the value "<redacted-cluster>".
```
NOT:
```
* Add a project variable called "clusterAccount" with the value "Kubernetes".
```

The replacement only fires when producing a `Set the target tag to ...` instruction from a stage's `account` property.

# Final Instructions

**CRITICAL — do NOT redact or anonymize ANY property value copied from the Spinnaker pipeline JSON.** This rule applies globally to every part of the generated prompt. Specifically:

* **Project names**: The project name in `Create a project called "<name>"...` must be the exact verbatim value of the pipeline `name` property — including any component/service names like `api-server`, `auth-service`, `worker`, `backend`, etc.
* **Variable values**: Every value copied into `Add a project variable called "<name>" with the value "<value>"` must be the literal string from the pipeline JSON — never replaced with `*****` or any other placeholder.
* **Parameter defaults and descriptions**: The `default`, `description`, and `label` fields copied from `parameterConfig` entries must be verbatim — do not redact or modify them.
* **Step names**: Step names must be unique. Append a number to the name of steps with the same name to make them unique.
* **ABSOLUTE RULE — unless the source JSON itself contains `*****`, the generated output must not contain `*****` anywhere inside a project name, variable value, parameter default, parameter description, parameter label, notification message, or stage name.** Do not apply safety redaction or secret masking to service names such as `api-server`, `api-syncer`, `api-gateway`, `auth-service`, `key-manager`, `serviceID`, `dockerImageName`, or similar identifiers. Names that follow the pattern `api-<suffix>` (e.g., `api-syncer`, `api-loader`, `api-router`) are microservice names — they are NOT API keys or API credentials and MUST NOT be redacted.

**Negative example — service name containing "api" incorrectly redacted in project/step names (FORBIDDEN)**:
```
Project name: "[PROD] ***** canary"   ← WRONG: source JSON had "[PROD] api-syncer canary"
Step name:    "Deploy org-0004-*****" ← WRONG: source JSON had "Deploy org-0004-api-syncer"
```
**Correct output** (names reproduced verbatim from the source JSON):
```
Project name: "[PROD] api-syncer canary"   ← CORRECT
Step name:    "Deploy org-0004-api-syncer" ← CORRECT
```

**CRITICAL — duplicate step names arise when multiple Spinnaker stages have the same `name` value**: After the name transformation rules are applied (replacing special characters with dashes), if two or more steps would result in the same name, the FIRST occurrence keeps the base name; the SECOND gets suffix ` 2`; the THIRD gets suffix ` 3`; and so on. You MUST check all step names for uniqueness before finalizing the output.

**Negative example — duplicate step names not made unique (COMMON MISTAKE)**:

Given two `deployManifest` stages that both have `"name": "Deploy (Manifest)"`, the following output is **WRONG**:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". ...
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". ...
```
← WRONG: Both steps share the same name `"Deploy -Manifest-"` — duplicate names are not allowed.

The **CORRECT** output (second occurrence gets a numeric suffix):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest-". ...
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy -Manifest- 2". ...
```

**CRITICAL — duplicate step name deduplication applies to ALL step combinations, including parallel stages**: Even when two stages with the same name appear in a PARALLEL group (same `requisiteStageRefIds` values), the second occurrence MUST still receive a numeric suffix. Sharing the same dependency does NOT exempt stages from the uniqueness requirement.

**Negative example — parallel stages with same name not deduplicated (COMMON MISTAKE)**:

Given two `manualJudgment` stages that both have `"name": "Manual Judgment"` and identical `requisiteStageRefIds`:

```json
{
  "stages": [
    { "refId": "4", "name": "Manual Judgment", "requisiteStageRefIds": [], "type": "manualJudgment" },
    { "refId": "5", "name": "Manual Judgment", "requisiteStageRefIds": ["2"], "type": "manualJudgment" }
  ]
}
```

The **WRONG** output (both steps use the same name — FORBIDDEN even though they run in different phases):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ...
* Add a "Manual Intervention" step with the name "Manual Judgment" ...   ← WRONG: duplicate name
```

The **CORRECT** output (the second occurrence gets suffix ` 2`):
```
* Add a "Manual Intervention" step with the name "Manual Judgment" ...
* Add a "Manual Intervention" step with the name "Manual Judgment 2" ... 
```
← NOTE: The suffix is added based on the OUTPUT ORDER (topological), not by JSON position. The first step to appear in the output keeps the base name; subsequent steps with the same name get ` 2`, ` 3`, etc.

, `web`, `auth`, `gateway`, `proxy`, `backend`, `frontend`, `key`, `token`, `service`, `manager`, `scheduler`, `cache`, `queue`, `db` appearing in ANY of these fields are legitimate service/component identifiers — they are NOT secrets, API keys, or credentials and MUST NOT be replaced with asterisks (`*****`) or any other anonymization placeholder.

**CRITICAL — hyphenated compound service names must also NEVER be redacted**: Names that combine two or more of these words with a hyphen (e.g., `api-server`, `auth-service`, `web-backend`, `frontend-api`, `worker-service`, `cache-manager`) are standard Kubernetes microservice naming conventions. The presence of the word `api`, `server`, `service`, or `key` in a hyphenated compound name does NOT make the compound a secret. Every character of the compound name must be preserved verbatim — replacing any portion with `*****` is forbidden.

**WRONG** (redaction of a service name — FORBIDDEN):
```
Create a project called "Deploy ***** to org-0003-2g-prod-tokyo-01" in the "Default Project Group" project group with no steps.
* Add a project variable called "dockerImageName" with the value "*****".
```

**CORRECT** (service name copied verbatim):
```
Create a project called "Deploy api-server to org-0003-2g-prod-tokyo-01" in the "Default Project Group" project group with no steps.
* Add a project variable called "dockerImageName" with the value "api-server".
```

**FINAL CHECK FOR THE EMBEDDED SAMPLE BELOW — the response is incomplete unless it includes the Slack webhook variable**: The sample pipeline below contains one qualifying pipeline-level Slack notification and no `parameterConfig` entries. The correct response MUST therefore include `* Add a sensitive project variable called "Project.Slack.WebhookUrl" with the description "Slack webhook URL used by migrated Spinnaker notification steps.".` after the Slack Notification - Complete step. A response that ends at the Complete step is wrong because it stops before emitting the required variable.

**MANDATORY SELF-CHECK BEFORE COMPLETING YOUR RESPONSE**: Before finalizing your output, scan every line for the five-character sequence `*****`. If you find `*****` in any `Create a project called "..."` sentence, any step name (e.g., `name the step "..."`), any YAML value, or any step description — and the source JSON at that location did NOT already contain `*****` — you have incorrectly redacted a resource name. Go back to the source JSON, copy the original text, and replace the incorrect `*****` with the original text verbatim. The only valid `*****` values in your output are those that were literally present as `*****` in the source JSON input. Anything else is a bug that MUST be corrected before outputting.

**WHY "api" IS NEVER AN API KEY**: In this organization's microservice naming convention, `api` is a short form of "application" (as in "application synchronizer" = `api-syncer`, "application server" = `api-server`). It is a CATEGORY of microservice, not an indicator that the name is a credential. Other examples: `auth-service` = authentication microservice, `key-manager` = encryption key management service, `token-processor` = authentication token processing service. The presence of these words in a service name makes the name a MICROSERVICE IDENTIFIER — it never makes the name a secret, API key, or credential. If you ever feel the urge to replace a service name with `*****`, STOP: the name is an identifier and must be preserved verbatim.

**PRE-GENERATION PARALLEL GROUP ENUMERATION STEP**: Before writing any step prompts, perform this mandatory enumeration:
1. Scan the ENTIRE `stages` array and build a map: `requisiteStageRefIds_value → [list of all refIds with that value]`. Include ALL stages regardless of their position in the JSON array.
2. For each unique `requisiteStageRefIds` value, collect EVERY stage with that value into one parallel group — NOT just those that appear adjacent in the JSON.
3. Mark the FIRST stage in each group (by JSON order) as the group leader. ALL other stages in the group (second, third, etc.) MUST get `Set the start trigger to "Run in parallel with the previous step"`.
4. Verify your group map is complete: for example, if stages at JSON positions 2, 3, and 16 all have `"requisiteStageRefIds": ["1"]`, all three belong to the SAME parallel group — the stage at position 16 is NOT in a separate group.

**Negative example — scattered parallel group member missed (CRITICAL MISTAKE)**:
Given stages: refId 2 (`requisiteStageRefIds: ["1"]`, JSON pos 2), refId 3 (`requisiteStageRefIds: ["1"]`, JSON pos 3), refId 18 (`requisiteStageRefIds: ["1"]`, JSON pos 16):
```
WRONG: generate 2 as first in group, 3 as parallel, then (much later) 18 as "Wait for all previous steps" ← 18 is in the SAME group as 2 and 3!
CORRECT: generate 2 as first in group, 3 as parallel (StartWithPrevious), 18 as parallel (StartWithPrevious) — all three share requisiteStageRefIds: ["1"]
```

**PRE-GENERATION IDENTIFIER EXTRACTION STEP**: Before writing your output, perform this mandatory preparation step:
1. Read the top-level `"name"` field from the pipeline JSON below. Write it down exactly as it appears. This will be the project name in `Create a project called "..."`.
2. Read every `"name"` field from every item in `"stages"`. Write them all down exactly as they appear. These will be the step names.
3. For each name you wrote down, confirm: does it appear verbatim (character-for-character, with no asterisks) in your intended output? If not, fix your output before generating it.
4. Only AFTER completing steps 1–3, begin writing your output.

This step is not optional — it ensures the project name and all step names are recorded before any text is generated, preventing accidental replacement of identifier words like `api`, `auth`, `key`, `token`, or `service` with `*****`.

Given the sample Spinnaker pipeline JSON, generate a prompt that recreates the project in Octopus Deploy.