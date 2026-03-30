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

* **IMPORTANT**: Feed prompts are ONLY generated from `expectedArtifacts[].matchArtifact.type == "docker/image"` entries or from Docker/Pubsub trigger `registry` fields. The `manifestArtifact` property on individual stages (regardless of its `type`) does NOT generate any feed prompt. In particular, `manifestArtifact` entries with `"type": "gcs/object"` or `"type": "github/file"` must NEVER trigger feed creation — those are artifact source types for the Kubernetes manifest itself, not Docker container registries.

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

If the `disabled` property of the Spinnaker pipeline is `true`, add the following sentence to the end of the prompt:

```
* The project must be disabled.
```

If the `disabled` property is `false`, absent, or `null`, do **NOT** add `* The project must be disabled.` — only add this line when `disabled` is explicitly `true`.

**IMPORTANT**: The `disabled` property must only be read from the top-level pipeline JSON object. Do not infer project disabled status from any other field (e.g., trigger `enabled` state, stage state, or presence of other flags). A pipeline JSON that has no `disabled` key at all must produce a project that is **not** disabled.

Example — pipeline WITHOUT `disabled` field: when the pipeline JSON contains no `disabled` key (e.g., `{"name": "My Project", "stages": [...], "triggers": [...]}`), the output must NOT include `* The project must be disabled.`

**WRONG output** (this line must NEVER appear when `disabled` is absent or `false` from the JSON):
```
* The project must be disabled.
```

**CORRECT output** for a pipeline with no `disabled` key (the disabled line is simply absent — it does not matter whether the pipeline name suggests it is for production, development, or any other environment):
```
Create a project called "My Project" in the "Default Project Group" project group with no steps.
```

If the pipeline has `"type": "templatedPipeline"`, it is a pipeline backed by a shared template whose stage definitions are stored externally and cannot be read from the JSON directly. The following rules apply:

* Do NOT convert any `stages` from the JSON — stages come from the shared template.
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
* **IMPORTANT**: The `<stage name>` placeholder must be replaced with the exact value of the `name` property from the Spinnaker stage, preserving all characters verbatim — including parentheses `()`, brackets `[]`, hyphens, and any other special characters. Do not replace parentheses or other special characters with underscores or any other character.

**CRITICAL — parentheses in stage names MUST NOT be converted to underscores**: A stage named `"Deploy (Manifest)"` in Spinnaker MUST produce a step named exactly `"Deploy (Manifest)"` in the output prompt. It MUST NOT produce `"Deploy _Manifest_"` or `"Deploy Manifest"` or any other modified form. The Octopus AI assistant that receives the generated prompt may convert parentheses to underscores when creating steps — to prevent this, after the step name in the output prompt, append the following literal note: ` (set the step name to exactly the quoted value, preserving all special characters including parentheses and brackets)`.

**WRONG** output (parentheses converted to underscores — this is a COMMON mistake):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy _Manifest_".
```

**CORRECT** output (parentheses preserved, with explicit note):
```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "Deploy (Manifest)" (set the step name to exactly the quoted value, preserving all special characters including parentheses and brackets).
```

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>" (set the step name to exactly the quoted value, preserving all special characters including parentheses and brackets). Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "<reference>". Set the File Paths to "<name>". Set the target tag to <account>.
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

**GCS artifacts via `manifestArtifactId`**: When a stage uses `manifestArtifactId` to reference an entry in `expectedArtifacts`, resolve the artifact by looking up the matching entry by `id`. If the `defaultArtifact.type` of the resolved entry is `"gcs/object"`, apply the **same GCS inline YAML rules** as for a direct `manifestArtifact.type: "gcs/object"` stage:
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

## Run Job Manifest Stage

Stages with `"type": "runJobManifest"` represent Kubernetes job executions and must be converted using exactly the same rules as `deployManifest` stages. Apply the artifact reference logic identically:

* If the stage has a `manifestArtifactId` property, look up the matching entry in `expectedArtifacts` by `id` and use `defaultArtifact.reference` as the Repository URL and `defaultArtifact.name` as the File Paths.
* If the stage has a direct `manifestArtifact` property, use `manifestArtifact.reference` as the Repository URL and `manifestArtifact.name` as the File Paths.
* Replace `<account>` with the `account` property of the stage, applying the same placeholder substitution rule (e.g., `<redacted-cluster>` or empty string → `Kubernetes`).

The resulting prompt is identical to a `deployManifest` stage:

```
* Add a "Deploy Kubernetes YAML" step to the deployment process and name the step "<stage name>" (set the step name to exactly the quoted value, preserving all special characters including parentheses and brackets). Set the YAML Source to "Files from a Git repository". Set the Authentication to "Anonymous". Set the Repository URL to "<reference>". Set the File Paths to "<name>". Set the target tag to <account>.
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
* Replace `<parameter label>` with the `label` property of the parameter in the Spinnaker pipeline. If the `label` property is absent, use the `name` property as the label.

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

