const prompt = `## Introduction

This document describes the best practices and principles for achieving operational excellence in an organization based on the
AWS Well-Architected Framework.

Each section contains a checklist of best practices to follow. Some sections include a Rationale for why the provided Octopus implementation supports the best practice.

## Common Instructions

You must ignore the "is_version_controlled" settings when evaluating whether a project is configured with Config-as-Code, as this value is always "false".

You must only consider the instructions like "Project '#{Octopus.Project.Name}' is configured to use Config-as-Code" or "Project '#{Octopus.Project.Name}' is not configured to use Config-as-Code."

If you see the instruction "Project '#{Octopus.Project.Name}' is not configured to use Config-as-Code", this is definitive evidence that the project does not use Config-as-Code.
# [OPS05-BP01 Use version control](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_dev_integ_version_control.html)

Risk Level: High

The project is compliant if it is configured with Config-as-Code.

The project is partially compliant if the following steps source their scripts and templates from Git:
* Script steps
* Cloudformation steps
* Kubernetes raw YAML steps
* Terraform steps

You will be penalized for reporting this project as compliant if the project does not use Config-as-Code.

## Rationale

Config-as-Code allows the deployment process to be persisted in version control.

Configuring steps that use scripts and templates to source their code from Git ensures they meet the requirement of using version control.

# [OPS05-BP03 Use configuration management systems](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_dev_integ_conf_mgmt_sys.html)

Risk Level: Medium

The project is compliant if it sources values from variables.
The project is compliant if it use external configuration management systems such as Hashicorp Vault, AWS Systems Manager Parameter Store, or AWS Secrets Manager.

You will be penalized for reporting this project as non-compliant if it uses both variables and external configuration management systems.
You will be penalized for reporting this project as non-compliant if it only uses variables and do not use external configuration management systems.
You will be penalized for reporting this project as non-compliant if it uses hard-coded values for non-sensitive data that is unique to each step.

To be non-compliant, the deployment process uses duplicate values across multiple steps.

## Rationale

Defining application configuration as variables or using external configuration management systems allows configuration to be managed separately from the deployment process and decoupled from the deployed artifacts.

RBAC controls provide a security layer preventing unauthorized modification of configuration values.

Audit logs track changes to configuration values.

Using variables to define repeatable values reduces the risk of errors when updating multiple steps.

# [OPS02-BP01 Resources have identified owners](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ops_model_def_resource_owners.html)

Risk Level: High

To be compliant with this requirement, all projects must indicate who owns them.

To be non-compliant, the project does not indicate who owns them.

# [OPS03-BP05 Experimentation is encouraged](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_org_culture_team_enc_experiment.html)

Risk Level: Medium

To be compliant with this requirement, the project must use Config-as-Code.

To be non-compliant, the project does not use Config-as-Code.

## Rationale

Config-as-Code allows the deployment process to be modified in a Git branch, tested, and reviewed before being merged into the main branch. This allows teams to experiment with changes without impacting production workloads.

# [OPS05-BP02 Test and validate changes](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_dev_integ_test_val_chg.html)

Risk Level: High

To be compliant with this requirement, the deployment process must include one or more steps that test or validate changes during deployments such as:
* Unit tests
* Integration tests
* End-to-end tests
* Smoke tests
* Load tests

This requirement also contributes:

* [REL08-BP02: Integrate functional testing as part of your deployment](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_functional_testing.html)
* [REL08-BP04: Deploy using immutable infrastructure](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_immutable_infrastructure.html)
* [REL07-BP04: Load test your workload](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_adapt_to_changes_load_tested_adapt.html)
* [OPS06-BP02: Test deployments](https://docs.aws.amazon.com/wellarchitected/latest/framework/ops_mit_deploy_risks_test_val_chg.html)

# [OPS06-BP01 Plan for unsuccessful changes](https://docs.aws.amazon.com/wellarchitected/latest/framework/ops_mit_deploy_risks_plan_for_unsucessful_changes.html)

This requirement also contributes to:

* [OPS06-BP04 Automate testing and rollback](https://docs.aws.amazon.com/wellarchitected/latest/framework/ops_mit_deploy_risks_auto_testing_and_rollback.html)
* [OPS07-BP05 Make informed decisions to deploy systems and changes](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_informed_deploy_decisions.html)
* [SEC11-BP06: Deploy software programmatically](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_appsec_deploy_software_programmatically.html)
* [REL08-BP02: Integrate functional testing as part of your deployment](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_functional_testing.html)
* [REL08-BP04: Deploy using immutable infrastructure](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_immutable_infrastructure.html)
* [REL08-BP05: Deploy changes with automation](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_tracking_change_management_automated_changemgmt.html)

# [OPS06-BP03 Employ safe deployment strategies](https://docs.aws.amazon.com/wellarchitected/latest/framework/ops_mit_deploy_risks_deploy_mgmt_sys.html)

To be compliant with this requirement, the deployment process must include one or more of the following deployment strategies:
* Blue/Green deployments
* Canary deployments
* Rolling deployments
* Traffic Splitting
* Feature Toggles or Flags

Features that indicate blue/green deployments are:
* Azure functions using deployment slots
* AWS Lambda using aliases

To be non-compliant, the deployment process uses only all-at-once deployments.

This requirement also contributes to:
* [REL08-BP04: Deploy using immutable infrastructure](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_immutable_infrastructure.html)

# [OPS10-BP07 Automate responses to events](https://docs.aws.amazon.com/wellarchitected/latest/framework/ops_event_response_auto_event_response.html)

Risk level: Medium

To be compliant with this requirement, the deployment process must include steps configured to run on failure, including (but not limited to):

* Notification steps
* Rollback steps
* Custom failure handling scripts

## Rationale

A failed deployment likely means the intended change was not successfully applied. Automating responses to deployment failures helps to reduce the time to respond and remediate issues.


# [REL07-BP04 Load test your workload](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_load_tested_adapt.html)

Risk level: Medium

To be compliant with this requirement, the project must include a runbook to perform load testing.

Smoke tests do not satisfy this requirement.

To be non-compliant, the project does not include any step or runbook that performs load testing.

# [REL08-BP02: Integrate functional testing as part of your deployment](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_tracking_change_management_functional_testing.html)

Risk level: High

To be compliant with this requirement, the deployment process must:

* Include steps that implement one or more of the following tests:
* Unit tests
* Integration tests
* End-to-end tests
* Smoke tests
* Load tests
* Include steps that implement rollbacks

# [REL08-BP03 Integrate resiliency testing as part of your deployment](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_tracking_change_management_resiliency_testing.html)

Risk level: Medium

To be compliant with this requirement, the deployment process or runbooks must include chaos testing.

To be non-compliant, there are no steps or runbooks that perform chaos testing.

# [REL09-BP01 Identify and back up all data that needs to be backed up, or reproduce the data from sources](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_backing_up_data_identified_backups_data.html)

Risk level: High

To be compliant with this requirement, the project must include a runbook to back up data.

To be non-compliant, there is no step or runbook that automates the backup process.

# [REL09-BP03 Perform data backup automatically](https://docs.aws.amazon.com/wellarchitected/2023-10-03/framework/rel_backing_up_data_automated_backups_data.html)

Risk level: Medium

To be compliant with this requirement, the backup runbook must be run on a trigger.

To be non-compliant, there is no runbook or step that performs a backup, or the backup runbook is only run manually.

# [REL10-BP01 Deploy the workload to multiple locations](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html)

Risk level: High

To be compliant with this requirement, cloud deployments must be deployed to multiple regions or availability zones.

To be non-compliant, the deployment process only deploys to a single region or availability zone.

Deploying to multiple environments does not indicate compliance unless those environments are in different regions or availability zones.
# [SEC01-BP01 Separate workloads using accounts](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_securely_operate_multi_accounts.html)

Risk level: High

To be compliant with this requirement, accounts must be scoped to different environments.

    To be non-compliant, the same account is used for multiple environments.

## Rationale

Using a shared account across multiple environments typically indicates that an account has broad permissions that may allow access to production resources from lower environments.

# [SEC11-BP02: Automate testing throughout the development and release lifecycle](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_appsec_automate_testing_throughout_lifecycle.html)

Risk level:  Medium

To be compliant with this requirement, the deployment process must include security or vulnerability scanning steps.

This requirement also contributes to:
* [SEC06-BP01: Perform vulnerability management](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_protect_compute_vulnerability_management.html)

# [SEC11-BP07: Regularly assess security properties of the pipelines](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_appsec_regularly_assess_security_properties_of_pipelines.html)

Risk level: High

To be compliant with this requirement:

* Teams must be used to provide separate duties for deployment and editing of projects.
* Projects must also only use OIDC accounts.
* Projects that have prompted variables must have steps to validate the inputs.

The project is non-compliant if it uses any of the following account types, as these do not support OIDC:

* octopusdeploy_azure_service_principal
* octopusdeploy_aws_account
* octopusdeploy_gcp_account
* octopusdeploy_username_password_account
* octopusdeploy_token_account

This requirement also contributes to:
* [SEC02-BP02: Use temporary credentials](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_identities_unique.html)
* [SEC02-BP04: Rely on a centralized identity provider](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_identities_identity_provider.html)
* [SEC02-BP06: Employ user groups and attributes](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_identities_groups_attributes.html)
* [SEC03-BP02: Grant least privilege access](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_permissions_least_privileges.html)

## Rationale

OIDC accounts remove the need to store long-lived credentials within Octopus Deploy.

# [SEC10-BP01 Identify key personnel and external resources](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_incident_response_identify_personnel.html)

Risk level: High

To be compliant with this requirement, all projects must identify security personnel responsible for the project.

To be non-compliant, security personnel are not identified for the project.

# [COST03-BP02 Add organization information to cost and usage](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_monitor_usage_org_information.html)

Risk level: Medium

This project is compliant if it deploys cloud resources and defines tags that indicate the associated cost center or business unit.

Tenant tags do not satisfy this best practice.

This project is non-compliant if it does not include tags that indicate the associated cost center or business unit.

You will be penalized for reporting this project as partially compliant if there are no tags that indicate the associated cost center or business unit.

You will be penalized for reporting this project as partially compliant if it only includes tenant tags.

## Selection Criteria

To meet the selection criteria for this best practice, the project must deploy cloud resources.

## Rationale

Any cloud resources deployed by Octopus should include tags that indicate the associated cost center or business unit. This allows costs to be allocated appropriately.
## Project Compliance Report

You must consider this prompt to be a general query about the project "#{Octopus.Project.Name}" in the space "#{Octopus.Space.Name}".

You must select the "answer_general_query" tool to process this prompt.

Given the configuration of the project, you must consider each section and determine if the project meets the requirements.

Generate a report using the emojis 🟢 (meaning "Compliant"), 🟡 (meaning "Partially Compliant"), 🔴 (meaning "Non-Compliant"), or ⚪ (meaning "Not Applicable") for the overall compliance for each best practice based on the project's configuration. The emoji is used in the heading of each best practice.

The report must include the risk level for each best practice.

The ⚪ ("Not Applicable") status is only used when the best practice specifically indicates the selection criteria used to determine that the best practice applies to a project or step, and the project or step does not meet those criteria.

You will be penalized for using the ⚪ ("Not Applicable") status for best practices that do not include selection criteria.

You will be penalized for using the 🟢 ("Compliant") status for best practices that the project is not compliant with.

You will be penalized for using the 🟡 ("Partially Compliant") status for best practices that the project is not compliant with.

You must use the 🔴 (meaning "Non-Compliant") status for best practices that the project is not compliant with. For example, if the report for a best practice includes a phrase like "Therefore, the project does not meet the requirements for <requirement>.", the status must be 🔴.

Provide a brief explanation for each assessment.

If a project is compliant, the 🟢 emoji must be used.
If a project is partially compliant, the 🟡 emoji must be used.
If a project is non-compliant, the 🔴 emoji must be used.
If a project is not applicable, the ⚪ emoji must be used.

You must include a blank line between the heading and the explanation.

You will be penalized for reporting on an assumed space or project.

Add a line break between each section.

Add the compliance status at the end of the section.

This is an example report format:

[ABCD-BVN12 Awesome Best Practice](https://example.com/best-practice-url) (High Risk)

This is an example of a project that clearly meets the requirements of the best practice.

🟢 Compliant
___

[ABCD-BVAD Another Very Awesome Description](https://example.com/another-best-practice-url) (Medium Risk)

This is an example of a project that does not meet any of the requirements of the best practice.

🔴 Not Compliant`

