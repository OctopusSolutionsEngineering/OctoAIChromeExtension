// Store the dashboard configuration
let dashboardConfig = null;
let allProjects = [];
let selectedProjectIds = new Set();
let defaultProjectToSelect = null;
let environmentsCache = new Map(); // Cache for environment ID to name mapping
let releasesCache = new Map(); // Cache for release ID to release object mapping

// Rate limiting for API calls
let apiCallQueue = [];
let isProcessingQueue = false;
let lastApiCallTime = 0;
const API_CALL_DELAY_MS = 1000; // 1 second between calls

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds between retries

// Local storage key for regex
const REGEX_STORAGE_KEY = 'changemanagement.regexPattern';
const DEPLOYMENT_HISTORY_STORAGE_KEY = 'changemanagement.deploymentHistory';

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get dashboard configuration
        dashboardConfig = await new Promise((resolve) => {
            dashboardGetConfig((config) => resolve(config));
        });

        if (!dashboardConfig || !dashboardConfig.serverUrls || dashboardConfig.serverUrls.length === 0) {
            showError('No Octopus server URLs found. Please launch this dashboard from an Octopus Deploy instance.');
            return;
        }

        // Get URL parameters and default values
        const urlParams = getUrlParams();

        // URL params take precedence over config context
        const defaultSpace = urlParams.space || dashboardConfig.context?.space;
        const defaultProject = urlParams.project || dashboardConfig.context?.project;
        
        // Store default project for later use
        if (defaultProject) {
            defaultProjectToSelect = defaultProject;
        }

        // Set up event listeners
        setupEventListeners();

        // Load saved regex from local storage
        loadRegexFromStorage();
        
        // Load saved deployment history from local storage
        loadDeploymentHistoryFromStorage();

        // Load spaces and select default if available
        await loadSpaces(defaultSpace);
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to initialize dashboard: ' + error.message);
    }
});

// Get URL parameters
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        space: params.get('space'),
        project: params.get('project')
    };
}

// Load spaces from Octopus
async function loadSpaces(defaultSpace) {
    const spaceSelect = document.getElementById('space-select');
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];

    try {
        const response = await fetchOctopusApiJson(serverUrl, '/api/spaces/all');
        const spaces = response;

        // Clear existing options except the first one
        spaceSelect.innerHTML = '<option value="">-- Select a space --</option>';

        // Add spaces to dropdown
        spaces.forEach(space => {
            const option = document.createElement('option');
            option.value = space.Id;
            option.textContent = space.Name;
            option.dataset.spaceName = space.Name;
            spaceSelect.appendChild(option);
        });

        // Select default space if provided
        if (defaultSpace) {
            // Try to find space by name or ID
            const matchingOption = Array.from(spaceSelect.options).find(
                option => option.dataset.spaceName === defaultSpace || option.value === defaultSpace
            );

            if (matchingOption) {
                spaceSelect.value = matchingOption.value;
                // Trigger the change event to load projects
                const changeEvent = new Event('change', { bubbles: true });
                spaceSelect.dispatchEvent(changeEvent);
            }
        }
    } catch (error) {
        console.error('Error loading spaces:', error);
        showError('Failed to load spaces: ' + error.message);
    }
}

