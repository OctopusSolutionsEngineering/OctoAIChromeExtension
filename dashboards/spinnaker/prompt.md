# Prompt Structure

* Multiple prompts can be separated into multiple sections with a blank line, three dashes (`---`), and a new blank line.
* The prompts to create a project and the prompts to create steps must appear in the same section.
* The prompts to create feeds must appear in a separate section before the prompts to create the project and steps.

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
* When a pipeline has `expectedArtifacts` entries with `matchArtifact.type` set to `docker/image`, create feeds from those entries and do NOT also create a feed from the pipeline's Docker trigger `registry` field.
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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-1058`. NOTE: This step originally loaded its manifest from Google Cloud Storage at "gs://example-bucket/storage-1058". The manifest must be inlined or the step must be reconfigured to read from a supported source. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest)".
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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy (Manifest)". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/manifest.yaml`. NOTE: This step originally loaded its manifest from Google Cloud Storage at "gs://example-bucket/manifest.yaml". The manifest must be inlined or the step must be reconfigured to read from a supported source. Set the target tag to Kubernetes.
```

**WRONG output** (no GCR feed section — this is a common mistake when `expectedArtifacts` is absent):
```
Create a project called "my-service deploy to dev" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step...
```

* **IMPORTANT**: Feed prompts are ONLY generated from `expectedArtifacts[].matchArtifact.type == "docker/image"` entries, from Docker trigger `registry` fields, OR from the registry host embedded in Pubsub trigger `payloadConstraints.tag` values. The `manifestArtifact` property on individual stages (regardless of its `type`) does NOT generate any feed prompt. In particular, `manifestArtifact` entries with `"type": "gcs/object"` or `"type": "github/file"` must NEVER trigger feed creation — those are artifact source types for the Kubernetes manifest itself, not Docker container registries.

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

**ABSOLUTE RULE — `disabled: true` on a regular pipeline does NOT skip stage conversion**: Setting `"disabled": true` on a regular pipeline (one that does NOT have `"type": "templatedPipeline"`) means ONLY that the project must be disabled in Octopus (i.e., `* The project must be disabled.` is appended). It does NOT affect stage conversion in any way. ALL stages MUST still be converted to their equivalent Octopus steps regardless of whether `disabled` is `true`. Do NOT omit any stage or use "with no steps" just because the pipeline is disabled.

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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-1058`. NOTE: This step originally loaded its manifest from Google Cloud Storage at "gs://example-bucket/storage-1058". The manifest must be inlined or the step must be reconfigured to read from a supported source. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest)".
* The project must be disabled.
```

If the pipeline has `"type": "templatedPipeline"`, it is a pipeline backed by a shared template whose stage definitions are stored externally and cannot be read from the JSON directly. The following rules apply:

* Do NOT convert any `stages` from the JSON — stages come from the shared template.

  **ABSOLUTE RULE — `stages` in `templatedPipeline` are ALWAYS ignored**: Even when the `stages` array is non-empty (for example, because `_resolvedFrom: "execution"` indicates stages were captured from a previous run, or `_originalSchema: "v2"` is present), you MUST NOT convert those stages. The presence of `_resolvedFrom`, `_templateRef`, `_originalSchema`, or any other metadata fields does NOT change this rule. The `stages` array in a `templatedPipeline` MUST be completely ignored regardless of whether it is empty or contains stage definitions.

  **Negative example — converting stages from a `templatedPipeline` (FORBIDDEN)**:
  ```json
  {
    "name": "Deploy Service",
    "type": "templatedPipeline",
    "_resolvedFrom": "execution",
    "stages": [
      { "type": "deployManifest", "name": "Deploy", "refId": "1", "requisiteStageRefIds": ["2"] },
      { "type": "manualJudgment", "name": "Manual Judgment", "refId": "2", "requisiteStageRefIds": [] }
    ],
    "variables": { "manifestURL": "gs://bucket/file.yaml" }
  }
  ```

  The **WRONG** output (generates steps from stages — FORBIDDEN for `templatedPipeline`):
  ```
  Create a project called "Deploy Service" in the "Default Project Group" project group with no steps.
  * Add a "Manual Intervention" step ... "Manual Judgment" ...
  * Add a "Deploy Kubernetes YAML" step ... "Deploy" ...
  * Add a project variable called "manifestURL" with the value "gs://bucket/file.yaml".
  ```

  The **CORRECT** output (no steps from stages — only variables are converted):
  ```
  Create a project called "Deploy Service" in the "Default Project Group" project group with no steps.
  * Add a project variable called "manifestURL" with the value "gs://bucket/file.yaml".
  ```

* **DO convert any `notifications` from the JSON** — notification steps are project-level and must be preserved. This applies even though stages are skipped. Notifications in a `templatedPipeline` must be converted using exactly the same rules as for a regular pipeline (see the Notifications section). The `when` array and `message` text must be inspected and Slack Notification steps must be generated for all applicable events.
* DO apply the `disabled` status — add `* The project must be disabled.` when `disabled: true`.
* DO NOT add feed creation prompts — `templatedPipeline` types have no `expectedArtifacts` in the top-level JSON.

**IMPORTANT — `templatedPipeline` notifications are REQUIRED**: When a `templatedPipeline` has a `notifications` array, you MUST generate Slack notification steps for it. Do NOT skip notifications just because the pipeline `type` is `templatedPipeline`. The Finish and Complete steps must appear in the correct order: all Slack Notification - Start steps first (if `pipeline.starting` is in `when`), followed by the (absent) deployment steps, then Slack Notification - Finish steps (if `pipeline.failed` is in `when`), then Slack Notification - Complete steps (if `pipeline.complete` is in `when`), then the `variables` prompts.

* A `templatedPipeline` entry may contain a `variables` object with deployment configuration. These are added as variables to the project.
* If the `variables` property is absent or empty, do not output any project variable prompts.
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
* Add a project variable called "manifestURL" with the value "gs://example-bucket/storage-0420".
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
      "enabled": false,
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

* If the Docker trigger has `"enabled": false`, use `The trigger must be disabled.` instead of `The trigger must be enabled.`

* Place the external feed trigger prompt **after** all deployment step prompts (including Slack notification steps) and all variable prompts, but **before** the `* The project must be disabled.` line.

* **CRITICAL**: A Docker trigger in the pipeline JSON does NOT automatically mean the external feed trigger prompt should be generated. The external feed trigger is only valid when at least one deployment step in the project actually deploys a Docker image. Before emitting the external feed trigger prompt, check every deployment stage (`deployManifest`, `runJobManifest`, `runJob`) in the pipeline:
  * A `runJob` stage qualifies if its `containers` array contains an `imageDescription` field.
  * A `deployManifest` or `runJobManifest` stage qualifies **only if** its manifest artifact has `type: "docker/image"`. Stages whose `manifestArtifact.type` is `"gcs/object"` or `"github/file"` do **NOT** reference Docker images.
  * If no qualifying Docker-image steps are found, omit the external feed trigger prompt entirely — even if the pipeline has Docker or Pubsub triggers.
* **CRITICAL — `requiredArtifactIds` does NOT qualify a stage as deploying a Docker image**: A `deployManifest` or `runJobManifest` stage may have a `requiredArtifactIds` array that references a Docker image artifact. This field tells Spinnaker which artifacts must be bound before the stage runs (e.g., a Docker image to be injected into a GCS-sourced manifest). However, `requiredArtifactIds` does NOT change the type of the manifest artifact itself. If the stage's actual manifest comes from a `gcs/object` or `github/file` artifact (via `manifestArtifactId` or `manifestArtifact`), the stage does NOT qualify as deploying a Docker image for external feed trigger purposes — regardless of what is in `requiredArtifactIds`.

  **Negative example — `requiredArtifactIds` pointing to Docker image but manifest is GCS**: Given a stage with `manifestArtifactId` resolving to a GCS artifact AND `requiredArtifactIds` pointing to a Docker image artifact, the stage does **NOT** qualify. The external feed trigger must **NOT** be generated.

  ```json
  {
    "stages": [
      {
        "manifestArtifactId": "gcs-artifact-id",
        "requiredArtifactIds": ["docker-image-artifact-id"],
        "type": "deployManifest",
        "name": "Deploy prod"
      }
    ]
  }
  ```

  The **WRONG** output (generates external feed trigger because of `requiredArtifactIds` — FORBIDDEN):
  ```
  * Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be enabled.
  ```

  The **CORRECT** output (no external feed trigger because the manifest itself is GCS, not docker/image):
  ```
  [no external feed trigger line]
  ```
* **IMPORTANT**: Creating a feed from a Docker trigger's `registry` field (because `expectedArtifacts` is absent or empty) does **NOT** imply that an external feed trigger should be generated. The two decisions are independent. Even when a GCR or Docker feed is created solely from the trigger's `registry` field, you must still verify that at least one deployment stage qualifies as deploying a Docker image before emitting the external feed trigger prompt. If all stages use `manifestArtifact.type: "gcs/object"` or `"github/file"`, omit the external feed trigger prompt regardless of how the feed was determined.

**ABSOLUTE RULE — GCS/GitHub-only deployments never get an external feed trigger**: If every `deployManifest`, `runJobManifest`, and `runJob` stage in the pipeline uses `manifestArtifact.type: "gcs/object"` or `manifestArtifact.type: "github/file"` (and no `runJob` stage has a `containers[].imageDescription`), the external feed trigger prompt **MUST NOT** appear in the output — even when a Docker or Pubsub trigger is present, and even when a feed creation prompt is emitted for that trigger.

**CRITICAL — absent `expectedArtifacts` does NOT qualify stages as Docker-image deployments**: When the `expectedArtifacts` key is entirely absent from the pipeline JSON (not present at all), and the only deployment stages use `manifestArtifact.type: "gcs/object"` or `manifestArtifact.type: "github/file"`, this combination **MUST NOT** generate an external feed trigger — even if a Docker trigger is present and even if a GCR feed is created. The absence of `expectedArtifacts` never implies that stages deploy Docker images.

**Negative example — absent `expectedArtifacts` + Docker trigger + GCS-only stages (MOST COMMON MISTAKE)**:

```json
{
  "name": "my-service deploy to prod",
  "stages": [
    {
      "manifestArtifact": { "type": "gcs/object", "reference": "gs://bucket/manifest.yaml" },
      "type": "deployManifest"
    }
  ],
  "triggers": [ { "registry": "gcr.io", "type": "docker", "enabled": false } ]
  // Note: no "expectedArtifacts" key at all
}
```

The **CORRECT** output for this pipeline has a GCR feed section AND a project section with NO external feed trigger:
```
Create a feed called "Google Container Registry" in Octopus Deploy with a feed URL of "https://gcr.io/v2/".

