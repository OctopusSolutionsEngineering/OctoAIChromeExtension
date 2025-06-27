async function getLocalPrompts() {
    const octoAILvsName = "OctoAI Prompts"
    const maxPrompts = 5

    const pageName = getPageName();

    if (!pageName) {
        return null;
    }

    try {
        const match = window.location.href.match(/(Spaces-\d+)/);
        if (match) {
            const collection = await fetch("/api/Spaces/" + match[1] + "/LibraryVariableSets", {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Items);

            const octoAiLvs = collection.filter(lvs => lvs.Name === octoAILvsName).pop();

            if (!octoAiLvs) {
                return null;
            }

            const octoAiLvsVariableSetId = await fetch("/api/Spaces/" + match[1] + "/LibraryVariableSets/" + octoAiLvs.Id, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.VariableSetId);

            const octoAiLvsVariables = await fetch("/api/Spaces/" + match[1] + "/Variables/" + octoAiLvsVariableSetId, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Variables);

            const prompts = []
            for (let i = 0; i < maxPrompts; i++) {
                const prompt = octoAiLvsVariables
                    .filter(v => v.Name.trim() === pageName + "[" + i + "].Prompt")
                    .map(v => v.Value)
                    .pop();
                const systemPrompt = octoAiLvsVariables
                    .filter(v => v.Name.trim() === pageName + "[" + i + "].SystemPrompt")
                    .map(v => v.Value)
                    .pop();

                if (prompt) {
                    prompts.push({"prompt": prompt, "systemPrompt": systemPrompt});
                }
            }

            return prompts;
        }
    } catch (error) {
        Logger.error(error.message);
    }

    return null;

}

async function getSamplePrompts() {
    const defaultPrompts = [
        {prompt: "List the projects in the Default space"},
        {prompt: "Create a Kubernetes project called 'K8s Web App'"},
        {prompt: "Help"}
    ]

    try {
        const localPrompts = await getLocalPrompts();

        const suggestedPrompts = await getSuggestedPrompts();

        const prompts = arrayNotNullOrEmpty(localPrompts) || arrayNotNullOrEmpty(suggestedPrompts) || defaultPrompts;

        if (prompts) {
            return await processPrompts(prompts);
        }

        return defaultPrompts;
    } catch (error) {
        Logger.error(error.message);
        return defaultPrompts;
    }
}

async function getSuggestedPrompts() {
    const response = await chrome.runtime.sendMessage({action: "getPrompts"});

    if (response.error) {
        throw new Error(`OctoAI API call failed: ${response.error.message}`);
    }

    // Get the longest page name where the regex matches
    const pageName = getPageName();

    return response.response
        .filter(prompt => prompt.name === pageName)
        .map(prompt => prompt.prompts)
        .flatMap(prompts => prompts.map(prompt => {
            {
                return {prompt: prompt}
            }
        }));
}

async function processPrompts(prompts) {
    const spaceName = await getSpaceName();
    const projectName = await getProjectName();
    const runbookName = await getRunbookName();
    const firstEnvironmentName = await getFirstEnvironmentName();
    const stepName = await getStepName();
    const tenantName = await getTenantName();
    const lbsSet = await getLibraryVariableSet();
    const machineName = await getMachine();
    const accountName = await getAccount();
    const environmentName = await getEnvironment();
    const workerName = await getWorker();
    const workerPoolName = await getWorkerPool();
    const certificateName = await getCertificate();
    const gitCredential = await getGitCredential();
    const feedName = await getFeed();
    const lifecycle = await getLifecycle();
    const deploymentVersion = await getDeploymentName();
    const releaseVersion = await getReleaseVersion();
    const runbookRun = await getRunbookRun();
    return prompts
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Space.Name}", spaceName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Space.Name}", spaceName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Worker.Name}", workerName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Worker.Name}", workerName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Environment.Name}", environmentName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Environment.Name}", environmentName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Lifecycle.Name}", lifecycle),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Lifecycle.Name}", lifecycle)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.GitCredential.Name}", gitCredential),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.GitCredential.Name}", gitCredential)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Feed.Name}", feedName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Feed.Name}", feedName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Certificate.Name}", certificateName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Certificate.Name}", certificateName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.WorkerPool.Name}", workerPoolName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.WorkerPool.Name}", workerPoolName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Tenant.Name}", tenantName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Tenant.Name}", tenantName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Account.Name}", accountName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Account.Name}", accountName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Machine.Name}", machineName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Machine.Name}", machineName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.LibraryVariableSet.Name}", lbsSet),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.LibraryVariableSet.Name}", lbsSet)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Project.Name}", projectName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Project.Name}", projectName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Runbook.Name}", runbookName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Runbook.Name}", runbookName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Step.Name}", stepName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Step.Name}", stepName)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Deployment.Id}", deploymentVersion),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Deployment.Id}", deploymentVersion)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.RunbookRun.Id}", runbookRun),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.RunbookRun.Id}", runbookRun)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Release.Number}", releaseVersion),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Release.Number}", releaseVersion)
            }
        })
        .map(p => {
            return {
                "prompt": replaceMarker(p.prompt, "#{Octopus.Environment[0].Name}", firstEnvironmentName),
                "systemPrompt": replaceMarker(p.systemPrompt, "#{Octopus.Environment[0].Name}", firstEnvironmentName)
            }
        });
}

