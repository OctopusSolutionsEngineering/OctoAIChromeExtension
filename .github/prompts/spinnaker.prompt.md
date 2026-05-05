---
name: Spinnaker Migration Refinement
description: This prompt converts Spinnaker pipelines into Octopus projects, compares the results, and improves the prompt.md file based on the findings.
---

You will convert Spinnaker pipelines into Octopus projects, compare the results, and improve the prompt.md file.

The prompt.md file contains the instructions required to convert Spinnaker pipelines into prompts that create Octopus projects.

The generalinstructions.md file contains instructions for building Terraform configurations for Octopus projects.

# Reading the pipeline

Select a random Spinnaker pipeline JSON file from one of the directories under `/Users/matthewcasperson/Downloads/spinnaker-pipelines-vendor-anonymized`.

Count the number of array items with `jq`.

We want to select a random pipeline from the array with each iteration.

Generate a random number using the `$RANDOM` bash variable between 0 and the array size minus 1, e.g. `echo $(( RANDOM % 100 ))` to generate a number between 0 and 99.

Select a random pipeline from the array with `jq`, and process the item using the instructions in the next sections. Then select a new random pipeline and repeat the process.

Finish when you have found 5 significant improvements to the `prompt.md` file. You do not have to process every item in the array.

## Reset the test space

Reset the scratchpad space. 

## Convert the pipeline

Create a temporary file using bash in the `/Users/matthewcasperson/Scratchpad` dir, grant everyone read access to the file, and replace the placeholders with the contents of the appropriate files using bash commands like `cat` and `jq` rather than reading the files directly:

```
<prompt.md contents>

<pipelines.json array item>
```

Run the temporary file with the AI Assistant, passing the filename directly to the `send_prompt_from_file` tool.

The response from the AI Assistant is another prompt describing how to recreate the Spinnaker pipeline as Octopus resources. There is not a strict one-to-one relationship between Spinnaker and Octopus resources.

The prompt may contain multiple sections separated by a triple dash (`---`).

Split the result up on the triple dash separators.

Append `The current space is "Scratchpad"` to the end of each individual prompt.

You must pass the original prompt exactly as it was returned with the addition of the space context.

It is **CRITICAL** that you DO NOT fix the returned prompt! Any errors with the returned prompt must be addressed by improving the `prompt.md` file. You MUST pass through the prompt unaltered with the addition of the space context.

The default timeout of 60 seconds is often not enough for call to `send_prompt` or `send_prompt_from_file`, which means they time out. If the `send_prompt` or `send_prompt_from_file` tools time out, sleep for 180 seconds, and try again. You can retry calls to the `send_prompt` or `send_prompt_from_file` tools up to 5 times.

When sleeping, run the command `sleep 180` with no other arguments or commands. You must assume that when the command is done, you have slept for the appropriate amount of time.

DO NOT attempt to fix the timeout issues with any other strategy than sleeping.

## Read the converted projects

Serialize the project `<project name>` in the space `Scratchpad` to terraform with the `convertOctopusToTerraform` tool. Replace `<project name>` with the name of the project that was just created.

The project name is defined in the `projectName` argument sent to the `convertOctopusToTerraform` tool, which is an array. The space name is defined in the `space` argument sent to the `convertOctopusToTerraform` tool, which is a string.
  
DO NOT pass the API key or server url parameters to the `convertOctopusToTerraform` tool, as these are defined by environment variables.

## Improve the prompt

Compare the Terraform configuration of the space to the original array item from the pipelines.json file. 

Update the prompt.md file to address the 5 most significant issues found as part of the migration.

Update the generalinstructions.md file to address the 5 most significant issues found as part of the migration that are related to building Terraform configurations for Octopus projects.