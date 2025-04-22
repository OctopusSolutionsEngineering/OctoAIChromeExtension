function addAiToPage(theme) {
    if (document.getElementById("octoai")) {
        return
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
.octo-ai-fade-out {
  opacity: 0;
  transition: opacity 0.5s ease;
}
.octo-ai-hidden {
  display: none;
}
@keyframes siriWave {
    0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(68, 68, 255, 0.7);
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(68, 68, 255, 0);
    }
    100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(68, 68, 255, 0);
    }
}
.siri-button {
    position: relative;
    background: radial-gradient(circle at 30% 30%, #4444ff, #9944ff);
    z-index: 1;
    transition: all 0.3s ease;
    animation: siriWave 2s infinite;
}
.siri-button::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.4), transparent);
}`;
    document.head.appendChild(styleSheet);

    // Add additional styling for markdown elements
    const markdownStyles = document.createElement("style");
    markdownStyles.textContent = `
        #octoai-container td,
        #octoai-container th,
        #octoai-container p,
        #octoai-container li, 
        #octoai-container ul, 
        #octoai-container h1, 
        #octoai-container h2, 
        #octoai-container h3,
        #octoai-container h4,
        #octoai-container h5,
        #octoai-container h6 {
            color: ${theme.text};
        }
        
        #octoai-container a:hover {
            color: ${theme.text};
        }
    `;
    document.head.appendChild(markdownStyles);

    // This is the button used to open the prompt interface
    const newButton = document.createElement("button");
    newButton.id = "octoai"

    newButton.className = "siri-button";
    newButton.style.position = "absolute";
    newButton.style.top = "16px";
    newButton.style.right = "120px";
    newButton.style.width = "32px";
    newButton.style.height = "32px";
    newButton.style.padding = "0";
    newButton.style.margin = "0";
    newButton.style.border = "none";
    newButton.style.borderRadius = "50%";

    newButton.addEventListener("mouseover", function () {
        this.style.transform = "scale(1.1)";
        this.style.filter = "brightness(1.2)";
    });

    newButton.addEventListener("mouseout", function () {
        this.style.transform = "scale(1)";
        this.style.filter = "brightness(1)";
    });

    document.body.appendChild(newButton);

    newButton.addEventListener("click", function (event) {
        event.preventDefault();
        displayAIChat();
    });
}

async function createOctopusApiKey() {
    // cached results as static variables
    if (createOctopusApiKey.token && createOctopusApiKey.expiry > Date.now()) {
        return {accessToken: createOctopusApiKey.token, apiKey: null};
    } else {
        createOctopusApiKey.token = null;
        createOctopusApiKey.expiry = null;
    }

    try {
        const csrfToken = getOctopusCsrfTokenFromCookie();

        const headers = {
            'Content-Type': 'application/json'
        };

        if (csrfToken) {
            headers['X-Octopus-Csrf-Token'] = csrfToken;
        }

        const response = await fetch(`/api/users/access-token`, {
            method: 'POST',
            headers: headers,
            credentials: 'include'
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('New API key created successfully');

        createOctopusApiKey.token = data.AccessToken;
        createOctopusApiKey.expiry = Date.now() + 45 * 60 * 1000; // 45 min expiry

        return {accessToken: data.AccessToken, apiKey: null};
    } catch (error) {
        // Assume we have a guest account
        return {accessToken: null, apiKey: "API-GUEST"};
    }
}

function getOctopusCsrfTokenFromCookie() {
    try {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith('Octopus-Csrf-Token')) {
                const csrfToken = cookie.split("=");
                console.log('CSRF token found in cookie');
                return csrfToken[1];
            }
        }
        console.log('No Octopus-Csrf-Token cookie found');
        return null;
    } catch (error) {
        console.error('Error reading Octopus-Csrf-Token cookie:', error);
        return null;
    }
}

/**
 Check to see if the response is a confirmation prompt.
 */
function isActionSseResponse(sseResponse) {
    return !!sseResponse
        .split('\n')
        .filter(line => line.trim())
        .filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.replace('data: ', '')))
        .filter(response => 'type' in response && response.type === 'action')
        .pop()
}

function getConfirmationTitleAndMessage(sseResponse) {
    return sseResponse
        .split('\n')
        .filter(line => line.trim())
        .filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.replace('data: ', '')))
        .filter(response => 'type' in response && response.type === 'action')
        .map(response => {
            return {
                title: response.title,
                message: response.message,
                id: response.confirmation.id
            }
        })
        .pop()
}

function convertFromSseResponse(sseResponse) {
    const responses = sseResponse
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line.replace('data: ', '')));

    const contentResponses = responses
        .filter(response => 'content' in response.choices[0].delta);

    return contentResponses
        .map(line => line.choices[0].delta.content.trim())
        .join('\n');
}

async function callOctoAi(systemPrompt, prompt) {
    console.log(systemPrompt)
    console.log(prompt)

    try {
        const combinedPrompt = [systemPrompt, prompt]
            .filter(p => p.trim())
            .map(p => p.trim())
            .join("\n");

        // Get the server URL from the current location
        const serverUrl = window.location.origin;

        const creds = await createOctopusApiKey();

        const response = await chrome.runtime
            .sendMessage({
                action: "prompt",
                prompt: combinedPrompt,
                accessToken: creds.accessToken,
                apiKey: creds.apiKey,
                serverUrl: serverUrl
            });

        if (response.error) {
            return {
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: "There was an error processing your request. You may try the prompt again."
            };
        }

        if (isActionSseResponse(response.response)) {
            // This is a confirmation prompt rather than an answer
            showConfirmation();
            hideForm();
            const titleAndMessage = getConfirmationTitleAndMessage(response.response);

            document.getElementById("octo-ai-approve").onclick = function() {
                approveConfirmation(titleAndMessage.id);
            }

            return {
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: titleAndMessage.title + "\n\n" + titleAndMessage.message
            };
        }

        showExamples();
        return {prompt: prompt, systemPrompt: systemPrompt, response: convertFromSseResponse(response.response)};
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

async function approveConfirmation(id) {
    hideResponse();
    hideConfirmation();
    disableSubmitButton();
    showForm();

    const thinkingAnimation = showThinking();

    const creds = await createOctopusApiKey();

    // Get the server URL from the current location
    const serverUrl = window.location.origin;

    try {
        const response = await chrome.runtime
            .sendMessage({
                action: "confirmation",
                id: id,
                accessToken: creds.accessToken,
                apiKey: creds.apiKey,
                serverUrl: serverUrl
            });

        if (response.error) {
            displayMarkdownResponseV2(
                {
                    prompt: "",
                    systemPrompt: "",
                    response: "There was an error processing your request. You may try the prompt again."
                },
                getColors());
            return;
        }

        displayMarkdownResponseV2(
            {
                prompt: response.prompt,
                systemPrompt: "",
                response: convertFromSseResponse(response.response)
            },
            getColors());
    }
    finally {
        clearInterval(thinkingAnimation);
        showExamples();
        showPrompt();
        enableSubmitButton();
    }
}

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
        console.error(error.message);
    }

    return null;

}

function getPageName() {
    return Object.keys(getPageRegex())
        .filter(key => window.location.href.match(getPageRegex()[key]))
        .sort((a, b) => a.length - b.length)
        .pop();
}

async function getSamplePrompts() {
    const defaultPrompts = [
        {prompt: "List the projects in the Default space"},
        {prompt: "Generate a terraform module with three environments and a project called \"My Application\""},
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
        console.error(error.message);
        return defaultPrompts;
    }
}

function arrayNotNullOrEmpty(array) {
    if (!array) {
        return null
    }

    return array.length > 0 ? array : null
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

async function getFirstEnvironmentName() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        const names = await fetch("/api/Spaces/" + match[1] + "/Environments", {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Items.map(item => item.Name))

        if (names.length > 0) {
            return names[0]
        }

        return "MyEnvironment"
    }
    return null;
}

async function getSpaceId() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        return match[1]
    }
    return null;
}

async function getSpaceName() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getProjectName() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/[^?]*\\??.*/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/projects/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getDeploymentName() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)\/deployments\/([^?]*)\\??.*/);
    if (match) {
        return match[4]
    }
    return null;
}

async function getRunbookRun() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/snapshots\/([^\/]*)\/runs\/([^?]*)\\??.*/);
    if (match) {
        return match[5]
    }
    return null;
}

async function getReleaseVersion() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)(\/.*)/);
    if (match) {
        return decodeURIComponent(match[3])
    }
    return null;
}

async function getRunbookName() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/[^?]*\\??.*/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Runbooks/" + match[3], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getTenantName() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants\/([^\/]+)\/[^?]*\\??.*/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Tenants/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getLibraryVariableSet() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/LibraryVariableSet/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getMachine() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Machines/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getAccount() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Accounts/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getEnvironment() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Environments/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }

    // We can also extract an environment from a deployment
    const deploymentId = await getDeploymentName()
    const spaceId = await getSpaceId()

    if (deploymentId) {
        const environmentId = await fetch("/api/Spaces/" + spaceId + "/Deployments/" + deploymentId, {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.EnvironmentId)

        if (environmentId) {
            return await fetch("/api/Spaces/" + spaceId + "/Environments/" + environmentId, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Name)
        }
    }

    const runbookRun = await getRunbookRun()

    if (runbookRun) {
        const environmentId = await fetch("/api/Spaces/" + spaceId + "/RunbookRuns/" + runbookRun, {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.EnvironmentId)

        if (environmentId) {
            return await fetch("/api/Spaces/" + spaceId + "/Environments/" + environmentId, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Name)
        }
    }

    return null;
}

async function getCertificate() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/certificates\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Certificates/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getFeed() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/feeds\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Feeds/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getGitCredential() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitcredentials\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Git-Credentials/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getLifecycle() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/lifecycles\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Lifecycles/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getWorker() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workers\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/Workers/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getWorkerPool() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workerpools\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1] + "/WorkerPools/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getStepName() {
    const match = window.location.href.match(/https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/process\/steps\\?.*/);
    if (match) {
        const parentStepId = new URLSearchParams(window.location.href.split("?")[1]).get("parentStepId");

        const steps = await fetch("/api/Spaces/" + match[1] + "/projects/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.DeploymentProcessId)
            .then(deploymentProcessId => fetch("/api/Spaces/" + match[1] + "/DeploymentProcesses/" + deploymentProcessId, {credentials: 'include'}))
            .then(response => response.json())
            .then(json => json.Steps)

        const step = steps
            .filter(step => step.Id === parentStepId)
            .map(step => step.Name);

        if (step.length > 0) {
            return step[0]
        }
    }
    return null;
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

async function displayAIChat() {

    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        hidePromptUI()
    } else {
        displayPromptUIV2(getColors());
        const prompts = await getSamplePrompts();
        displayExamples(prompts, getColors());
    }
}

function createButton(text, theme, id) {
    const button = document.createElement('div');
    if (id) {
        button.id = id;
    }
    button.textContent = text;
    button.title = text;
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.padding = '10px';
    button.style.marginBottom = '10px';
    button.style.backgroundColor = theme.backgroundSecondaryButton;
    button.style.border = '1px solid #ccc';
    button.style.borderRadius = '5px';
    button.style.borderColor = theme.border;
    button.style.textAlign = 'left';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.style.whiteSpace = 'nowrap';
    button.style.overflow = 'hidden';
    button.style.textOverflow = 'ellipsis';
    button.style.color = theme.text;

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = theme.backgroundButton;
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = theme.backgroundSecondaryButton;
    });

    return button;
}

function displayExamples(prompts, theme) {
    const examplesContainer = document.getElementById('octoai-examples');

    if (!examplesContainer) {
        return
    }

    examplesContainer.innerHTML = '';

    // Create and append the header
    const examplesHeader = document.createElement('h2');
    examplesHeader.textContent = 'Examples';
    examplesHeader.style.marginBottom = '20px';
    examplesHeader.style.color = theme.text;
    examplesContainer.appendChild(examplesHeader);

    // Function to create a button
    function createExampleButton(prompt, theme) {
        const button = createButton(prompt.prompt, theme);

        if (prompt.systemPrompt) {
            button.textContent = "SYSTEM: " + prompt.prompt;

            // Add click event
            button.addEventListener('click', () => {
                submitPrompt(prompt.systemPrompt, prompt.prompt);
            });

        } else {
            button.textContent = prompt.prompt;

            // Add click event
            button.addEventListener('click', () => {
                const input = document.getElementById('octoai-input');
                if (input) {
                    input.value = prompt.prompt;
                    input.focus();
                }
            });
        }

        return button;
    }

    // Generate buttons and append them to the container
    prompts.forEach(prompt => {
        const button = createExampleButton(prompt, getColors());
        examplesContainer.appendChild(button);
    });
}

function hideForm() {
    const input = document.getElementById('octoai-form');
    const response = document.getElementById('octoai-response');
    if (input) {
        input.style.display = 'none';
    }
    if (response) {
        response.style.display = 'none';
    }
}

function showForm() {
    const input = document.getElementById('octoai-form');
    const response = document.getElementById('octoai-response');
    if (input) {
        input.style.display = 'flex';
    }
    if (response) {
        response.style.display = 'inherit';
    }
}


function hidePromptUI() {
    const container = document.getElementById('octoai-container');
    if (container) {
        container.parentElement.removeChild(container);
    }
}

function displayPromptUIV2(theme) {
    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        existingContainer.parentElement.removeChild(existingContainer);
    }

    // Create the main container div
    const container = document.createElement('div');
    container.id = 'octoai-container';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.border = '1px solid #E0E0E0';
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.width = '800px';
    container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    container.style.backgroundColor = theme.background;
    container.style.borderColor = theme.border;

    // Set absolute positioning in the bottom-right corner
    container.style.position = 'absolute';
    container.style.bottom = '16px';
    container.style.right = '16px';
    container.style.zIndex = '1000';

    // Create the header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.margin = '0 0 16px 0';

    // Add the OctoAI logo
    const logo = document.createElement('span');
    logo.textContent = '✨ OctoAI';
    logo.style.fontWeight = 'bold';
    logo.style.fontSize = '16px';
    logo.style.color = theme.text;
    header.appendChild(logo);

    // Add close button (right side)
    const closeButton = document.createElement('span');
    closeButton.textContent = '✕';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = theme.textSecondary;
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.padding = '0 4px';

    // Add hover effect
    closeButton.addEventListener('mouseover', () => {
        closeButton.style.color = theme.text;
    });
    closeButton.addEventListener('mouseout', () => {
        closeButton.style.color = theme.textSecondary;
    });

    // Add click event to remove the container
    closeButton.addEventListener('click', () => {
        hidePromptUI()
    });

    header.appendChild(closeButton);

    // Add the header to the container
    container.appendChild(header);

    // Create the response markdown
    const message = document.createElement('div');
    message.id = 'octoai-response';
    message.style.display = 'none';
    message.style.maxHeight = '300px';
    message.style.overflowY = 'auto';
    message.style.margin = '0 0 16px 0';
    container.appendChild(message);

    // Create the feedback section
    const feedback = document.createElement('div');
    feedback.style.marginBottom = '8px';
    feedback.style.display = 'none';
    feedback.id = 'octoai-feedback';

    // Add the "Was this response helpful?" text
    const feedbackText = document.createElement('span');
    feedbackText.textContent = 'Was this response helpful?';
    feedbackText.style.fontSize = '14px';
    feedbackText.style.color = theme.textSecondary;
    feedback.appendChild(feedbackText);

    // Add thumbs up and thumbs down buttons
    const thumbsUp = document.createElement('button');
    thumbsUp.id = 'octo-ai-thumbs-up';
    thumbsUp.textContent = '👍';
    thumbsUp.style.border = 'none';
    thumbsUp.style.background = 'none';
    thumbsUp.style.cursor = 'pointer';
    thumbsUp.style.fontSize = '16px';
    thumbsUp.style.color = theme.textSecondary;
    feedback.appendChild(thumbsUp);

    const thumbsDown = document.createElement('button');
    thumbsDown.id = 'octo-ai-thumbs-down';
    thumbsDown.textContent = '👎';
    thumbsDown.style.border = 'none';
    thumbsDown.style.background = 'none';
    thumbsDown.style.cursor = 'pointer';
    thumbsDown.style.fontSize = '16px';
    thumbsDown.style.color = theme.textSecondary;
    feedback.appendChild(thumbsDown);

    // Add the feedback section to the container
    container.appendChild(feedback);

    // Create a form element
    const form = document.createElement('form');
    form.id = 'octoai-form';
    form.style.display = 'flex';
    form.style.margin = '0 0 16px 0';
    form.style.alignItems = 'center';
    form.style.border = '1px solid #ccc';
    form.style.borderRadius = '4px';
    form.style.padding = '8px 12px';
    form.style.fontFamily = 'Arial, sans-serif';
    form.style.fontSize = '14px';
    form.style.backgroundColor = theme.backgroundInput;
    form.style.borderColor = theme.border;

    // Create an input element
    const input = document.createElement('input');
    input.id = 'octoai-input';
    input.type = 'text';
    input.placeholder = 'Ask Octopus about your instance';
    input.style.flex = '1';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.fontSize = '14px';
    input.style.color = theme.text;
    input.style.background = 'rgba(0, 0, 0, 0)';
    input.value = localStorage.getItem("octoai-prompt") || '';

    // Create the submit button
    const submitButton = document.createElement('button');
    submitButton.id = 'octoai-submit';
    submitButton.type = 'submit';
    submitButton.innerHTML = '&#8594;'; // Unicode for the right arrow
    submitButton.style.border = 'none';
    submitButton.style.backgroundColor = 'transparent';
    submitButton.style.cursor = 'pointer';
    submitButton.style.color = theme.text;
    submitButton.style.fontSize = '16px';

    // Append the input and button to the form
    form.appendChild(input);
    form.appendChild(submitButton);

    // Append the form to the body
    container.appendChild(form);

    // Create a container for the UI
    const examplesContainer = document.createElement('div');
    examplesContainer.id = 'octoai-examples';
    examplesContainer.style.fontFamily = 'Arial, sans-serif';

    container.appendChild(examplesContainer)

    // Create a container for the confirmation message
    const confirmationContainer = document.createElement('div');
    confirmationContainer.id = 'octoai-confirmation';
    confirmationContainer.style.fontFamily = 'Arial, sans-serif';
    confirmationContainer.style.display = 'none';

    const approveButton = createButton("Approve", getColors(), "octo-ai-approve");
    const abortButton = createButton("Abort", getColors(), "octo-ai-abort");

    // Aborting a confirmation resets the dialog
    abortButton.onclick = () => {
        hideAllButtons();
        hideResponse();
        showExamples();
        showForm();
    }

    confirmationContainer.appendChild(approveButton);
    confirmationContainer.appendChild(abortButton);

    container.appendChild(confirmationContainer)


    // Add a submit event listener
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPrompt("", input.value.trim());
    });

    // Add the final note
    const finalNote = document.createElement('p');
    finalNote.textContent = '⚠️ AI responses can be inaccurate. OctoAI is an Alpha feature.';
    finalNote.style.fontSize = '12px';
    finalNote.style.color = theme.textSecondary;
    finalNote.style.marginTop = '16px';
    container.appendChild(finalNote);

    // Append the container to the body
    document.body.appendChild(container);
}

function showThinking() {
    const input = document.getElementById('octoai-input');
    input.disabled = true;
    let dots = 0;
    input.value = "Thinking";
    return setInterval(() => {
        dots = (dots + 1) % 4;  // Cycle through 0-3 dots
        input.value = "Thinking" + ".".repeat(dots);
    }, 500);
}

function showPrompt() {
    const input = document.getElementById('octoai-input');
    input.disabled = false
    input.value = localStorage.getItem("octoai-prompt");
}

function disableSubmitButton() {
    const submitButton = document.getElementById('octoai-submit');
    if (submitButton) {
        submitButton.disabled = true
        submitButton.style.cursor = 'not-allowed';
    }
}

function enableSubmitButton() {
    const submitButton = document.getElementById('octoai-submit');
    if (submitButton) {
        submitButton.disabled = false
        submitButton.style.cursor = 'pointer';
    }
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
            console.log(e))
        .finally(() => {
                clearInterval(thinkingAnimation)
                showPrompt();
                enableSubmitButton();
            }
        );
}

function hideAllButtons() {
    hideConfirmation();
    hideExamples();
}

function hideConfirmation() {
    const container = document.getElementById('octoai-confirmation');

    if (container) {
        container.style.display = 'none';
    }
}

function hideExamples() {
    const examplesContainer = document.getElementById('octoai-examples');

    if (examplesContainer) {
        examplesContainer.style.display = 'none';
    }
}

function showConfirmation() {
    const container = document.getElementById('octoai-confirmation');

    if (container) {
        container.style.display = 'block';
    }
}

function showExamples() {
    const examplesContainer = document.getElementById('octoai-examples');

    if (examplesContainer) {
        examplesContainer.style.display = 'block';
    }
}

function hideResponse() {
    const response = document.getElementById('octoai-response');
    const feedback = document.getElementById('octoai-feedback');

    if (response) {
        response.innerHTML = '';
        response.style.display = 'none';
    }

    if (feedback) {
        feedback.style.display = 'none';
    }
}

function addFeedbackListener(feedback, thumbsUp, thumbsDown, prompt) {
    thumbsUp.onclick = function (event) {
        event.preventDefault();
        thumbsUp.disabled = true;
        thumbsDown.disabled = true;
        fadeOutAndHide(feedback);
        console.log("Feedback thumbs up");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({
                action: "feedback",
                prompt: prompt,
                accessToken: creds.accessToken,
                thumbsUp: true
            }))
    }

    thumbsDown.onclick = function (event) {
        event.preventDefault();
        thumbsUp.disabled = true;
        thumbsDown.disabled = true;
        fadeOutAndHide(feedback);
        console.log("Feedback thumbs down");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({
                action: "feedback",
                prompt: prompt,
                accessToken: creds.accessToken,
                thumbsUp: false
            }))
    }
}

function displayMarkdownResponseV2(llmResponse, theme) {
    const response = document.getElementById('octoai-response');
    const feedback = document.getElementById('octoai-feedback');
    const thumbsUp = document.getElementById('octo-ai-thumbs-up');
    const thumbsDown = document.getElementById('octo-ai-thumbs-down');

    if (response) {
        response.innerHTML = DOMPurify.sanitize(marked.parse(llmResponse.response));
        response.prepend(buildMessageBubble(llmResponse.prompt, theme))
        response.style.display = 'block';
        feedback.style.display = 'block';
        feedback.classList.remove('octo-ai-hidden');
        feedback.classList.remove('octo-ai-fade-out');
        thumbsUp.disabled = false;
        thumbsDown.disabled = false;
    }
}

function buildMessageBubble(message, theme) {
    // Create the bubble element
    const bubble = document.createElement('div');

    if (!message) {
        return bubble;
    }

    // Style the bubble
    bubble.style.position = 'relative';
    bubble.style.display = 'inline-block';
    bubble.style.padding = '10px 20px';
    bubble.style.backgroundColor = theme.text;
    bubble.style.borderRadius = '20px';
    bubble.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    bubble.style.fontFamily = 'Arial, sans-serif';
    bubble.style.fontSize = '14px';
    bubble.style.color = theme.text;
    bubble.style.backgroundColor = theme.backgroundSecondary;
    bubble.textContent = message;

    // Create a wrapper div to allow right alignment
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'flex-end';
    wrapper.style.width = '100%';
    wrapper.style.marginBottom = '10px';

    wrapper.appendChild(bubble);

    return wrapper
}

function watchForChange() {
    window.onhashchange = function () {
        const existingContainer = document.getElementById('octoai-container');

        if (existingContainer) {
            getSamplePrompts()
                .then(prompts => displayExamples(prompts, getColors()));
        }
    }
}

function getColors() {
    return {
        background: '#1f303f',
        backgroundSecondary: '#2e475d',
        backgroundInput: '#111a23',
        backgroundButton: '#13314b',
        backgroundSecondaryButton: '#2e475d',
        backgroundTertiaryButton: '#1e2d3b',
        text: '#f4f6f8',
        textSecondary: '#98aaba',
        link: '#87bfec',
        border: '#2e475d'
    }
}

function fadeOutAndHide(element) {
    element.classList.add('octo-ai-fade-out');
    element.addEventListener('transitionend', () => {
        element.classList.add('octo-ai-hidden');
    }, {once: true});
}

/*
    Returns an object that maps page URLs to plain english path breadcrumbs.
 */
function getPageRegex() {
    return {
        "Dashboard": /https:\/\/.*?\/app#\/Spaces-.*?\/projects\/?(\?.*)$/,
        "Tasks": /https:\/\/.*?\/app#\/Spaces-.*?\/tasks\/?(\?.*)$/,
        "Project": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/?(\?.*)$/,
        "Project.Settings": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings$/,
        "Project.VersionControl": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings\/versioncontrol$/,
        "Project.ITSMProviders": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings\/itsmproviders$/,
        "Project.Channels": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/channels$/,
        "Project.Triggers": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/triggers$/,
        "Project.Process": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/(([^\/]+)\/)*deployments\/process$/,
        "Project.Step": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/(branches\/([^\/]+)\/)?deployments\/process\/steps(\?.*)?/,
        "Project.Variables": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables/,
        "Project.AllVariables": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables\/all/,
        "Project.PreviewVariables": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables\/preview/,
        "Project.VariableSets": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/variables\/library/,
        "Project.TenantVariables": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/tenant\/project-templates$/,
        "LibraryVariableSets": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/?(\?.*)?/,
        "LibraryVariableSets.LibraryVariableSet": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/([^\/]+)(\?.*)?/,
        "Project.Operations": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations$/,
        "Project.Operations.Triggers": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/triggers$/,
        "Project.Runbooks": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks$/,
        "Project.Runbooks.Runbook": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/[^?]*(\?.*)?/,
        "Project.Runbooks.Runbook.Run": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/snapshots\/([^\/]*)\/runs\/([^?]*)\/?(\?.*)?/,
        "Project.Deployment": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)\/deployments\/([^?]*)\/?(\?.*)?/,
        "Project.Release": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases$/,
        "Machines": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines/,
        "Machines.Machine": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines\/([^\/]+)\/[^?]*(\?.*)?/,
        "Accounts": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts/,
        "Accounts.Account": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts\/([^\/]+)(\?.*)?/,
        "Workers": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workers/,
        "WorkerPools": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workerpools/,
        "MachinePolicies": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machinepolicies/,
        "MachineProxies": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/proxies/,
        "Feeds": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/feeds/,
        "GitCredentials": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitcredentials/,
        "GitConnections": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitconnections/,
        "Lifecycles": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/lifecycles/,
        "Packages": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/builtinrepository/,
        "ScriptModules": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/scripts/,
        "StepTemplates": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/steptemplates/,
        "TagSets": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/tagsets/,
        "TagSets.TagSet": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/tagsets\/(TagSets-\d+)/,
        "Tenants": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants/,
        "Tenants.Tenant": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants\/([^\/]+)\/[^?]*(\?.*)?/,
        "Certificates": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/certificates/,
        "Environments": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments/,
        "Environments.Environment": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments\/([^\/]+)(\?.*)?/,
        "Infrastructure": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/overview/,
        "BuildInformation": /https:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/buildinformation/
    }
}

console.log("Loaded OctoAI")
addAiToPage(getColors())
watchForChange()
