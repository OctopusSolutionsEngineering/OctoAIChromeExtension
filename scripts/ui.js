function ensureOctoAiStyles(theme) {
    if (document.getElementById('octoai-styles')) {
        return
    }

    const style = document.createElement("style");
    style.id = 'octoai-styles';
    style.textContent = `
        /* ---- Launcher button ---- */
        #octoai {
            position: absolute;
            bottom: 16px;
            right: 16px;
            width: 48px;
            height: 48px;
            padding: 0;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border: 2px solid transparent;
            border-radius: 50%;
            background:
                linear-gradient(${theme.background}, ${theme.background}) padding-box,
                linear-gradient(135deg, ${theme.accentStart}, ${theme.accentEnd}) border-box;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        #octoai:hover {
            transform: translateY(-2px) scale(1.06);
            box-shadow: 0 8px 24px rgba(31, 192, 255, 0.3), 0 4px 16px rgba(0, 0, 0, 0.4);
        }

        #octoai.octoai-dragging {
            transition: none;
            transform: scale(1.12);
            cursor: grabbing;
            box-shadow: 0 12px 32px rgba(31, 192, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        /* ---- Panel ---- */
        #octoai-container {
            font-family: ${theme.fontFamily};
            position: absolute;
            bottom: 16px;
            right: 16px;
            z-index: 1000;
            width: min(800px, calc(100vw - 32px));
            max-height: calc(100% - 32px);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            padding: 20px;
            border: 1px solid rgba(125, 155, 190, 0.16);
            border-radius: 16px;
            background:
                radial-gradient(120% 50% at 50% 0%, rgba(31, 192, 255, 0.07), transparent 60%),
                linear-gradient(180deg, #1E2833 0%, #18212B 100%);
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
            scrollbar-color: ${theme.textSecondary} transparent;
            animation: octoai-pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
        }

        #octoai-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 24px;
            right: 24px;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(31, 192, 255, 0.5), rgba(204, 60, 255, 0.5), transparent);
        }

        #octoai-container *::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        #octoai-container *::-webkit-scrollbar-thumb {
            background: rgba(152, 170, 186, 0.3);
            border-radius: 4px;
        }

        #octoai-container *::-webkit-scrollbar-track {
            background: transparent;
        }

        /* ---- Header ---- */
        #octoai-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 16px 0;
        }

        #octoai-logo {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            flex: none;
            border-radius: 10px;
            border: 1px solid rgba(125, 155, 190, 0.2);
            background: linear-gradient(135deg, rgba(31, 192, 255, 0.14), rgba(204, 60, 255, 0.14));
        }

        #octoai-logo svg {
            width: 22px;
            height: 22px;
        }

        .octoai-title {
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 0.2px;
            color: ${theme.text};
        }

        .octoai-icon-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            flex: none;
            border-radius: 8px;
            color: ${theme.textSecondary};
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
        }

        .octoai-icon-btn:hover {
            background: rgba(152, 170, 186, 0.14);
            color: ${theme.text};
        }

        .octoai-icon-btn svg {
            width: 16px;
            height: 16px;
        }

        .octoai-icon-btn svg path {
            fill: currentColor;
        }

        .octoai-header-spacer {
            margin-left: auto;
        }

        /* ---- Prompt form ---- */
        #octoai-form {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0 0 12px 0;
            padding: 12px;
            border: 1px solid transparent;
            border-radius: 12px;
            background:
                linear-gradient(#161F28, #161F28) padding-box,
                linear-gradient(135deg, rgba(31, 192, 255, 0.55), rgba(204, 60, 255, 0.55)) border-box;
            transition: box-shadow 0.2s ease;
        }

        #octoai-form:focus-within {
            background:
                linear-gradient(#161F28, #161F28) padding-box,
                linear-gradient(135deg, ${theme.accentStart}, ${theme.accentEnd}) border-box;
            box-shadow: 0 0 0 3px rgba(31, 192, 255, 0.12), 0 0 24px rgba(31, 192, 255, 0.08);
        }

        #octoai-input {
            flex: 1;
            min-height: 3.5em;
            background: transparent;
            border: none;
            outline: none;
            resize: vertical;
            color: ${theme.text};
            font-family: inherit;
            font-size: 14px;
            line-height: 1.5;
            caret-color: ${theme.accentStart};
        }

        #octoai-input::placeholder {
            color: rgba(152, 170, 186, 0.7);
        }

        #octoai-submit {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            flex: none;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            background: linear-gradient(135deg, ${theme.accentStart}, ${theme.accentEnd});
            box-shadow: 0 2px 10px rgba(31, 192, 255, 0.35);
            transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
        }

        #octoai-submit:hover:not(:disabled) {
            transform: scale(1.08);
            filter: brightness(1.1);
        }

        #octoai-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        #octoai-submit svg {
            width: 16px;
            height: 16px;
        }

        /* ---- Status pills ---- */
        .octoai-meta {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin: 0 0 14px 0;
        }

        #octoai-region-message {
            font-size: 11px;
            color: ${theme.textSecondary};
            padding: 3px 10px;
            border-radius: 999px;
            border: 1px solid rgba(125, 155, 190, 0.18);
            background: rgba(152, 170, 186, 0.06);
        }

        #octoai-auto-apply-message {
            font-size: 11px;
            color: #FFD28A;
            padding: 3px 10px;
            border-radius: 999px;
            border: 1px solid rgba(255, 193, 94, 0.3);
            background: rgba(255, 193, 94, 0.08);
        }

        /* ---- Suggestions ---- */
        #octoai-examples {
            overflow-y: auto;
            flex-grow: 1;
            margin: 0 -6px;
            padding: 0 6px;
        }

        .octoai-eyebrow {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            color: #7D93A8;
            margin: 2px 2px 10px 2px;
        }

        .octoai-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            box-sizing: border-box;
            padding: 10px 12px;
            margin-bottom: 6px;
            border: 1px solid rgba(125, 155, 190, 0.12);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.02);
            color: ${theme.text};
            font-size: 14px;
            line-height: 1.4;
            text-align: left;
            cursor: pointer;
            overflow: hidden;
            transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
            animation: octoai-item-in 0.35s ease both;
        }

        .octoai-item:hover {
            background: ${theme.backgroundSecondary};
            border-color: rgba(31, 192, 255, 0.35);
            transform: translateX(2px);
        }

        .octoai-item-text {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .octoai-item-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            flex: none;
            border-radius: 6px;
            border: 1px solid rgba(125, 155, 190, 0.18);
            background: linear-gradient(135deg, rgba(31, 192, 255, 0.16), rgba(204, 60, 255, 0.16));
        }

        .octoai-item-icon svg {
            width: 13px;
            height: 13px;
        }

        .octoai-folder::after {
            content: '\\203A';
            flex: none;
            margin-left: auto;
            color: ${theme.textSecondary};
            font-size: 18px;
            line-height: 1;
        }

        .octoai-back {
            display: inline-flex;
            width: auto;
            padding: 6px 14px 6px 10px;
            border-radius: 999px;
            background: transparent;
            font-size: 13px;
            color: ${theme.textSecondary};
        }

        .octoai-back:hover {
            color: ${theme.text};
            transform: none;
        }

        .octoai-back::before {
            content: '\\2039';
            font-size: 18px;
            line-height: 1;
            margin-right: 6px;
        }

        .octoai-go {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            flex: none;
            margin-left: auto;
            opacity: 0.35;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .octoai-go svg {
            display: block;
            width: 18px;
            height: 18px;
        }

        .octoai-item:hover .octoai-go {
            opacity: 1;
        }

        .octoai-go:hover {
            transform: scale(1.15);
        }

        .octoai-badge {
            flex: none;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            padding: 2px 7px;
            border-radius: 999px;
            color: #9FD8FF;
            border: 1px solid rgba(31, 192, 255, 0.25);
            background: linear-gradient(135deg, rgba(31, 192, 255, 0.18), rgba(204, 60, 255, 0.18));
        }

        /* ---- Action buttons (approve/abort/settings) ---- */
        .octoai-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 9px 20px;
            margin: 0 10px 0 0;
            border: 1px solid transparent;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: filter 0.15s ease, background 0.15s ease;
        }

        .octoai-btn-primary {
            background: linear-gradient(135deg, ${theme.accentStart}, ${theme.gradientEnd});
            color: #FFFFFF;
        }

        .octoai-btn-primary:hover {
            filter: brightness(1.1);
        }

        .octoai-btn-ghost {
            background: transparent;
            border-color: rgba(125, 155, 190, 0.3);
            color: ${theme.text};
        }

        .octoai-btn-ghost:hover {
            background: rgba(152, 170, 186, 0.1);
        }

        /* ---- Response / markdown ---- */
        #octoai-response {
            overflow-y: auto;
            max-height: 340px;
            margin: 0 0 16px 0;
            font-size: 14px;
            line-height: 1.55;
        }

        #octoai-container td,
        #octoai-container th,
        #octoai-container p,
        #octoai-container li,
        #octoai-container ul,
        #octoai-container h1,
        #octoai-container h2,
        #octoai-container h3,
        #octoai-container h4,
        #octoai-container h5,
        #octoai-container h6 {
            color: ${theme.text};
        }

        #octoai-container a {
            color: ${theme.link};
        }

        #octoai-container a:hover {
            color: ${theme.text};
        }

        #octoai-response code {
            background: #141C24;
            border-radius: 4px;
            padding: 2px 5px;
            font-size: 12.5px;
        }

        #octoai-response pre {
            background: #141C24;
            border: 1px solid rgba(125, 155, 190, 0.14);
            border-radius: 8px;
            padding: 12px;
            overflow-x: auto;
        }

        #octoai-response pre code {
            background: transparent;
            padding: 0;
        }

        #octoai-response table {
            border-collapse: collapse;
        }

        #octoai-response td,
        #octoai-response th {
            border: 1px solid rgba(125, 155, 190, 0.2);
            padding: 6px 10px;
        }

        .octoai-bubble-wrap {
            display: flex;
            justify-content: flex-end;
            width: 100%;
            margin-bottom: 12px;
        }

        .octoai-bubble {
            position: relative;
            display: inline-block;
            max-height: 5em;
            overflow-y: auto;
            padding: 10px 16px;
            border-radius: 14px 14px 4px 14px;
            border: 1px solid rgba(31, 192, 255, 0.25);
            background: linear-gradient(135deg, rgba(31, 192, 255, 0.16), rgba(204, 60, 255, 0.16));
            color: ${theme.text};
            font-size: 14px;
            white-space: pre-line;
        }

        /* ---- Feedback ---- */
        #octoai-feedback {
            display: none;
            align-items: center;
            margin-bottom: 8px;
        }

        #octoai-feedback span:first-child {
            font-size: 14px;
            color: ${theme.textSecondary};
        }

        #octo-ai-thumbs-up,
        #octo-ai-thumbs-down {
            cursor: pointer;
            font-size: 16px;
            padding-left: 8px;
            color: ${theme.textSecondary};
        }

        /* ---- Settings ---- */
        #octoai-settings h3 {
            color: ${theme.text};
            margin: 0 0 16px 0;
        }

        .octoai-settings-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 24px;
        }

        .octoai-settings-row label {
            color: ${theme.text};
            cursor: pointer;
            font-size: 14px;
        }

        .octoai-settings-row input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
            accent-color: ${theme.gradientEnd};
        }

        .octoai-settings-row select {
            background-color: ${theme.backgroundSecondary};
            color: ${theme.text};
            border: 1px solid ${theme.border};
            border-radius: 6px;
            padding: 4px 8px;
            cursor: pointer;
        }

        /* ---- Utility ---- */
        .octoai-item:focus-visible,
        .octoai-icon-btn:focus-visible,
        .octoai-go:focus-visible,
        #octoai-submit:focus-visible,
        #octo-ai-thumbs-up:focus-visible,
        #octo-ai-thumbs-down:focus-visible {
            outline: 2px solid ${theme.accentStart};
            outline-offset: 2px;
        }

        .octo-ai-fade-out {
            opacity: 0;
            transition: opacity 0.5s ease-out;
        }

        .octo-ai-hidden {
            display: none;
        }

        @keyframes octoai-pop {
            from {
                opacity: 0;
                transform: translateY(14px) scale(0.97);
            }
            to {
                opacity: 1;
                transform: none;
            }
        }

        @keyframes octoai-item-in {
            from {
                opacity: 0;
                transform: translateY(6px);
            }
            to {
                opacity: 1;
                transform: none;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #octoai-container,
            .octoai-item {
                animation: none;
            }
        }
    `;
    document.head.appendChild(style);
}