---

Create a project called "my-service deploy to prod" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step... [no external feed trigger line]
```

The **WRONG** output (external feed trigger MUST NOT appear when all stages are GCS-only):
```
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be disabled.
```

**Negative example**: The following pipeline has a Docker trigger but the only `deployManifest` stage uses `manifestArtifact.type: "gcs/object"`. Because no stage qualifies as deploying a Docker image, the external feed trigger prompt **must NOT** be generated:

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

The correct output for this pipeline has **no external feed trigger prompt**. Only a GCR feed creation prompt and the project creation prompt are produced.

**WRONG output** (must never appear for this pipeline):
```
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be disabled.
```

**CORRECT output** (no external feed trigger line at all — the project prompt contains only the Kubernetes YAML step):
```
Create a project called "Deploy Workers" in the "Default Project Group" project group with no steps.
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Workers". Set the YAML Source to "Inline YAML"...
```

**Negative example — Docker trigger enabled + `requiredArtifactIds` referencing Docker image + GCS/GitHub-file manifest stages (DO NOT add external feed trigger)**:

A pipeline may have a Docker trigger with `enabled: true` AND deployment stages that have `requiredArtifactIds` pointing to a Docker image artifact, while the manifest itself comes from `gcs/object` or `github/file`. In this case, the external feed trigger MUST NOT be generated because the manifest source type determines eligibility, not `requiredArtifactIds` or trigger `enabled` state.

```json
{
  "triggers": [ { "type": "docker", "registry": "gcr.io", "enabled": true } ],
  "stages": [
    {
      "type": "deployManifest",
      "manifestArtifactId": "gcs-artifact-id",
      "requiredArtifactIds": ["docker-image-artifact-id"],
      "name": "Deploy Canary"
    },
    {
      "type": "scaleManifest",
      "manifestName": "deployment/my-service-canary",
      "replicas": 0,
      "name": "Scale Down Canary"
    }
  ]
}
```

The **WRONG** output (external feed trigger added because Docker trigger is enabled — FORBIDDEN):
```
* Add a single external feed trigger that creates a new release for each step that deploys a Docker image. The trigger must be enabled.
```

The **CORRECT** output (no external feed trigger — GCS manifest and scaleManifest do not qualify):
```
[no external feed trigger line]
```

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
* The same **CRITICAL** check applies: only emit the external feed trigger prompt when at least one deployment step actually deploys a Docker image (see the Docker Triggers section above for the qualifying criteria).
* There is no equivalent of the `runAsUser`, `subscriptionName`, or `pubsubSystem` properties in Octopus Deploy, so they are not included in the prompt.

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

The equivalent step in an Octopus Deploy project that replicates the `pipeline.failed` event is created with the prompt:

```
* Add a community step template step with the name "Slack Notification - Finish" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Only run the step when the previous step has failed. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-test-service-dev-spinnaker-log". Set the "ssn_Message" property to "Please rerun the pipeline."
```

* The `ssn_Message` value for the Finish step must come from `notifications[].message.pipeline.failed.text`. If `message.pipeline.failed.text` is absent or empty, omit the `ssn_Message` property entirely.

The equivalent step in an Octopus Deploy project that replicates the `pipeline.complete` event is created with the prompt:

```
* Add a community step template step with the name "Slack Notification - Complete" and the URL "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" to the end of the deployment process. Always run the step. Set the "ssn_HookUrl" property to "#{Project.Slack.WebhookUrl}". Set the "ssn_Channel" property to "pj-test-service-dev-spinnaker-log". Set the "ssn_Message" property to "Deployment completed."
```

* The `ssn_Message` value for the Complete step must come from `notifications[].message.pipeline.complete.text` OR `notifications[].message.pipeline.completed.text` (whichever is present — they are equivalent). If both are absent or empty, omit the `ssn_Message` property entirely. Do NOT fall back to the `pipeline.failed` message text.

* The name of notification steps must be unique. Append a counter the end of step names, like `Slack Notification - Complete 2`, to ensure step names are unique.

# Stages

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
* **IMPORTANT**: The `<stage name>` placeholder must be replaced with the exact value of the `name` property from the Spinnaker stage, taking into account the Octopus limitation that step names can only contain letters, numbers, periods, commas, dashes, underscores or hashes. If the stage name contains parentheses `()` or square brackets `[]`, replace them with underscores `_` (e.g., `Deploy (Manifest)` becomes `Deploy _Manifest_`). For every step where the stage name contained parentheses or other special characters, also set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "<reference>". Set the File Paths to "<name>". Set the target tag to <account>.
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

* When a stage has a `manifestArtifact` property directly (instead of `manifestArtifactId`), use the `reference` field of `manifestArtifact` as the Repository URL and the `name` field of `manifestArtifact` as the File Paths.
* **GCS artifacts**: When `manifestArtifact.type` is `"gcs/object"`, the artifact reference is a Google Cloud Storage path (e.g., `gs://bucket/path`). GCS paths are NOT valid Git repository URLs and cannot be used as the Repository URL in a "Deploy Kubernetes YAML" step with the "Files from a Git repository" source. Use the following logic:
  * If the stage has a non-empty `manifests` array (a cached copy of the Kubernetes manifest from a previous execution), serialize those manifests to YAML and use that content as the inline YAML for the step. This avoids requiring manual intervention to supply the manifest. The manifest YAML content must be serialized verbatim — do NOT redact, anonymize, or replace any values (names, namespaces, image references, environment variable values, etc.) with asterisks or placeholders. Service names, namespaces, and deployment names that appear in the manifest are Kubernetes resource identifiers, not secrets.
  * If the stage does NOT have a `manifests` array (or it is empty), set the YAML Source to **"Inline YAML"** and set the YAML content to a placeholder comment `# TODO: replace with manifest downloaded from <reference>`. Append a note: `NOTE: This step originally loaded its manifest from Google Cloud Storage at "<reference>". The manifest must be inlined or the step must be reconfigured to read from a supported source.`
