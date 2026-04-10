const DEFAULT_REPORTING_PERIOD_DAYS = 90;

const OSFI_PROMPT_TEMPLATE = `# OSFI Compliance Evidence Report

You are preparing evidence for an OSFI audit based on Octopus Deploy project and deployment information.
The audience is OSFI examiners, internal audit, and risk officers at federally regulated institutions.

## Guardrails

- Read only: do not suggest changes that mutate Octopus Deploy state.
- No invented evidence: if data is missing, say "Insufficient data - recommend manual review".
- No secrets in output: never include secret values.
- Respect the reporting period supplied below.

## Scope Inputs

- Space: {{SPACE_NAME}}
- Project: {{PROJECT_NAME}}
- Reporting period (days): {{REPORTING_PERIOD_DAYS}}
- Institution: {{INSTITUTION_NAME}}

If an input is unavailable, state that in the report and continue with available evidence.

## Required Analysis

1. Deployment history and frequency over the reporting period.
2. Change approval evidence for production deployments.
3. Segregation of duties observations.
4. Environment promotion controls.
5. Secret and configuration management posture.
6. Deployment target health and inventory observations.
7. Operational resilience indicators (including recovery and rollback capability).

## OSFI Mapping Requirements

Map evidence to:
- B-10 Third-Party Risk Management
- E-21 Operational Resilience

## Report Format

Return markdown only in this structure:

1. Title line: "OSFI Compliance Evidence Report for Project \"{{PROJECT_NAME}}\" in Space \"{{SPACE_NAME}}\""
2. Report metadata table including institution, reporting period, report date, and prepared-by notice.
3. Executive summary.
4. B-10 section with clear observations and control status.
5. E-21 section with clear observations and supporting evidence.
6. Findings summary grouped as Critical Gaps, Observations, and Strengths.
7. Appendix with deployment statistics, approval trail, target inventory, and variable summary.

Formatting requirements:
- Use valid GitHub-flavored markdown.
- When using markdown tables, do not insert blank lines between the header row, separator row, and data rows.
- Keep table rows contiguous so they render as actual HTML tables.

Use concise language and include "Insufficient data - recommend manual review" for any section without enough evidence.`;

function normalizeContextValue(value) {
    if (!value) {
        return "Not provided";
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return "Not provided";
    }

    if (/^#\{[^}]+\}$/.test(trimmed)) {
        return "Not provided";
    }

    return trimmed;
}

function parseReportingPeriod(rawValue) {
    const trimmed = String(rawValue ?? "").trim();
    if (!/^[1-9]\d*$/.test(trimmed)) {
        return DEFAULT_REPORTING_PERIOD_DAYS;
    }

    return Number(trimmed);
}

function buildShareUrl(currentHref, params) {
    const url = new URL(currentHref);
    if (params.space) {
        url.searchParams.set("space", params.space);
    }
    if (params.project) {
        url.searchParams.set("project", params.project);
    }
    url.searchParams.set("days", String(parseReportingPeriod(params.days)));
    return url.toString();
}

function parseUrlParams(search) {
    const params = new URLSearchParams(search || "");
    return {
        space: params.get("space"),
        project: params.get("project"),
        days: params.get("days")
    };
}

function buildOsfiPrompt({ spaceName, projectName, reportingPeriodDays, institutionName }) {
    return OSFI_PROMPT_TEMPLATE
        .replaceAll("{{SPACE_NAME}}", normalizeContextValue(spaceName))
        .replaceAll("{{PROJECT_NAME}}", normalizeContextValue(projectName))
        .replaceAll("{{REPORTING_PERIOD_DAYS}}", String(parseReportingPeriod(reportingPeriodDays)))
        .replaceAll("{{INSTITUTION_NAME}}", normalizeContextValue(institutionName));
}

