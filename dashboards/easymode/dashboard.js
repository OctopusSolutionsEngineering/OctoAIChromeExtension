// Platform prompts configuration
const platformPrompts = {
    kubernetes: 'Create a Kubernetes project called "My K8s WebApp", and then:\n* Configure the Kubernetes steps to use client side apply (client side apply is required by the "Mock K8s" target).\n* Disable verification checks in the Kubernetes steps (verification checks are not supported by the "Mock K8s" target).\n* Create a token account called "Mock Token".\n* Create a feed called "Docker Hub" pointing to "https://index.docker.io" using anonymous authentication.\n* Add a target called "Mock K8s", with the tag "Kubernetes", using the token account, pointing to "https://mockk8s.octopus.com", using the health check image "octopusdeploy/worker-tools:6.5.0-ubuntu.22.04" from the "Docker Hub" feed, using the worker pool "Hosted Ubuntu".',
    argocd: 'Create an Argo CD project called "My Argo CD WebApp"',
    awslambda: 'Create an AWS Lambda project called "My AWS Lambda App"',
    scriptstep: 'Create a Script project called "My Script App"',
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
    createrelease: '* Add a channel called "Application" using the lifecycle from the project.\n* Add a trigger to create a release when a new package is pushed to the feed linked to the "Application" channel.'
};

