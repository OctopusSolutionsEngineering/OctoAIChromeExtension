# Overview

Your task is to generate a number of random projects in Octopus using the AI Assistant. 

The instructions for creating the Terraform resources representing projects and their supporting resources from prompts are in the `/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker/generalinstructions.md` file.

The instructions in the `generalinstructions.md` file must be updated to address edge cases that are discovered as random projects are created.

You must update the `generalinstructions.md` file to address the issues you discover.

Note that projects are created from templates that include a number of steps, triggers, and variables. This is expected unless the prompt explicitly states that the project should not include any steps, triggers, or variables.

You MUST NOT add rules to the `generalinstructions.md` file stating that a project must not include the template steps.

## Reset the test space

Reset the space `Scratchpad2` to ensure that it is empty.

## Generating projects

Given these example prompts:

```
Create a Kubernetes project called "My K8s Project 2". 
Add a step to deploy a K8s deployment. 
Add a step to deploy a Kubernetes ClusterIP service. 
Use the "Security" lifecycle. 
Add a step to deploy a Kubernetes ingress resource. 
Enable variable debugging.
```

```
Create an Azure Web App project call "My Azure Project 1"
```

Write a single prompt to create Octopus projects, starting with "Create a Kubernetes project", "Create an Azure Web App project", "Create an AWS Lambda project", "Create an Argo CD image tag update project", "Create a Tomcat project", or "Create a Script project" including a mix of:

* feeds
* accounts
* steps
* platforms like helm, kustoimize, aws lambdas, azure web apps, azure functions, cloud formation, arm templates, bicep templates
* lifecycles
* project groups
* project names
* step run conditions
* step environment scopes
* rollout strategies like blue/green and canary
* variables
* environments
* target tags
* packages
* cloud providers
* retention policies
* inline scripts
* script from packages
* tenanted, untenanted, or tenanted and untenanted deployments
* tenants
* variable scopes
* tenant tags
* tenants
* project tenant variables
* Sample Kubernetes YAML

Do not reuse project names from previous responses.

Include a random number suffix on the project name from 1 to 10000.

Append `The current space is "Scratchpad2"` to the end of each generated prompt.

Pass the generated prompts one by one to the AI Assistant using the `send_prompt` tool.

The response from the AI Assistant includes the generated Terraform configuration and may include errors related to planning or applying the Terraform configuration.

The default timeout of 60 seconds is often not enough for call to `send_prompt` or `send_prompt_from_file`, which means they time out. If the `send_prompt` or `send_prompt_from_file` tools time out, sleep for 180 seconds, and try again. You can retry calls to the `send_prompt` or `send_prompt_from_file` tools up to 5 times.

When sleeping, run the command `sleep 180` with no other arguments or commands. You must assume that when the command is done, you have slept for the appropriate amount of time.

DO NOT attempt to fix the timeout issues with any other strategy than sleeping.

## Errors during project creation

If the response indicates that the project could not be created, update the `generalinstructions.md` file to address the error returned by the AI Assistant.

## Read the converted projects

Serialize the newly created project in the space `Scratchpad2` to terraform with the `convertOctopusToTerraform` tool.

The project name is defined in the `projectName` argument sent to the `convertOctopusToTerraform` tool, which is an array. The space name is defined in the `space` argument sent to the `convertOctopusToTerraform` tool, which is a string.

DO NOT pass the API key or server url parameters to the `convertOctopusToTerraform` tool, as these are defined by environment variables.

## Improve the prompt

Compare the Terraform configuration of the project to the original prompt.

The directory `/home/vagrant/Code/OctopusCopilot/context` contains sample Terraform files that provide canonical examples of how to represent Octopus resources in Terraform. Start with the `everystep.tf` file, as this contains the most comprehensive example of projects and steps. Then list the contents of that directory to find examples that may relate to the type of project being created by the prompt.

CRITICAL: The Terraform generated to create the project and the sample context in `/home/vagrant/Code/OctopusCopilot/context` is different from the Terraform generated when reading an existing project:
* Terraform generated from an existing project does not expose the `count` fields or `lifecycle` blocks on resources.
* Terraform generated from an existing project does not match every resource to an associated data source.

When updating the `generalinstructions.md` file, you must only consider the presense or absence of resources and their properties excluding the `count` fields and `lifecycle` blocks.

You MUST NOT update the `generalinstructions.md` file with instructions around the use of the "count" fields or "lifecycle" blocks.
You MUST NOT update the `generalinstructions.md` file with instructions around creating data sources.

Update the `generalinstructions.md` file to address the most significant issues found as part of the migration that are related to building Terraform configurations for Octopus projects.

You must refer to the sample Terraform files when making improvements to the `generalinstructions.md` file.

The `generalinstructions.md` file must only contain instructions that relate to creating Octopus resources in Terraform. The sample prompts may deliberately include instructions that are not related to creating Octopus resources. These instructions must be ignored. The AI Assistant can only create Octopus resources and must ignore instructions to directly modify other platforms or systems.

Once the `generalinstructions.md` file has been updated, use the `upload_file` tool from the `blobuploader` agent to upload the files to the Azure Blob Storage container. The `upload_file` tool is hard coded to upload the `generalinstructions.md` file to Azure Blob Storage. No arguments are passed to the `upload_file` tool This is the only file that needs to be uploaded. Uploading this file will make it available to the AI Assistant for future iterations of this process and ensures that the improvements made to the instructions are retained for future use.

You MUST NOT use any other method to upload the files to the Azure Blob Storage container other than the `upload_file` tool from the `blobuploader` agent.
You MUST NOT attempt to use a CLI tool to upload the files to the Azure Blob Storage container.

## Check the results

Recreate the same project again after the `generalinstructions.md` file has been improved and uploaded, and compare the results to the previous attempt. Repeat the process until you are satisfied that the improvements made to the `generalinstructions.md` files have resulted in a significantly improved migration process.

# Final Instructions

When reading files, confirm that you have read the whole file by counting the number of lines in the file with `wc -l` and comparing it to the number of lines you have read. If the numbers do not match, you have not read the whole file.

You MUST NEVER push files to remote repositories.

You MUST NEVER interact with the Octopus API directly. 
You MUST NOT use any CLI tools to interact with the Octopus API. 
You MUST NOT use any other tools or methods to interact with the Octopus API.
You MUST NEVER attempt to scan for the Octopus API key environment variables.