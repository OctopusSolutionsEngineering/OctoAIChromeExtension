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

// Safety limit to prevent excessive API calls when generating reports
// This caps the total number of deployments whose logs will be fetched in a single run.
const MAX_DEPLOYMENTS_TO_PROCESS = 500;
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

        // Get default space and project
        const defaults = getDefaultSpaceAndProject();
        
        // Store default project for later use
        if (defaults.project) {
            defaultProjectToSelect = defaults.project;
        }

        // Set up event listeners
        setupEventListeners();

        // Load saved regex from local storage
        loadRegexFromStorage();
        
        // Load saved deployment history from local storage
        loadDeploymentHistoryFromStorage();

        // Load spaces and select default if available
        await loadSpaces(defaults.space);
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

 /**
  * Hides and clears the error banner shown by showError().
  * This ensures stale errors are not visible when the user retries
  * or after a successful report generation.
  */
 function hideError() {
     const errorBanner = document.getElementById('error-message');
     if (errorBanner) {
         errorBanner.classList.remove('show');
         errorBanner.textContent = '';
     }
 }

// Get default space and project from URL params or dashboard config context
function getDefaultSpaceAndProject() {
    const urlParams = getUrlParams();
    
    // URL params take precedence over config context
    const defaultSpace = urlParams.space || dashboardConfig.context?.space;
    const defaultProject = urlParams.project || dashboardConfig.context?.project;
    
    return {
        space: defaultSpace,
        project: defaultProject
    };
}