function replaceMarker(prompt, marker, replacement) {
    if (!prompt) {
        return "";
    }

    if (!marker) {
        return prompt;
    }

    return prompt.replace(marker, replacement);
}

/**
 * The LLM needs to know the resource that is being prompted. This can be included in the prompt
 * by the end user. But if it isn't, this function adds the name of the resource that is being
 * viewed in the Octopus UI to the prompt.
 * @param prompt The prompt entered by the end user
 * @returns The prompt with the names of the currently viewed resources
 */
async function enrichPrompt(prompt) {
    if (!prompt) {
        return ""
    }

    const currentContext = [
        {type: "Space", name: await getSpaceName()},
        {type: "Project", name: await getProjectName()},
        {type: "Deployment ID", name: await getDeploymentName()},
        {type: "Runbook Run", name: await getRunbookRun()},
        {type: "Release Version", name: await getReleaseVersion()},
        {type: "Step", name: await getStepName()},
        {type: "Tenant", name: await getTenantName()},
        {type: "Library Variable Set", name: await getLibraryVariableSet()},
        {type: "Machine", name: await getMachine()},
        {type: "Account", name: await getAccount()},
        {type: "Environment", name: await getEnvironment()},
        {type: "Worker", name: await getWorker()},
        {type: "Worker Pool", name: await getWorkerPool()},
        {type: "Certificate", name: await getCertificate()},
        {type: "Feed", name: await getFeed()},
        {type: "Git Credential", name: await getGitCredential()},
        {type: "Lifecycle", name: await getLifecycle()},
        {type: "Runbook", name: await getRunbookName()},
    ]

    return currentContext.reduce((accumulator, currentValue) =>
            currentValue.name == null || accumulator.includes(currentValue.name) ?
                accumulator :
                accumulator + "\nCurrent " + currentValue.type + " is \"" + currentValue.name + "\".",
        prompt);
}



function submitPrompt(systemPrompt, originalPrompt) {
    if (!originalPrompt) {
        return
    }

    if (systemPrompt) {
        localStorage.setItem("octoai-prompt", "");
    } else {
        localStorage.setItem("octoai-prompt", originalPrompt);
    }

    hideAllButtons();
    disableSubmitButton();
    hideResponse();

    const thinkingAnimation = showThinking();

    const feedback = document.getElementById('octoai-feedback');
    const thumbsUp = document.getElementById('octo-ai-thumbs-up');
    const thumbsDown = document.getElementById('octo-ai-thumbs-down');

    enrichPrompt(originalPrompt)
        .then(prompt => {
            addFeedbackListener(feedback, thumbsUp, thumbsDown, prompt);
            return callOctoAi(systemPrompt, prompt);
        })
        .then(result => {
            displayMarkdownResponseV2(result, getColors());
        })
        .catch(e =>
            Logger.error(e))
        .finally(() =>
            {
                clearInterval(thinkingAnimation)
                showPrompt();
                enableSubmitButton();
            }
        );
}