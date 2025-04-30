function arrayNotNullOrEmpty(array) {
    if (!array) {
        return null
    }

    return array.length > 0 ? array : null
}

const Logger = {
    info: function(message) {
        console.log(`OctoAI: ${message}`);
    },
    error: function(message, error) {
        if (error) {
            console.error(`OctoAI: ${message}`, error);
        } else {
            console.error(`OctoAI: ${message}`);
        }
    }
};