* Do NOT generate a feed prompt from `manifestArtifact` GCS references.
* If the stage has `"source": "text"` and an inline `manifest` object (with no `manifestArtifactId` or `manifestArtifact` reference), serialize the `manifest` object to YAML and use that YAML content as the inline value on the step.
* Replace `<account>` with the value of the `account` property in the stage.

**GCS artifacts via `manifestArtifactId`**: When a stage uses `manifestArtifactId` to reference an entry in `expectedArtifacts`, you MUST:
1. Find the `expectedArtifacts` entry whose `id` matches the stage's `manifestArtifactId` value.
2. Check the `defaultArtifact.type` of that entry.
3. If `defaultArtifact.type` is `"gcs/object"`, **STOP** — do NOT use "Files from a Git repository". Apply the **GCS inline YAML rules** instead.

If the `defaultArtifact.type` of the resolved entry is `"gcs/object"`, apply the **same GCS inline YAML rules** as for a direct `manifestArtifact.type: "gcs/object"` stage:
* Use `defaultArtifact.reference` as the GCS path.
* If the stage has a non-empty `manifests` array, serialize those manifests to YAML as the inline YAML content.
* If there is no `manifests` array (or it is empty), set the YAML Source to **"Inline YAML"** and set the YAML content to `# TODO: replace with manifest downloaded from <reference>`. Append the same NOTE as for direct GCS stages.
* **CRITICAL**: A stage that resolves via `manifestArtifactId` to a `gcs/object` expected artifact does **NOT** qualify as deploying a Docker image — it must NOT trigger an external feed trigger, even if a Docker trigger is present in the pipeline.

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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Dev". Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "gs://example-bucket/storage-2091". Set the File Paths to "gs://example-bucket/storage-2091". Set the target tag to Kubernetes.
```

The **CORRECT** output (resolves via `manifestArtifactId` to GCS → inline YAML):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Dev". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-2091`. NOTE: This step originally loaded its manifest from Google Cloud Storage at "gs://example-bucket/storage-2091". The manifest must be inlined or the step must be reconfigured to read from a supported source. Set the target tag to Kubernetes.
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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_". Set the YAML Source to "Inline YAML". Set the YAML content to `# TODO: replace with manifest downloaded from gs://example-bucket/storage-2053`. NOTE: This step originally loaded its manifest from Google Cloud Storage at "gs://example-bucket/storage-2053". The manifest must be inlined or the step must be reconfigured to read from a supported source. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Deploy (Manifest)". Set the step namespace to "org-0001-product-catalog-jp-dev".
```

The **WRONG** output (namespace annotation silently omitted):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_". Set the YAML Source to "Inline YAML". ...
[Missing: Set the step namespace to "org-0001-product-catalog-jp-dev".]
```