// Load projects for selected space
async function loadProjects(spaceId, spaceName) {
    const availableList = document.getElementById('available-projects');
    const selectedList = document.getElementById('selected-projects');
    const loading = document.getElementById('loading');
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];

    try {
        // Show loading indicator
        loading.classList.add('show');
        availableList.innerHTML = '';

        // Fetch projects from Octopus API
        const response = await fetchOctopusApiJson(serverUrl, `/api/${spaceId}/projects/all`);
        allProjects = response;

        // Sort projects by name
        allProjects.sort((a, b) => a.Name.localeCompare(b.Name));

        // Populate available projects list
        allProjects.forEach(project => {
            if (!selectedProjectIds.has(project.Id)) {
                const option = document.createElement('option');
                option.value = project.Id;
                option.textContent = project.Name;
                availableList.appendChild(option);
            }
        });

        // Auto-select default project if specified
        if (defaultProjectToSelect) {
            // Find the project by name or ID
            const matchingProject = allProjects.find(
                project => project.Name === defaultProjectToSelect || project.Id === defaultProjectToSelect
            );

            if (matchingProject && !selectedProjectIds.has(matchingProject.Id)) {
                // Add to selected projects
                selectedProjectIds.add(matchingProject.Id);

                // Create option in selected list
                const selectedOption = document.createElement('option');
                selectedOption.value = matchingProject.Id;
                selectedOption.textContent = matchingProject.Name;
                selectedList.appendChild(selectedOption);

                // Remove from available list
                const optionToRemove = Array.from(availableList.options).find(
                    opt => opt.value === matchingProject.Id
                );
                if (optionToRemove) {
                    optionToRemove.remove();
                }
            }

            // Clear the default project after first use
            defaultProjectToSelect = null;
        }

        // Hide loading indicator
        loading.classList.remove('show');
    } catch (error) {
        console.error('Error loading projects:', error);
        showError('Failed to load projects: ' + error.message);
        loading.classList.remove('show');
    }
}

// Fetch data from Octopus API
async function fetchOctopusApiJson(serverUrl, endpoint) {
    return rateLimitedApiCall(async () => {
        return retryApiCall(async () => {
            // Make API request
            const apiResponse = await fetch(new URL(endpoint, serverUrl), {
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!apiResponse.ok) {
                throw new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
            }

            return await apiResponse.json();
        });
    });
}

async function fetchOctopusApiText(serverUrl, endpoint) {
    return rateLimitedApiCall(async () => {
        return retryApiCall(async () => {
            // Make API request
            const apiResponse = await fetch(new URL(endpoint, serverUrl), {
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!apiResponse.ok) {
                throw new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
            }

            return await apiResponse.text();
        });
    });
}

// Retry wrapper for API calls
async function retryApiCall(apiFunction, retryCount = 0) {
    try {
        return await apiFunction();
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.log(`API call failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}). Retrying in ${RETRY_DELAY_MS / 1000} seconds...`, error.message);
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            // Retry the call
            return retryApiCall(apiFunction, retryCount + 1);
        } else {
            // Max retries reached, throw the error
            console.error(`API call failed after ${MAX_RETRIES + 1} attempts:`, error.message);
            throw error;
        }
    }
}

// Rate-limited API call wrapper
async function rateLimitedApiCall(apiFunction) {
    return new Promise((resolve, reject) => {
        // Add to queue
        apiCallQueue.push({ apiFunction, resolve, reject });
        
        // Start processing if not already processing
        if (!isProcessingQueue) {
            processApiQueue();
        }
    });
}

// Process API call queue with rate limiting
async function processApiQueue() {
    if (isProcessingQueue || apiCallQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;

    while (apiCallQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastCall = now - lastApiCallTime;

        // Wait if we need to throttle
        if (timeSinceLastCall < API_CALL_DELAY_MS) {
            const delayNeeded = API_CALL_DELAY_MS - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, delayNeeded));
        }

        // Get next call from queue
        const { apiFunction, resolve, reject } = apiCallQueue.shift();

        // Update last call time
        lastApiCallTime = Date.now();

        // Execute the API call
        try {
            const result = await apiFunction();
            resolve(result);
        } catch (error) {
            reject(error);
        }
    }

    isProcessingQueue = false;
}