// Load spaces from Octopus
async function loadSpaces(defaultSpace) {
    const spaceSelect = document.getElementById('space-select');
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];

    try {
        const spaces = await fetchOctopusApiJson(serverUrl, '/api/spaces/all');

        // Clear existing options and add the default option
        spaceSelect.textContent = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Select a space --';
        spaceSelect.appendChild(defaultOption);

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
async function loadProjects(spaceId) {
    const availableList = document.getElementById('available-projects');
    const selectedList = document.getElementById('selected-projects');
    const loading = document.getElementById('loading');
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];

    try {
        // Show loading indicator
        loading.classList.add('show');
        availableList.textContent = '';

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

        // Update warning visibility
        updateNoProjectsWarning();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();

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
                const error = new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
                // Attach HTTP status information so retryApiCall can decide whether to retry
                error.status = apiResponse.status;
                error.statusText = apiResponse.statusText;
                throw error;
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
                const error = new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
                // Attach HTTP status information so retryApiCall can decide whether to retry
                error.status = apiResponse.status;
                error.statusText = apiResponse.statusText;
                throw error;
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
        // Fail fast for non-retryable HTTP status codes (e.g., auth failures and 404s)
        const status = error && typeof error.status === 'number' ? error.status : null;
        if (status === 400 || status === 401 || status === 403 || status === 404) {
            console.error(`Non-retryable API error (status ${status}). Failing fast without retries.`, error.message);
            throw error;
        }

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

        if (spaceId) {
            // Clear selections
            selectedProjectIds.clear();
            availableList.textContent = '';
            selectedList.textContent = '';
            
            // Load projects for selected space
            await loadProjects(spaceId);
            
            // Enable/disable Select All and Remove All buttons based on list contents
            selectAllButton.disabled = availableList.options.length === 0;
            removeAllButton.disabled = selectedList.options.length === 0;
            
            // Update warning visibility
            updateNoProjectsWarning();
            
            // Update Generate Report button state
            updateGenerateReportButtonState();
        } else {
            availableList.textContent = '';
            selectedList.textContent = '';
            allProjects = [];
            selectAllButton.disabled = true;
            removeAllButton.disabled = true;
            updateNoProjectsWarning();
            updateGenerateReportButtonState();
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
        
        // Update warning visibility
        updateNoProjectsWarning();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();
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
        availableList.textContent = '';
        
        // Update button states
        selectAllButton.disabled = true;
        addButton.disabled = true;
        removeAllButton.disabled = false;
        
        // Update warning visibility
        updateNoProjectsWarning();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();
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
        availableList.textContent = '';
        options.forEach(option => availableList.appendChild(option));

        // Update button states
        removeButton.disabled = true;
        selectAllButton.disabled = availableList.options.length === 0;
        removeAllButton.disabled = selectedList.options.length === 0;
        
        // Update warning visibility
        updateNoProjectsWarning();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();
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
        selectedList.textContent = '';
        
        // Sort available list
        const options = Array.from(availableList.options);
        options.sort((a, b) => a.textContent.localeCompare(b.textContent));
        availableList.textContent = '';
        options.forEach(option => availableList.appendChild(option));
        
        // Update button states
        removeAllButton.disabled = true;
        removeButton.disabled = true;
        selectAllButton.disabled = availableList.options.length === 0;
        
        // Update warning visibility
        updateNoProjectsWarning();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();
    });

    // Regex preset selection
    regexPreset.addEventListener('change', (e) => {
        const presetValue = e.target.value;
        if (presetValue) {
            regexInput.value = presetValue;
            saveRegexToStorage(presetValue);
            validateRegex();
            updateGenerateReportButtonState();
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
        
        // Validate regex
        validateRegex();
        
        // Update Generate Report button state
        updateGenerateReportButtonState();
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
    // Use window.localStorage instead of chrome.storage.local to avoid
    // depending on the Chrome extensions API from within the dashboard.
    const savedRegex = window.localStorage
        ? window.localStorage.getItem(REGEX_STORAGE_KEY)
        : null;

    if (savedRegex) {
        const regexInput = document.getElementById('regex-input');
        const regexPreset = document.getElementById('regex-preset');

        if (regexInput) {
            regexInput.value = savedRegex;
        }

        if (regexPreset) {
            // Check if saved regex matches a preset
            const matchingPreset = Array.from(regexPreset.options).find(
                option => option.value === savedRegex
            );

            if (matchingPreset) {
                regexPreset.value = savedRegex;
            }
        }

        // Validate the loaded regex
        validateRegex();

        // Update Generate Report button state
        updateGenerateReportButtonState();
    }
}

// Save regex to local storage
function saveRegexToStorage(regexValue) {
    if (window.localStorage) {
        window.localStorage.setItem(REGEX_STORAGE_KEY, regexValue);
        console.log('Regex pattern saved to local storage:', regexValue);
    } else {
        console.warn('Local storage is not available; regex pattern was not persisted.');
    }
}

// Load deployment history from local storage
function loadDeploymentHistoryFromStorage() {
    const savedHistory = window.localStorage
        ? window.localStorage.getItem(DEPLOYMENT_HISTORY_STORAGE_KEY)
        : null;

    if (savedHistory) {
        const deploymentHistoryInput = document.getElementById('deployment-history');
        if (deploymentHistoryInput) {
            deploymentHistoryInput.value = savedHistory;
        }
    }
}

// Save deployment history to local storage
function saveDeploymentHistoryToStorage(historyValue) {
    if (window.localStorage) {
        window.localStorage.setItem(DEPLOYMENT_HISTORY_STORAGE_KEY, historyValue);
        console.log('Deployment history saved to local storage:', historyValue);
    } else {
        console.warn('Local storage is not available; deployment history was not persisted.');
    }
}

// Handle Generate Report button click - UI interaction wrapper
async function handleGenerateReportClick() {
    const spaceSelect = document.getElementById('space-select');
    const regexInput = document.getElementById('regex-input');
    const deploymentHistoryInput = document.getElementById('deployment-history');
    const resultsSection = document.getElementById('results-section');
    const progressDiv = document.getElementById('progress');
    const resultsContent = document.getElementById('results-content');
    const summaryDiv = document.getElementById('summary');

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

    const rawDeploymentCount = deploymentHistoryInput.value.trim();
    const MAX_DEPLOYMENTS_PER_PROJECT = 25;
    let deploymentCount;
    
    if (rawDeploymentCount === '') {
        // Preserve existing default behavior when no value is entered
        deploymentCount = 3;
    } else {
        deploymentCount = parseInt(rawDeploymentCount, 10);
        if (!Number.isInteger(deploymentCount) || deploymentCount < 1) {
            showError('Please enter a valid number of deployments (1 or more).');
            return;
        }
        if (deploymentCount > MAX_DEPLOYMENTS_PER_PROJECT) {
            showError(`Deployment history cannot exceed ${MAX_DEPLOYMENTS_PER_PROJECT} deployments per project. Please enter a smaller number.`);
            return;
        }
    }

    const spaceId = spaceSelect.value;
    const serverUrl = dashboardConfig.lastServerUrl || dashboardConfig.serverUrls[0];
    const selectedProjects = allProjects.filter(p => selectedProjectIds.has(p.Id));

    // Disable UI elements
    disableUI();
    hideError();

    // Show results section
    resultsSection.style.display = 'block';
    resultsContent.textContent = '';
    summaryDiv.textContent = '';
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
            (project, nonCompliantDeployments, projectTotalDeployments) => {
                displayProjectResults(project, nonCompliantDeployments, projectTotalDeployments, serverUrl, spaceId);
            },
            // Summary callback
            (summary) => {
                displaySummary(summary);
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

// Basic safety checks for user-supplied regular expressions to reduce
// the risk of catastrophic backtracking on large log inputs.
function isSafeRegexPattern(pattern) {
    if (typeof pattern !== 'string') {
        return false;
    }

    // Limit pattern length to avoid extremely large expressions.
    const MAX_PATTERN_LENGTH = 500;
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return false;
    }

    // Heuristic checks for nested quantifiers that commonly cause
    // catastrophic backtracking, such as (.*)+, (.+)+, or quantified
    // groups that themselves contain quantified subpatterns.
    const nestedWildcardQuantifiers = /\((?:[^()]*?)(?:\.\*|\.\+)(?:[^()]*)\)(?:\+|\*|\{)/;
    const nestedGroupQuantifiers = /\((?:[^()]*?)(?:\+|\*|\{[^}]*\})(?:[^()]*)\)(?:\+|\*|\{)/;

    if (nestedWildcardQuantifiers.test(pattern) || nestedGroupQuantifiers.test(pattern)) {
        return false;
    }

    return true;
}

/**
 * Check a single deployment for compliance against a regex pattern.
 * Returns an object indicating whether the deployment is compliant and any error encountered.
 */
async function checkDeploymentCompliance(deployment, regex, serverUrl, spaceId) {
    try {
        const logs = await fetchDeploymentLogs(serverUrl, spaceId, deployment.TaskId);
        const hasMatch = regex.test(logs);
        
        return {
            compliant: hasMatch,
            deployment: deployment,
            error: null
        };
    } catch (error) {
        console.error(`Error fetching logs for deployment ${deployment.Id}:`, error);
        return {
            compliant: false,
            deployment: deployment,
            error: 'Failed to fetch logs'
        };
    }
}

/**
 * Process a single project and check all its deployments for compliance.
 * Returns statistics and non-compliant deployments for the project.
 */
async function processProjectCompliance(project, regex, serverUrl, spaceId, deploymentCount, remainingDeploymentBudget) {
    const projectNonCompliantDeployments = [];
    let projectCompliantCount = 0;
    let projectNonCompliantCount = 0;
    let projectTotalDeployments = 0;
    let reachedLimit = false;

    try {
        // Fetch deployments for this project
        const deployments = await fetchDeploymentsForProject(serverUrl, spaceId, project.Id, deploymentCount);

        // Check each deployment's logs
        for (const deployment of deployments) {
            // Check if we've reached the global deployment limit
            if (projectTotalDeployments >= remainingDeploymentBudget) {
                reachedLimit = true;
                break;
            }

            projectTotalDeployments++;

            const result = await checkDeploymentCompliance(deployment, regex, serverUrl, spaceId);

            if (result.compliant) {
                projectCompliantCount++;
            } else {
                projectNonCompliantCount++;
                projectNonCompliantDeployments.push({
                    id: result.deployment.Id,
                    version: result.deployment.ReleaseVersion,
                    environment: result.deployment.EnvironmentName,
                    created: result.deployment.Created,
                    taskId: result.deployment.TaskId,
                    error: result.error
                });
            }
        }
    } catch (error) {
        console.error(`Error processing project ${project.Name}:`, error);

        // If this looks like an authentication/authorization failure,
        // rethrow so the caller can display a clear error
        const status =
            (error && (error.status || error.statusCode)) ||
            (error && error.response && error.response.status);
        if (status === 401 || status === 403) {
            throw error;
        }
    }

    return {
        nonCompliantDeployments: projectNonCompliantDeployments,
        totalDeployments: projectTotalDeployments,
        compliantCount: projectCompliantCount,
        nonCompliantCount: projectNonCompliantCount,
        reachedLimit: reachedLimit
    };
}

async function generateComplianceReport(
    serverUrl,
    spaceId,
    projects,
    regexPattern,
    deploymentCount,
    onProgress,
    onProjectResult,
    onSummary
) {
    // Validate regex pattern safety
    if (!isSafeRegexPattern(regexPattern)) {
        throw new Error(
            'The provided regular expression is too complex or potentially unsafe. ' +
            'Please simplify the pattern and try again.'
        );
    }

    // Create regex object
    let regex;
    try {
        regex = new RegExp(regexPattern);
    } catch (e) {
        throw new Error('The provided regular expression is invalid: ' + (e && e.message ? e.message : String(e)));
    }

    // Fetch environments for name resolution
    onProgress('Loading environments...');
    await fetchEnvironments(serverUrl, spaceId);

    // Initialize statistics
    const stats = {
        totalDeployments: 0,
        compliantDeployments: 0,
        nonCompliantDeployments: 0
    };

    const skippedProjects = [];
    let processedCount = 0;
    let remainingDeploymentBudget = MAX_DEPLOYMENTS_TO_PROCESS;

    // Process each project
    for (const project of projects) {
        // Check if we've exhausted our deployment budget
        if (remainingDeploymentBudget <= 0) {
            skippedProjects.push(project.Name);
            continue;
        }

        processedCount++;
        onProgress(`Processing project ${processedCount} of ${projects.length}: ${project.Name}...`);

        // Process the project
        const projectResult = await processProjectCompliance(
            project,
            regex,
            serverUrl,
            spaceId,
            deploymentCount,
            remainingDeploymentBudget
        );

        // Update statistics
        stats.totalDeployments += projectResult.totalDeployments;
        stats.compliantDeployments += projectResult.compliantCount;
        stats.nonCompliantDeployments += projectResult.nonCompliantCount;
        
        // Update remaining budget
        remainingDeploymentBudget -= projectResult.totalDeployments;

        // Report results for this project
        onProjectResult(project, projectResult.nonCompliantDeployments, projectResult.totalDeployments);

        // If this project hit the limit, stop processing
        if (projectResult.reachedLimit) {
            // Add remaining projects to skipped list
            for (let i = processedCount; i < projects.length; i++) {
                skippedProjects.push(projects[i].Name);
            }
            break;
        }
    }

    // Display warning if deployment limit was reached
    if (skippedProjects.length > 0) {
        onProgress(
            `Stopped processing after ${stats.totalDeployments} deployments (limit ${MAX_DEPLOYMENTS_TO_PROCESS} reached). ` +
            `Skipped ${skippedProjects.length} project(s): ${skippedProjects.join(', ')}.`
        );
    }
    
    // Report overall summary
    onSummary({
        total: stats.totalDeployments,
        compliant: stats.compliantDeployments,
        nonCompliant: stats.nonCompliantDeployments,
        partial: skippedProjects.length > 0,
        skippedProjects: skippedProjects
    });
}

// Fetch deployments for a project
async function fetchDeploymentsForProject(serverUrl, spaceId, projectId, count) {
    const endpoint = `/api/${spaceId}/deployments?projects=${projectId}&take=${count}`;
    const response = await fetchOctopusApiJson(serverUrl, endpoint);
    
    // Get environment map for name resolution
    const envMap = environmentsCache.get(spaceId) || new Map();
    
    // Derive release version for each deployment, only fetching the release when needed
    const deploymentsWithVersions = await Promise.all(
        response.Items.map(async (deployment) => {
            // Prefer any version already provided on the deployment
            let releaseVersion = deployment.ReleaseVersion || 'Unknown';
            
            // Only fetch the release if the deployment doesn't already include a usable version
            if (!deployment.ReleaseVersion) {
                try {
                    // Fetch the release to get the version
                    const release = await fetchRelease(serverUrl, spaceId, deployment.ReleaseId);
                    if (release && release.Version) {
                        releaseVersion = release.Version;
                    } else {
                        // Fall back to ReleaseId if release or version is unavailable
                        releaseVersion = deployment.ReleaseId;
                    }
                } catch (error) {
                    console.error(`Error fetching release ${deployment.ReleaseId}:`, error);
                    // Fall back to ReleaseId if release fetch fails
                    releaseVersion = deployment.ReleaseId;
                }
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
function displayProjectResults(project, nonCompliantDeployments, projectTotalDeployments, serverUrl, spaceId) {
    const resultsContent = document.getElementById('results-content');
    
    const projectDiv = document.createElement('div');
    projectDiv.className = 'project-result';
    
    const projectTitle = document.createElement('h3');
    projectTitle.textContent = project.Name;
    projectDiv.appendChild(projectTitle);

    if (nonCompliantDeployments.length === 0) {
        const noIssuesDiv = document.createElement('div');
        noIssuesDiv.className = 'no-issues';
        noIssuesDiv.textContent = `✓ All ${projectTotalDeployments} deployment(s) contain the required change request reference.`;
        projectDiv.appendChild(noIssuesDiv);
    } else {
        const issuesTitle = document.createElement('p');
        issuesTitle.style.marginBottom = '10px';
        issuesTitle.style.fontWeight = '600';
        issuesTitle.textContent = `${nonCompliantDeployments.length} out of ${projectTotalDeployments} deployment(s) missing change request reference:`;
        projectDiv.appendChild(issuesTitle);

        nonCompliantDeployments.forEach(deployment => {
            const deploymentDiv = document.createElement('div');
            deploymentDiv.className = 'deployment-item';
            
            // Create link to deployment in Octopus web UI
            const deploymentLink = document.createElement('a');
            deploymentLink.href = `${serverUrl}/app#/${spaceId}/deployments/${deployment.id}`;
            deploymentLink.target = '_blank';
            deploymentLink.rel = 'noopener noreferrer';
            deploymentLink.className = 'deployment-link';
            deploymentLink.textContent = `Version: ${deployment.version}`;
            deploymentDiv.appendChild(deploymentLink);

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

// Display overall summary statistics
function displaySummary(summary) {
    const summaryDiv = document.getElementById('summary');
    
    // Calculate percentage
    const compliantPercentage = summary.total > 0 
        ? Math.round((summary.compliant / summary.total) * 100) 
        : 0;
    
    // Clear any existing content safely
    summaryDiv.textContent = '';

    // Create container for summary statistics
    const summaryStatsDiv = document.createElement('div');
    summaryStatsDiv.className = 'summary-stats';

    // Total deployments stat
    const totalStatItem = document.createElement('div');
    totalStatItem.className = 'stat-item';

    const totalLabel = document.createElement('div');
    totalLabel.className = 'stat-label';
    totalLabel.textContent = 'Total Deployments';

    const totalValue = document.createElement('div');
    totalValue.className = 'stat-value';
    totalValue.textContent = String(summary.total);

    totalStatItem.appendChild(totalLabel);
    totalStatItem.appendChild(totalValue);

    // Compliant stat
    const compliantStatItem = document.createElement('div');
    compliantStatItem.className = 'stat-item compliant';

    const compliantLabel = document.createElement('div');
    compliantLabel.className = 'stat-label';
    compliantLabel.textContent = 'Compliant';

    const compliantValue = document.createElement('div');
    compliantValue.className = 'stat-value';
    compliantValue.textContent = String(summary.compliant);

    const compliantPercentageDiv = document.createElement('div');
    compliantPercentageDiv.className = 'stat-percentage';
    compliantPercentageDiv.textContent = `${compliantPercentage}% with change request`;

    compliantStatItem.appendChild(compliantLabel);
    compliantStatItem.appendChild(compliantValue);
    compliantStatItem.appendChild(compliantPercentageDiv);

    // Non-compliant stat
    const nonCompliantStatItem = document.createElement('div');
    nonCompliantStatItem.className = 'stat-item non-compliant';

    const nonCompliantLabel = document.createElement('div');
    nonCompliantLabel.className = 'stat-label';
    nonCompliantLabel.textContent = 'Non-Compliant';

    const nonCompliantValue = document.createElement('div');
    nonCompliantValue.className = 'stat-value';
    nonCompliantValue.textContent = String(summary.nonCompliant);

    const nonCompliantPercentageDiv = document.createElement('div');
    nonCompliantPercentageDiv.className = 'stat-percentage';
    nonCompliantPercentageDiv.textContent = `${100 - compliantPercentage}% missing`;

    nonCompliantStatItem.appendChild(nonCompliantLabel);
    nonCompliantStatItem.appendChild(nonCompliantValue);
    nonCompliantStatItem.appendChild(nonCompliantPercentageDiv);

    // Assemble the summary stats container
    summaryStatsDiv.appendChild(totalStatItem);
    summaryStatsDiv.appendChild(compliantStatItem);
    summaryStatsDiv.appendChild(nonCompliantStatItem);

    // Add to the summary container
    summaryDiv.appendChild(summaryStatsDiv);
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

    // Enable/disable project action buttons based on current list state
    const hasAvailableSelection = availableList && availableList.selectedOptions && availableList.selectedOptions.length > 0;
    const hasSelectedSelection = selectedList && selectedList.selectedOptions && selectedList.selectedOptions.length > 0;

    document.getElementById('add-project').disabled = !hasAvailableSelection;
    document.getElementById('select-all').disabled = !availableList || availableList.options.length === 0;
    document.getElementById('remove-all').disabled = !selectedList || selectedList.options.length === 0;
    document.getElementById('remove-project').disabled = !hasSelectedSelection;

    document.getElementById('regex-preset').disabled = false;
    document.getElementById('regex-input').disabled = false;
    document.getElementById('deployment-history').disabled = false;

    // Recompute Generate Report button state based on current projects and regex
    updateGenerateReportButtonState();
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

// Update the no projects warning visibility
function updateNoProjectsWarning() {
    const warningDiv = document.getElementById('no-projects-warning');
    if (selectedProjectIds.size === 0) {
        warningDiv.style.display = 'block';
    } else {
        warningDiv.style.display = 'none';
    }
}

// Validate regex and update warning visibility
function validateRegex() {
    const regexInput = document.getElementById('regex-input');
    const warningDiv = document.getElementById('regex-warning');
    const regexValue = regexInput.value.trim();
    
    // Check if empty
    if (!regexValue) {
        warningDiv.style.display = 'block';
        return false;
    }
    
    // Check if valid regex
    try {
        new RegExp(regexValue);
        warningDiv.style.display = 'none';
        return true;
    } catch (e) {
        warningDiv.style.display = 'block';
        return false;
    }
}

// Update Generate Report button state based on warnings
function updateGenerateReportButtonState() {
    const goButton = document.getElementById('go-button');
    const hasProjects = selectedProjectIds.size > 0;
    const hasValidRegex = validateRegex();
    
    // Disable button if there are any warnings
    goButton.disabled = !hasProjects || !hasValidRegex;
}