## Run Job Manifest Stage

Stages with `"type": "runJobManifest"` represent Kubernetes job executions and must be converted using exactly the same rules as `deployManifest` stages. Apply the artifact reference logic identically:

* If the stage has a `manifestArtifactId` property, look up the matching entry in `expectedArtifacts` by `id` and use `defaultArtifact.reference` as the Repository URL and `defaultArtifact.name` as the File Paths.
* If the stage has a direct `manifestArtifact` property, use `manifestArtifact.reference` as the Repository URL and `manifestArtifact.name` as the File Paths.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).

The resulting prompt must follow exactly the same rules as a `deployManifest` stage, including the stage name transformation rules.

**IMPORTANT**: The `<stage name>` placeholder must follow the same rules as `deployManifest` stages: if the stage name contains parentheses `()`, replace them with underscores `-` (e.g., `Run Job (Manifest)` becomes `Run Job _Manifest_`). For every step where the stage name contained parentheses or other special characters, also set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.

**Negative example — `runJobManifest` stage name with parentheses not converted to square brackets (COMMON MISTAKE)**:

Given a `runJobManifest` stage with `"name": "Run Job (Manifest)"`, the **WRONG** output preserves the parentheses:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job (Manifest)". ...
```

The **CORRECT** output converts parentheses to square brackets and adds a step description:
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Run Job _Manifest_". ... Set the step description to "Original Spinnaker stage name: Run Job (Manifest)".
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
* Add a "Manual Intervention" step with the name "<stage name>" (set the step name to exactly the quoted value, preserving all special characters including parentheses and brackets) to the deployment process. Set the instructions to "<instructions>".
```

