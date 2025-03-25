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

    const newButton = document.createElement("button");
    newButton.id = "octoai"

    newButton.className = "siri-button";
    newButton.style.position = "absolute";
    newButton.style.top = "16px";
    newButton.style.right = "80px";
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
}

function displayPromptUI() {
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
    linksContainer.style.top = "30%";
    linksContainer.style.width = "100%";
    linksContainer.style.zIndex = "101";
    linksContainer.style.textAlign = "center";

    const textarea = document.createElement("textarea");

    // Add five links
    const buttonTexts = [
        "List the projects in the Default space",
        "Help me fix the deployment version \"0.1.1316%2B480f701.1323.1\" for the project \"Octopus Octoterra Function\" to the \"Production\" environment in the \"Octopus Copilot\" space.",
        "Find unused variables in the project \"Octopus Octoterra Function\" in the \"Octopus Copilot\" space.",
        "Generate a terraform module with three environments and a project called \"My Application\"",
        "Help"];
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
    textarea.style.border = "2px solid #4444ff"; // matching the button color
    textarea.style.outline = "none"; // remove outline when focused
    textarea.style.fontSize = "24px";
    textarea.value = "Get the projects in the Default space"
    linksContainer.appendChild(textarea);

    // Create send button
    const sendButton = document.createElement("button");
    sendButton.textContent = "Send";
    sendButton.style.padding = "8px 16px";
    sendButton.style.backgroundColor = "#4444ff";
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
        sendButton.disabled = true;

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

        callOctoAi(textarea.value)
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
            document.body.removeChild(linksContainer);
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
    contentDiv.style.backgroundColor = "black";
    contentDiv.style.color = "white";
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
    backButton.style.backgroundColor = "#4444ff";
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

function getOctopusApiKeyFromStorage() {
    try {
        const apiKey = localStorage.getItem("OctopusApiKey");
        if (apiKey) {
            console.log("API key found in localStorage");
            return apiKey;
        } else {
            console.log("No API key found in localStorage");
            return null;
        }
    } catch (error) {
        console.error("Error accessing localStorage:", error);
        return null;
    }
}

function setOctopusApiKeyFromStorage(apiKey) {
    try {
        localStorage.setItem("OctopusApiKey", apiKey);
    } catch (error) {
        console.error("Error accessing localStorage:", error);
    }
}

async function getOrCreateOctopusApiKey() {
    try {
        const existingApiKey = getOctopusApiKeyFromStorage();

        if (existingApiKey) {
            return existingApiKey;
        } else {
            const userData = await getCurrentOctopusUser();
            const apiKeyData = await createOctopusApiKey(userData.Id);
            setOctopusApiKeyFromStorage(apiKeyData.ApiKey);
            return apiKeyData.ApiKey;
        }
    } catch (error) {
        console.error('Error getting or creating Octopus Deploy API key:', error);
        throw error;
    }
}

async function getCurrentOctopusUser() {
    try {
        const response = await fetch(`/api/users/me`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const userData = await response.json();
        console.log('Current user retrieved:', userData.DisplayName);
        return userData;
    } catch (error) {
        console.error('Error getting current Octopus Deploy user:', error);
        throw error;
    }
}

async function createOctopusApiKey(userId) {
    try {
        const purpose = 'OctoAI temporary API key';

        const csrfToken = getOctopusCsrfTokenFromCookie();

        const headers = {
            'Content-Type': 'application/json'
        };

        if (csrfToken) {
            headers['X-Octopus-Csrf-Token'] = csrfToken;
        }

        const response = await fetch(`/api/users/${userId}/apikeys`, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify({
                Purpose: purpose,
                // API keys expire after 7 days by default
                Expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('New API key created successfully:', data.ApiKey);
        return data;
    } catch (error) {
        console.error('Error creating Octopus Deploy API key:', error);
        throw error;
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
    try {
        // Get the API key
        const apiKey = await getOrCreateOctopusApiKey();

        // Get the server URL from the current location
        const serverUrl = window.location.origin;

        const response = await chrome.runtime
            .sendMessage({prompt: prompt, apiKey: apiKey, serverUrl: serverUrl});

        if (response.error) {
            throw new Error(`OctoAI API call failed: ${response.error.message}`);
        }

        return convertFromSseResponse(response.response);
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

console.log("Loaded OctoAI")
addAiToPage()
