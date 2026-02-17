function dashboardGetConfig(callback) {
    chrome.storage.local.get("dashboardConfig", config => callback(config.dashboardConfig));
}

function dashboardSendPrompt(prompt, serverUrl) {
    return _dashboardGetOctopusCsrfTokenFromCookie(new URL(serverUrl).hostname)
        .then(csrfToken => fetch(serverUrl + `/api/users/access-token`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Octopus-Csrf-Token': csrfToken
            },
            method: 'POST',
            credentials: 'include'
        }))
        .then(response => {
            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`);
            }
            return response;
        })
        .then(response => response.json())
        .then(json => json.AccessToken)
        .then(accessToken => chrome.runtime.sendMessage({
            action: "prompt",
            prompt: prompt,
            accessToken: accessToken,
            serverUrl: serverUrl
        }))
        .then(result => _dashboardConvertFromSseResponse(result))
        .catch(error => {
            return {
                response: "An error occurred while processing your request. Please try again.",
                state: "Error"
            }
        });

    /**
     * Gets the Octopus CSRF token from the browser cookies for the given server URL.
     * @private
     */
    function _dashboardGetOctopusCsrfTokenFromCookie(domain) {
        return chrome.cookies.getAll({domain: domain})
            .then(cookies => cookies
                .filter(cookie => cookie.name.startsWith('Octopus-Csrf-Token'))
                .map(cookie => cookie.value)
                .pop())
    }

    /**
     * Convert the SSE response from the dashboard into a format that can be displayed in the UI.
     * @private
     */
    function _dashboardConvertFromSseResponse(sseResponse) {
        if (sseResponse.error) {
            return {
                response: sseResponse.error,
                state: "Error"
            };
        }

        if (_dashboardIsActionSseResponse(sseResponse.response)) {
            return _dashboardConfirmationResponse(sseResponse.response)
        }

        return {
            response: _dashboardConvertFromSuccessSseResponse(sseResponse.response),
            state: "Success"
        };
    }

    /**
     * Check if the SSE response is an action response that requires confirmation.
     * @private
     */
    function _dashboardIsActionSseResponse(sseResponse) {
        return !!sseResponse
            .split('\n')
            .filter(line => line.trim())
            .filter(line => line.startsWith('data: '))
            .map(line => JSON.parse(line.replace('data: ', '')))
            .filter(response => 'type' in response && response.type === 'action')
            .pop()
    }

    /**
     * Extract the confirmation message and id from the SSE response.
     * @private
     */
    function _dashboardConfirmationResponse(sseResponse) {
        return sseResponse
            .split('\n')
            .filter(line => line.trim())
            .filter(line => line.startsWith('data: '))
            .map(line => JSON.parse(line.replace('data: ', '')))
            .filter(response => 'type' in response && response.type === 'action')
            .map(response => {
                return {
                    response: response.title + "\n\n" + response.message,
                    state: "Confirmation",
                    id: response.confirmation.id
                }
            })
            .pop()
    }

    /**
     * Convert a successful SSE response from the dashboard into a format that can be displayed in the UI.
     * @private
     */
    function _dashboardConvertFromSuccessSseResponse(sseResponse) {
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
}