/*
    The prompt variable is a shared prompt that is also included in the promptsv#.json file.
    It is expected to be updated by copying and pasting a shared prompt in multiple places.
    These instructions are unique to this dashboard, and are appended to the shared prompt.
 */
const customInstructions = "You must prefix the report with a heading that includes the project name and space name, like this: 'AWS Well-Architected Report for Project \"Project Name\" in Space \"Space Name\"'."

dashboardGetConfig(config => {
    const reportEl = document.getElementById('report');

    if (!config || !config.lastServerUrl || !config.context) {
        reportEl.innerHTML = DOMPurify.sanitize(`
            <div class="error-message">
                <h3>⚠️ Configuration Error</h3>
                <p>Missing required configuration for the dashboard.</p>
                <p>Try reopening this dashboard from the Octopus AI Assistant.</p>
            </div>
        `);
        return;
    }

    dashboardSendPrompt(prompt + "\n\n" + config.context + "\n\n" + customInstructions, config.lastServerUrl)
        .then(result => {
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }

            // Parse and sanitize the markdown response
            const htmlContent = marked.parse(result.response);
            const cleanHtml = DOMPurify.sanitize(htmlContent);

            reportEl.innerHTML = cleanHtml;
        })
        .catch(error => {
            // Show error message
            reportEl.innerHTML = DOMPurify.sanitize(`
                <div class="error-message">
                    <h3>⚠️ Error Loading Report</h3>
                    <p>Failed to generate the AWS Well-Architected compliance report.</p>
                    <p><strong>Error:</strong> ${error.message || error}</p>
                </div>
            `);
        });
})