// Calculate freeze dates that are always in the future relative to current date
const calculateFreezeDates = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January, 11 = December)
    const currentDay = now.getDate();

    // Determine which year to use for each freeze
    // Black Friday: November 23-29
    const blackFridayYear = (currentMonth === 10 && currentDay >= 23) || currentMonth === 11 ? currentYear + 1 : currentYear;
    // Cyber Monday: November 30 - December 2
    const cyberMondayYear = (currentMonth === 10 && currentDay >= 30) || currentMonth === 11 ? currentYear + 1 : currentYear;
    // Christmas: December 20-27
    const christmasYear = (currentMonth === 11 && currentDay >= 20) ? currentYear + 1 : currentYear;

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

    // Helper function to count total selected items (excluding platform)
    function getTotalSelectedItems() {
        let count = 0;
        if (selectedTenant) count++;
        count += selectedSteps.length;
        count += selectedRunbooks.length;
        count += selectedChannels.length;
        count += selectedReleaseNotes.length;
        count += selectedTriggers.length;
        count += selectedFreezes.length;
        count += selectedCommunityTemplates.length;
        return count;
    }

    // Helper function to check if selection is allowed
    function canSelectItem() {
        const limitedPlatforms = ['kubernetes', 'argocd', 'awslambda'];
        if (limitedPlatforms.includes(selectedPlatform)) {
            return getTotalSelectedItems() < 1;
        }
        return true; // No limit for other platforms
    }

    // Helper function to update disabled state for all cards
    function updateCardDisabledStates() {
        const warningElement = document.getElementById('kubernetesWarning');
        const awsLambdaWarning = document.getElementById('awslambda-message');
        const tenantsMessage = document.getElementById('tenants-message');
        const textarea = document.getElementById('promptText');
        const limitedPlatforms = ['kubernetes', 'argocd', 'awslambda'];

        // If AWS Lambda is selected, disable all items below the platform row
        if (selectedPlatform === 'awslambda') {
            // Disable all items below platform
            [tenantCards, stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                cards.forEach(card => {
                    card.classList.add('disabled-card');
                });
            });

            // Show AWS Lambda warning
            if (awsLambdaWarning) {
                awsLambdaWarning.style.display = 'block';
            }

            // Hide the platform limitation warning
            if (warningElement) {
                warningElement.style.display = 'none';
            }

            // Hide tenant warning
            if (tenantsMessage) {
                tenantsMessage.style.display = 'none';
            }

            // Add warning-displayed class to reduce textarea height
            if (textarea) {
                textarea.classList.add('warning-displayed');
            }

            return; // Exit early since AWS Lambda is selected
        } else {
            // Hide AWS Lambda warning when not selected
            if (awsLambdaWarning) {
                awsLambdaWarning.style.display = 'none';
            }
        }

        // If a tenant is selected, disable all items below the tenant row
        if (selectedTenant) {
            [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                cards.forEach(card => {
                    card.classList.add('disabled-card');
                });
            });

            // Hide the platform limitation warning when tenant is selected
            if (warningElement) {
                warningElement.style.display = 'none';
            }

            // Add warning-displayed class to reduce textarea height (tenant warning is shown)
            if (textarea) {
                textarea.classList.add('warning-displayed');
            }

            return; // Exit early since tenant is selected
        }

        if (limitedPlatforms.includes(selectedPlatform) && getTotalSelectedItems() >= 1) {
            // Disable all unselected cards
            [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                cards.forEach(card => {
                    if (!card.classList.contains('selected')) {
                        card.classList.add('disabled-card');
                    }
                });
            });
            // Also disable tenant cards if not selected
            tenantCards.forEach(card => {
                if (!card.classList.contains('selected')) {
                    card.classList.add('disabled-card');
                }
            });

            // Show warning message
            if (warningElement) {
                warningElement.style.display = 'block';
            }

            // Add warning-displayed class to reduce textarea height
            if (textarea) {
                textarea.classList.add('warning-displayed');
            }
        } else {
            // Remove disabled state when under limit or not a limited platform
            [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                cards.forEach(card => {
                    card.classList.remove('disabled-card');
                });
            });
            tenantCards.forEach(card => {
                card.classList.remove('disabled-card');
            });

            // Hide warning message
            if (warningElement) {
                warningElement.style.display = 'none';
            }

            // Remove warning-displayed class to restore normal textarea height
            if (textarea) {
                textarea.classList.remove('warning-displayed');
            }
        }

        // Update trigger card states based on platform selection
        updateTriggerCardStates();
    }

    // Helper function to disable/enable specific trigger cards based on platform
    function updateTriggerCardStates() {
        const platformsDisablingCreateRelease = ['scriptstep', 'bluegreen'];
        const limitedPlatforms = ['kubernetes', 'argocd', 'awslambda'];

        triggerCards.forEach(card => {
            const trigger = card.getAttribute('data-trigger');

            // Disable "createrelease" trigger for scriptstep and bluegreen platforms
            if (trigger === 'createrelease' && platformsDisablingCreateRelease.includes(selectedPlatform)) {
                card.classList.add('disabled-card');

                // If it was selected, deselect it
                if (card.classList.contains('selected')) {
                    card.classList.remove('selected');
                    selectedTriggers = selectedTriggers.filter(t => t !== trigger);
                    localStorage.setItem('easymode.selectedTriggers', JSON.stringify(selectedTriggers));
                }
            } else if (trigger === 'createrelease' && !platformsDisablingCreateRelease.includes(selectedPlatform)) {
                // Only re-enable if no other disabling conditions apply
                const shouldBeDisabled = selectedPlatform === 'awslambda' || // AWS Lambda disables all items
                    selectedTenant || // Tenant selected disables all items below
                    (limitedPlatforms.includes(selectedPlatform) && getTotalSelectedItems() >= 1 && !card.classList.contains('selected')); // Limited platform with item limit reached

                if (!shouldBeDisabled) {
                    card.classList.remove('disabled-card');
                }
            }
        });
    }

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

            // If AWS Lambda is selected, clear all selections (it doesn't allow any additional selections)
            if (selectedPlatform === 'awslambda') {
                // Clear all selections
                selectedTenant = null;
                selectedSteps = [];
                selectedRunbooks = [];
                selectedChannels = [];
                selectedReleaseNotes = [];
                selectedTriggers = [];
                selectedFreezes = [];
                selectedCommunityTemplates = [];

                // Remove selected class from all cards
                tenantCards.forEach(c => c.classList.remove('selected'));
                stepCards.forEach(c => c.classList.remove('selected'));
                runbookCards.forEach(c => c.classList.remove('selected'));
                channelCards.forEach(c => c.classList.remove('selected'));
                releaseNoteCards.forEach(c => c.classList.remove('selected'));
                triggerCards.forEach(c => c.classList.remove('selected'));
                freezeCards.forEach(c => c.classList.remove('selected'));
                communityTemplateCards.forEach(c => c.classList.remove('selected'));

                // Clear localStorage
                localStorage.removeItem('easymode.selectedTenant');
                localStorage.removeItem('easymode.selectedSteps');
                localStorage.removeItem('easymode.selectedRunbooks');
                localStorage.removeItem('easymode.selectedChannels');
                localStorage.removeItem('easymode.selectedReleaseNotes');
                localStorage.removeItem('easymode.selectedTriggers');
                localStorage.removeItem('easymode.selectedFreezes');
                localStorage.removeItem('easymode.selectedCommunityTemplates');
            }

            // If a limited platform is selected and we have more than 1 item selected, clear all selections
            const limitedPlatforms = ['kubernetes', 'argocd', 'awslambda'];
            if (limitedPlatforms.includes(selectedPlatform) && getTotalSelectedItems() > 1) {
                // Clear all selections
                selectedTenant = null;
                selectedSteps = [];
                selectedRunbooks = [];
                selectedChannels = [];
                selectedReleaseNotes = [];
                selectedTriggers = [];
                selectedFreezes = [];
                selectedCommunityTemplates = [];

                // Remove selected class from all cards
                tenantCards.forEach(c => c.classList.remove('selected'));
                stepCards.forEach(c => c.classList.remove('selected'));
                runbookCards.forEach(c => c.classList.remove('selected'));
                channelCards.forEach(c => c.classList.remove('selected'));
                releaseNoteCards.forEach(c => c.classList.remove('selected'));
                triggerCards.forEach(c => c.classList.remove('selected'));
                freezeCards.forEach(c => c.classList.remove('selected'));
                communityTemplateCards.forEach(c => c.classList.remove('selected'));

                // Clear localStorage
                localStorage.removeItem('easymode.selectedTenant');
                localStorage.removeItem('easymode.selectedSteps');
                localStorage.removeItem('easymode.selectedRunbooks');
                localStorage.removeItem('easymode.selectedChannels');
                localStorage.removeItem('easymode.selectedReleaseNotes');
                localStorage.removeItem('easymode.selectedTriggers');
                localStorage.removeItem('easymode.selectedFreezes');
                localStorage.removeItem('easymode.selectedCommunityTemplates');
            }

            // Update disabled states for limited platforms
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedPlatform', platform);
        });
    });

    // Handle tenant card selection
    tenantCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const tenant = this.getAttribute('data-tenant');
            const tenantsMessage = document.getElementById('tenants-message');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedTenant = null;
                localStorage.removeItem('easymode.selectedTenant');

                // Hide warning message
                if (tenantsMessage) {
                    tenantsMessage.style.display = 'none';
                    tenantsMessage.textContent = '';
                }

                // Re-enable all cards below tenants row
                [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                    cards.forEach(card => {
                        card.classList.remove('disabled-card');
                    });
                });
            } else {
                // Check if we can select a new item (for limited platforms)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Remove selected class from all tenant cards (only one can be selected)
                tenantCards.forEach(c => c.classList.remove('selected'));

                // Add selected class to clicked card
                this.classList.add('selected');

                // Update selected tenant
                selectedTenant = tenant;

                // Save selection to localStorage
                localStorage.setItem('easymode.selectedTenant', tenant);

                // Show warning message
                if (tenantsMessage) {
                    tenantsMessage.textContent = 'You cannot select additional options when a tenant is selected. Deselect the tenant to enable other options.';
                    tenantsMessage.style.display = 'block';
                }

                // Clear all selections below tenants row
                selectedSteps = [];
                selectedRunbooks = [];
                selectedChannels = [];
                selectedReleaseNotes = [];
                selectedTriggers = [];
                selectedFreezes = [];
                selectedCommunityTemplates = [];

                // Clear localStorage for items below tenants row
                localStorage.removeItem('easymode.selectedSteps');
                localStorage.removeItem('easymode.selectedRunbooks');
                localStorage.removeItem('easymode.selectedChannels');
                localStorage.removeItem('easymode.selectedReleaseNotes');
                localStorage.removeItem('easymode.selectedTriggers');
                localStorage.removeItem('easymode.selectedFreezes');
                localStorage.removeItem('easymode.selectedCommunityTemplates');

                // Remove selected class from all cards below tenants row
                [stepCards, runbookCards, channelCards, releaseNoteCards, triggerCards, freezeCards, communityTemplateCards].forEach(cards => {
                    cards.forEach(card => {
                        card.classList.remove('selected');
                        card.classList.add('disabled-card');
                    });
                });
            }

            // Update disabled states for limited platforms
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();
        });
    });

    // Handle step card selection (multiple selection allowed)
    stepCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const step = this.getAttribute('data-step');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedSteps = selectedSteps.filter(s => s !== step);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedSteps.push(step);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedSteps', JSON.stringify(selectedSteps));
        });
    });

    // Handle runbook card selection (multiple selection allowed)
    runbookCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const runbook = this.getAttribute('data-runbook');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedRunbooks = selectedRunbooks.filter(r => r !== runbook);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedRunbooks.push(runbook);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedRunbooks', JSON.stringify(selectedRunbooks));
        });
    });

    // Handle channel card selection (multiple selection allowed)
    channelCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const channel = this.getAttribute('data-channel');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedChannels = selectedChannels.filter(c => c !== channel);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedChannels.push(channel);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedChannels', JSON.stringify(selectedChannels));
        });
    });

    // Handle release note card selection (multiple selection allowed)
    releaseNoteCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const releaseNote = this.getAttribute('data-releasenote');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedReleaseNotes = selectedReleaseNotes.filter(r => r !== releaseNote);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedReleaseNotes.push(releaseNote);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedReleaseNotes', JSON.stringify(selectedReleaseNotes));
        });
    });

    // Handle trigger card selection (multiple selection allowed)
    triggerCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const trigger = this.getAttribute('data-trigger');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedTriggers = selectedTriggers.filter(t => t !== trigger);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedTriggers.push(trigger);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedTriggers', JSON.stringify(selectedTriggers));
        });
    });

    // Handle freeze card selection (multiple selection allowed)
    freezeCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const freeze = this.getAttribute('data-freeze');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedFreezes = selectedFreezes.filter(f => f !== freeze);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedFreezes.push(freeze);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedFreezes', JSON.stringify(selectedFreezes));
        });
    });

    // Handle community template card selection (multiple selection allowed)
    communityTemplateCards.forEach(card => {
        card.addEventListener('click', function() {
            // Don't allow clicks on disabled cards
            if (this.classList.contains('disabled-card')) {
                return;
            }

            const template = this.getAttribute('data-communitytemplate');

            // Toggle selected state
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                selectedCommunityTemplates = selectedCommunityTemplates.filter(t => t !== template);
            } else {
                // Check if we can select a new item (for kubernetes limit)
                if (!canSelectItem()) {
                    return; // Don't allow selection if limit is reached
                }

                // Select
                this.classList.add('selected');
                selectedCommunityTemplates.push(template);
            }

            // Update disabled states for kubernetes platform
            updateCardDisabledStates();

            // Update textarea
            updatePromptTextarea();

            // Save selection to localStorage
            localStorage.setItem('easymode.selectedCommunityTemplates', JSON.stringify(selectedCommunityTemplates));
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
    const savedPlatform = localStorage.getItem('easymode.selectedPlatform');
    const savedTenant = localStorage.getItem('easymode.selectedTenant');
    const savedSteps = localStorage.getItem('easymode.selectedSteps');
    const savedRunbooks = localStorage.getItem('easymode.selectedRunbooks');
    const savedChannels = localStorage.getItem('easymode.selectedChannels');
    const savedReleaseNotes = localStorage.getItem('easymode.selectedReleaseNotes');
    const savedTriggers = localStorage.getItem('easymode.selectedTriggers');
    const savedFreezes = localStorage.getItem('easymode.selectedFreezes');
    const savedCommunityTemplates = localStorage.getItem('easymode.selectedCommunityTemplates');

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

    // Define platform-based selection rules
    const limitedPlatforms = ['kubernetes', 'argocd', 'awslambda'];
    const platformsDisablingCreateRelease = ['scriptstep', 'bluegreen'];
    const isAwsLambda = savedPlatform === 'awslambda';
    const isLimitedPlatform = limitedPlatforms.includes(savedPlatform);

    // Helper function to validate and click on a card if it's allowed
    function tryRestoreSelection(card) {
        if (!card) return false;
        
        // Don't click if card is disabled
        if (card.classList.contains('disabled-card')) {
            return false;
        }
        
        card.click();
        return card.classList.contains('selected');
    }

    // Helper function to normalize array selections
    // Returns the number of items successfully restored
    function normalizeArraySelections(savedData, cardSelector, storageKey, currentTotal) {
        if (!savedData) return 0;
        
        try {
            const items = JSON.parse(savedData);
            const validItems = [];
            
            // For AWS Lambda, clear all selections as nothing is allowed
            if (isAwsLambda) {
                localStorage.removeItem(storageKey);
                return 0;
            }
            
            // For limited platforms, only allow 1 item total across all categories
            const maxTotal = isLimitedPlatform ? 1 : Infinity;
            
            for (const item of items) {
                // Stop if we've reached the global selection limit
                if (currentTotal + validItems.length >= maxTotal) {
                    break;
                }
                
                const card = document.querySelector(cardSelector.replace('ITEM', item));
                if (tryRestoreSelection(card)) {
                    validItems.push(item);
                }
            }
            
            // Write back the normalized (valid) selections
            if (validItems.length > 0) {
                localStorage.setItem(storageKey, JSON.stringify(validItems));
            } else {
                localStorage.removeItem(storageKey);
            }
            
            return validItems.length;
        } catch (e) {
            console.error(`Error parsing ${storageKey}:`, e);
            localStorage.removeItem(storageKey);
            return 0;
        }
    }

    // Restore tenant selection (if allowed)
    if (savedTenant) {
        // AWS Lambda doesn't allow tenant selection
        if (isAwsLambda) {
            localStorage.removeItem('easymode.selectedTenant');
        } else {
            const tenantCard = document.querySelector(`[data-tenant="${savedTenant}"]`);
            if (!tryRestoreSelection(tenantCard)) {
                localStorage.removeItem('easymode.selectedTenant');
            }
        }
    }

    // If tenant is selected, clear all other selections as they're not allowed
    if (selectedTenant) {
        localStorage.removeItem('easymode.selectedSteps');
        localStorage.removeItem('easymode.selectedRunbooks');
        localStorage.removeItem('easymode.selectedChannels');
        localStorage.removeItem('easymode.selectedReleaseNotes');
        localStorage.removeItem('easymode.selectedTriggers');
        localStorage.removeItem('easymode.selectedFreezes');
        localStorage.removeItem('easymode.selectedCommunityTemplates');
    } else {
        // Restore other selections (with normalization)
        // Track total selections to respect global limits for limited platforms
        let totalRestored = 0;
        
        totalRestored += normalizeArraySelections(savedSteps, '[data-step="ITEM"]', 'easymode.selectedSteps', totalRestored);
        totalRestored += normalizeArraySelections(savedRunbooks, '[data-runbook="ITEM"]', 'easymode.selectedRunbooks', totalRestored);
        totalRestored += normalizeArraySelections(savedChannels, '[data-channel="ITEM"]', 'easymode.selectedChannels', totalRestored);
        totalRestored += normalizeArraySelections(savedReleaseNotes, '[data-releasenote="ITEM"]', 'easymode.selectedReleaseNotes', totalRestored);
        totalRestored += normalizeArraySelections(savedFreezes, '[data-freeze="ITEM"]', 'easymode.selectedFreezes', totalRestored);
        totalRestored += normalizeArraySelections(savedCommunityTemplates, '[data-communitytemplate="ITEM"]', 'easymode.selectedCommunityTemplates', totalRestored);
        
        // Special handling for triggers (some may be disabled based on platform)
        if (savedTriggers) {
            try {
                const triggers = JSON.parse(savedTriggers);
                const validTriggers = [];
                const maxTotal = isLimitedPlatform ? 1 : Infinity;
                
                for (const trigger of triggers) {
                    // Stop if we've reached the global selection limit
                    if (totalRestored + validTriggers.length >= maxTotal) {
                        break;
                    }
                    
                    // Skip createrelease trigger if platform disables it
                    if (trigger === 'createrelease' && platformsDisablingCreateRelease.includes(savedPlatform)) {
                        continue;
                    }
                    
                    const card = document.querySelector(`[data-trigger="${trigger}"]`);
                    if (tryRestoreSelection(card)) {
                        validTriggers.push(trigger);
                    }
                }
                
                // Write back the normalized triggers
                if (validTriggers.length > 0) {
                    localStorage.setItem('easymode.selectedTriggers', JSON.stringify(validTriggers));
                } else {
                    localStorage.removeItem('easymode.selectedTriggers');
                }
            } catch (e) {
                console.error('Error parsing saved triggers:', e);
                localStorage.removeItem('easymode.selectedTriggers');
            }
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
                <button id="reloadBtn" class="reload-button">Reload Dashboard</button>
            </div>
        `;

        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', function() {
                console.log('Reload button clicked');
                // Reload the page to display the main page again
                location.reload();
            });
        }
    }
}

// Helper function to display the response with Approve/Reject buttons
function displayResponse(result, serverUrl) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    let responseHtml = '';

    // Convert markdown to HTML using marked library
    const htmlContent = marked.parse(result.response);
    const sanitizedHtml = DOMPurify.sanitize(htmlContent);

    if (result.state === 'Error') {
        responseHtml = `
            <div class="response-container error">
                <h2>Error</h2>
                <div class="response-text">${sanitizedHtml}</div>
                <div class="response-actions">
                    <button id="reloadBtn" class="reload-button">Reload Dashboard</button>
                </div>
            </div>
        `;
    } else if (!result.id) {
       responseHtml = `
            <div class="response-container">
                <h2>Error</h2>
                <div class="response-text">${sanitizedHtml}</div>
                <div class="response-actions">
                    <button id="reloadBtn" class="reload-button">Reload Dashboard</button>
                </div>
            </div>
        `;
    } else {
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
                    <button id="reloadBtn" class="reload-button">Reload Dashboard</button>
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
    const reloadBtn = document.getElementById('reloadBtn');

    if (okBtn) {
        okBtn.addEventListener('click', function() {
            console.log('OK button clicked');
            // Reload the page to return to the main page
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