// Set up event listeners
function setupEventListeners() {
    const spaceSelect = document.getElementById('space-select');
    const addButton = document.getElementById('add-project');
    const removeButton = document.getElementById('remove-project');
    const selectAllButton = document.getElementById('select-all');
    const removeAllButton = document.getElementById('remove-all');
    const availableList = document.getElementById('available-projects');
    const selectedList = document.getElementById('selected-projects');
    const regexPreset = document.getElementById('regex-preset');
    const regexInput = document.getElementById('regex-input');
    const deploymentHistoryInput = document.getElementById('deployment-history');
    const goButton = document.getElementById('go-button');

    // Space selection change
    spaceSelect.addEventListener('change', async (e) => {
        const spaceId = e.target.value;
        const spaceName = e.target.selectedOptions[0]?.dataset.spaceName;

        if (spaceId) {
            // Clear selections
            selectedProjectIds.clear();
            availableList.innerHTML = '';
            selectedList.innerHTML = '';
            
            // Load projects for selected space
            await loadProjects(spaceId, spaceName);
            
            // Enable/disable Select All and Remove All buttons based on list contents
            selectAllButton.disabled = availableList.options.length === 0;
            removeAllButton.disabled = selectedList.options.length === 0;
        } else {
            availableList.innerHTML = '';
            selectedList.innerHTML = '';
            allProjects = [];
            selectAllButton.disabled = true;
            removeAllButton.disabled = true;
        }
    });

    // Enable/disable buttons based on selection
    availableList.addEventListener('change', () => {
        addButton.disabled = availableList.selectedOptions.length === 0;
    });

    selectedList.addEventListener('change', () => {
        removeButton.disabled = selectedList.selectedOptions.length === 0;
    });

    // Add project button
    addButton.addEventListener('click', () => {
        const selectedOptions = Array.from(availableList.selectedOptions);
        
        selectedOptions.forEach(option => {
            // Add to selected projects
            selectedProjectIds.add(option.value);
            
            // Move to selected list
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            selectedList.appendChild(newOption);
            
            // Remove from available list
            option.remove();
        });

        // Update button states
        addButton.disabled = true;
        selectAllButton.disabled = availableList.options.length === 0;
        removeAllButton.disabled = selectedList.options.length === 0;
    });

    // Select All button
    selectAllButton.addEventListener('click', () => {
        const allOptions = Array.from(availableList.options);
        
        allOptions.forEach(option => {
            // Add to selected projects
            selectedProjectIds.add(option.value);
            
            // Move to selected list
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            selectedList.appendChild(newOption);
        });

        // Clear available list
        availableList.innerHTML = '';
        
        // Update button states
        selectAllButton.disabled = true;
        addButton.disabled = true;
        removeAllButton.disabled = false;
    });

    // Remove project button
    removeButton.addEventListener('click', () => {
        const selectedOptions = Array.from(selectedList.selectedOptions);
        
        selectedOptions.forEach(option => {
            // Remove from selected projects
            selectedProjectIds.delete(option.value);
            
            // Move back to available list
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            availableList.appendChild(newOption);
            
            // Remove from selected list
            option.remove();
        });

        // Sort available list
        const options = Array.from(availableList.options);
        options.sort((a, b) => a.textContent.localeCompare(b.textContent));
        availableList.innerHTML = '';
        options.forEach(option => availableList.appendChild(option));

        // Update button states
        removeButton.disabled = true;
        selectAllButton.disabled = availableList.options.length === 0;
        removeAllButton.disabled = selectedList.options.length === 0;
    });

    // Remove All button
    removeAllButton.addEventListener('click', () => {
        const allOptions = Array.from(selectedList.options);
        
        allOptions.forEach(option => {
            // Remove from selected projects
            selectedProjectIds.delete(option.value);
            
            // Move back to available list
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            availableList.appendChild(newOption);
        });

        // Clear selected list
        selectedList.innerHTML = '';
        
        // Sort available list
        const options = Array.from(availableList.options);
        options.sort((a, b) => a.textContent.localeCompare(b.textContent));
        availableList.innerHTML = '';
        options.forEach(option => availableList.appendChild(option));
        
        // Update button states
        removeAllButton.disabled = true;
        removeButton.disabled = true;
        selectAllButton.disabled = availableList.options.length === 0;
    });

    // Regex preset selection
    regexPreset.addEventListener('change', (e) => {
        const presetValue = e.target.value;
        if (presetValue) {
            regexInput.value = presetValue;
            saveRegexToStorage(presetValue);
        }
    });

    // Regex input change
    regexInput.addEventListener('input', (e) => {
        const regexValue = e.target.value;
        saveRegexToStorage(regexValue);
        
        // Clear preset selection if user types custom regex
        if (regexValue && regexValue !== regexPreset.value) {
            regexPreset.value = '';
        }
    });

    // Deployment history input change
    deploymentHistoryInput.addEventListener('input', (e) => {
        const historyValue = e.target.value;
        saveDeploymentHistoryToStorage(historyValue);
    });

    // Go button click
    goButton.addEventListener('click', async () => {
        await handleGenerateReportClick();
    });
}

