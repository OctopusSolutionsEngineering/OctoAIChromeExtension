function addAiToPage(theme) {
    if (document.getElementById("octoai")) {
        return
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
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

async function callOctoAi(prompt) {
    console.log(prompt)

    try {
        // Get the server URL from the current location
        const serverUrl = window.location.origin;

        const creds = await createOctopusApiKey();

        const response = await chrome.runtime
            .sendMessage({action: "prompt", prompt: prompt, accessToken: creds.accessToken, apiKey: creds.apiKey, serverUrl: serverUrl});

        if (response.error) {
            return {prompt: prompt, response: "There was an error processing your request. You may try the prompt again."};
        }

        return {prompt: prompt, response: convertFromSseResponse(response.response)};
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

async function getSamplePrompts() {
    const defaultPrompts = [
        "List the projects in the Default space",
        "Generate a terraform module with three environments and a project called \"My Application\"",
        "Help"
    ]

    try {
        const response = await chrome.runtime.sendMessage({action: "getPrompts"});

        if (response.error) {
            throw new Error(`OctoAI API call failed: ${response.error.message}`);
        }

        // Get the longest page name where the regex matches
        const pageName = Object.keys(getPageRegex())
            .filter(key => window.location.href.match(getPageRegex()[key]))
            .sort((a, b) => a.length - b.length)
            .pop()

        const match = response.response
            .filter(prompt => prompt.name === pageName)
            .map(prompt => prompt.prompts)
            .pop()

        if (match) {
            return await processPrompts(match);
        }

        return defaultPrompts
    } catch (error) {
        console.error(error.message);
        return defaultPrompts
    }
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
        const environmentId = await fetch("/api/Spaces/" +spaceId + "/Deployments/" + deploymentId, {credentials: 'include'})
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
        const environmentId = await fetch("/api/Spaces/" +spaceId + "/RunbookRuns/" + runbookRun, {credentials: 'include'})
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
        .map(prompt => prompt.replace("#{Octopus.Space.Name}", spaceName))
        .map(prompt => prompt.replace("#{Octopus.Worker.Name}", workerName))
        .map(prompt => prompt.replace("#{Octopus.Environment.Name}", environmentName))
        .map(prompt => prompt.replace("#{Octopus.Lifecycle.Name}", lifecycle))
        .map(prompt => prompt.replace("#{Octopus.GitCredential.Name}", gitCredential))
        .map(prompt => prompt.replace("#{Octopus.Feed.Name}", feedName))
        .map(prompt => prompt.replace("#{Octopus.Certificate.Name}", certificateName))
        .map(prompt => prompt.replace("#{Octopus.WorkerPool.Name}", workerPoolName))
        .map(prompt => prompt.replace("#{Octopus.Tenant.Name}", tenantName))
        .map(prompt => prompt.replace("#{Octopus.Account.Name}", accountName))
        .map(prompt => prompt.replace("#{Octopus.Machine.Name}", machineName))
        .map(prompt => prompt.replace("#{Octopus.LibraryVariableSet.Name}", lbsSet))
        .map(prompt => prompt.replace("#{Octopus.Project.Name}", projectName))
        .map(prompt => prompt.replace("#{Octopus.Runbook.Name}", runbookName))
        .map(prompt => prompt.replace("#{Octopus.Step.Name}", stepName))
        .map(prompt => prompt.replace("#{Octopus.Deployment.Id}", deploymentVersion))
        .map(prompt => prompt.replace("#{Octopus.RunbookRun.Id}", runbookRun))
        .map(prompt => prompt.replace("#{Octopus.Release.Number}", releaseVersion))
        .map(prompt => prompt.replace("#{Octopus.Environment[0].Name}", firstEnvironmentName));
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
        const buttonTexts = await getSamplePrompts();
        displayExamples(buttonTexts, getColors());
    }
}

function displayExamples(buttons, theme) {
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
    function createButton(text, theme) {
        const button = document.createElement('div');
        button.textContent = text;
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
        button.style.color = theme.text;

        // Add hover effect
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = theme.backgroundButton;
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = theme.backgroundSecondaryButton;
        });

        // Add click event
        button.addEventListener('click', () => {
            const input = document.getElementById('octoai-input');
            if (input) {
                input.value = text;
                input.focus();
            }
        });

        return button;
    }

    // Generate buttons and append them to the container
    buttons.forEach(text => {
        const button = createButton(text, getColors());
        examplesContainer.appendChild(button);
    });
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
    message.style.overflowY = 'scroll';
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
    thumbsUp.textContent = '👍';
    thumbsUp.style.border = 'none';
    thumbsUp.style.background = 'none';
    thumbsUp.style.cursor = 'pointer';
    thumbsUp.style.fontSize = '16px';
    thumbsUp.style.color = theme.textSecondary;
    feedback.appendChild(thumbsUp);

    const thumbsDown = document.createElement('button');
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

    // Add a submit event listener
    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const originalPrompt = input.value.trim();

        if (!originalPrompt) {
            return
        }

        localStorage.setItem("octoai-prompt", originalPrompt);

        hideExamples()

        input.disabled = true
        submitButton.disabled = true
        submitButton.style.cursor = 'not-allowed';

        let dots = 0;
        input.value = "Thinking"
        const thinkingAnimation = setInterval(() => {
            dots = (dots + 1) % 4;  // Cycle through 0-3 dots
            input.value = "Thinking" + ".".repeat(dots);
        }, 500);

        hideResponse()

        enrichPrompt(originalPrompt)
            .then(prompt => {
                addFeedbackListener(feedback, thumbsUp, thumbsDown, prompt);
                return callOctoAi(prompt);
            })
            .then(result => {
                displayMarkdownResponseV2(result, theme);
            })
            .catch(e =>
                console.log(e))
            .finally(() => {
                    clearInterval(thinkingAnimation)
                    input.disabled = false
                    input.value = ""
                    submitButton.disabled = false
                    submitButton.style.cursor = 'pointer';
                    showExamples()
                }
            );
    });

    // Add the final note
    const finalNote = document.createElement('p');
    finalNote.textContent = '⚠️ AI responses can be inaccurate.';
    finalNote.style.fontSize = '12px';
    finalNote.style.color = theme.textSecondary;
    finalNote.style.marginTop = '16px';
    container.appendChild(finalNote);

    // Append the container to the body
    document.body.appendChild(container);
}