* Replace `<stage name>` with the `name` property of the stage.
* Replace `<instructions>` with the `instructions` property of the stage. If the `instructions` property is absent or empty, use `"Please review and approve."` as the default instructions text.

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
* Replace `<name>` with the `name` property in the Spinnaker stage.

```
* Add a "Run a Script" step with the name "<name>" to the deployment process. Set the script to the following inline PowerShell code: `Start-Sleep -Seconds <seconds>`
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

* When `stageEnabled.expression` is `false` (a boolean literal, not a string), the stage is hard-disabled. **Skip this stage entirely** — do not generate any step for it.
* When `stageEnabled.expression` is `true` (a boolean literal), the stage is always enabled — treat it as a normal stage.
* When `stageEnabled.expression` is a **string** (a SpEL expression), there is no direct Octopus Deploy equivalent. **Convert the stage normally** but append the following NOTE to the step prompt:

  ```
  Add the following description: `This step has a Spinnaker conditional execution condition that has no direct Octopus Deploy equivalent: stageEnabled.expression = "<expression>". Manually review whether this step should be conditionally disabled or use an Octopus run condition.`
  ```

  Replace `<expression>` with the verbatim value of `stageEnabled.expression`.

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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy Prod". Add the following description: `This step has a Spinnaker conditional execution condition that has no direct Octopus Deploy equivalent: stageEnabled.expression = "${ #judgment(\"Manual Judgment\").equals(\"Continue\")}". Manually review whether this step should be conditionally disabled or use an Octopus run condition.`
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

* Octopus Deploy has no equivalent time-window restriction for individual steps. When a stage has `"restrictExecutionDuringTimeWindow": true`, convert the stage normally but append the following description to the step prompt:

  ```
  Add the following description: `This step originally had a Spinnaker execution time window restriction. Days: <days>. Window: <startHour>:<startMin>-<endHour>:<endMin>. Replicate this restriction manually in Octopus if required.`
  ```

  Replace `<days>` with the numeric day numbers from `restrictedExecutionWindow.days` (1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday) and `<startHour>:<startMin>-<endHour>:<endMin>` from the first whitelist entry.

  If `restrictExecutionDuringTimeWindow` is `false` or absent, do NOT append any NOTE.

## Ignored Stage Types

The following stage types represent Spinnaker-internal operations or metadata lookups that have no equivalent in Octopus Deploy. When any of these stage types is encountered, **skip it entirely** — do not generate any step prompt, comment, or placeholder for it:

* `findArtifactFromExecution` — looks up artifacts produced by another pipeline execution. This is a Spinnaker-specific mechanism for passing artifacts between pipelines and has no Octopus Deploy equivalent.
* `evaluateVariables` — evaluates SpEL expressions to set pipeline variables. Skip it entirely.
* `checkPreconditions` — checks pipeline preconditions. Skip it entirely.
* `setPipelineParameters` — sets parameters for a running pipeline. Skip it entirely.

**IMPORTANT**: If a pipeline has only ignored stages (e.g., only `findArtifactFromExecution` and `checkPreconditions` stages), the project creation prompt must still be generated with no steps (use `"with no steps"` in the project prompt). Do not omit the project creation prompt just because all stages are of ignored types.

## Unknown Stage Types

If a stage has a `type` value that is not listed in this document (i.e., not `deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `pipeline`, `wait`, `deleteManifest`, `scaleManifest`, or an ignored type), generate a placeholder "Run a Script" step for it so that it is not silently lost:

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
* Replace `<code>` with a PowerShell script to call `kubectl` to delete the resource in the `manifestName` field.
* The `manifestName` field contains the Kubernetes resource kind and name separated by a space (e.g., `"job my-job"` → `kubectl delete job my-job`). Parse the kind and name from this field.
* If the stage has a `location` field, it represents the Kubernetes namespace. Include `-n <location>` in the kubectl command. For example, if `manifestName` is `"job job-denpyo-checker"` and `location` is `"app-0251-dev"`, the command is `kubectl delete job job-denpyo-checker -n app-0251-dev`.
* **IMPORTANT — step name special character replacement and step description**: The same rules as `deployManifest` stages apply. If the stage `name` contains parentheses `()` or square brackets `[]`, replace them with underscores `_` in the step name (e.g., `Delete (canary)` → `Delete _canary_`). For every `deleteManifest` step where the stage name contained parentheses or other special characters, ALSO set the step description to preserve the original name: append `Set the step description to "Original Spinnaker stage name: <original name>"` to the step prompt.

