// 1. Find element using the XPath
function findElementByXPath(xpath) {
    return document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;
}

// 2. Find the element and its parent
const styleSheet = document.createElement("style");
styleSheet.textContent = `
@keyframes siriWave {
    0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(68, 68, 255, 0.7);
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(68, 68, 255, 0);
    }
    100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(68, 68, 255, 0);
    }
}
.siri-button {
    position: relative;
    background: radial-gradient(circle at 30% 30%, #4444ff, #9944ff);
    z-index: 1;
    transition: all 0.3s ease;
    animation: siriWave 2s infinite;
}
.siri-button::after {
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

const newButton = document.createElement("button");

newButton.className = "siri-button";
newButton.style.position = "absolute";
newButton.style.top = "16px";
newButton.style.right = "80px";
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

// Add the button to the parent element
document.body.appendChild(newButton);

// 4. Add an "on click" event to the new button
newButton.addEventListener("click", function (event) {
    event.preventDefault();
    console.log("New button clicked!");

    // 1. Create a semi-transparent black overlay div
    const overlayDiv = document.createElement("div");
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.backgroundColor = "rgb(0,0,0)";
    overlayDiv.style.opacity = "0.8";
    overlayDiv.style.zIndex = "100";
    document.body.appendChild(overlayDiv);

    // 2. Create container for links
    const linksContainer = document.createElement("div");
    linksContainer.style.position = "absolute";
    linksContainer.style.top = "30%";
    linksContainer.style.left = "50%";
    linksContainer.style.width = "100%";
    linksContainer.style.transform = "translateX(-50%)";
    linksContainer.style.zIndex = "101";
    linksContainer.style.textAlign = "center";

    // Add five links
    const linkTexts = ["Link 1", "Link 2", "Link 3", "Link 4", "Link 5"];
    linkTexts.forEach(text => {
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = text;
        link.style.display = "block";
        link.style.margin = "10px";
        link.style.color = "white";
        link.style.textDecoration = "none";
        link.style.fontSize = "18px";
        linksContainer.appendChild(link);
    });
    document.body.appendChild(linksContainer);

    // 3. Create textarea
    const textarea = document.createElement("textarea");
    textarea.style.display = "block";
    textarea.style.width = "80%"; // 80% of page width
    textarea.style.height = "100px"; // enough for about 5 lines
    textarea.style.margin = "20px auto";
    textarea.style.zIndex = "101";
    textarea.style.position = "relative";
    textarea.style.borderRadius = "8px"; // rounded borders
    textarea.style.padding = "10px"; // add some padding for better text appearance
    textarea.style.boxSizing = "border-box"; // include padding in width calculation
    textarea.style.border = "2px solid #4444ff"; // matching the button color
    textarea.style.outline = "none"; // remove outline when focused
    linksContainer.appendChild(textarea);

    // 4. Create send button
    const sendButton = document.createElement("button");
    sendButton.textContent = "Send";
    sendButton.style.padding = "8px 16px";
    sendButton.style.backgroundColor = "#4444ff";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "4px";
    sendButton.style.cursor = "pointer";
    sendButton.style.zIndex = "101";
    sendButton.style.position = "relative";
    linksContainer.appendChild(sendButton);
});