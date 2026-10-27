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

        .octoai-hint {
            font-size: 12px;
            color: ${theme.textSecondary};
            text-align: center;
            padding: 10px 0 2px 0;
        }

        .octoai-hint a {
            color: ${theme.link};
            text-decoration: none;
        }

        .octoai-hint a:hover {
            text-decoration: underline;
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

        .octoai-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            flex: none;
            margin-left: auto;
            color: ${theme.textSecondary};
            opacity: 0.35;
            transition: opacity 0.15s ease, transform 0.15s ease, color 0.15s ease;
        }

        .octoai-pin svg {
            display: block;
            width: 15px;
            height: 15px;
        }

        .octoai-item:hover .octoai-pin {
            opacity: 1;
        }

        .octoai-pin:hover {
            transform: scale(1.15);
        }

        .octoai-pin:focus-visible {
            opacity: 1;
        }

        .octoai-pin.octoai-pinned {
            opacity: 1;
            color: #9FD8FF;
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
        .octoai-pin:focus-visible,
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

async function displayAIChat() {

    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        hidePromptUI()
    } else {
        displayPromptUIV2(getColors());
    }
}

function hidePromptUI() {
    const container = document.getElementById('octoai-container');
    if (container) {
        container.parentElement.removeChild(container);
    }
}

function displayPromptUIV2(theme) {
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

    // The AI Assistant is deprecated, so the only content is a message pointing to the MCP server
    const message = document.createElement('div');
    message.id = 'octoai-response';

    const deprecation = document.createElement('p');
    deprecation.appendChild(document.createTextNode('The AI Assistant is deprecated. The '));

    const mcpLink = document.createElement('a');
    mcpLink.href = 'https://octopus.com/docs/octopus-ai/mcp';
    mcpLink.target = '_blank';
    mcpLink.rel = 'noopener noreferrer';
    mcpLink.textContent = 'MCP server';
    deprecation.appendChild(mcpLink);

    deprecation.appendChild(document.createTextNode(' is the preferred AI interface to Octopus.'));
    message.appendChild(deprecation);

    container.appendChild(message);

    // Append the container to the body
    document.body.appendChild(container);
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