function isMarkdownTableLine(line) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) {
        return false;
    }

    if (/^\|.*\|$/.test(trimmed)) {
        return true;
    }

    return /^:?-{3,}:?(\s*\|\s*:?-{3,}:?)+$/.test(trimmed.replace(/^\|/, "").replace(/\|$/, ""));
}

function normalizeGeneratedMarkdown(markdown) {
    const lines = String(markdown ?? "").split("\n");
    const normalized = [];
    let nextNonEmptyIndex = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const previousLine = normalized[normalized.length - 1];

        if (nextNonEmptyIndex <= index) {
            nextNonEmptyIndex = index + 1;
        }
        while (nextNonEmptyIndex < lines.length && lines[nextNonEmptyIndex].trim() === "") {
            nextNonEmptyIndex += 1;
        }
        const nextNonEmptyLine = nextNonEmptyIndex < lines.length ? lines[nextNonEmptyIndex] : "";

        if (line.trim() === "") {
            if (isMarkdownTableLine(previousLine) && isMarkdownTableLine(nextNonEmptyLine)) {
                continue;
            }

            normalized.push(line);
            continue;
        }

        if (isMarkdownTableLine(line) && previousLine && previousLine.trim() !== "" && !isMarkdownTableLine(previousLine)) {
            normalized.push("");
        }

        normalized.push(line);
    }

    return normalized.join("\n");
}

async function fetchFromOctopus(serverUrl, endpoint) {
    try {
        const response = await fetch(new URL(endpoint, serverUrl), {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error("Authentication failed. Please sign in to Octopus Deploy.");
        }

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching from Octopus:", error);
        throw error;
    }
}

async function populateSpaces(serverUrl, defaultSpace) {
    const spaceSelect = document.getElementById("space-select");

    const spaces = await fetchFromOctopus(serverUrl, "/api/spaces/all");
    spaceSelect.textContent = "";
    spaceSelect.disabled = false;

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "-- Select a space --";
    spaceSelect.appendChild(placeholderOption);

    spaces.forEach((space) => {
        const option = document.createElement("option");
        option.value = space.Id;
        option.textContent = space.Name;
        option.dataset.name = space.Name;
        spaceSelect.appendChild(option);
    });

    if (defaultSpace) {
        const matchingOption = Array.from(spaceSelect.options).find(
            (opt) => opt.dataset.name === defaultSpace || opt.value === defaultSpace
        );

        if (matchingOption) {
            spaceSelect.value = matchingOption.value;
        }
    }

    return spaceSelect.value;
}

async function populateProjects(serverUrl, spaceId, defaultProject) {
    const projectSelect = document.getElementById("project-select");

    if (!spaceId) {
        projectSelect.textContent = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a space first...";
        projectSelect.appendChild(placeholder);
        projectSelect.disabled = true;
        return;
    }

    const projects = await fetchFromOctopus(serverUrl, `/api/${spaceId}/projects/all`);
    projectSelect.textContent = "";
    projectSelect.disabled = false;

    projects.forEach((project) => {
        const option = document.createElement("option");
        option.value = project.Id;
        option.textContent = project.Name;
        option.dataset.name = project.Name;
        projectSelect.appendChild(option);
    });

    if (defaultProject) {
        const matchingOption = Array.from(projectSelect.options).find(
            (opt) => opt.dataset.name === defaultProject || opt.value === defaultProject
        );

        if (matchingOption) {
            projectSelect.value = matchingOption.value;
        }
    }

    document.getElementById("generate-report-btn").disabled = !projectSelect.value;
    document.getElementById("copy-link-btn").disabled = !projectSelect.value;
}

let isGenerating = false;

function renderReportHtml(reportEl, html) {
    reportEl.innerHTML = DOMPurify.sanitize(html);
}

async function copyLinkToClipboard() {
    const spaceSelect = document.getElementById("space-select");
    const projectSelect = document.getElementById("project-select");
    const reportingPeriodInput = document.getElementById("reporting-period");
    const copyButton = document.getElementById("copy-link-btn");

    const selectedSpace = spaceSelect.options[spaceSelect.selectedIndex];
    const selectedProject = projectSelect.options[projectSelect.selectedIndex];
    if (!selectedSpace || !selectedProject) {
        return;
    }

    const shareUrl = buildShareUrl(window.location.href, {
        space: selectedSpace.dataset.name,
        project: selectedProject.dataset.name,
        days: reportingPeriodInput.value
    });

    const restoreCopyButtonState = (originalText) => {
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.disabled = !projectSelect.value;
        }, 1500);
    };

    try {
        await navigator.clipboard.writeText(shareUrl);
        const originalText = copyButton.textContent;
        copyButton.textContent = "Copied";
        copyButton.disabled = true;
        restoreCopyButtonState(originalText);
    } catch (error) {
        console.error("Failed to copy link:", error);
        const originalText = copyButton.textContent;
        copyButton.textContent = "Copy Failed";
        restoreCopyButtonState(originalText);
    }
}

