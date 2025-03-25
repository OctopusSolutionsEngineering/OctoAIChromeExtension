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
    // Add your custom functionality here
});