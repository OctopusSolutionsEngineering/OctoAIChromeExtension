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

// Channel instructions configuration
const channelInstructions = {
    hotfix: '* Create a channel called "Hot Fix" using a lifecycle called "Hot Fix" that includes only the "Production" environment.',
    featurebranch: '* Create a channel called "Feature Branch" using a lifecycle called "Feature Branch" that includes only the "Feature Branch" environment.'
};

// Release note instructions configuration
const releaseNoteInstructions = {
    buildinformation: '* Add the following release notes to the project:\n```\nHere are the notes for the packages\n#{each package in Octopus.Release.Package}\n- #{package.PackageId} #{package.Version}\n#{each workItem in package.WorkItems}\n  - [#{workItem.Id}](#{workItem.LinkUrl}) - #{workItem.Description}\n#{/each}\n#{each commit in package.Commits}\n  - [#{commit.CommitId}](#{commit.LinkUrl}) - #{commit.Comment}\n#{/each}\n#{/each}\n```'
};

// Trigger instructions configuration
const triggerInstructions = {
    createrelease: '* Add a trigger to create a release when a new package is pushed to the feed.'
};

// Calculate freeze dates that are always in the future relative to current date (Feb 19, 2026)
const calculateFreezeDates = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January, 11 = December)
    const currentDay = now.getDate();

    // Determine which year to use for each freeze
    // Black Friday: November 23-29
    const blackFridayYear = (currentMonth === 10 && currentDay > 29) || currentMonth === 11 ? currentYear + 1 : currentYear;
    // Cyber Monday: November 30 - December 2
    const cyberMondayYear = (currentMonth === 11 && currentDay > 2) ? currentYear + 1 : currentYear;
    // Christmas: December 20-27
    const christmasYear = (currentMonth === 11 && currentDay > 27) ? currentYear + 1 : currentYear;

    return {
        blackFriday: { year: blackFridayYear, start: `November 23rd, ${blackFridayYear}`, end: `November 29th, ${blackFridayYear}` },
        cyberMonday: { year: cyberMondayYear, start: `November 30th, ${cyberMondayYear}`, end: `December 2nd, ${cyberMondayYear}` },
        christmas: { year: christmasYear, start: `December 20th, ${christmasYear}`, end: `December 27th, ${christmasYear}` }
    };
};

// Freeze instructions configuration with dynamic dates
const freezeDates = calculateFreezeDates();
const freezeInstructions = {
    blackfriday: `* Add a deployment freeze called "Black Friday Freeze" from ${freezeDates.blackFriday.start} to ${freezeDates.blackFriday.end}.`,
    cybermonday: `* Add a deployment freeze called "Cyber Monday Freeze" from ${freezeDates.cyberMonday.start} to ${freezeDates.cyberMonday.end}.`,
    christmas: `* Add a deployment freeze called "Christmas Freeze" from ${freezeDates.christmas.start} to ${freezeDates.christmas.end}.`
};