async function generateReport(serverUrl, institutionName) {
    if (isGenerating) {
        return;
    }

    const reportEl = document.getElementById("report");
    const spaceSelect = document.getElementById("space-select");
    const projectSelect = document.getElementById("project-select");
    const reportingPeriodInput = document.getElementById("reporting-period");
    const generateButton = document.getElementById("generate-report-btn");

    const selectedSpace = spaceSelect.options[spaceSelect.selectedIndex];
    const selectedProject = projectSelect.options[projectSelect.selectedIndex];

    if (!selectedSpace || !selectedProject) {
        renderReportHtml(reportEl, `
            <div class="error-message">
                <h3>Selection Required</h3>
                <p>Please select both a space and a project to generate the report.</p>
            </div>
        `);
        return;
    }

    const spaceName = selectedSpace.dataset.name;
    const projectName = selectedProject.dataset.name;
    const reportingPeriodDays = parseReportingPeriod(reportingPeriodInput.value);
    reportingPeriodInput.value = String(reportingPeriodDays);

    isGenerating = true;
    generateButton.disabled = true;
    spaceSelect.disabled = true;
    projectSelect.disabled = true;

    renderReportHtml(reportEl, `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Generating OSFI compliance evidence report for space "${spaceName}", project "${projectName}"...</p>
        </div>
    `);

    try {
        const prompt = buildOsfiPrompt({
            spaceName,
            projectName,
            reportingPeriodDays,
            institutionName
        });

        const result = await dashboardSendPrompt(prompt, serverUrl);

        if (result.state === "Error") {
            renderReportHtml(reportEl, `
                <div class="error-message">
                    <h3>Report Generation Failed</h3>
                    <p>${result.response || "An unknown error occurred."}</p>
                </div>
            `);
            return;
        }

        if (result.state === "Confirmation") {
            renderReportHtml(reportEl, `
                <div class="error-message">
                    <h3>Confirmation Required</h3>
                    <p>The AI Assistant requested a confirmation that is not supported by this dashboard.</p>
                    <p>${result.response || ""}</p>
                </div>
            `);
            return;
        }

        const normalizedMarkdown = normalizeGeneratedMarkdown(result.response || "No response was returned.");
        const htmlContent = marked.parse(normalizedMarkdown, {
            gfm: true
        });
        renderReportHtml(reportEl, htmlContent);
    } catch (error) {
        renderReportHtml(reportEl, `
            <div class="error-message">
                <h3>Error Loading Report</h3>
                <p>Failed to generate the OSFI compliance evidence report.</p>
                <p><strong>Error:</strong> ${error.message || error}</p>
            </div>
        `);
    } finally {
        isGenerating = false;
        spaceSelect.disabled = false;
        projectSelect.disabled = false;
        generateButton.disabled = !projectSelect.value;
        document.getElementById("copy-link-btn").disabled = !projectSelect.value;
    }
}

