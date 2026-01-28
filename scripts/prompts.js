async function getLocalPrompts() {
    const octoAILvsName = "OctoAI Prompts"
    const maxPrompts = 5

    const pageName = await getPageName();

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

async function isOnEmptyDashboardPage() {
    return await getPageName() === "Dashboard.NoProjects";
}

async function getSamplePrompts() {
    const defaultPrompts = [
        {prompt: "List the projects in the space"},
        {prompt: "Create a Kubernetes project called 'K8s Web App'"},
        {prompt: "Help"}
    ]

    try {
        const localPrompts = await getLocalPrompts();

        const suggestedPrompts = await getSuggestedPrompts()
            .catch(() => [])

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
    const pageName = await getPageName();

    function convertStringToPrompt(promptString) {
        if (isObject(promptString)) {
            // This is a nested menu
            if (promptString.name && promptString.prompts) {
                return {
                    name: promptString.name,
                    prompts: promptString.prompts.map(prompt => convertStringToPrompt(prompt))
                };
            }

            // This is a short prompt that creates a longer prompt
            if (promptString.prompt || promptString.fullPrompt) {
                return {
                    prompt: promptString.prompt,
                    fullPrompt: promptString.fullPrompt
                };
            }

            // This is an unexpected object, which will be ignored
            return null;
        }

        return {
            prompt: promptString
        };
    }

    return response.response
        .filter(prompt => prompt.name === pageName)
        .map(prompt => prompt.prompts)
        .flatMap(prompts => prompts.map(prompt => convertStringToPrompt(prompt)))
        .filter(prompt => prompt != null);
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

    function mapPrompt(prompt, template, replacement) {
        if (Array.isArray(prompt.prompts)) {
            return {
                "name": prompt.name,
                "prompts": prompt.prompts.map(item => mapPrompt(item, template, replacement))
            };
        }

        return {
            "prompt": replaceMarker(prompt.prompt, template, replacement),
            "systemPrompt": replaceMarker(prompt.systemPrompt, template, replacement),
            "fullPrompt": replaceMarker(prompt.fullPrompt, template, replacement),
        }
    }

    return prompts
        .map(p => mapPrompt(p, "#{Octopus.Space.Name}", spaceName))
        .map(p => mapPrompt(p, "#{Octopus.Worker.Name}", workerName))
        .map(p => mapPrompt(p, "#{Octopus.Environment.Name}", environmentName))
        .map(p => mapPrompt(p, "#{Octopus.Lifecycle.Name}", lifecycle))
        .map(p => mapPrompt(p, "#{Octopus.GitCredential.Name}", gitCredential))
        .map(p => mapPrompt(p, "#{Octopus.Feed.Name}", feedName))
        .map(p => mapPrompt(p, "#{Octopus.Certificate.Name}", certificateName))
        .map(p => mapPrompt(p, "#{Octopus.WorkerPool.Name}", workerPoolName))
        .map(p => mapPrompt(p, "#{Octopus.Tenant.Name}", tenantName))
        .map(p => mapPrompt(p, "#{Octopus.Account.Name}", accountName))
        .map(p => mapPrompt(p, "#{Octopus.LibraryVariableSet.Name}", lbsSet))
        .map(p => mapPrompt(p, "#{Octopus.Project.Name}", projectName))
        .map(p => mapPrompt(p, "#{Octopus.Runbook.Name}", runbookName))
        .map(p => mapPrompt(p, "#{Octopus.Step.Name}", stepName))
        .map(p => mapPrompt(p, "#{Octopus.Deployment.Id}", deploymentVersion))
        .map(p => mapPrompt(p, "#{Octopus.RunbookRun.Id}", runbookRun))
        .map(p => mapPrompt(p, "#{Octopus.Release.Number}", releaseVersion))
        .map(p => mapPrompt(p, "#{Octopus.Environment[0].Name}", firstEnvironmentName))
        .map(p => mapPrompt(p, "#{Octopus.Machine.Name}", machineName))
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
            currentValue.name == null ?
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

    addFeedbackListener(feedback, thumbsUp, thumbsDown, originalPrompt);

    callOctoAi(systemPrompt, originalPrompt)
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