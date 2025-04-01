function addAiToPage() {
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
        #octoai-overlay p,
        #octoai-overlay li, 
        #octoai-overlay ul, 
        #octoai-overlay h1, 
        #octoai-overlay h2, 
        #octoai-overlay h3,
        #octoai-overlay h4,
        #octoai-overlay h5,
        #octoai-overlay h6 {
            color: black;
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
        displayPromptUI();
    });
}

function removeExistingOverlay() {
    const overlay = document.getElementById("octoai-overlay");
    if (overlay) {
        overlay.parentElement.removeChild(overlay);
    }

    const container = document.getElementById("octoai-container");
    if (container) {
        container.parentElement.removeChild(container);
    }
}

async function displayPromptUIV2() {
    removeExistingOverlay();

    // Create the main container div
    const container = document.createElement('div');
    container.id = 'octoai-container';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.border = '1px solid #E0E0E0';
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.width = '600px';
    container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    container.style.backgroundColor = '#FFFFFF';

    // Set absolute positioning in the bottom-right corner
    container.style.position = 'absolute';
    container.style.bottom = '16px';
    container.style.right = '16px';
    container.style.zIndex = '1000';

    // Create the header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';

    // Add the OctoAI logo
    const logo = document.createElement('span');
    logo.textContent = '✨ OctoAI';
    logo.style.fontWeight = 'bold';
    logo.style.fontSize = '16px';
    logo.style.color = '#4A4A4A';
    header.appendChild(logo);

    // Add the header to the container
    container.appendChild(header);

    // Create the response markdown
    const message = document.createElement('div');
    message.id = 'octoai-response';
    message.style.margin = '0 0 16px 0';
    message.style.display = 'none';
    container.appendChild(message);

    // Create the feedback section
    const feedback = document.createElement('div');
    feedback.style.display = 'none';

    // Add the "Was this response helpful?" text
    const feedbackText = document.createElement('span');
    feedbackText.id = 'octoai-feedback';
    feedbackText.textContent = 'Was this response helpful?';
    feedbackText.style.fontSize = '14px';
    feedbackText.style.color = '#4A4A4A';
    feedback.appendChild(feedbackText);

    // Add thumbs up and thumbs down buttons
    const thumbsUp = document.createElement('button');
    thumbsUp.textContent = '👍';
    thumbsUp.style.border = 'none';
    thumbsUp.style.background = 'none';
    thumbsUp.style.cursor = 'pointer';
    thumbsUp.style.fontSize = '16px';
    thumbsUp.style.color = '#4A4A4A';
    feedback.appendChild(thumbsUp);

    const thumbsDown = document.createElement('button');
    thumbsDown.textContent = '👎';
    thumbsDown.style.border = 'none';
    thumbsDown.style.background = 'none';
    thumbsDown.style.cursor = 'pointer';
    thumbsDown.style.fontSize = '16px';
    thumbsDown.style.color = '#4A4A4A';
    feedback.appendChild(thumbsDown);

    // Add the feedback section to the container
    container.appendChild(feedback);

    // Create a container for the UI
    const examplesContainer = document.createElement('div');
    examplesContainer.style.fontFamily = 'Arial, sans-serif';
    examplesContainer.style.padding = '20px';

    // Create and append the header
    const examplesHeader = document.createElement('h2');
    examplesHeader.textContent = 'Examples';
    examplesHeader.style.marginBottom = '20px';
    examplesHeader.style.color = 'rgb(74, 74, 74)';
    examplesContainer.appendChild(examplesHeader);

    // Button data
    const buttons = [
        { id: 'button1', text: 'List the packages used by steps in this project' },
        { id: 'button2', text: 'Find unused variables' },
        { id: 'button3', text: 'Describe what this deployment process does' }
    ];

    // Function to create a button
    function createButton(id, text) {
        const button = document.createElement('div');
        button.id = id;
        button.textContent = text;
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.padding = '10px';
        button.style.marginBottom = '10px';
        button.style.backgroundColor = '#f0f0f0';
        button.style.border = '1px solid #ccc';
        button.style.borderRadius = '5px';
        button.style.textAlign = 'left';
        button.style.cursor = 'pointer';
        button.style.fontSize = '16px';
        button.style.color = 'rgb(74, 74, 74)';

        // Add hover effect
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#e0e0e0';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#f0f0f0';
        });

        // Add click event
        button.addEventListener('click', () => {
            console.log(`${text} clicked`);
        });

        return button;
    }

    // Generate buttons and append them to the container
    buttons.forEach(({ id, text }) => {
        const button = createButton(id, text);
        examplesContainer.appendChild(button);
    });

    // Append the container to the body
    container.appendChild(examplesContainer);

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
    form.style.backgroundColor = '#fff';

    // Create an input element
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask Octopus about your instance';
    input.style.flex = '1';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.fontSize = '14px';
    input.style.color = '#333';

    // Create the submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.innerHTML = '&#8594;'; // Unicode for the right arrow
    submitButton.style.border = 'none';
    submitButton.style.backgroundColor = 'transparent';
    submitButton.style.cursor = 'pointer';
    submitButton.style.color = '#007bff';
    submitButton.style.fontSize = '16px';

    // Append the input and button to the form
    form.appendChild(input);
    form.appendChild(submitButton);

    // Append the form to the body
    container.appendChild(form);

    // Add a submit event listener
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        alert(`You submitted: ${input.value}`);
    });

    // Add the final note
    const finalNote = document.createElement('p');
    finalNote.textContent = 'AI responses can be inaccurate.';
    finalNote.style.fontSize = '12px';
    finalNote.style.color = '#9E9E9E';
    finalNote.style.marginTop = '16px';
    container.appendChild(finalNote);

    // Append the container to the body
    document.body.appendChild(container);
}