async function initializeDashboard() {
    const reportEl = document.getElementById("report");
    const spaceSelect = document.getElementById("space-select");
    const projectSelect = document.getElementById("project-select");
    const reportingPeriodInput = document.getElementById("reporting-period");
    const generateButton = document.getElementById("generate-report-btn");
    const copyLinkButton = document.getElementById("copy-link-btn");

    dashboardGetConfig(async (config) => {
        if (!config || !config.lastServerUrl) {
            renderReportHtml(reportEl, `
                <div class="error-message">
                    <h3>Configuration Error</h3>
                    <p>Missing required configuration for the dashboard.</p>
                    <p>Try reopening this dashboard from the Octopus AI Assistant.</p>
                </div>
            `);
            return;
        }

        const serverUrl = config.lastServerUrl;
        const urlParams = parseUrlParams(window.location.search);

        const defaultSpace = urlParams.space || config.context?.space;
        const defaultProject = urlParams.project || config.context?.project;
        const defaultDays = urlParams.days || config.context?.reportingPeriodDays;
        reportingPeriodInput.value = String(parseReportingPeriod(defaultDays));

        try {
            const selectedSpaceId = await populateSpaces(serverUrl, defaultSpace);
            if (selectedSpaceId) {
                await populateProjects(serverUrl, selectedSpaceId, defaultProject);
            }

            spaceSelect.addEventListener("change", async () => {
                try {
                    await populateProjects(serverUrl, spaceSelect.value, null);
                } catch (error) {
                    renderReportHtml(reportEl, `
                        <div class="error-message">
                            <h3>Error Loading Projects</h3>
                            <p>Failed to load projects for the selected space.</p>
                            <p><strong>Error:</strong> ${error.message || error}</p>
                        </div>
                    `);
                    projectSelect.textContent = "";
                    projectSelect.disabled = true;
                    generateButton.disabled = true;
                    copyLinkButton.disabled = true;
                }
            });

            projectSelect.addEventListener("change", () => {
                generateButton.disabled = !projectSelect.value || isGenerating;
                copyLinkButton.disabled = !projectSelect.value;
            });

            generateButton.addEventListener("click", async () => {
                await generateReport(serverUrl, config.context?.institutionName);
            });

            copyLinkButton.addEventListener("click", async () => {
                await copyLinkToClipboard();
            });

            if (defaultSpace && defaultProject && spaceSelect.value && projectSelect.value) {
                await generateReport(serverUrl, config.context?.institutionName);
            } else {
                renderReportHtml(reportEl, `
                    <div class="info-message">
                        <h3>Ready to Generate Report</h3>
                        <p>Select a space and project, then click Generate Report.</p>
                    </div>
                `);
            }
        } catch (error) {
            renderReportHtml(reportEl, `
                <div class="error-message">
                    <h3>Initialization Error</h3>
                    <p>Failed to initialize the dashboard.</p>
                    <p><strong>Error:</strong> ${error.message || error}</p>
                </div>
            `);
        }
    });
}

function bootstrapDashboard() {
    if (typeof document === "undefined" || typeof dashboardGetConfig !== "function") {
        return;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initializeDashboard();
        }, { once: true });
        return;
    }

    initializeDashboard();
}

const isCommonJsRuntime = typeof module !== "undefined" && typeof module.exports !== "undefined";

if (!isCommonJsRuntime) {
    bootstrapDashboard();
}

if (typeof module !== "undefined") {
    module.exports = {
        DEFAULT_REPORTING_PERIOD_DAYS,
        OSFI_PROMPT_TEMPLATE,
        normalizeContextValue,
        parseReportingPeriod,
        parseUrlParams,
        buildShareUrl,
        buildOsfiPrompt,
        isMarkdownTableLine,
        normalizeGeneratedMarkdown,
        initializeDashboard,
        bootstrapDashboard
    };
}
