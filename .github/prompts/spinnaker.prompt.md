---
name: Spinnaker Migration Refinement
description: This prompt converts Spinnaker pipelines into Octopus projects, compares the results, and improves the prompt.md file based on the findings.
---

You will convert Spinnaker pipelines into Octopus projects, compare the results, and improve the prompt.md file.

The `/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker/prompt.md` file contains the instructions required to convert Spinnaker pipelines into prompts that create Octopus projects.

The `/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker/generalinstructions.md` file contains instructions for building Terraform configurations for Octopus projects.

Use the directory `/home/vagrant/Scratchpad` as a temporary directory to store any files you need to create as part of this process.

# Reading the pipeline

Select a random Spinnaker pipeline JSON file from one of the directories under `/home/vagrant/Downloads/spinnaker-pipelines-vendor-anonymized`.

Count the number of array items with `jq`.

We want to select a random pipeline from the array with each iteration.

Generate a random number using the `$RANDOM` bash variable between 0 and the array size minus 1, e.g. `echo $(( RANDOM % 100 ))` to generate a number between 0 and 99.

Select a random pipeline from the array with `jq`, and process the item using the instructions in the next sections. Then select a new random pipeline and repeat the process.

Finish when you have found 5 significant improvements to the `prompt.md` file. You do not have to process every item in the array.

## Reset the test space

Reset the `Scratchpad` space to ensure that it is empty.

## Convert the pipeline

Create a temporary file using bash in the `/home/vagrant/Scratchpad` dir, grant everyone read access to the file, and replace the placeholders with the contents of the appropriate files using bash commands like `cat` and `jq` rather than reading the files directly:

```
<prompt.md contents>

<pipelines.json array item>
```

Run the temporary file with the AI Assistant, passing the filename directly to the `send_prompt_from_file` tool.

The response from the AI Assistant is another prompt describing how to recreate the Spinnaker pipeline as Octopus resources. There is not a strict one-to-one relationship between Spinnaker and Octopus resources.

The prompt may contain multiple sections separated by a triple dash (`---`).

Split the result up on the triple dash separators.

Append `The current space is "Scratchpad"` to the end of each individual prompt.

You must pass the original prompt exactly as it was returned to the AI Assistant with the addition of the space context.

It is **CRITICAL** that you DO NOT fix the returned prompt! Any errors with the returned prompt must be addressed by improving the `prompt.md` and `generalinstructions.md` files. You MUST pass through the prompt unaltered with the addition of the space context.

The response from the AI Assistant includes the generated Terraform configuration and may include errors related to planning or applying the Terraform configuration.

The default timeout of 60 seconds is often not enough for call to `send_prompt` or `send_prompt_from_file`, which means they time out. If the `send_prompt` or `send_prompt_from_file` tools time out, sleep for 180 seconds, and try again. You can retry calls to the `send_prompt` or `send_prompt_from_file` tools up to 5 times.

When sleeping, run the command `sleep 180` with no other arguments or commands. You must assume that when the command is done, you have slept for the appropriate amount of time.

DO NOT attempt to fix the timeout issues with any other strategy than sleeping.

If the response indicates that the project could not be created, update the `prompt.md` and `generalinstructions.md` files to address the error returned by the AI Assistant.

## Read the converted projects

Serialize the project `<project name>` in the space `Scratchpad` to terraform with the `convertOctopusToTerraform` tool. Replace `<project name>` with the name of the project that was just created.

The project name is defined in the `projectName` argument sent to the `convertOctopusToTerraform` tool, which is an array. The space name is defined in the `space` argument sent to the `convertOctopusToTerraform` tool, which is a string.
  
DO NOT pass the API key or server url parameters to the `convertOctopusToTerraform` tool, as these are defined by environment variables.

## Improve the prompt

Compare the Terraform configuration of the space to the original array item from the pipelines.json file. 

Update the `prompt.md` file to address the 5 most significant issues found as part of the migration.

Update the `generalinstructions.md` file to address the 5 most significant issues found as part of the migration that are related to building Terraform configurations for Octopus projects. The instructions in the `generalinstructions.md` file must focus on improving the Terraform configuration for Octopus projects, rather than improving the prompt for converting Spinnaker pipelines to Octopus projects.

You will be penalized for adding Spinnaker specific instructions to the `generalinstructions.md` file.

CRITICAL: The Terraform generated to create the project and the sample context in `/home/vagrant/Code/OctopusCopilot/context` is different from the Terraform generated when reading an existing project:
* Terraform generated from an existing project does not expose the `count` fields or `lifecycle` blocks on resources.
* Terraform generated from an existing project does not match every resource to an associated data source.

When updating the `generalinstructions.md` file, you must only consider the presense or absence of resources and their properties excluding the `count` fields and `lifecycle` blocks.

You MUST NOT update the `generalinstructions.md` file with instructions around the use of the "count" fields or "lifecycle" blocks.
You MUST NOT update the `generalinstructions.md` file with instructions around creating data sources.
You MUST NOT update the `generalinstructions.md` file with instructions around retaining special characters in the project name.

The directory `/home/vagrant/Code/OctopusCopilot/context` contains Terraform files that provide canonical examples of how to represent Octopus resources in Terraform. Start with the `everystep.tf` file, as this contains the most comprehensive example of projects and steps. You can refer to these files when making improvements to the `generalinstructions.md` file.

Once the `generalinstructions.md` file has been updated, use the `upload_file` tool from the `blobuploader` agent to upload the files to the Azure Blob Storage container. The `upload_file` tool is hard coded to upload the `generalinstructions.md` file to Azure Blob Storage. This is the only file that needs to be uploaded. Uploading this file will make it available to the AI Assistant for future iterations of this process and ensures that the improvements made to the instructions are retained for future use.

You MUST NOT use any other method to upload the files to the Azure Blob Storage container other than the `upload_file` tool from the `blobuploader` agent.
You MUST NOT attempt to use a CLI tool to upload the files to the Azure Blob Storage container.
You MUST NOT upload the `prompt.md` file to the Azure Blob Storage container.

## Check the results

Recreate the same project again with the improved `prompt.md` and `generalinstructions.md` file, and compare the results to the previous attempt. Repeat the process until you are satisfied that the improvements made to the `prompt.md` and `generalinstructions.md` files have resulted in a significantly improved migration process.

# Final Instructions

When reading files, confirm that you have read the whole file by counting the number of lines in the file with `wc -l` and comparing it to the number of lines you have read. If the numbers do not match, you have not read the whole file.

You MUST NEVER push files to remote repositories.

You must save files in the `/home/vagrant/Scratchpad` directory when calling the `send_prompt_from_file` tool. This is the only directory that the MCP server can read.

You MUST NEVER interact with the Octopus API directly. You MUST NOT use any CLI tools to interact with the Octopus API. You MUST NOT use any other tools or methods to interact with the Octopus API.