// Load regex from local storage
function loadRegexFromStorage() {
    chrome.storage.local.get(REGEX_STORAGE_KEY, (result) => {
        const savedRegex = result[REGEX_STORAGE_KEY];
        if (savedRegex) {
            const regexInput = document.getElementById('regex-input');
            const regexPreset = document.getElementById('regex-preset');
            
            regexInput.value = savedRegex;
            
            // Check if saved regex matches a preset
            const matchingPreset = Array.from(regexPreset.options).find(
                option => option.value === savedRegex
            );
            
            if (matchingPreset) {
                regexPreset.value = savedRegex;
            }
        }
    });
}

// Save regex to local storage
function saveRegexToStorage(regexValue) {
    chrome.storage.local.set({ [REGEX_STORAGE_KEY]: regexValue }, () => {
        console.log('Regex pattern saved to local storage:', regexValue);
    });
}

// Load deployment history from local storage
function loadDeploymentHistoryFromStorage() {
    chrome.storage.local.get(DEPLOYMENT_HISTORY_STORAGE_KEY, (result) => {
        const savedHistory = result[DEPLOYMENT_HISTORY_STORAGE_KEY];
        if (savedHistory) {
            const deploymentHistoryInput = document.getElementById('deployment-history');
            deploymentHistoryInput.value = savedHistory;
        }
    });
}

// Save deployment history to local storage
function saveDeploymentHistoryToStorage(historyValue) {
    chrome.storage.local.set({ [DEPLOYMENT_HISTORY_STORAGE_KEY]: historyValue }, () => {
        console.log('Deployment history saved to local storage:', historyValue);
    });
}

// Handle Generate Report button click - UI interaction wrapper
async function handleGenerateReportClick() {
    const spaceSelect = document.getElementById('space-select');
    const regexInput = document.getElementById('regex-input');
    const deploymentHistoryInput = document.getElementById('deployment-history');
    const resultsSection = document.getElementById('results-section');
    const progressDiv = document.getElementById('progress');
    const resultsContent = document.getElementById('results-content');

    // Validate inputs
    if (!spaceSelect.value) {
        showError('Please select a space.');
        return;
    }

    if (selectedProjectIds.size === 0) {
        showError('Please select at least one project.');
        return;
    }

    const regexPattern = regexInput.value.trim();
    if (!regexPattern) {
        showError('Please enter a regex pattern.');
        return;
    }

    const deploymentCount = parseInt(deploymentHistoryInput.value) || 3;
    const spaceId = spaceSelect.value;
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];
    const selectedProjects = allProjects.filter(p => selectedProjectIds.has(p.Id));

    // Disable UI elements
    disableUI();

    // Show results section
    resultsSection.style.display = 'block';
    resultsContent.innerHTML = '';
    progressDiv.textContent = 'Generating compliance report...';

    try {
        await generateComplianceReport(
            serverUrl,
            spaceId,
            selectedProjects,
            regexPattern,
            deploymentCount,
            // Progress callback
            (message) => {
                progressDiv.textContent = message;
            },
            // Result callback
            (project, nonCompliantDeployments) => {
                displayProjectResults(project, nonCompliantDeployments);
            }
        );

        progressDiv.textContent = 'Report generation complete.';
    } catch (error) {
        console.error('Error generating compliance report:', error);
        showError('Failed to generate compliance report: ' + error.message);
    } finally {
        // Re-enable UI elements
        enableUI();
    }
}