## Running steps in parallel

> **ABSOLUTE RULE — JSON position is irrelevant to execution order.** A stage's topological group is determined **exclusively** by its `requisiteStageRefIds` value. A stage with `"requisiteStageRefIds": []` is **always** in the root group, even if it appears as the last item in the JSON array. Never use the position of a stage in the JSON array to decide its topological group or whether it runs before or after another stage. When you identify the root group, scan the **entire** `stages` array and collect ALL stages whose `requisiteStageRefIds` is empty or absent regardless of where they appear in the JSON.

* First, topologically sort all deployment stages by their `requisiteStageRefIds` dependency graph. Treat each `refId` as a node and each entry in `requisiteStageRefIds` as a directed edge from prerequisite to dependent. Stages with an empty or absent `requisiteStageRefIds` array have no prerequisites and must appear first in the sorted order; stages that depend only on those come next; and so on, until all stages are ordered.
* **CRITICAL: Perform the topological sort based purely on `requisiteStageRefIds` values — NOT on the position of the stage in the JSON array.** A stage that appears late in the JSON array but has `"requisiteStageRefIds": []` must still be placed in the first (root) group, even if the JSON places it after a stage that depends on it.
* When the topologically-sorted execution order differs from the original JSON array order (i.e., a stage with empty `requisiteStageRefIds` appears later in the JSON than a stage that depends on it):
  * Append `Run this step first.` to the first stage's step prompt (the stage that has no prerequisites and was moved earlier by the topological sort).
  * Append `Set the start trigger to "Wait for all previous steps to complete, then start"` to every subsequent stage's step prompt in the sorted list.
* **IMPORTANT**: The `Run this step first.` annotation and the `"Wait for all previous steps to complete, then start"` annotation are ONLY added when the topological sort changes the execution order relative to the JSON array order. If the pipeline's stages are already in topological order in the JSON (i.e., no stage with `requisiteStageRefIds: []` appears after a stage that depends on it), do NOT add either annotation — the default sequential execution in Octopus is assumed. In a simple sequential pipeline where stages appear in JSON order as stage-1, stage-2, stage-3 (each depending on the previous), NO start trigger annotations of any kind are needed.
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

1. All "Slack Notification - Start" steps (one per `notifications` array entry that has `pipeline.starting` in its `when` array) must be listed first, before any deployment stage steps, in `notifications` array order.
2. All deployment stage steps must be listed next, in topological execution order as described in the "Running steps in parallel" section above. When multiple stages share the same dependency level, preserve their relative order from the original JSON array.
3. All "Slack Notification - Finish" steps (one per `notifications` array entry that has `pipeline.failed` in its `when` array) must be listed after all deployment stage steps, in `notifications` array order.
4. All "Slack Notification - Complete" steps (one per `notifications` array entry that has `pipeline.complete` in its `when` array) must be listed last, after all Finish steps, in `notifications` array order.
5. All `parameterConfig` variable prompts must follow all notification steps (after the Complete steps). When there are NO pipeline-level notification steps, variable prompts must appear BEFORE the deployment stage steps.
6. The external feed trigger prompt (if any) must follow all variable prompts and all notification steps, but before `* The project must be disabled.`.
7. `* The project must be disabled.` must **always** be the very last line in the project's prompt block — it must appear after all step prompts, all variable prompts, and the external feed trigger prompt. No other prompt item may follow it.

**CRITICAL: Do NOT group all notification steps together at the start of the output.** The Finish and Complete steps must appear **after** all deployment stage steps — they must never be listed immediately after the Start step when deployment stages are also present. The correct pattern is:

```
* Add ... "Slack Notification - Start" ... to the start of the deployment process.
* Add ... [first deployment step] ...
* Add ... [second deployment step] ...
* ... [all remaining deployment steps] ...
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

Given the sample Spinnaker pipeline JSON, generate a prompt that recreates the project in Octopus Deploy.