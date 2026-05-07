import { pipeline, env } from './transformers.min.js';

// Setup paths
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL('models/');
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');

env.useBrowserCache = false;           
env.backends.onnx.wasm.proxy = false;  
env.backends.onnx.wasm.numThreads = 1; 

let aiPipeline = null;

async function getClassifier() {
    if (!aiPipeline) {
        aiPipeline = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    }
    return aiPipeline;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return false;

    if (message.type === "RUN_AI") {
        getClassifier().then(classifier => {
            classifier(message.text, ["personal information detail profile", "quiz exam test academic question"]).then(out => {
                sendResponse({ label: out.labels[0].includes("personal") ? "info" : "quiz" });
            }).catch(err => {
                sendResponse({ label: "quiz" }); 
            });
        });
        return true; 
    }
    
    if (message.type === "RUN_COMPLEXITY_AI") {
        getClassifier().then(classifier => {
            classifier(message.text, ["easy simple basic memory fact", "medium moderate concept application", "hard complex difficult calculation explanation"]).then(out => {
                let complexity = "Medium";
                if (out.labels[0].includes("easy")) complexity = "Easy";
                if (out.labels[0].includes("hard")) complexity = "Hard";
                sendResponse({ complexity: complexity });
            }).catch(err => {
                sendResponse({ complexity: "Medium" }); 
            });
        });
        return true;
    }
});