function displayMarkdownResponseV2(markdownContent) {
    const response = document.getElementById('octoai-response');
    response.innerHTML = DOMPurify.sanitize(marked.parse(markdownContent));
}

async function displayPromptUI() {
    removeExistingOverlay();

    const overlayDiv = document.createElement("div");
    overlayDiv.id = "octoai-overlay";
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.backgroundColor = "rgb(0,0,0, 0.9)";
    overlayDiv.style.zIndex = "100";

    document.body.appendChild(overlayDiv);

    // Add click event to hide the overlay and its children when clicked directly
    overlayDiv.addEventListener("click", function (event) {
        // Only hide if the click was directly on the overlay (not on its children)
        if (event.target === this) {
            document.body.removeChild(overlayDiv);
            document.body.removeChild(linksContainer);
        }
    });

    // Create container for links
    const linksContainer = document.createElement("div");
    linksContainer.style.position = "relative";
    linksContainer.style.top = "10%";
    linksContainer.style.width = "100%";
    linksContainer.style.zIndex = "101";
    linksContainer.style.textAlign = "center";

    const textarea = document.createElement("textarea");

    // Add five links
    const buttonTexts = await getSamplePrompts();
    const buttons = buttonTexts.map(text => {
        const button = document.createElement("button");
        button.textContent = text;
        button.style.display = "block";
        button.style.margin = "10px auto";
        button.style.width = "80%";
        button.style.color = "white";
        button.style.backgroundColor = "transparent";
        button.style.border = "none";
        button.style.fontSize = "18px";
        button.style.padding = "5px";
        button.style.transition = "all 0.3s ease";
        button.style.cursor = "default"; // Default cursor since they're just displaying text

        // Add hover effect
        button.addEventListener("mouseover", function () {
            this.style.backgroundColor = "rgba(68, 68, 255, 0.3)";
            this.style.transform = "scale(1.02)";
        });

        button.addEventListener("mouseout", function () {
            this.style.backgroundColor = "transparent";
            this.style.transform = "scale(1)";
        });

        button.addEventListener("click", function() {
            textarea.value = button.textContent
        })

        linksContainer.appendChild(button);

        return button
    });
    overlayDiv.appendChild(linksContainer);

    // Create textarea
    textarea.style.display = "block";
    textarea.style.width = "80%"; // 80% of page width
    textarea.style.height = "150px"; // enough for about 5 lines
    textarea.style.margin = "20px auto";
    textarea.style.zIndex = "101";
    textarea.style.position = "relative";
    textarea.style.borderRadius = "8px"; // rounded borders
    textarea.style.padding = "10px"; // add some padding for better text appearance
    textarea.style.boxSizing = "border-box"; // include padding in width calculation
    textarea.style.border = "2px solid #00874d"; // matching the button color
    textarea.style.outline = "none"; // remove outline when focused
    textarea.style.fontSize = "24px";
    textarea.value = localStorage.getItem("octoai-prompt") || "What do you do?";
    linksContainer.appendChild(textarea);

    // Create send button
    const sendButton = document.createElement("button");
    sendButton.textContent = "Send";
    sendButton.style.padding = "8px 16px";
    sendButton.style.backgroundColor = "#00874d";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "4px";
    sendButton.style.cursor = "pointer";
    sendButton.style.zIndex = "101";
    sendButton.style.position = "relative";
    sendButton.style.height = "64px";
    sendButton.style.width = "80%";
    sendButton.style.margin = "10px auto";
    sendButton.style.display = "block";
    sendButton.style.fontSize = "18px";

    sendButton.onclick = function () {
        if (textarea.value.trim() === "") {
            return
        }

        localStorage.setItem("octoai-prompt", textarea.value);

        sendButton.disabled = true;
        sendButton.style.backgroundColor = "#2e475d";
        sendButton.style.color = "#557999";
        textarea.style.borderColor = "#557999";

        buttons.forEach(button => {
            button.disabled = true
        })

        textarea.disabled = true
        textarea.style.backgroundColor = "gray";
        textarea.style.color = "black";

        let dots = 0;
        sendButton.textContent = "Thinking"
        const thinkingAnimation = setInterval(() => {
            dots = (dots + 1) % 4;  // Cycle through 0-3 dots
            sendButton.textContent = "Thinking" + ".".repeat(dots);
        }, 500);

        enrichPrompt(textarea.value)
            .then(prompt => callOctoAi(prompt))
            .then(result =>
                displayMarkdownResponse(result))
            .catch(e =>
                console.log(e))
            .finally(() =>
                clearInterval(thinkingAnimation)
            );
    }

    linksContainer.appendChild(sendButton);
}

