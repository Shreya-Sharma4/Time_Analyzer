window.aiPredictionCache = {};
window.pendingClassifications = new Set();

window.predictFormType = function(text) {
    const clean = text.trim();
    if (!clean) return "quiz";
    const lower = clean.toLowerCase();

    const quizTriggers = ["?", "what", "when", "who", "which", "how", "why", "explain", "calculate", "solve", "find", "describe"];
    if (quizTriggers.some(q => lower.includes(q)) || lower.length > 60) return "quiz";

    const infoTriggers = ["email", "name", "roll", "section", "class", "id", "prn", "phone", "mobile", "contact", "gender", "department", "semester", "address", "cgpa", "percentage", "linkedin", "github", "url", "resume", "location", "erp"];
    const cleanWords = lower.replace(/[^\w\s]/gi, '').split(/\s+/);
    if (cleanWords.length <= 12 && cleanWords.some(w => infoTriggers.includes(w))) return "info";

    if (window.aiPredictionCache[clean]) return window.aiPredictionCache[clean];

    if (!window.pendingClassifications.has(clean)) {
        window.pendingClassifications.add(clean);
        chrome.runtime.sendMessage({ type: "RUN_AI", text: clean }, (response) => {
            if (response && response.label) window.aiPredictionCache[clean] = response.label;
        });
    }
    return "pending";
};