function addAiToPage(theme) {
    if (document.getElementById("octoai")) {
        return
    }

    ensureOctoAiStyles(theme);

    // This is the button used to open the prompt interface
    const newButton = document.createElement("button");
    newButton.id = "octoai"
    newButton.title = "Octopus AI Assistant (right-click and drag to move)"

    addSvgFromFile('img/sparkles.svg', newButton);

    document.body.appendChild(newButton);

    newButton.addEventListener("click", function (event) {
        event.preventDefault();
        displayAIChat();
    });

    makeLauncherDraggable(newButton);
}

// Allow the launcher to be dragged out of the way with a right-click hold.
// The position is not persisted, so a page reload puts it back in the corner.
function makeLauncherDraggable(button) {
    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    button.addEventListener('pointerdown', (event) => {
        // Only the secondary (right) button starts a drag; left-click still opens the panel
        if (event.button !== 2) {
            return;
        }

        event.preventDefault();

        const rect = button.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        button.setPointerCapture(event.pointerId);
        button.classList.add('octoai-dragging');

        // Switch from corner-anchored to viewport coordinates for the drag
        button.style.position = 'fixed';
        button.style.bottom = 'auto';
        button.style.right = 'auto';
        button.style.left = rect.left + 'px';
        button.style.top = rect.top + 'px';

        const move = (moveEvent) => {
            const x = Math.min(Math.max(moveEvent.clientX - offsetX, 8), window.innerWidth - rect.width - 8);
            const y = Math.min(Math.max(moveEvent.clientY - offsetY, 8), window.innerHeight - rect.height - 8);
            button.style.left = x + 'px';
            button.style.top = y + 'px';
        };

        const stop = () => {
            button.releasePointerCapture(event.pointerId);
            button.classList.remove('octoai-dragging');
            button.removeEventListener('pointermove', move);
            button.removeEventListener('pointerup', stop);
            button.removeEventListener('pointercancel', stop);
        };

        button.addEventListener('pointermove', move);
        button.addEventListener('pointerup', stop);
        button.addEventListener('pointercancel', stop);
    });
}