// Generate compliance report (refactored to be HTML-agnostic)
async function generateComplianceReport(
    serverUrl,
    spaceId,
    projects,
    regexPattern,
    deploymentCount,
    onProgress,
    onProjectResult
) {
    const regex = new RegExp(regexPattern);

    // Fetch environments for name resolution
    onProgress('Loading environments...');
    await fetchEnvironments(serverUrl, spaceId);

    let processedCount = 0;

    for (const project of projects) {
        processedCount++;
        onProgress(`Processing project ${processedCount} of ${projects.length}: ${project.Name}...`);

        const nonCompliantDeployments = [];

        try {
            // Fetch deployments for this project
            const deployments = await fetchDeploymentsForProject(serverUrl, spaceId, project.Id, deploymentCount);

            // Check each deployment's logs
            for (const deployment of deployments) {
                try {
                    const logs = await fetchDeploymentLogs(serverUrl, spaceId, deployment.TaskId);
                    const hasMatch = regex.test(logs);

                    if (!hasMatch) {
                        nonCompliantDeployments.push({
                            id: deployment.Id,
                            version: deployment.ReleaseVersion,
                            environment: deployment.EnvironmentName,
                            created: deployment.Created,
                            taskId: deployment.TaskId
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching logs for deployment ${deployment.Id}:`, error);
                    nonCompliantDeployments.push({
                        id: deployment.Id,
                        version: deployment.ReleaseVersion,
                        environment: deployment.EnvironmentName,
                        created: deployment.Created,
                        taskId: deployment.TaskId,
                        error: 'Failed to fetch logs'
                    });
                }
            }
        } catch (error) {
            console.error(`Error processing project ${project.Name}:`, error);
        }

        // Report results for this project
        onProjectResult(project, nonCompliantDeployments);
    }
}

// Fetch deployments for a project
async function fetchDeploymentsForProject(serverUrl, spaceId, projectId, count) {
    const endpoint = `/api/${spaceId}/deployments?projects=${projectId}&take=${count}`;
    const response = await fetchOctopusApiJson(serverUrl, endpoint);
    
    // Get environment map for name resolution
    const envMap = environmentsCache.get(spaceId) || new Map();
    
    // Fetch release details for each deployment to get version
    const deploymentsWithVersions = await Promise.all(
        response.Items.map(async (deployment) => {
            let releaseVersion = 'Unknown';
            
            try {
                // Fetch the release to get the version
                const release = await fetchRelease(serverUrl, spaceId, deployment.ReleaseId);
                releaseVersion = release.Version;
            } catch (error) {
                console.error(`Error fetching release ${deployment.ReleaseId}:`, error);
                // Fall back to ReleaseId if release fetch fails
                releaseVersion = deployment.ReleaseId;
            }
            
            return {
                Id: deployment.Id,
                ReleaseVersion: releaseVersion,
                EnvironmentName: envMap.get(deployment.EnvironmentId) || deployment.EnvironmentId,
                Created: deployment.Created,
                TaskId: deployment.TaskId
            };
        })
    );
    
    return deploymentsWithVersions;
}

// Fetch a release by ID
async function fetchRelease(serverUrl, spaceId, releaseId) {
    // Create cache key combining space and release ID
    const cacheKey = `${spaceId}:${releaseId}`;
    
    // Return cached release if already fetched
    if (releasesCache.has(cacheKey)) {
        return releasesCache.get(cacheKey);
    }
    
    // Fetch from API
    const endpoint = `/api/${spaceId}/releases/${releaseId}`;
    const release = await fetchOctopusApiJson(serverUrl, endpoint);
    
    // Cache the release
    releasesCache.set(cacheKey, release);
    
    return release;
}

// Fetch deployment logs
async function fetchDeploymentLogs(serverUrl, spaceId, taskId) {
    const endpoint = `/api/${spaceId}/tasks/${taskId}/raw`;
    return await fetchOctopusApiText(serverUrl, endpoint);
}

// Fetch and cache environments for a space
async function fetchEnvironments(serverUrl, spaceId) {
    // Return cached environments if already fetched
    if (environmentsCache.has(spaceId)) {
        return environmentsCache.get(spaceId);
    }

    const endpoint = `/api/${spaceId}/environments/all`;
    const environments = await fetchOctopusApiJson(serverUrl, endpoint);
    
    // Create a map of environment ID to name
    const envMap = new Map();
    environments.forEach(env => {
        envMap.set(env.Id, env.Name);
    });
    
    // Cache the map
    environmentsCache.set(spaceId, envMap);
    
    return envMap;
}

// Display results for a project
function displayProjectResults(project, nonCompliantDeployments) {
    const resultsContent = document.getElementById('results-content');
    
    const projectDiv = document.createElement('div');
    projectDiv.className = 'project-result';
    
    const projectTitle = document.createElement('h3');
    projectTitle.textContent = project.Name;
    projectDiv.appendChild(projectTitle);

    if (nonCompliantDeployments.length === 0) {
        const noIssuesDiv = document.createElement('div');
        noIssuesDiv.className = 'no-issues';
        noIssuesDiv.textContent = '✓ All deployments contain the required change request reference.';
        projectDiv.appendChild(noIssuesDiv);
    } else {
        const issuesTitle = document.createElement('p');
        issuesTitle.style.marginBottom = '10px';
        issuesTitle.style.fontWeight = '600';
        issuesTitle.textContent = `${nonCompliantDeployments.length} deployment(s) missing change request reference:`;
        projectDiv.appendChild(issuesTitle);

        nonCompliantDeployments.forEach(deployment => {
            const deploymentDiv = document.createElement('div');
            deploymentDiv.className = 'deployment-item';
            
            const versionSpan = document.createElement('div');
            versionSpan.className = 'deployment-version';
            versionSpan.textContent = `Version: ${deployment.version}`;
            deploymentDiv.appendChild(versionSpan);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'deployment-info';
            
            if (deployment.error) {
                infoDiv.textContent = `Environment: ${deployment.environment} | Error: ${deployment.error}`;
            } else {
                const date = new Date(deployment.created).toLocaleString();
                infoDiv.textContent = `Environment: ${deployment.environment} | Deployed: ${date}`;
            }
            
            deploymentDiv.appendChild(infoDiv);
            projectDiv.appendChild(deploymentDiv);
        });
    }

    resultsContent.appendChild(projectDiv);
}

// Disable all UI elements
function disableUI() {
    document.getElementById('space-select').disabled = true;
    document.getElementById('available-projects').disabled = true;
    document.getElementById('selected-projects').disabled = true;
    document.getElementById('add-project').disabled = true;
    document.getElementById('select-all').disabled = true;
    document.getElementById('remove-all').disabled = true;
    document.getElementById('remove-project').disabled = true;
    document.getElementById('regex-preset').disabled = true;
    document.getElementById('regex-input').disabled = true;
    document.getElementById('deployment-history').disabled = true;
    document.getElementById('go-button').disabled = true;
}

// Enable all UI elements
function enableUI() {
    const availableList = document.getElementById('available-projects');
    const selectedList = document.getElementById('selected-projects');
    
    document.getElementById('space-select').disabled = false;
    document.getElementById('available-projects').disabled = false;
    document.getElementById('selected-projects').disabled = false;
    document.getElementById('add-project').disabled = false;
    document.getElementById('select-all').disabled = availableList.options.length === 0;
    document.getElementById('remove-all').disabled = selectedList.options.length === 0;
    document.getElementById('remove-project').disabled = false;
    document.getElementById('regex-preset').disabled = false;
    document.getElementById('regex-input').disabled = false;
    document.getElementById('deployment-history').disabled = false;
    document.getElementById('go-button').disabled = false;
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