function hideExamples() {
    const examplesContainer = document.getElementById('octoai-examples');

    if (examplesContainer) {
        examplesContainer.style.display = 'none';
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
    thumbsUp.onclick = function(event) {
        event.preventDefault();
        feedback.style.display = 'none';
        console.log("Feedback thumbs up");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({action: "feedback", prompt: prompt, accessToken: creds.accessToken, thumbsUp: true}))
    }

    thumbsDown.onclick = function(event) {
        event.preventDefault();
        feedback.style.display = 'none';
        console.log("Feedback thumbs down");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({action: "feedback", prompt: prompt, accessToken: creds.accessToken, thumbsUp: false}))
    }
}

function displayMarkdownResponseV2(llmResponse, theme) {
    const response = document.getElementById('octoai-response');
    const feedback = document.getElementById('octoai-feedback');

    if (response) {
        response.innerHTML = DOMPurify.sanitize(marked.parse(llmResponse.response));
        response.prepend(buildMessageBubble(llmResponse.prompt, theme))
        response.style.display = 'block';
        feedback.style.display = 'block';
    }
}

function buildMessageBubble(message, theme) {
    // Create the bubble element
    const bubble = document.createElement('div');

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
    window.onhashchange = function(){
        const existingContainer = document.getElementById('octoai-container');

        if (existingContainer) {
            getSamplePrompts()
                .then(buttonTexts => displayExamples(buttonTexts, getColors()));
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
        text: '#f4f6f8',
        textSecondary: '#98aaba',
        link: '#87bfec',
        border: '#2e475d'
    }
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
