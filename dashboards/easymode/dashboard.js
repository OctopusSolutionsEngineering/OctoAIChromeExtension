// Platform prompts configuration
const platformPrompts = {
    kubernetes: 'Create a Kubernetes project called "My K8s WebApp", and then:\n* Configure the Kubernetes steps to use client side apply (client side apply is required by the "Mock K8s" target).\n* Disable verification checks in the Kubernetes steps (verification checks are not supported by the "Mock K8s" target).\n* Create a token account called "Mock Token".\n* Create a feed called "Docker Hub" pointing to "https://index.docker.io" using anonymous authentication.\n* Add a target called "Mock K8s", with the tag "Kubernetes", using the token account, pointing to "https://mockk8s.octopus.com", using the health check image "octopusdeploy/worker-tools:6.5.0-ubuntu.22.04" from the "Docker Hub" feed, using the worker pool "Hosted Ubuntu".',
    argocd: 'CCreate an Argo CD project called "My Argo CD WebApp"',
    azurewebapp: 'Create an Azure Web App project called "My Azure WebApp"',
    azurefunctions: 'Create an Azure Functions project called "My Azure Function App"',
    awslambda: 'Create an AWS Lambda project called "My AWS Lambda App"',
    scriptstep: 'Create a script project called "My Script App"',
    bluegreen: 'Create a Blue/Green deployment project called "My Blue Green App"'
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    const platformCards = document.querySelectorAll('.platform-card');
    const promptTextarea = document.getElementById('promptText');
    const executeButton = document.getElementById('executeButton');

    let selectedPlatform = null;

    // Handle platform card selection
    platformCards.forEach(card => {
        card.addEventListener('click', function() {
            const platform = this.getAttribute('data-platform');

            // Remove selected class from all cards
            platformCards.forEach(c => c.classList.remove('selected'));

            // Add selected class to clicked card
            this.classList.add('selected');

            // Update selected platform
            selectedPlatform = platform;

            // Update textarea with the platform's prompt
            if (platformPrompts[platform]) {
                promptTextarea.value = platformPrompts[platform];
            }

            // Save selection to localStorage
            localStorage.setItem('selectedPlatform', platform);
        });
    });

    // Handle execute button
    executeButton.addEventListener('click', function() {
        const promptText = promptTextarea.value.trim();

        if (!promptText) {
            alert('Please enter a prompt or select a platform.');
            return;
        }

        // Step 1: Clear the page and show a loading widget
        clearPageAndShowLoading();

        // Step 2: Call dashboardGetConfig from api.js
        dashboardGetConfig(function(config) {
            if (!config || !config.lastServerUrl) {
                showError('No server configuration found. Please launch the dashboard from an Octopus Deploy instance.');
                return;
            }

            // Append space name to the prompt
            const spaceName = config.context.space || 'Unknown';
            const enhancedPrompt = promptText + '\n\nThe current space is ' + spaceName;

            // Step 3: Call dashboardSendPrompt with the enhanced prompt and lastServerUrl
            dashboardSendPrompt(enhancedPrompt, config.lastServerUrl)
                .then(function(result) {
                    // Step 4: Display the response text
                    displayResponse(result, config.lastServerUrl);
                })
                .catch(function(error) {
                    showError('An error occurred: ' + error.message);
                });
        });
    });

    // Load saved selection from localStorage
    const savedPlatform = localStorage.getItem('selectedPlatform');
    if (savedPlatform) {
        const savedCard = document.querySelector(`[data-platform="${savedPlatform}"]`);
        if (savedCard) {
            savedCard.click();
        }
    }
});

// Helper function to clear the page and show loading widget
function clearPageAndShowLoading() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p class="loading-text">Processing your request. This can take a few minutes...</p>
            </div>
        `;
    }
}

// Helper function to show error message
function showError(message) {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="error-container">
                <h2>Error</h2>
                <p class="error-message">${DOMPurify.sanitize(message)}</p>
                <button class="reload-button" onclick="location.reload()">Reload Dashboard</button>
            </div>
        `;
    }
}

// Helper function to display the response with Approve/Reject buttons
function displayResponse(result, serverUrl) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    let responseHtml = '';

    if (result.state === 'Error') {
        responseHtml = `
            <div class="response-container error">
                <h2>Error</h2>
                <div class="response-text">${DOMPurify.sanitize(result.response)}</div>
                <div class="response-actions">
                    <button class="reload-button" onclick="location.reload()">Reload Dashboard</button>
                </div>
            </div>
        `;
    } else {
        // Convert markdown to HTML using marked library
        const htmlContent = marked.parse(result.response);
        const sanitizedHtml = DOMPurify.sanitize(htmlContent);

        responseHtml = `
            <div class="response-container">
                <h2>Response</h2>
                <div class="response-text">${sanitizedHtml}</div>
                <div class="response-actions">
                    <button class="approve-button" id="approveBtn">Approve</button>
                    <button class="reject-button" id="rejectBtn">Reject</button>
                </div>
            </div>
        `;
    }

    mainContent.innerHTML = responseHtml;

    // Add event listeners for Approve and Reject buttons
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');

    if (approveBtn) {
        approveBtn.addEventListener('click', function() {
            console.log('Approve button clicked');

            // Check if we have a confirmation ID
            if (result.id && serverUrl) {
                // Show loading state
                clearPageAndShowLoading();

                // Call dashboardApprovePrompt with the id and server URL
                dashboardApprovePrompt(result.id, serverUrl)
                    .then(function(approvalResult) {
                        displayApprovalResponse(approvalResult);
                    })
                    .catch(function(error) {
                        showError('An error occurred while approving: ' + error.message);
                    });
            } else {
                // No ID means this wasn't a confirmation response, just log
                console.log('No confirmation ID found, approval not required');
            }
        });
    }

    if (rejectBtn) {
        rejectBtn.addEventListener('click', function() {
            console.log('Reject button clicked');
            // Reload the page to display the main page again
            location.reload();
        });
    }
}

// Helper function to display the approval response with OK button
function displayApprovalResponse(result) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    let responseHtml = '';

    if (result.state === 'Error') {
        responseHtml = `
            <div class="response-container error">
                <h2>Error</h2>
                <div class="response-text">${DOMPurify.sanitize(result.response)}</div>
                <div class="response-actions">
                    <button class="reload-button" onclick="location.reload()">Reload Dashboard</button>
                </div>
            </div>
        `;
    } else {
        // Convert markdown to HTML using marked library if needed
        const htmlContent = marked.parse(result.response);
        const sanitizedHtml = DOMPurify.sanitize(htmlContent);

        responseHtml = `
            <div class="response-container">
                <h2>Approval Response</h2>
                <div class="response-text">${sanitizedHtml}</div>
                <div class="response-actions">
                    <button class="ok-button" id="okBtn">OK</button>
                </div>
            </div>
        `;
    }

    mainContent.innerHTML = responseHtml;

    // Add event listener for OK button
    const okBtn = document.getElementById('okBtn');
    if (okBtn) {
        okBtn.addEventListener('click', function() {
            console.log('OK button clicked');
            // Reload the page to return to the main page
            location.reload();
        });
    }
}