// Function to load and add an SVG from a file
function addSvgFromFile(filePath, parent) {
    fetch(chrome.runtime.getURL(filePath))
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load SVG: ${response.statusText}`);
            }
            return response.text();
        })
        .then(svgContent => {
            const container = typeof parent === 'string'
                ? document.getElementById(parent)
                : parent;
            if (container) {
                container.innerHTML = svgContent;
            } else {
                console.error(`Container with ID "${container}" not found.`);
            }
        })
        .catch(error => console.error(error));
}

// Non-button elements with click handlers need explicit keyboard support
function makeKeyboardClickable(element, label) {
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    if (label) {
        element.setAttribute('aria-label', label);
    }
    element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            element.click();
        }
    });
}

async function displayAIChatForEmptyProjects() {
    const onProjectPage = await isOnEmptyDashboardPage();

    if (onProjectPage) {
        const existingContainer = document.getElementById('octoai-container');
        if (!existingContainer) {
            displayPromptUIV2(getColors());
            await displayPrompts();
        }
    }
}

async function displayAIChat() {

    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        hidePromptUI()
    } else {
        displayPromptUIV2(getColors());
        await displayPrompts();
    }
}

async function displayPrompts() {
    const prompts = await getSamplePrompts();
    displayExamples(prompts, null, getColors());
}

function createPrompt(text, theme) {
    const button = createButton(text, theme);

    const goButton = document.createElement('span');
    goButton.className = 'octoai-go';
    goButton.title = "Quick run"
    makeKeyboardClickable(goButton, 'Quick run');
    button.appendChild(goButton);
    addSvgFromFile('img/go.svg', goButton);

    return {button, goButton};
}

function createButton(text, theme, id, icon, badge) {
    const button = document.createElement('div');
    button.className = 'octoai-item';

    if (icon) {
        const iconContainer = document.createElement('span');
        iconContainer.className = 'octoai-item-icon';
        button.appendChild(iconContainer);
        addSvgFromFile('img/' + icon, iconContainer);
    }

    if (badge) {
        const badgeContainer = document.createElement('span');
        badgeContainer.className = 'octoai-badge';
        badgeContainer.textContent = badge;
        button.appendChild(badgeContainer);
    }

    const textContainer = document.createElement('span');
    textContainer.className = 'octoai-item-text';
    button.appendChild(textContainer);
    textContainer.textContent = text;

    if (id) {
        button.id = id;
    }

    button.title = text;
    makeKeyboardClickable(button, text);

    return button;
}

function displayExamples(prompts, parentPrompts, theme) {
    const examplesContainer = document.getElementById('octoai-examples');

    if (!examplesContainer) {
        return
    }

    examplesContainer.innerHTML = '';

    // Function to create a button
    function createExampleButton(prompt, theme) {
        if (prompt.systemPrompt || prompt.systemPromptOnly) {
            // System prompts are those defined in a library variable set
            const button = createButton(prompt.prompt, theme, null, null, "TEAM");

            // Add click event
            button.addEventListener('click', () => {
                submitPrompt(prompt.systemPrompt, prompt.systemPromptOnly, prompt.prompt);
            });

            return button;
        }
        else if (prompt.fullPrompt) {
            // Prompts can have a shorthand description in the menu and a full prompt to insert
            const {button, goButton } = createPrompt(prompt.prompt, theme);

            // Add click event
            button.addEventListener('click', () => {
                const input = document.getElementById('octoai-input');
                if (input) {
                    input.value = prompt.fullPrompt;
                    input.focus();
                }
            });

            // Add quick run event
            goButton.addEventListener('click', (event) => {
                event.stopPropagation();
                submitPrompt('', false, prompt.fullPrompt);
            });

            return button;
        } else if (prompt.dashboardName) {
            const button = createButton(prompt.dashboardName, theme);

            // Dashboard prompts are those that link to a dashboard in the extension
            button.addEventListener('click', () => {
                displayDashboard(prompt.dashboardFile);
            });

            return button;
        } else {
            // Regular prompts display the sample prompt they execute
            const {button, goButton } = createPrompt(prompt.prompt, theme);

            // Add click event
            button.addEventListener('click', () => {
                const input = document.getElementById('octoai-input');
                if (input) {
                    input.value = prompt.prompt;
                    input.focus();
                }
            });

            // Add quick run event
            goButton.addEventListener('click', (event) => {
                event.stopPropagation();
                submitPrompt('', false, prompt.prompt);
            });

            return button;
        }
    }

    function createExampleFolderButton(childPrompts, theme) {
        const button = createButton(childPrompts.name, theme, null, 'folder.svg');
        button.classList.add('octoai-folder');

        // Add click event
        button.addEventListener('click', () => {
            displayExamples(childPrompts.prompts, prompts, theme);
        });

        return button;
    }

    // Generate a back button if we have parent prompts
    if (parentPrompts) {
        const backButton = createButton('Back', theme);
        backButton.classList.add('octoai-back');
        backButton.addEventListener('click', () => {
            displayExamples(parentPrompts, null, theme);
        });
        examplesContainer.appendChild(backButton);
    } else {
        const eyebrow = document.createElement('div');
        eyebrow.className = 'octoai-eyebrow';
        eyebrow.textContent = 'Suggestions';
        examplesContainer.appendChild(eyebrow);
    }

    // Generate buttons and append them to the container
    prompts.forEach((prompt, index) => {
        const button = Array.isArray(prompt.prompts)
            ? createExampleFolderButton(prompt, getColors())
            : createExampleButton(prompt, getColors());
        button.style.animationDelay = Math.min(index * 30, 300) + 'ms';
        examplesContainer.appendChild(button);
    });
}

function hideForm() {
    const input = document.getElementById('octoai-form');
    const response = document.getElementById('octoai-response');
    if (input) {
        input.style.display = 'none';
    }
    if (response) {
        response.style.display = 'none';
    }
}

function showForm() {
    const input = document.getElementById('octoai-form');
    const response = document.getElementById('octoai-response');
    if (input) {
        input.style.display = 'flex';
    }
    if (response) {
        response.style.display = 'inherit';
    }
}


function hidePromptUI() {
    const container = document.getElementById('octoai-container');
    if (container) {
        container.parentElement.removeChild(container);
    }
}

function displayPromptUIV2(theme) {
    chrome.runtime.sendMessage({action: "show_ui"});

    ensureOctoAiStyles(theme);

    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        existingContainer.parentElement.removeChild(existingContainer);
    }

    // Create the main container div
    const container = document.createElement('div');
    container.id = 'octoai-container';

    // Create the header
    const header = document.createElement('div');
    header.id = 'octoai-header';

    // Add the OctoAI logo
    const logo = document.createElement('span');
    logo.id = 'octoai-logo';
    header.appendChild(logo);
    addSvgFromFile('img/sparkles.svg', 'octoai-logo');

    // Add the heading
    const heading = document.createElement('span');
    heading.textContent = 'Octopus AI Assistant';
    heading.className = 'octoai-title';
    header.appendChild(heading);

    const spacer = document.createElement('span');
    spacer.className = 'octoai-header-spacer';
    header.appendChild(spacer);

    const info = document.createElement('span');
    info.setAttribute('title', 'AI responses can be inaccurate.');
    info.id = 'octoai-info';
    info.className = 'octoai-icon-btn';
    info.style.cursor = 'help';
    header.appendChild(info);
    addSvgFromFile('img/info.svg', 'octoai-info');

    const gear = document.createElement('span');
    gear.setAttribute('title', 'Settings');
    gear.id = 'octoai-gear';
    gear.className = 'octoai-icon-btn';
    makeKeyboardClickable(gear, 'Settings');
    header.appendChild(gear);
    addSvgFromFile('img/gear.svg', 'octoai-gear');

    // Add click event to show settings
    gear.addEventListener('click', () => {
        displaySettings(theme);
    });

    // Add close button (right side)
    const closeButton = document.createElement('span');
    closeButton.textContent = '✕';
    closeButton.setAttribute('title', 'Close');
    closeButton.className = 'octoai-icon-btn';
    makeKeyboardClickable(closeButton, 'Close');

    // Add click event to remove the container
    closeButton.addEventListener('click', () => {
        hidePromptUI()
    });

    header.appendChild(closeButton);

    // Add the header to the container
    container.appendChild(header);

    // Create the response markdown
    const message = document.createElement('div');
    message.id = 'octoai-response';
    message.style.display = 'none';
    container.appendChild(message);

    // Create the feedback section
    const feedback = document.createElement('div');
    feedback.style.display = 'none';
    feedback.id = 'octoai-feedback';

    // Add the "Was this response helpful?" text
    const feedbackText = document.createElement('span');
    feedbackText.textContent = 'Was this response helpful?';
    feedback.appendChild(feedbackText);

    // Add thumbs up and thumbs down buttons
    const thumbsUp = document.createElement('span');
    thumbsUp.id = 'octo-ai-thumbs-up';
    makeKeyboardClickable(thumbsUp, 'This response was helpful');
    feedback.appendChild(thumbsUp);

    addSvgFromFile('img/thumbs-up.svg', 'octo-ai-thumbs-up');

    const thumbsDown = document.createElement('span');
    thumbsDown.id = 'octo-ai-thumbs-down';
    makeKeyboardClickable(thumbsDown, 'This response was not helpful');
    feedback.appendChild(thumbsDown);

    addSvgFromFile('img/thumbs-down.svg', 'octo-ai-thumbs-down');

    // Add the feedback section to the container
    container.appendChild(feedback);

    // Create a form element
    const form = document.createElement('form');
    form.id = 'octoai-form';

    // Create an input element
    const input = document.createElement('textarea');
    input.id = 'octoai-input';
    input.autocomplete = "off";
    input.type = 'text';
    input.placeholder = 'Ask Octopus about your instance';
    input.value = localStorage.getItem("octoai-prompt") || '';

    // Create the submit button
    const submitButton = document.createElement('button');
    submitButton.id = 'octoai-submit';
    submitButton.type = 'submit';
    submitButton.setAttribute('title', 'Send');
    submitButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M5 12h14M12 5l7 7-7 7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // Append the input and button to the form
    form.appendChild(input);
    form.appendChild(submitButton);

    // Append the form to the body
    container.appendChild(form);

    // Create the status pill row
    const meta = document.createElement('div');
    meta.className = 'octoai-meta';

    // Create auto-apply status message
    const autoApplyMessage = document.createElement('div');
    autoApplyMessage.id = 'octoai-auto-apply-message';
    autoApplyMessage.textContent = 'Auto-apply enabled';
    autoApplyMessage.style.display = 'none'; // Hidden by default
    meta.appendChild(autoApplyMessage);

    const regionMessage = document.createElement('div');
    regionMessage.id = 'octoai-region-message';
    meta.appendChild(regionMessage);

    container.appendChild(meta);

    // Create a container for the UI
    const examplesContainer = document.createElement('div');
    examplesContainer.id = 'octoai-examples';

    container.appendChild(examplesContainer)

    // Create a container for the confirmation message
    const confirmationContainer = document.createElement('div');
    confirmationContainer.id = 'octoai-confirmation';
    confirmationContainer.style.display = 'none';

    const approveButton = createButton("Approve", getColors(), "octo-ai-approve");
    approveButton.className = 'octoai-btn octoai-btn-primary';
    const abortButton = createButton("Abort", getColors(), "octo-ai-abort");
    abortButton.className = 'octoai-btn octoai-btn-ghost';

    // Aborting a confirmation resets the dialog
    abortButton.onclick = () => {
        hideAllButtons();
        hideResponse();
        showExamples();
        showForm();
        showPrompt();
        enableSubmitButton();
    }

    confirmationContainer.appendChild(approveButton);
    confirmationContainer.appendChild(abortButton);

    container.appendChild(confirmationContainer)


    // Add a submit event listener
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPrompt("", "", input.value.trim());
    });

    // Append the container to the body
    document.body.appendChild(container);

    // Update auto-apply message visibility after container is in DOM
    updateAutoApplyMessage();
    updateRegionMessage();
}

function showThinking() {
    window.showThinking.current = 1;
    window.showThinking.total = 1;

    const input = document.getElementById('octoai-input');
    input.disabled = true;
    let dots = 0;
    let start = new Date();
    input.value = "Thinking";
    return setInterval(() => {
        const timeElapsed = new Date() - start;

        const longMessage = window.showThinking.total > 1
            ? "Processing prompt " + window.showThinking.current + " of " + window.showThinking.total + ". Please be patient"
            : "Some prompts can take a minute or two to process. Please be patient"

        const message = timeElapsed > 30000 ? longMessage : "Thinking";

        dots = (dots + 1) % 4;
        input.value = message + ".".repeat(dots);
    }, 500);
}

function showPrompt() {
    const input = document.getElementById('octoai-input');
    input.disabled = false
    input.value = localStorage.getItem("octoai-prompt");
}

function updateAutoApplyMessage() {
    const message = document.getElementById('octoai-auto-apply-message');
    if (message) {
        const autoApplyEnabled = localStorage.getItem('octoai-auto-apply') === 'true';
        message.style.display = autoApplyEnabled ? 'block' : 'none';
    }
}

function hideAutoApplyMessage() {
    const message = document.getElementById('octoai-auto-apply-message');
    if (message) {
        message.style.display = 'none';
    }
}

function updateRegionMessage() {
    const message = document.getElementById('octoai-region-message');
    if (message) {
        const selectedRegion = localStorage.getItem('octoai-region') || '';
        const displayRegion = selectedRegion || 'Global';
        message.textContent = `Region: ${displayRegion}`;
    }
}

function hideRegionMessage() {
    const message = document.getElementById('octoai-region-message');
    if (message) {
        message.style.display = 'none';
    }
}

function disableSubmitButton() {
    const submitButton = document.getElementById('octoai-submit');
    if (submitButton) {
        submitButton.disabled = true
        submitButton.style.cursor = 'not-allowed';
    }
}

function enableSubmitButton() {
    const submitButton = document.getElementById('octoai-submit');
    if (submitButton) {
        submitButton.disabled = false
        submitButton.style.cursor = 'pointer';
    }
}

function hideAllButtons() {
    hideConfirmation();
    hideExamples();
}

function hideConfirmation() {
    const container = document.getElementById('octoai-confirmation');

    if (container) {
        container.style.display = 'none';
    }
}

function hideExamples() {
    const examplesContainer = document.getElementById('octoai-examples');

    if (examplesContainer) {
        examplesContainer.style.display = 'none';
    }
}

function showConfirmation() {
    const container = document.getElementById('octoai-confirmation');

    if (container) {
        container.style.display = 'block';
    }
}

function showExamples() {
    const examplesContainer = document.getElementById('octoai-examples');

    if (examplesContainer) {
        examplesContainer.style.display = 'block';
    }
}

function hideResponse() {
    const response = document.getElementById('octoai-response');
    const feedback = document.getElementById('octoai-feedback');

    if (response) {
        response.innerHTML = '';
        response.style.display = 'none';
    }

    if (feedback) {
        feedback.style.display = 'none';
    }
}

function getColors() {
    return {
        background: '#1B242D',                 // The background colour of any elements
        gradientStart: '#1FF2FF',              // The start of the gradient
        gradientEnd: '#0d81d8',                // The end of the gradient
        gradientEnd2: '#a683e5',                // The end of the gradient
        accentStart: '#1FC0FF',                 // Brand accent gradient start (matches the sparkles logo)
        accentEnd: '#CC3CFF',                   // Brand accent gradient end (matches the sparkles logo)
        backgroundSecondary: '#1F303F',        // The background colour for prompt bubbles
        backgroundButton: '#1B242D',           // The background colour for buttons like examples
        backgroundSecondaryButton: '#1F303F',  // The hover background for buttons
        text: '#f4f6f8',                        // primary text colour
        textSecondary: '#98aaba',               // secondary text colour, used for title elements
        link: '#87bfec',                        // link colour
        border: '#2e475d',                      // popup border colour
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }
}

function fadeOutAndHide(element) {
    element.classList.add('octo-ai-fade-out');
    element.addEventListener('transitionend', () => {
        element.classList.add('octo-ai-hidden');
    }, {once: true});
}

function buildMessageBubble(message, theme) {
    // Create the bubble element
    const bubble = document.createElement('div');

    if (!message) {
        return bubble;
    }

    bubble.className = 'octoai-bubble';
    bubble.textContent = message;

    // Create a wrapper div to allow right alignment
    const wrapper = document.createElement('div');
    wrapper.className = 'octoai-bubble-wrap';

    wrapper.appendChild(bubble);

    return wrapper
}

function displayMarkdownResponseV2(llmResponse, theme) {
    const response = document.getElementById('octoai-response');
    const feedback = document.getElementById('octoai-feedback');
    const thumbsUp = document.getElementById('octo-ai-thumbs-up');
    const thumbsDown = document.getElementById('octo-ai-thumbs-down');

    if (response) {
        response.innerHTML = DOMPurify.sanitize(marked.parse(llmResponse.response));
        response.prepend(buildMessageBubble(llmResponse.prompt, theme))
        response.style.display = 'block';
        feedback.style.display = 'flex';
        feedback.classList.remove('octo-ai-hidden');
        feedback.classList.remove('octo-ai-fade-out');
        thumbsUp.disabled = false;
        thumbsDown.disabled = false;
    }
}

function addFeedbackListener(feedback, thumbsUp, thumbsDown, prompt) {
    thumbsUp.onclick = function (event) {
        event.preventDefault();
        thumbsUp.disabled = true;
        thumbsDown.disabled = true;
        fadeOutAndHide(feedback);
        Logger.info("Feedback thumbs up");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({
                action: "feedback",
                prompt: prompt,
                accessToken: creds.accessToken,
                thumbsUp: true,
                serverUrl: window.location.origin
            }))
    }

    thumbsDown.onclick = function (event) {
        event.preventDefault();
        thumbsUp.disabled = true;
        thumbsDown.disabled = true;
        fadeOutAndHide(feedback);
        Logger.info("Feedback thumbs down");
        createOctopusApiKey()
            .then(creds => chrome.runtime.sendMessage({
                action: "feedback",
                prompt: prompt,
                accessToken: creds.accessToken,
                thumbsUp: false
            }))
    }
}

function displaySettings(theme) {
    // Hide the examples container
    hideExamples();
    hideForm();
    hideResponse();

    // Hide the auto-apply message
    hideAutoApplyMessage();
    hideRegionMessage();

    // Get or create the settings container
    let settingsContainer = document.getElementById('octoai-settings');

    if (!settingsContainer) {
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'octoai-settings';
        settingsContainer.style.padding = '4px';

        const container = document.getElementById('octoai-container');
        if (container) {
            container.appendChild(settingsContainer);
        }
    }

    // Clear existing content
    settingsContainer.innerHTML = '';
    settingsContainer.style.display = 'block';

    // Create settings title
    const title = document.createElement('h3');
    title.textContent = 'Settings';
    settingsContainer.appendChild(title);

    // Create checkbox container
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'octoai-settings-row';

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'octoai-auto-apply-checkbox';

    // Load saved value from local storage
    const savedValue = localStorage.getItem('octoai-auto-apply');
    if (savedValue === 'true') {
        checkbox.checked = true;
    }

    // Create label
    const label = document.createElement('label');
    label.htmlFor = 'octoai-auto-apply-checkbox';
    label.textContent = 'Auto-apply new resources';

    checkboxContainer.appendChild(label);
    checkboxContainer.appendChild(checkbox);
    settingsContainer.appendChild(checkboxContainer);

    // Create region selector
    const regionContainer = document.createElement('div');
    regionContainer.className = 'octoai-settings-row';

    const regionLabel = document.createElement('label');
    regionLabel.htmlFor = 'octoai-region-select';
    regionLabel.textContent = 'Region';

    const regionSelect = document.createElement('select');
    regionSelect.id = 'octoai-region-select';

    [
        { label: 'Global', value: '' },
        { label: 'US', value: 'US' },
        { label: 'Europe', value: 'Europe' }
    ].forEach(region => {
        const option = document.createElement('option');
        option.value = region.value;
        option.textContent = region.label;
        regionSelect.appendChild(option);
    });

    const savedRegion = localStorage.getItem('octoai-region');
    regionSelect.value = ['', 'US', 'Europe'].includes(savedRegion) ? savedRegion : '';

    regionContainer.appendChild(regionLabel);
    regionContainer.appendChild(regionSelect);
    settingsContainer.appendChild(regionContainer);

    // Create OK button
    const okButton = createButton('OK', theme, 'octoai-settings-ok');
    okButton.className = 'octoai-btn octoai-btn-primary';

    okButton.addEventListener('click', () => {
        // Save checkbox value to local storage
        localStorage.setItem('octoai-auto-apply', checkbox.checked);
        localStorage.setItem('octoai-region', regionSelect.value);

        // Update the auto-apply message visibility
        updateAutoApplyMessage();
        updateRegionMessage();

        // Hide settings and show examples again
        settingsContainer.style.display = 'none';
        showExamples();
        showForm();

        const regionMessage = document.getElementById('octoai-region-message');
        if (regionMessage) {
            regionMessage.style.display = 'block';
        }
    });

    settingsContainer.appendChild(okButton);
}