**Negative example — `deleteManifest` stage with parentheses and no step description (COMMON MISTAKE)**:

Given a `deleteManifest` stage with `"name": "Delete (canary)"`, the **WRONG** output omits the step description:
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Delete _canary_". Set the script to inline Powershell with the code `kubectl delete deployment ...`. Set the target tag to Kubernetes.
```
← WRONG: The step description is MISSING. The original name "Delete (canary)" had parentheses, so the description must be added.

The **CORRECT** output (step description added to preserve original name with parentheses):
```
* Add a "Run a kubectl script" step to the deployment process and name the step "Delete _canary_". Set the script to inline Powershell with the code `kubectl delete deployment ...`. Set the target tag to Kubernetes. Set the step description to "Original Spinnaker stage name: Delete (canary)".
```

```
* Add a "Run a kubectl script" step to the deployment process and name the step "<stage name>". Set the script to inline Powershell with the code `<code>`. Set the target tag to <account>.
```

## Scale Manifest Stage

Stages with `"type": "scaleManifest"` represent scaling of a Kubernetes resource to a target replica count (e.g., scaling to zero to effectively stop a deployment). Convert them using the same prompt as `deleteManifest` stages:

* Replace `<stage name>` with the `name` property of the stage.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).
* Replace `<code>` with a PowerShell script to call `kubectl` to scale the resource in the `manifestName` field to the number in the `replicas` field.

```
* Add a "Run a kubectl script" step to the deployment process and name the step "<stage name>". Set the script to inline Powershell with the code `<code>`. Set the target tag to <account>.
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
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_" ...
* Add a project variable called "batch_size", with a default value of "50"...
* Add a project variable called "timeout", with a default value of "30"...
```

## Running steps in parallel

> **ABSOLUTE RULE — JSON position is irrelevant to execution order.** A stage's topological group is determined **exclusively** by its `requisiteStageRefIds` value. A stage with `"requisiteStageRefIds": []` is **always** in the root group, even if it appears as the last item in the JSON array. Never use the position of a stage in the JSON array to decide its topological group or whether it runs before or after another stage. When you identify the root group, scan the **entire** `stages` array and collect ALL stages whose `requisiteStageRefIds` is empty or absent regardless of where they appear in the JSON.

* First, topologically sort all deployment stages by their `requisiteStageRefIds` dependency graph. Treat each `refId` as a node and each entry in `requisiteStageRefIds` as a directed edge from prerequisite to dependent. Stages with an empty or absent `requisiteStageRefIds` array have no prerequisites and must appear first in the sorted order; stages that depend only on those come next; and so on, until all stages are ordered.
* **CRITICAL: Perform the topological sort based purely on `requisiteStageRefIds` values — NOT on the position of the stage in the JSON array.** A stage that appears late in the JSON array but has `"requisiteStageRefIds": []` must still be placed in the first (root) group, even if the JSON places it after a stage that depends on it.
* When the topologically-sorted execution order differs from the original JSON array order (i.e., at least one stage must be moved when converting from JSON order to topological order):
  * Append `Run this step first.` to the first stage's step prompt (the root stage that was promoted to the front of the sorted list because it has no prerequisites).
  * Append `Set the start trigger to "Wait for all previous steps to complete, then start"` to every subsequent NON-PARALLEL stage's step prompt — i.e., every stage that is the FIRST in its dependency group (except the root group which has already been handled). Parallel siblings (2nd, 3rd, etc. stages within the same dependency group) continue to use `"Run in parallel with the previous step"` as before.
* **IMPORTANT**: The `Run this step first.` annotation and the `"Wait for all previous steps to complete, then start"` annotation are ONLY added when the topological sort changes the execution order relative to the JSON array order. If the pipeline's stages are already in topological order in the JSON (i.e., no stage must be moved), do NOT add either annotation — the default sequential execution in Octopus is assumed. In a simple sequential pipeline where stages appear in JSON order as stage-1, stage-2, stage-3 (each depending on the previous), NO start trigger annotations of any kind are needed.

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

Topological order: 1→2→3→{4,5}. This EXACTLY MATCHES the JSON order (no stage is moved). Therefore, **no** `Run this step first.` or `Set the start trigger to "Wait for all previous steps to complete, then start"` annotations are needed.

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
* **CRITICAL — the `Run this step first.` annotation applies to the ROOT stage even if it is a `manualJudgment` or other non-deployment type.** Any stage that has `requisiteStageRefIds: []` and appears AFTER other stages in the JSON (i.e., it is moved to the front by the topological sort) MUST receive `Run this step first.` appended to its step prompt, regardless of its stage type.
* When multiple stages share exactly the same `requisiteStageRefIds` value, they are intended to run in parallel. **This includes stages that all have an empty `requisiteStageRefIds` array `[]`** — an empty array `[]` is a shared value just like any other. For the second and subsequent stages in such a parallel group, append `Set the start trigger to "Run in parallel with the previous step".` to the step prompt.
  * Example: If stages with refIds 1, 2, 4, 15, 16, 17, 18 all have `"requisiteStageRefIds": []`, then the step for refId 1 gets no parallel annotation (it is first), but the steps for refIds 2, 4, 15, 16, 17, and 18 each get `Set the start trigger to "Run in parallel with the previous step"` appended.
  * Similarly, if stages with refIds 8, 9, 11, 12, 13, 14, 19 all have `"requisiteStageRefIds": ["5"]`, then the step for refId 8 gets no parallel annotation (it is first in the group), but the steps for refIds 9, 11, 12, 13, 14, and 19 each get `Set the start trigger to "Run in parallel with the previous step"` appended.
* **CRITICAL — notification steps (Slack Notification Start/Finish/Complete) are NOT deployment stages and must NEVER influence parallel annotations of deployment stages.** When determining the parallel annotation for the first deployment stage in a parallel group, ignore any preceding notification steps entirely. If the first deployment stage in the root group is preceded only by a Slack Notification - Start step, that deployment stage MUST NOT receive a "Run in parallel with the previous step" annotation — it is the first deployment stage in its group and runs sequentially after the notification.
* **CRITICAL — the first stage in ANY parallel group NEVER receives a parallel annotation**, regardless of whether it is the root group or a subsequent group. Only the 2nd and later stages within a parallel group get the "Run in parallel" annotation. This applies across all dependency levels: if six stages in the pipeline all depend on stage 5, the first of those six stages in JSON order gets no annotation; only stages 2-6 in that group get the parallel annotation.

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

The **CORRECT** output (refId 2 promoted to first with `Run this step first.`; refId 1 gets `Wait for all previous steps to complete, then start`):
```
* Add a "Deploy Kubernetes YAML" step ... "Run Pre-Deploy Job" ... Run this step first.
* Add a "Deploy Kubernetes YAML" step ... "Deploy Prod" ... Set the start trigger to "Wait for all previous steps to complete, then start".
```

**KEY RULE**: When the topological sort changes ANY stage's position relative to its JSON array position, ALL stages that follow the root must receive `Set the start trigger to "Wait for all previous steps to complete, then start"`. Never output a pipeline where stages are in the correct topological order but annotations are absent.

**Worked example — reversed JSON order WITH a Slack Notification - Start step**:

A preceding notification step does NOT cancel the topological reorder annotation requirements. When a pipeline has a `pipeline.starting` Slack notification AND stages that require topological reordering, both rules apply simultaneously: the notification comes first, AND the `Run this step first.` / `Wait for all previous steps to complete, then start` annotations are added to the reordered deployment stages.

Given a pipeline:
```json
{
  "notifications": [
    { "address": "deploy-feed", "level": "pipeline", "type": "slack", "when": ["pipeline.starting", "pipeline.failed", "pipeline.complete"] }
  ],
  "stages": [
    { "refId": "2", "requisiteStageRefIds": ["3"], "type": "deployManifest", "name": "Deploy _Manifest_" },
    { "refId": "3", "requisiteStageRefIds": [], "type": "manualJudgment", "name": "Manual Judgment" }
  ]
}
```

JSON order: stage 2 (Deploy, depends on 3) at position 1 → stage 3 (Manual Judgment, root) at position 2. Topological order: stage 3 → stage 2. **Order differs from JSON**, so reorder annotations are required.

The **WRONG** output (stages appear in correct topological order but annotations are absent — COMMON MISTAKE):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Manual Intervention" step with the name "Manual Judgment" ...               ← MISSING: "Run this step first."
* Add a "Deploy Kubernetes YAML" step ... "Deploy _Manifest_" ...                    ← MISSING: "Set the start trigger to 'Wait for all previous steps...'"
* Add a community step template step with the name "Slack Notification - Finish" ...
* Add a community step template step with the name "Slack Notification - Complete" ...
```

