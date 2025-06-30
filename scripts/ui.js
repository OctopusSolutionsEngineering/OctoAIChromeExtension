function addAiToPage(theme) {
    if (document.getElementById("octoai")) {
        return
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `    
.octo-ai-fade-out {
  opacity: 0;
  transition: opacity 0.5s ease;
}
.octo-ai-hidden {
  display: none;
}
@keyframes aiWave {
    0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(31, 242, 255, 0.7);
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(31, 242, 255, 0);
    }
    100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(31, 242, 255, 0);
    }
}
.ai-button {
    position: relative;
    background: radial-gradient(circle at 30% 30%, rgb(13, 129, 216), rgb(31, 242, 255));
    z-index: 1;
    transition: all 0.3s ease;
    animation: aiWave 2s infinite;
}
.ai-button::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.4), transparent);
}`;
    document.head.appendChild(styleSheet);

    // Add additional styling for markdown elements
    const markdownStyles = document.createElement("style");
    markdownStyles.textContent = `
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
        
        #octoai-container a:hover {
            color: ${theme.text};
        }
    `;
    document.head.appendChild(markdownStyles);

    // This is the button used to open the prompt interface
    const newButton = document.createElement("button");
    newButton.id = "octoai"

    newButton.className = "ai-button";
    newButton.style.position = "absolute";
    newButton.style.top = "16px";
    newButton.style.right = "120px";
    newButton.style.width = "32px";
    newButton.style.height = "32px";
    newButton.style.padding = "0";
    newButton.style.margin = "0";
    newButton.style.border = "none";
    newButton.style.borderRadius = "50%";

    newButton.addEventListener("mouseover", function () {
        this.style.transform = "scale(1.1)";
        this.style.filter = "brightness(1.2)";
    });

    newButton.addEventListener("mouseout", function () {
        this.style.transform = "scale(1)";
        this.style.filter = "brightness(1)";
    });

    document.body.appendChild(newButton);

    newButton.addEventListener("click", function (event) {
        event.preventDefault();
        displayAIChat();
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

async function displayAIChat() {

    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        hidePromptUI()
    } else {
        displayPromptUIV2(getColors());
        const prompts = await getSamplePrompts();
        displayExamples(prompts, null, getColors());
    }
}

function createButton(text, theme, id, icon) {
    const button = document.createElement('div');

    if (icon) {
        const iconContainer = document.createElement('span');
        iconContainer.style.width = '16px'
        iconContainer.style.height = '16px'
        button.appendChild(iconContainer);
        addSvgFromFile('img/' + icon, iconContainer);

        const textContainer = document.createElement('span');
        button.appendChild(textContainer);
        textContainer.textContent = text;
    } else {
        button.textContent = text;
    }

    if (id) {
        button.id = id;
    }

    button.title = text;
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.padding = '10px';
    button.style.marginBottom = '10px';
    button.style.backgroundColor = theme.backgroundButton;
    button.style.border = '0px';
    button.style.borderRadius = '5px';
    button.style.borderColor = theme.border;
    button.style.textAlign = 'left';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.style.whiteSpace = 'nowrap';
    button.style.overflow = 'hidden';
    button.style.textOverflow = 'ellipsis';
    button.style.color = theme.text;

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = theme.backgroundSecondaryButton;
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = theme.backgroundButton;
    });

    return button;
}

function displayExamples(prompts, parentPrompts, theme) {
    const examplesContainer = document.getElementById('octoai-examples');

    if (!examplesContainer) {
        return
    }

    examplesContainer.innerHTML = '';

    // Create and append the header
    const examplesHeader = document.createElement('h2');
    examplesHeader.textContent = 'Examples';
    examplesHeader.style.marginBottom = '20px';
    examplesHeader.style.color = theme.text;
    examplesContainer.appendChild(examplesHeader);

    // Function to create a button
    function createExampleButton(prompt, theme) {
        const button = createButton(prompt.prompt, theme);

        if (prompt.systemPrompt) {
            button.textContent = "TEAM: " + prompt.prompt;

            // Add click event
            button.addEventListener('click', () => {
                submitPrompt(prompt.systemPrompt, prompt.prompt);
            });

        } else {
            // Add click event
            button.addEventListener('click', () => {
                const input = document.getElementById('octoai-input');
                if (input) {
                    input.value = prompt.prompt;
                    input.focus();
                }
            });
        }

        return button;
    }

    function createExampleFolderButton(childPrompts, theme) {
        const button = createButton(childPrompts.name, theme, null, 'folder.svg');

        // Add click event
        button.addEventListener('click', () => {
            displayExamples(childPrompts.prompts, prompts, theme);
        });

        return button;
    }

    // Generate a back button if we have parent prompts
    if (parentPrompts) {
        const backButton = createButton('Back', theme, null, 'folder.svg');
        backButton.addEventListener('click', () => {
            displayExamples(parentPrompts, null, theme);
        });
        examplesContainer.appendChild(backButton);
    }

    // Generate buttons and append them to the container
    prompts.forEach(prompt => {
        const button = Array.isArray(prompt.prompts)
            ? createExampleFolderButton(prompt, getColors())
            : createExampleButton(prompt, getColors());
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
    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        existingContainer.parentElement.removeChild(existingContainer);
    }

    // Create the main container div
    const container = document.createElement('div');
    container.id = 'octoai-container';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.border = '1px solid #E0E0E0';
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.maxHeight = 'calc(100% - 32px)';
    container.style.width = '800px';
    container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    container.style.backgroundColor = theme.background;
    container.style.borderColor = theme.border;
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.scrollbarColor = theme.textSecondary + " " + theme.backgroundSecondary;

    // Set absolute positioning in the bottom-right corner
    container.style.position = 'absolute';
    container.style.bottom = '16px';
    container.style.right = '16px';
    container.style.zIndex = '1000';

    // Create the header
    const header = document.createElement('div');
    header.id = 'octoai-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.margin = '0 0 16px 0';

    // Add the OctoAI logo
    const logo = document.createElement('span');
    logo.id = 'octoai-logo';
    header.appendChild(logo);
    addSvgFromFile('img/sparkles.svg', 'octoai-logo');

    // Add the heading
    const heading = document.createElement('span');
    heading.textContent = 'Octopus AI Assistant';
    heading.style.fontWeight = 'bold';
    heading.style.fontSize = '16px';
    heading.style.paddingLeft = '8px';
    heading.style.color = theme.text;
    header.appendChild(heading);

    const info = document.createElement('span');
    info.setAttribute('title', 'AI responses can be inaccurate. The Octopus AI Assistant is an Alpha feature.');
    info.id = 'octoai-info';
    info.style.color = theme.textSecondary;
    info.style.paddingLeft = '8px';
    header.appendChild(info);
    addSvgFromFile('img/info.svg', 'octoai-info');

    // Add close button (right side)
    const closeButton = document.createElement('span');
    closeButton.textContent = '✕';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = theme.textSecondary;
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.padding = '0 4px';

    // Add hover effect
    closeButton.addEventListener('mouseover', () => {
        closeButton.style.color = theme.text;
    });
    closeButton.addEventListener('mouseout', () => {
        closeButton.style.color = theme.textSecondary;
    });

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
    message.style.maxHeight = '300px';
    message.style.overflowY = 'auto';
    message.style.margin = '0 0 16px 0';
    container.appendChild(message);

    // Create the feedback section
    const feedback = document.createElement('div');
    feedback.style.marginBottom = '8px';
    feedback.style.display = 'none';
    feedback.id = 'octoai-feedback';

    // Add the "Was this response helpful?" text
    const feedbackText = document.createElement('span');
    feedbackText.textContent = 'Was this response helpful?';
    feedbackText.style.fontSize = '14px';
    feedbackText.style.color = theme.textSecondary;
    feedback.appendChild(feedbackText);

    // Add thumbs up and thumbs down buttons
    const thumbsUp = document.createElement('span');
    thumbsUp.id = 'octo-ai-thumbs-up';
    thumbsUp.style.border = 'none';
    thumbsUp.style.background = 'none';
    thumbsUp.style.cursor = 'pointer';
    thumbsUp.style.fontSize = '16px';
    thumbsUp.style.color = theme.textSecondary;
    thumbsUp.style.paddingLeft = '8px';
    feedback.appendChild(thumbsUp);

    addSvgFromFile('img/thumbs-up.svg', 'octo-ai-thumbs-up');

    const thumbsDown = document.createElement('span');
    thumbsDown.id = 'octo-ai-thumbs-down';
    thumbsDown.style.border = 'none';
    thumbsDown.style.background = 'none';
    thumbsDown.style.cursor = 'pointer';
    thumbsDown.style.fontSize = '16px';
    thumbsDown.style.color = theme.textSecondary;
    thumbsDown.style.paddingLeft = '8px';
    feedback.appendChild(thumbsDown);

    addSvgFromFile('img/thumbs-down.svg', 'octo-ai-thumbs-down');

    // Add the feedback section to the container
    container.appendChild(feedback);

    // Create a form element
    const form = document.createElement('form');
    form.id = 'octoai-form';
    form.style.display = 'flex';
    form.style.margin = '0 0 16px 0';
    form.style.alignItems = 'center';
    form.style.padding = '8px 12px';
    form.style.fontFamily = 'Arial, sans-serif';
    form.style.fontSize = '14px';
    form.style.background = "#1b242d";
    form.style.padding = "0.5rem";
    form.style.border = "double 3px transparent";
    form.style.borderRadius = "6px";
    form.style.backgroundImage = "linear-gradient(" + theme.background + "," + theme.background + "), linear-gradient(to bottom, " + theme.gradientStart + "," + theme.gradientEnd + ")";
    form.style.backgroundOrigin = "border-box";
    form.style.backgroundClip = "padding-box, border-box";

    // Create an input element
    const input = document.createElement('textarea');
    input.id = 'octoai-input';
    input.autocomplete = "off";
    input.type = 'text';
    input.placeholder = 'Ask Octopus about your instance';
    input.style.width = '100%';
    input.style.height = '5em';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.color = theme.text;
    input.style.setProperty("-webkit-autofill:active", "-webkit-text-fill-color: ")
    input.value = localStorage.getItem("octoai-prompt") || '';

    // Create the submit button
    const submitButton = document.createElement('button');
    submitButton.id = 'octoai-submit';
    submitButton.type = 'submit';
    submitButton.innerHTML = '&#8594;'; // Unicode for the right arrow
    submitButton.style.border = 'none';
    submitButton.style.backgroundColor = 'transparent';
    submitButton.style.cursor = 'pointer';
    submitButton.style.color = theme.text;
    submitButton.style.fontSize = '16px';

    // Append the input and button to the form
    form.appendChild(input);
    form.appendChild(submitButton);

    // Append the form to the body
    container.appendChild(form);

    // Create a container for the UI
    const examplesContainer = document.createElement('div');
    examplesContainer.id = 'octoai-examples';
    examplesContainer.style.fontFamily = 'Arial, sans-serif';
    examplesContainer.style.overflowY = 'auto';
    examplesContainer.style.flexGrow = '1';

    container.appendChild(examplesContainer)

    // Create a container for the confirmation message
    const confirmationContainer = document.createElement('div');
    confirmationContainer.id = 'octoai-confirmation';
    confirmationContainer.style.fontFamily = 'Arial, sans-serif';
    confirmationContainer.style.display = 'none';

    const approveButton = createButton("Approve", getColors(), "octo-ai-approve");
    const abortButton = createButton("Abort", getColors(), "octo-ai-abort");

    // Aborting a confirmation resets the dialog
    abortButton.onclick = () => {
        hideAllButtons();
        hideResponse();
        showExamples();
        showForm();
    }

    confirmationContainer.appendChild(approveButton);
    confirmationContainer.appendChild(abortButton);

    container.appendChild(confirmationContainer)


    // Add a submit event listener
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPrompt("", input.value.trim());
    });

    // Append the container to the body
    document.body.appendChild(container);
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
        backgroundSecondary: '#1F303F',        // The background colour for prompt bubbles
        backgroundButton: '#1B242D',           // The background colour for buttons like examples
        backgroundSecondaryButton: '#1F303F',  // The hover background for buttons
        text: '#f4f6f8',                        // primary text colour
        textSecondary: '#98aaba',               // secondary text colour, used for title elements
        link: '#87bfec',                        // link colour
        border: '#2e475d'                       // popup border colour
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

    // Style the bubble
    bubble.style.position = 'relative';
    bubble.style.display = 'inline-block';
    bubble.style.padding = '10px 20px';
    bubble.style.backgroundColor = theme.text;
    bubble.style.borderRadius = '20px';
    bubble.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    bubble.style.fontFamily = 'Arial, sans-serif';
    bubble.style.fontSize = '14px';
    bubble.style.whiteSpace = "pre-line";
    bubble.style.overflowY = "auto";
    bubble.style.maxHeight = "5em";
    bubble.style.color = theme.text;
    bubble.style.backgroundColor = theme.backgroundSecondary;
    bubble.textContent = message;

    // Create a wrapper div to allow right alignment
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'flex-end';
    wrapper.style.width = '100%';
    wrapper.style.marginBottom = '10px';

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
        feedback.style.display = 'block';
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
                thumbsUp: true
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