function displayMarkdownResponse(markdownContent) {
    removeExistingOverlay();

    const overlayDiv = document.createElement("div");
    overlayDiv.id = "octoai-overlay";
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.backgroundColor = "rgb(0,0,0, 0.9)";
    overlayDiv.style.zIndex = "100";

    document.body.appendChild(overlayDiv);

    overlayDiv.addEventListener("click", function (event) {
        if (event.target === this) {
            document.body.removeChild(overlayDiv);
        }
    });

    const contentDiv = document.createElement("div");
    contentDiv.style.position = "absolute";
    contentDiv.style.top = "10%";
    contentDiv.style.left = "10%";
    contentDiv.style.right = "10%";
    contentDiv.style.bottom = "20%";
    contentDiv.style.backgroundColor = "white";
    contentDiv.style.borderRadius = "8px";
    contentDiv.style.overflowY = "auto";
    contentDiv.style.overflowX = "auto";
    contentDiv.style.zIndex = "101";
    contentDiv.style.backgroundColor = "white";
    contentDiv.style.color = "black";
    contentDiv.style.border = "#2e475d;"
    contentDiv.style.borderWidth = "thin";
    contentDiv.style.borderStyle = "solid";
    contentDiv.style.padding = "10px";

    contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(markdownContent));

    overlayDiv.appendChild(contentDiv);

    const backButton = document.createElement("button");
    backButton.textContent = "Back";
    backButton.style.position = "absolute";
    backButton.style.bottom = "10%";
    backButton.style.left = "10%";
    backButton.style.right = "10%";
    backButton.style.backgroundColor = "#00874d";
    backButton.style.color = "white";
    backButton.style.border = "none";
    backButton.style.borderRadius = "4px";
    backButton.style.cursor = "pointer";
    backButton.style.zIndex = "101";
    backButton.style.fontSize = "18px";
    backButton.style.padding = "5px";
    backButton.style.height = "64px";

    backButton.addEventListener("click", function() {
        displayPromptUI();
    });

    // Add the back button to the overlay
    overlayDiv.appendChild(backButton);
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
            throw new Error(`OctoAI API call failed: ${response.error.message}`);
        }

        return convertFromSseResponse(response.response);
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

        const matches = response.response
            .filter(prompt => window.location.href.match(prompt.url))
            .map(prompt => prompt.prompts);

        if (matches.length > 0) {
            return await processPrompts(matches[0]);
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
                accumulator + "\nCurrent " + currentValue.type + " is \"" + currentValue.name + "\"",
            prompt);
}

console.log("Loaded OctoAI")
addAiToPage()