The **CORRECT** output (correct topological order WITH required annotations):
```
* Add a community step template step with the name "Slack Notification - Start" ...
* Add a "Manual Intervention" step with the name "Manual Judgment" ... Run this step first.   ← root stage promoted from JSON pos 2 to topo pos 1
* Add a "Deploy Kubernetes YAML" step ... "Deploy _Manifest_" ... Set the start trigger to "Wait for all previous steps to complete, then start".  ← depends on Manual Judgment
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
* Add a "Manual Intervention" step ... "Migrate Judgment" ... Run this step first.          ← refId 4, ROOT, moved from JSON pos 2 to first
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

**Key observation**: Stage 1 (first in JSON) depends on stage 3. Stage 2 (second in JSON) is a root stage. The topological order is:
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
2. All non-notification stage steps must be listed next (this includes ALL stage types: `deployManifest`, `runJobManifest`, `runJob`, `manualJudgment`, `wait`, `deleteManifest`, `scaleManifest`, `pipeline`, and any unknown stage types), in topological execution order as described in the "Running steps in parallel" section above. When multiple stages share the same dependency level, preserve their relative order from the original JSON array. **CRITICAL**: `wait` stages, `manualJudgment` stages, and ALL other non-notification stage types MUST appear AFTER the Start step — do NOT place them before the Start step even if they appear earlier in the pipeline JSON.
3. All "Slack Notification - Finish" steps (one per `notifications` array entry that has `pipeline.failed` in its `when` array) must be listed after all deployment stage steps, in `notifications` array order.
4. All "Slack Notification - Complete" steps (one per `notifications` array entry that has `pipeline.complete` in its `when` array) must be listed last, after all Finish steps, in `notifications` array order.
5. All `parameterConfig` variable prompts must follow all notification steps (after the Complete steps). When there are NO pipeline-level notification steps, variable prompts must appear BEFORE the deployment stage steps.
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

**IMPORTANT — scope of the `<redacted-cluster>` replacement**: This placeholder replacement applies **only** to the `account` property of deployment stages (`deployManifest`, `runJobManifest`, `runJob`) when it appears in the `Set the target tag to <account>` instruction in the generated output prompt. It does NOT apply to:
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

Words such as `api`, `server`, `worker`, `web`, `auth`, `gateway`, `proxy`, `backend`, `frontend`, `key`, `token`, `service`, `manager`, `scheduler`, `cache`, `queue`, `db` appearing in ANY of these fields are legitimate service/component identifiers — they are NOT secrets, API keys, or credentials and MUST NOT be replaced with asterisks (`*****`) or any other anonymization placeholder.

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

Given the sample Spinnaker pipeline JSON, generate a prompt that recreates the project in Octopus Deploy.