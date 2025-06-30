async function createOctopusApiKey() {
    // cached results as static variables
    if (createOctopusApiKey.token && createOctopusApiKey.expiry > Date.now()) {
        return {accessToken: createOctopusApiKey.token, apiKey: null};
    } else {
        createOctopusApiKey.token = null;
        createOctopusApiKey.expiry = null;
    }

    try {
        const promises = getOctopusCsrfTokenFromCookie()
            .map(csrfToken => {
                return {
                    'Content-Type': 'application/json',
                    'X-Octopus-Csrf-Token': csrfToken
                }
            })
            .map(headers => fetch(`/api/users/access-token`, {
                method: 'POST',
                headers: headers,
                credentials: 'include'
            }));

        const response = (await Promise.all(promises))
            .filter(response => response.ok)
            .pop();

        if (!response) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        Logger.info('New API key created successfully');

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
        const csrfTokens = []
        // I've seen cases where there were multiple CSRF cookies, but one was expired.
        // We get all the cookies and try them one by one.
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith('Octopus-Csrf-Token')) {
                const csrfToken = cookie.split("=");
                Logger.info('CSRF token found in cookie');
                csrfTokens.push(csrfToken[1]);
            }
        }
        if (csrfTokens.length > 0) {
            return csrfTokens;
        }
        Logger.info('No Octopus-Csrf-Token cookie found');
        return null;
    } catch (error) {
        Logger.error('Error reading Octopus-Csrf-Token cookie:', error);
        return null;
    }
}

async function callOctoAi(systemPrompt, prompt) {
    Logger.info(systemPrompt)
    Logger.info(prompt)

    try {
        const combinedPrompt = [systemPrompt, prompt]
            .filter(p => p.trim())
            .map(p => p.trim())
            .join("\n");

        // Get the server URL from the current location
        const serverUrl = window.location.origin;

        const creds = await createOctopusApiKey();

        // Compound document prompts are separated by a line with "---" in the middle.
        const splitPrompts = combinedPrompt.split("\n\n---\n\n");

        const promises = splitPrompts.map(prompt => chrome.runtime
            .sendMessage({
                action: "prompt",
                prompt: prompt,
                accessToken: creds.accessToken,
                apiKey: creds.apiKey,
                serverUrl: serverUrl
            }))

        const responses = await Promise.all(promises);

        if (responses.length === 1 && !responses[0].error && isActionSseResponse(responses[0].response)) {
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
        } else if (responses.length > 1) {
            const errors = responses
                .filter(response => response.error)
                .map(response => response.prompt);

            if (anyErrors) {
                return {
                    prompt: prompt,
                    systemPrompt: systemPrompt,
                    response: "The following prompts were not processed successfully. You may try the prompts again: " + errors.join("\n\n")
                };
            }

            return {prompt: prompt, systemPrompt: systemPrompt, response: "All the prompts were processed successfully."};
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
        Logger.error(error.message);
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
