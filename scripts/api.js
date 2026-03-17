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
        const splitPrompts = combinedPrompt
            .split("\n\n---\n\n")
            .filter(p => p.trim());

        const enrichedPrompts = await Promise.all(
            splitPrompts.map(p => enrichPrompt(p)))

        function displayFinalResults(result, prompts, index, thinkingAnimation) {
            // Completed one prompt successfully - display the results
            if (prompts.length === 1) {
                clearInterval(thinkingAnimation);
                showForm();
                showExamples();
                showPrompt();
                enableSubmitButton();
                displayMarkdownResponseV2(result, getColors());
                return;
            }

            if (index < prompts.length - 1) {
                // Move to the next prompt if there is one
                sendPrompt(prompts, index + 1, thinkingAnimation);
            } else {
                // We completed all the prompts successfully - display a summary message
                clearInterval(thinkingAnimation);
                showForm();
                showExamples();
                showPrompt();
                enableSubmitButton();
                displayMarkdownResponseV2({
                    prompt: "",
                    systemPrompt: "",
                    response: prompts.length + " prompts were processed successfully."
                }, getColors());
            }
        }

        // We need to loop over each prompt, allowing each to be manually confirmed if necessary.
        // The flows are:
        // Multiple prompts -> process first prompt -> if confirmation needed, ask for confirmation -> if approved, process next prompt
        // Single prompt -> process prompt -> if confirmation needed, ask for confirmation -> if approved, show result
        // Auto-approval enabled -> Multiple prompts -> process first prompt -> process next prompt
        // Any errors or aborted confirmations end the flow and show the results up to that point.
        function sendPrompt(prompts, index, thinkingAnimation) {
            sendPrompts([prompts[index]], creds, serverUrl)
                .then(responses => {
                    processResponse(prompt, systemPrompt, responses)
                        .then(result => {

                            if (result.type === "confirmation") {
                                // Prompt requires confirmation

                                if (localStorage.getItem('octoai-auto-apply') === 'true') {
                                    // Auto approve is enabled, so confirm and move to the next prompt

                                    const titleAndMessage = getConfirmationTitleAndMessage(responses[0].response);

                                    approveConfirmation(titleAndMessage.id)
                                        .then(response => processResponse(prompt, systemPrompt, [response]))
                                        .then(result => displayFinalResults(result, prompts, index, thinkingAnimation));
                                } else {
                                    // Show a manual confirmation prompt to the user.

                                    clearInterval(thinkingAnimation);

                                    // need to display a manual confirmation prompt to the user
                                    displayConfirmation(responses, function (response, projectCount) {
                                        // Get the result of the confirmation
                                        processResponse(prompt, systemPrompt, [response])
                                            .then(result => displayFinalResults(result, prompts, index, showThinking()));
                                    });

                                    // Display the details of what is being confirmed
                                    displayMarkdownResponseV2(result, getColors());
                                }
                            } else if (result.type === "error") {
                                // Any error ends the processing
                                clearInterval(thinkingAnimation);
                                showForm();
                                showExamples();
                                showPrompt();
                                enableSubmitButton();
                                displayMarkdownResponseV2(result, getColors());
                            } else {
                                // A prompt with no confirmation needed - display the results or move to the next prompt
                                displayFinalResults(result, prompts, index, thinkingAnimation);
                            }
                        })
                });
        }

        return sendPrompt(enrichedPrompts, 0, showThinking());
    } catch (error) {
        Logger.error(error.message);
        throw error;
    }
}

function displayConfirmation(responses, approveCallback) {
    // This is a confirmation prompt rather than an answer
    showConfirmation();
    hideForm();
    const titleAndMessage = getConfirmationTitleAndMessage(responses[0].response);

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
        clearTimeout(timeout);

        hideResponse();
        hideConfirmation();
        disableSubmitButton();
        showForm();

        getProjectCount()
            .then(projectCount =>
                approveConfirmation(titleAndMessage.id)
                    .then(result => approveCallback(result, projectCount)));
    }
}

/**
 * Take the raw SEE response and process it into a structure that can be displayed to the user.
 */
async function processResponse(prompt, systemPrompt, responses) {
    if (responses.length === 1 && !responses[0].error && isActionSseResponse(responses[0].response)) {
        const titleAndMessage = getConfirmationTitleAndMessage(responses[0].response);
        return {
            type: "confirmation",
            prompt: prompt,
            systemPrompt: systemPrompt,
            response: titleAndMessage.title + "\n\n" + titleAndMessage.message
        };
    } else if (responses.length > 1) {
        const errors = responses
            .filter(response => response.error)
            .map(response => response.prompt);

        if (errors.length !== 0) {
            return {
                type: "error",
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: "The following prompts were not processed successfully. You may try the prompts again: " + errors.join("\n\n")
            };
        }

        return {
            type: "complete",
            prompt: prompt,
            systemPrompt: systemPrompt,
            response: "All the prompts were processed successfully."};
    }

    if (responses[0].error) {
        return {
            type: "error",
            prompt: prompt,
            systemPrompt: systemPrompt,
            response: "There was an error processing your request. This may be due to network restrictions. See https://octopus.com/docs/octopus-ai/assistant/getting-started#using-with-on-premises-instances for more details on enabling network to on-premises instances and cloud instances with IP whitelists."
        };
    }

    return {
        type: "complete",
        prompt: prompt,
        systemPrompt: systemPrompt,
        response: convertFromSseResponse(responses[0].response)};
}

async function sendPrompts(prompts, creds, serverUrl) {
    const results = []

    window.showThinking.total = prompts.length;
    for(var i = 0; i < prompts.length; i++) {
        window.showThinking.current = i + 1;

        results.push(await chrome.runtime.sendMessage({
            action: "prompt",
            prompt: prompts[i],
            accessToken: creds.accessToken,
            apiKey: creds.apiKey,
            serverUrl: serverUrl
        }));
    }
    return Promise.all(results);
}

async function approveConfirmation(id) {
    const creds = await createOctopusApiKey();

    // Get the server URL from the current location
    const serverUrl = window.location.origin;

    return await chrome.runtime
        .sendMessage({
            action: "confirmation",
            id: id,
            accessToken: creds.accessToken,
            apiKey: creds.apiKey,
            serverUrl: serverUrl
        });
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
