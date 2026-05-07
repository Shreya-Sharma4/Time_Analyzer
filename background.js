// --- CLOUD AI (GEMINI BATCH PROCESSOR) ---
const GEMINI_API_KEY = "AIzaSyBSw6EsMDtrIszlMMo"; // <-- Put your AIza... key here

let creating; 

async function ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });
    if (existingContexts.length > 0) return;
    
    if (creating) {
        await creating;
        return;
    }

    creating = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run AI models in an un-killable background DOM'
    });
    
    await creating;
    creating = null; 
}

const DATABASE_URL = "https://time-analyzer-453ed-default-rtdb.firebaseio.com"; 
const API_KEY = "AIzaSyDi1oCW3OgQBgDCWvYpxl-pk6cl4CtdxC8"; 

async function hashPass(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  // --- 1. LOCAL AI ROUTING (For Info Auto-Skip) ---
  if (message.type === "RUN_AI" || message.type === "RUN_COMPLEXITY_AI") {
      ensureOffscreenDocument().then(() => {
          chrome.runtime.sendMessage({ ...message, target: 'offscreen' }, (response) => {
              sendResponse(response);
          });
      });
      return true; 
  }

  // --- 2. BATCH CLOUD AI ROUTING (The Gemini Magic Fix) ---
  if (message.type === "RUN_COMPLEXITY_BATCH") {
      const questions = message.questions; 
      if (!questions || questions.length === 0) { sendResponse({ results: [] }); return true; }

      let questionListStr = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const prompt = `
      You are an expert professor evaluating a quiz. 
      Grade the cognitive difficulty of each question as Easy, Medium, or Hard based on the thinking required:
      - Easy: Simple memory recall, basic definitions, direct facts, or 1-step basic math (e.g., "What does FIFO mean?", "2+3*4").
      - Medium: Applying a concept, comparing concepts, or standard multi-step logic.
      - Hard: Finding complex hidden patterns (e.g., number series), tricky edge cases, deep conceptual analysis, or complex calculations.
      
      Questions:
      ${questionListStr}

      Return ONLY a raw JSON array of strings matching the exact order of the questions. 
      Example: ["Easy", "Medium", "Hard"]
      Do NOT include markdown blocks like \`\`\`json.`;

      fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1 }
          })
      }).then(r => r.json()).then(data => {
          if (data.error) throw new Error(data.error.message);
          
          let text = data.candidates[0].content.parts[0].text.trim();
          text = text.replace(/```json/gi, '').replace(/```/g, '').trim(); 
          const results = JSON.parse(text);
          sendResponse({ results: results });
      }).catch(err => {
          console.error("Batch Error:", err);
          sendResponse({ results: questions.map(() => "Medium") }); 
      });
      return true; 
  }

  // --- 3. FIREBASE ROUTING ---
  if (message.type === "TEACHER_SIGNUP") {
    const { username, password, name, department, securityAnswer } = message.payload;
    const internalEmail = `${username}@timeanalyzer.local`; 
    
    Promise.all([hashPass(password), hashPass(securityAnswer)]).then(([hashedPass, hashedSec]) => {
        return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
            method: "POST", body: JSON.stringify({ email: internalEmail, password, returnSecureToken: true }),
            headers: { "Content-Type": "application/json" }
        }).then(r => r.json()).then(authData => {
            
            // FIX: Correctly throw "Username already taken" instead of failing the token check!
            if (authData.error) {
                throw new Error(authData.error.message === "EMAIL_EXISTS" ? "Username already taken." : authData.error.message);
            }
            
            const uid = authData.localId || `manual_${Date.now()}`;
            const profileData = { name, department, username, h_code: hashedPass, s_code: hashedSec, internalEmail, authorized: true };
            
            if (!authData.idToken) throw new Error("Failed to generate secure token.");

            return fetch(`${DATABASE_URL}/teachers/${uid}.json?auth=${authData.idToken}`, {
                method: "PUT", body: JSON.stringify(profileData)
            }).then(r => {
                if (!r.ok) throw new Error("Database Write Failed");
                return { success: true, profile: profileData, token: authData.idToken };
            });
        });
    })
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TEACHER_LOGIN") {
    const { username, password } = message.payload;
    
    hashPass(password).then(hashedInput => {
        return fetch(`${DATABASE_URL}/teachers.json`).then(r => r.json()).then(teachers => {
            if (!teachers) throw new Error("No teachers found");
            const uid = Object.keys(teachers).find(id => teachers[id].username === username);
            
            if (uid && teachers[uid].h_code === hashedInput) {
                const targetEmail = teachers[uid].internalEmail || `${username}@timeanalyzer.local`;
                return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
                    method: "POST", body: JSON.stringify({ email: targetEmail, password, returnSecureToken: true }),
                    headers: { "Content-Type": "application/json" }
                }).then(r => r.json()).then(data => {
                      if (data.error) {
                          const freshEmail = `${username}_${Date.now()}@timeanalyzer.local`;
                          return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
                            method: "POST", body: JSON.stringify({ email: freshEmail, password: password, returnSecureToken: true }),
                            headers: { "Content-Type": "application/json" }
                         }).then(r => r.json()).then(newData => {
                             if (newData.error || !newData.idToken) {
                                 sendResponse({ success: false, error: "Auth sync failed." });
                             } else {
                                 fetch(`${DATABASE_URL}/teachers/${uid}/internalEmail.json?auth=${newData.idToken}`, {
                                     method: "PUT", body: JSON.stringify(freshEmail)
                                 });
                                 const cleanProfile = { ...teachers[uid], internalEmail: freshEmail };
                                 sendResponse({ success: true, profile: cleanProfile, token: newData.idToken });
                             }
                         });
                      } else {
                          if (!data.idToken) {
                              sendResponse({ success: false, error: "Missing token from Firebase." });
                              return;
                          }
                          const cleanProfile = { ...teachers[uid] };
                          sendResponse({ success: true, profile: cleanProfile, token: data.idToken });
                      }
                });
            } else {
                sendResponse({ success: false, error: "Invalid Username or Password" });
            }
        });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TEACHER_RESET_PASSWORD") {
      const { username, securityAnswer, newPassword } = message.payload;
      
      Promise.all([hashPass(securityAnswer), hashPass(newPassword)]).then(([hashedSecInput, hashedNewPass]) => {
          return fetch(`${DATABASE_URL}/teachers.json`).then(r => r.json()).then(teachers => {
              const uid = Object.keys(teachers || {}).find(id => teachers[id].username === username);
              if (!uid) throw new Error("User not found.");
              
              const storedSecHash = teachers[uid].s_code || "";
              if (storedSecHash === hashedSecInput) {
                  const tempEmail = `reset_${Date.now()}@timeanalyzer.local`;
                  return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
                      method: "POST", body: JSON.stringify({ email: tempEmail, password: "TempPassword123!", returnSecureToken: true }), headers: { "Content-Type": "application/json" }
                  })
                  .then(r => r.json())
                  .then(authData => {
                      if (!authData.idToken) throw new Error("Failed to generate secure token.");
                      return fetch(`${DATABASE_URL}/teachers/${uid}/h_code.json?auth=${authData.idToken}`, {
                          method: "PUT", body: JSON.stringify(hashedNewPass), headers: { "Content-Type": "application/json" }
                      });
                  })
                  .then(r => {
                      if(!r.ok) throw new Error("Database Write Failed.");
                      sendResponse({ success: true });
                  });
              } else {
                  throw new Error("Incorrect Security Answer");
              }
          });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }

  if (message.type === "STUDENT_SIGNUP") {
    const { username, password, securityAnswer } = message.payload;
    if (!username) { sendResponse({ success: false, error: "Username required" }); return true; }
    
    const internalEmail = `${username}@timeanalyzer.student`;

    Promise.all([hashPass(password), hashPass(securityAnswer)]).then(([hashedPass, hashedSec]) => {
        return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
            method: "POST", body: JSON.stringify({ email: internalEmail, password, returnSecureToken: true }),
            headers: { "Content-Type": "application/json" }
        }).then(r => r.json()).then(authData => {
            if (authData.error) throw new Error(authData.error.message === "EMAIL_EXISTS" ? "Username already taken." : authData.error.message);
            
            const uid = authData.localId;
            const profileData = { username, h_code: hashedPass, s_code: hashedSec, internalEmail };
            
            if (!authData.idToken) throw new Error("Failed to generate secure token.");
            
            return fetch(`${DATABASE_URL}/students/${uid}.json?auth=${authData.idToken}`, {
                method: "PUT", body: JSON.stringify(profileData)
            }).then(r => {
                if (!r.ok) throw new Error("Database Write Failed");
                return { success: true, uid };
            });
        });
    })
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "STUDENT_LOGIN") {
    const { username, password } = message.payload;
    
    hashPass(password).then(hashedInput => {
        return fetch(`${DATABASE_URL}/students.json`).then(r => r.json()).then(students => {
             const uid = Object.keys(students || {}).find(id => students[id].username === username);
             if (uid && students[uid].h_code === hashedInput) {
                 const targetEmail = students[uid].internalEmail || `${username}@timeanalyzer.student`;
                 
                 return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
                    method: "POST", body: JSON.stringify({ email: targetEmail, password, returnSecureToken: true }),
                    headers: { "Content-Type": "application/json" }
                }).then(r => r.json()).then(data => {
                      if (data.error) {
                          const freshEmail = `${username}_${Date.now()}@timeanalyzer.student`;
                          return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
                            method: "POST", body: JSON.stringify({ email: freshEmail, password: password, returnSecureToken: true }),
                            headers: { "Content-Type": "application/json" }
                         }).then(r => r.json()).then(newData => {
                             if (newData.error || !newData.idToken) {
                                 sendResponse({ success: false, error: "Auth sync failed." });
                             } else {
                                 fetch(`${DATABASE_URL}/students/${uid}/internalEmail.json?auth=${newData.idToken}`, {
                                     method: "PUT", body: JSON.stringify(freshEmail)
                                 });
                                 sendResponse({ success: true, uid: uid, token: newData.idToken });
                             }
                         });
                      } else {
                          if (!data.idToken) {
                              sendResponse({ success: false, error: "Missing token from Firebase." });
                              return;
                          }
                          sendResponse({ success: true, uid: uid, token: data.idToken });
                      }
                });
             } else {
                 sendResponse({ success: false, error: "Invalid Username or Password" });
             }
        });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "STUDENT_RESET_PASSWORD") {
    const { username, securityAnswer, newPassword } = message.payload;
    
    Promise.all([hashPass(securityAnswer), hashPass(newPassword)]).then(([hashedSecInput, hashedNewPass]) => {
        return fetch(`${DATABASE_URL}/students.json`).then(r => r.json()).then(students => {
            const uid = Object.keys(students || {}).find(id => students[id].username === username);
            if (!uid) throw new Error("User not found.");
            
            const storedSecHash = students[uid].s_code || "";
            if (storedSecHash === hashedSecInput) {
                const tempEmail = `reset_${Date.now()}@timeanalyzer.student`;
                return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
                    method: "POST", body: JSON.stringify({ email: tempEmail, password: "TempPassword123!", returnSecureToken: true }), headers: { "Content-Type": "application/json" }
                })
                .then(r => r.json())
                .then(authData => {
                    if (!authData.idToken) throw new Error("Failed to generate secure token.");
                    return fetch(`${DATABASE_URL}/students/${uid}/h_code.json?auth=${authData.idToken}`, {
                        method: "PUT", body: JSON.stringify(hashedNewPass), headers: { "Content-Type": "application/json" }
                    });
                })
                .then(r => {
                    if(!r.ok) throw new Error("Database Write Failed");
                    sendResponse({ success: true });
                });
            } else {
                throw new Error("Incorrect Security Answer.");
            }
        });
    })
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SAVE_STUDENT_RESULT") {
      const { uid, data } = message.payload;
      Promise.all([
          fetch(`${DATABASE_URL}/students/${uid}/last_result.json`, { method: "PUT", body: JSON.stringify(data) }),
          fetch(`${DATABASE_URL}/students/${uid}/results/${data.formId}.json`, { method: "PUT", body: JSON.stringify(data) })
      ]).then(responses => {
          sendResponse({ success: responses[0].ok && responses[1].ok });
      }).catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }

  if (message.type === "GET_STUDENT_RESULT") {
      const { uid } = message.payload;
      fetch(`${DATABASE_URL}/students/${uid}/last_result.json`)
          .then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }

  if (message.type === "SAVE_KEYS_TO_CLOUD") {
    const authQuery = message.payload.token ? `?auth=${message.payload.token}` : "";
    const url = `${DATABASE_URL}/keys/${message.payload.formId}.json${authQuery}`;
    fetch(url, { method: "PATCH", body: JSON.stringify(message.payload.keys) })
      .then(r => {
          if (!r.ok) throw new Error("Permission Denied (401)");
          sendResponse({ success: true });
      }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === "SAVE_CONFIG_TO_CLOUD") {
    const authQuery = message.payload.token ? `?auth=${message.payload.token}` : "";
    const url = `${DATABASE_URL}/config/${message.payload.formId}.json${authQuery}`;
    fetch(url, { method: "PUT", body: JSON.stringify(message.payload.config) })
      .then(r => {
          if (!r.ok) throw new Error("Permission Denied (401)");
          sendResponse({ success: true });
      }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === "RESET_CLOUD_KEYS") {
    const { formId, token } = message.payload;
    const authQuery = token ? `?auth=${token}` : "";
    Promise.all([
        fetch(`${DATABASE_URL}/keys/${formId}.json${authQuery}`, { method: "DELETE" }),
        fetch(`${DATABASE_URL}/config/${formId}.json${authQuery}`, { method: "DELETE" })
    ]).then(responses => {
        if (!responses[0].ok || !responses[1].ok) throw new Error("Permission Denied (401). Invalid Token.");
        sendResponse({ success: true });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === "GET_KEYS_FROM_CLOUD") {
    const { formId } = message.payload;
    Promise.all([
        fetch(`${DATABASE_URL}/keys/${formId}.json`).then(r => r.json()),
        fetch(`${DATABASE_URL}/config/${formId}.json`).then(r => r.json())
    ]).then(([keys, config]) => sendResponse({ success: true, keys, config })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "OPEN_DASHBOARD") {
      const params = new URLSearchParams();
      if (message.payload && message.payload.mode) params.append("mode", message.payload.mode);
      if (message.payload && message.payload.formId) params.append("formId", message.payload.formId);
      
      const paramStr = params.toString() ? `?${params.toString()}` : "";
      const url = chrome.runtime.getURL(`analytics.html${paramStr}`); 
      chrome.tabs.create({ url: url });
      sendResponse({ success: true });
      return true;
  }
});
