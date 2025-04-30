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

        if (!response.error && isActionSseResponse(response.response)) {
            // This is a confirmation prompt rather than an answer
            showConfirmation();
            hideForm();
            const titleAndMessage = getConfirmationTitleAndMessage(response.response);

            // 4 minutes to approve
            const timeout = setTimeout(function() {
                hideConfirmation();
                hideResponse();
                showForm();
                showExamples();
                showPrompt();
                enableSubmitButton();
            }, 4 * 60 * 1000)

            document.getElementById("octo-ai-approve").onclick = function() {
                approveConfirmation(timeout, titleAndMessage.id);
            }

            return {
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: titleAndMessage.title + "\n\n" + titleAndMessage.message
            };
        }

        showExamples();

        if (response.error) {

            return {
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: "There was an error processing your request. You may try the prompt again."
            };
        }

        return {prompt: prompt, systemPrompt: systemPrompt, response: convertFromSseResponse(response.response)};
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

async function approveConfirmation(timeout, id) {
    clearTimeout(timeout);
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
