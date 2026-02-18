// Platform prompts configuration
const platformPrompts = {
    kubernetes: 'Create a Kubernetes project called "My K8s WebApp", and then:\n* Configure the Kubernetes steps to use client side apply (client side apply is required by the "Mock K8s" target).\n* Disable verification checks in the Kubernetes steps (verification checks are not supported by the "Mock K8s" target).\n* Create a token account called "Mock Token".\n* Create a feed called "Docker Hub" pointing to "https://index.docker.io" using anonymous authentication.\n* Add a target called "Mock K8s", with the tag "Kubernetes", using the token account, pointing to "https://mockk8s.octopus.com", using the health check image "octopusdeploy/worker-tools:6.5.0-ubuntu.22.04" from the "Docker Hub" feed, using the worker pool "Hosted Ubuntu".',
    argocd: 'Create an Argo CD project called "My Argo CD WebApp"',
    azurewebapp: 'Create an Azure Web App project called "My Azure WebApp"',
    azurefunctions: 'Create an Azure Functions project called "My Azure Function App"',
    awslambda: 'Create an AWS Lambda project called "My AWS Lambda App"',
    scriptstep: 'Create a script project called "My Script App"',
    bluegreen: 'Create a Blue/Green deployment project called "My Blue Green App"'
};

// Tenant instructions configuration
const tenantInstructions = {
    regional: '* Add 5 tenants based on geographical regions, link the tenants to the project, and require tenants to deploy the project.',
    physical: '* Add 5 tenants based on fictional brick and mortar store names, link the tenants to the project, and require tenants to deploy the project.',
    businessunit: '* Add 5 tenants based on fictional business unit names, link the tenants to the project, and require tenants to deploy the project.',
    company: '* Add 5 tenants based on fictional company names, link the tenants to the project, and require tenants to deploy the project.'
};

// Placeholder step instructions configuration
const stepInstructions = {
    smoketests: '* Add a script step at the end of the deployment process to run smoke tests with a script that echoes "Running Smoke Test...".',
    openfirewall: '* Add a step at the end of the deployment process to open the firewall with a script that echoes "Opening Firewall Ports...".',
    publishreleasenotes: '* Add a step at the end of the deployment process to publish release notes with a script that echoes "Publishing Notes...".',
    manualintervention: '* Add a manual intervention step at the start of the deployment process, scoped to the "Production" environment.'
};

// Runbook instructions configuration
const runbookInstructions = {
    database: '* Add a runbook to simulate a database backup scoped to the "Production" environment.',
    service: '* Add a runbook to simulate the restart of the service scoped to the environments from the project\'s lifecycles.',
    logs: '* Add a runbook to simulate the retrieval of logs scoped to the environments from the project\'s lifecycles.'
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    const platformCards = document.querySelectorAll('.platform-card');
    const tenantCards = document.querySelectorAll('.tenant-card');
    const stepCards = document.querySelectorAll('.step-card');
    const runbookCards = document.querySelectorAll('.runbook-card');
    const promptTextarea = document.getElementById('promptText');
    const executeButton = document.getElementById('executeButton');

    let selectedPlatform = null;
    let selectedTenant = null;
    let selectedSteps = [];
    let selectedRunbooks = [];

    // Handle platform card selection
    platformCards.forEach(card => {
        card.addEventListener('click', function() {
            const platform = this.getAttribute('data-platform');

            // Remove selected class from all platform cards
            platformCards.forEach(c => c.classList.remove('selected'));

            // Add selected class to clicked card
            this.classList.add('selected');

            // Update selected platform
            selectedPlatform = platform;

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedPlatform', platform);
        });
    });

    // Handle tenant card selection
    tenantCards.forEach(card => {
        card.addEventListener('click', function() {
            const tenant = this.getAttribute('data-tenant');

            // Remove selected class from all tenant cards
            tenantCards.forEach(c => c.classList.remove('selected'));

            // Add selected class to clicked card
            this.classList.add('selected');

            // Update selected tenant
            selectedTenant = tenant;

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedTenant', tenant);
        });
    });

    // Handle step card selection (multiple selection allowed)
    stepCards.forEach(card => {
        card.addEventListener('click', function() {
            const step = this.getAttribute('data-step');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedSteps = selectedSteps.filter(s => s !== step);
            } else {
                // Select
                this.classList.add('selected');
                selectedSteps.push(step);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedSteps', JSON.stringify(selectedSteps));
        });
    });

    // Handle runbook card selection (multiple selection allowed)
    runbookCards.forEach(card => {
        card.addEventListener('click', function() {
            const runbook = this.getAttribute('data-runbook');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedRunbooks = selectedRunbooks.filter(r => r !== runbook);
            } else {
                // Select
                this.classList.add('selected');
                selectedRunbooks.push(runbook);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedRunbooks', JSON.stringify(selectedRunbooks));
        });
    });

    // Function to update the prompt textarea based on selections
    function updatePromptTextarea() {
        let prompt = '';

        // Add platform prompt if selected
        if (selectedPlatform && platformPrompts[selectedPlatform]) {
            prompt = platformPrompts[selectedPlatform];
        }

        // Add tenant instruction if selected
        if (selectedTenant && tenantInstructions[selectedTenant]) {
            if (prompt) {
                prompt += '\n' + tenantInstructions[selectedTenant];
            } else {
                prompt = tenantInstructions[selectedTenant];
            }
        }

        // Add step instructions if selected
        if (selectedSteps.length > 0) {
            selectedSteps.forEach(step => {
                if (stepInstructions[step]) {
                    if (prompt) {
                        prompt += '\n' + stepInstructions[step];
                    } else {
                        prompt = stepInstructions[step];
                    }
                }
            });
        }

        // Add runbook instructions if selected
        if (selectedRunbooks.length > 0) {
            selectedRunbooks.forEach(runbook => {
                if (runbookInstructions[runbook]) {
                    if (prompt) {
                        prompt += '\n' + runbookInstructions[runbook];
                    } else {
                        prompt = runbookInstructions[runbook];
                    }
                }
            });
        }

        promptTextarea.value = prompt;
    }

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
    const savedTenant = localStorage.getItem('selectedTenant');
    const savedSteps = localStorage.getItem('selectedSteps');
    const savedRunbooks = localStorage.getItem('selectedRunbooks');

    if (savedPlatform) {
        const savedCard = document.querySelector(`[data-platform="${savedPlatform}"]`);
        if (savedCard) {
            savedCard.click();
        }
    }
    if (savedTenant) {
        const savedCard = document.querySelector(`[data-tenant="${savedTenant}"]`);
        if (savedCard) {
            savedCard.click();
        }
    }
    if (savedSteps) {
        try {
            const steps = JSON.parse(savedSteps);
            steps.forEach(step => {
                const savedCard = document.querySelector(`[data-step="${step}"]`);
                if (savedCard) {
                    savedCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved steps:', e);
        }
    }
    if (savedRunbooks) {
        try {
            const runbooks = JSON.parse(savedRunbooks);
            runbooks.forEach(runbook => {
                const savedCard = document.querySelector(`[data-runbook="${runbook}"]`);
                if (savedCard) {
                    savedCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved runbooks:', e);
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