// Community step template instructions configuration
const communityTemplateInstructions = {
    calculatereleasemode: '* Add the community step template with the website "https://library.octopus.com/step-templates/d166457a-1421-4731-b143-dd6766fb95d5" as the first step with the name "Calculate Deployment Mode".',
    slack: '* Add the community step template with the website "https://library.octopus.com/step-templates/99e6f203-3061-4018-9e34-4a3a9c3c3179" as the final step with the name "Send Slack Message". Configure the step to run on a worker. Remove any email steps if they are present.'
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    const platformCards = document.querySelectorAll('.platform-card');
    const tenantCards = document.querySelectorAll('.tenant-card');
    const stepCards = document.querySelectorAll('.step-card');
    const runbookCards = document.querySelectorAll('.runbook-card');
    const channelCards = document.querySelectorAll('.channel-card');
    const releaseNoteCards = document.querySelectorAll('.releasenote-card');
    const triggerCards = document.querySelectorAll('.trigger-card');
    const freezeCards = document.querySelectorAll('.freeze-card');
    const communityTemplateCards = document.querySelectorAll('.communitytemplate-card');
    const promptTextarea = document.getElementById('promptText');
    const executeButton = document.getElementById('executeButton');

    let selectedPlatform = null;
    let selectedTenant = null;
    let selectedSteps = [];
    let selectedRunbooks = [];
    let selectedChannels = [];
    let selectedReleaseNotes = [];
    let selectedTriggers = [];
    let selectedFreezes = [];
    let selectedCommunityTemplates = [];

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

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedTenant = null;
                localStorage.removeItem('selectedTenant');
            } else {
                // Remove selected class from all tenant cards (only one can be selected)
                tenantCards.forEach(c => c.classList.remove('selected'));

                // Add selected class to clicked card
                this.classList.add('selected');

                // Update selected tenant
                selectedTenant = tenant;

                // Save selection to localStorage
                localStorage.setItem('selectedTenant', tenant);
            }

            // All other rows are disabled until a tenant is selected, so enable/disable them based on whether a tenant is selected
            if (selectedTenant) {
                selectedSteps = [];
                selectedRunbooks = [];
                selectedChannels = [];
                selectedReleaseNotes = [];
                selectedTriggers = [];
                selectedFreezes = [];
                selectedCommunityTemplates = [];
                document.getElementById("tenants-message").innerText = "Prompt complexity limit reached. Unselect tenant to enable more options.";
                document.getElementById("tenants-message").style.display = "block";
            } else {
                document.getElementById("tenants-message").style.display = "none";
            }

            [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                cards.forEach(card => {
                    if (selectedTenant) {
                        card.classList.add("disabled-card")
                        card.classList.remove('selected')
                    } else {
                        card.classList.remove("disabled-card")
                    }
                });
            });

            // Update textarea
            updatePromptTextarea();
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

    // Handle channel card selection (multiple selection allowed)
    channelCards.forEach(card => {
        card.addEventListener('click', function() {
            const channel = this.getAttribute('data-channel');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedChannels = selectedChannels.filter(c => c !== channel);
            } else {
                // Select
                this.classList.add('selected');
                selectedChannels.push(channel);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedChannels', JSON.stringify(selectedChannels));
        });
    });

    // Handle release note card selection (multiple selection allowed)
    releaseNoteCards.forEach(card => {
        card.addEventListener('click', function() {
            const releaseNote = this.getAttribute('data-releasenote');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedReleaseNotes = selectedReleaseNotes.filter(r => r !== releaseNote);
            } else {
                // Select
                this.classList.add('selected');
                selectedReleaseNotes.push(releaseNote);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedReleaseNotes', JSON.stringify(selectedReleaseNotes));
        });
    });

    // Handle trigger card selection (multiple selection allowed)
    triggerCards.forEach(card => {
        card.addEventListener('click', function() {
            const trigger = this.getAttribute('data-trigger');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedTriggers = selectedTriggers.filter(t => t !== trigger);
            } else {
                // Select
                this.classList.add('selected');
                selectedTriggers.push(trigger);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedTriggers', JSON.stringify(selectedTriggers));
        });
    });

    // Handle freeze card selection (multiple selection allowed)
    freezeCards.forEach(card => {
        card.addEventListener('click', function() {
            const freeze = this.getAttribute('data-freeze');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedFreezes = selectedFreezes.filter(f => f !== freeze);
            } else {
                // Select
                this.classList.add('selected');
                selectedFreezes.push(freeze);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedFreezes', JSON.stringify(selectedFreezes));
        });
    });

    // Handle community template card selection (multiple selection allowed)
    communityTemplateCards.forEach(card => {
        card.addEventListener('click', function() {
            const template = this.getAttribute('data-communitytemplate');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedCommunityTemplates = selectedCommunityTemplates.filter(t => t !== template);
            } else {
                // Select
                this.classList.add('selected');
                selectedCommunityTemplates.push(template);
            }

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('selectedCommunityTemplates', JSON.stringify(selectedCommunityTemplates));
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

        // Add channel instructions if selected
        if (selectedChannels.length > 0) {
            selectedChannels.forEach(channel => {
                if (channelInstructions[channel]) {
                    if (prompt) {
                        prompt += '\n' + channelInstructions[channel];
                    } else {
                        prompt = channelInstructions[channel];
                    }
                }
            });
        }

        // Add release note instructions if selected
        if (selectedReleaseNotes.length > 0) {
            selectedReleaseNotes.forEach(releaseNote => {
                if (releaseNoteInstructions[releaseNote]) {
                    if (prompt) {
                        prompt += '\n' + releaseNoteInstructions[releaseNote];
                    } else {
                        prompt = releaseNoteInstructions[releaseNote];
                    }
                }
            });
        }

        // Add trigger instructions if selected
        if (selectedTriggers.length > 0) {
            selectedTriggers.forEach(trigger => {
                if (triggerInstructions[trigger]) {
                    if (prompt) {
                        prompt += '\n' + triggerInstructions[trigger];
                    } else {
                        prompt = triggerInstructions[trigger];
                    }
                }
            });
        }

        // Add freeze instructions if selected
        if (selectedFreezes.length > 0) {
            selectedFreezes.forEach(freeze => {
                if (freezeInstructions[freeze]) {
                    if (prompt) {
                        prompt += '\n' + freezeInstructions[freeze];
                    } else {
                        prompt = freezeInstructions[freeze];
                    }
                }
            });
        }

        // Add community template instructions if selected
        if (selectedCommunityTemplates.length > 0) {
            selectedCommunityTemplates.forEach(template => {
                if (communityTemplateInstructions[template]) {
                    if (prompt) {
                        prompt += '\n' + communityTemplateInstructions[template];
                    } else {
                        prompt = communityTemplateInstructions[template];
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
    const savedChannels = localStorage.getItem('selectedChannels');
    const savedReleaseNotes = localStorage.getItem('selectedReleaseNotes');
    const savedTriggers = localStorage.getItem('selectedTriggers');
    const savedFreezes = localStorage.getItem('selectedFreezes');
    const savedCommunityTemplates = localStorage.getItem('selectedCommunityTemplates');

    // Restore platform selection or default to kubernetes
    if (savedPlatform) {
        const platformCard = document.querySelector(`[data-platform="${savedPlatform}"]`);
        if (platformCard) {
            platformCard.click();
        }
    } else {
        // Default to kubernetes
        const kubernetesCard = document.querySelector('[data-platform="kubernetes"]');
        if (kubernetesCard) {
            kubernetesCard.click();
        }
    }

    // Restore tenant selection
    if (savedTenant) {
        const tenantCard = document.querySelector(`[data-tenant="${savedTenant}"]`);
        if (tenantCard) {
            tenantCard.click();
        }
    }

    // Restore steps selection
    if (savedSteps) {
        try {
            const steps = JSON.parse(savedSteps);
            steps.forEach(step => {
                const stepCard = document.querySelector(`[data-step="${step}"]`);
                if (stepCard) {
                    stepCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved steps:', e);
        }
    }

    // Restore runbooks selection
    if (savedRunbooks) {
        try {
            const runbooks = JSON.parse(savedRunbooks);
            runbooks.forEach(runbook => {
                const runbookCard = document.querySelector(`[data-runbook="${runbook}"]`);
                if (runbookCard) {
                    runbookCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved runbooks:', e);
        }
    }

    // Restore channels selection
    if (savedChannels) {
        try {
            const channels = JSON.parse(savedChannels);
            channels.forEach(channel => {
                const channelCard = document.querySelector(`[data-channel="${channel}"]`);
                if (channelCard) {
                    channelCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved channels:', e);
        }
    }

    // Restore release notes selection
    if (savedReleaseNotes) {
        try {
            const releaseNotes = JSON.parse(savedReleaseNotes);
            releaseNotes.forEach(releaseNote => {
                const releaseNoteCard = document.querySelector(`[data-releasenote="${releaseNote}"]`);
                if (releaseNoteCard) {
                    releaseNoteCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved release notes:', e);
        }
    }

    // Restore triggers selection
    if (savedTriggers) {
        try {
            const triggers = JSON.parse(savedTriggers);
            triggers.forEach(trigger => {
                const savedCard = document.querySelector(`[data-trigger="${trigger}"]`);
                if (savedCard) {
                    savedCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved triggers:', e);
        }
    }
    if (savedFreezes) {
        try {
            const freezes = JSON.parse(savedFreezes);
            freezes.forEach(freeze => {
                const savedCard = document.querySelector(`[data-freeze="${freeze}"]`);
                if (savedCard) {
                    savedCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved freezes:', e);
        }
    }
    if (savedCommunityTemplates) {
        try {
            const templates = JSON.parse(savedCommunityTemplates);
            templates.forEach(template => {
                const savedCard = document.querySelector(`[data-communitytemplate="${template}"]`);
                if (savedCard) {
                    savedCard.click();
                }
            });
        } catch (e) {
            console.error('Error parsing saved community templates:', e);
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
                    <button id="reloadBtn" class="reload-button">Reload Dashboard</button>
                </div>
            </div>
        `;
    } else if (!result.id) {
       responseHtml = `
            <div class="response-container">
                <h2>Error</h2>
                <div class="response-text">${DOMPurify.sanitize(result.response)}</div>
                <div class="response-actions">
                    <button id="reloadBtn" class="reload-button">Ok</button>
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
    const reloadBtn = document.getElementById('reloadBtn');

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

    if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
            console.log('Reload button clicked');
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

