(function() {
    if (window !== window.top) return;
    if (window.ta_teacher_active) return; 
    window.ta_teacher_active = true;

    // FIX: Prevents long questions from crashing Firebase
    const normalize = (s) => s ? s.replace(/[*.\#$\[\]\/]/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 700) : "";
    let CURRENT_TOKEN = null;
    let dashboardContainer = null; 
    
    const titlesToIgnore = ["email", "quiz", "name", "roll no", "section", "class", "erp"];

    function ensureTeacherState() {
        if (!location.href.includes("/forms/d/")) return;
        if (location.href.includes("/d/e/")) return; 

        const savedSession = sessionStorage.getItem("ta_teacher_session");
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if(session.profile) {
                    CURRENT_TOKEN = session.token || ""; 
                    initTeacherDashboard(session.profile);
                } else { 
                    sessionStorage.removeItem("ta_teacher_session"); 
                    createLoginModal(); 
                }
            } catch(e) { 
                sessionStorage.removeItem("ta_teacher_session");
                createLoginModal(); 
            }
        } else { createLoginModal(); }
    }

    setInterval(ensureTeacherState, 1000);
    ensureTeacherState();

    function createLoginModal() {
        if (document.getElementById("ta-login-modal") || document.getElementById("ta-teacher-controls")) return;

        const modal = document.createElement("div");
        modal.id = "ta-login-modal";
        Object.assign(modal.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", zIndex: "2147483647", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif" });
        
        const container = document.createElement("div");
        Object.assign(container.style, { background: "white", padding: "30px", borderRadius: "12px", width: "320px", textAlign: "center" });

        // --- ADDED: Enter key support for teacher forms overlay ---
        container.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const btn = container.querySelector("#ta-btn-action");
                if (btn) btn.click();
            }
        });
        // ----------------------------------------------------------

        modal.appendChild(container);
        document.body.appendChild(modal);

        // FIX: Replaced document.getElementById with container.querySelector to prevent the White Box crash
        const renderLogin = () => {
            container.innerHTML = `
                <h2 style="margin:0 0 15px 0;">🔐 Teacher Login</h2>
                <input id="ta-user" type="text" placeholder="Username" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
                <input id="ta-pass" type="password" placeholder="Password" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
                <div style="text-align:right; margin-bottom:10px;"><a href="#" id="ta-forgot" style="font-size:12px; color:#1a73e8;">Forgot Password?</a></div>
                <button id="ta-btn-action" style="width:100%; padding:10px; background:#1a73e8; color:white; border:none; border-radius:4px; cursor:pointer;">Login</button>
                <div style="margin-top:10px; font-size:12px;">New User? <a href="#" id="ta-switch-reg" style="color:#1a73e8;">Create Account</a></div>
                <p id="ta-error" style="color:red; font-size:12px; margin-top:10px; display:none;"></p>`;
            
            container.querySelector("#ta-switch-reg").onclick = (e) => { e.preventDefault(); renderRegister(); };
            container.querySelector("#ta-forgot").onclick = (e) => { e.preventDefault(); renderReset(); };
            container.querySelector("#ta-btn-action").onclick = () => handleAuth("LOGIN");
        };

        const renderRegister = () => {
            container.innerHTML = `
                <h2>📝 Create Account</h2>
                <input id="ta-name" type="text" placeholder="Full Name" style="width:100%; padding:8px; margin-bottom:8px; box-sizing:border-box;">
                <input id="ta-dept" type="text" placeholder="Department" style="width:100%; padding:8px; margin-bottom:8px; box-sizing:border-box;">
                <input id="ta-user" type="text" placeholder="Username" style="width:100%; padding:8px; margin-bottom:8px; box-sizing:border-box;">
                <input id="ta-pass" type="password" placeholder="Password" style="width:100%; padding:8px; margin-bottom:8px; box-sizing:border-box;">
                <input id="ta-security" type="text" placeholder="Security: First School Name?" style="width:100%; padding:8px; margin-bottom:15px; box-sizing:border-box; border:2px solid #1e8e3e;">
                <button id="ta-btn-action" style="width:100%; padding:10px; background:#188038; color:white; border:none; border-radius:4px; cursor:pointer;">Register</button>
                <div style="margin-top:10px; font-size:12px;"><a href="#" id="ta-switch-login">Back to Login</a></div>
                <p id="ta-error" style="color:red; font-size:12px; margin-top:10px; display:none;"></p>`;
            container.querySelector("#ta-switch-login").onclick = (e) => { e.preventDefault(); renderLogin(); };
            container.querySelector("#ta-btn-action").onclick = () => handleAuth("REGISTER");
        };

        const renderReset = () => {
            container.innerHTML = `
                <h2>🔄 Reset Password</h2>
                <input id="ta-user" type="text" placeholder="Username" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
                <input id="ta-security" type="text" placeholder="Security Answer" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
                <input id="ta-pass" type="password" placeholder="New Password" style="width:100%; padding:10px; margin-bottom:15px; box-sizing:border-box;">
                <button id="ta-btn-action" style="width:100%; padding:10px; background:#f4b400; color:white; border:none; border-radius:4px; cursor:pointer;">Update Password</button>
                <div style="margin-top:10px; font-size:12px;"><a href="#" id="ta-switch-login">Back to Login</a></div>
                <p id="ta-error" style="color:red; font-size:12px; margin-top:10px; display:none;"></p>`;
            container.querySelector("#ta-switch-login").onclick = (e) => { e.preventDefault(); renderLogin(); };
            container.querySelector("#ta-btn-action").onclick = () => handleAuth("RESET");
        };

        const handleAuth = (type) => {
            const username = container.querySelector("#ta-user").value;
            const password = container.querySelector("#ta-pass")?.value;
            const btn = container.querySelector("#ta-btn-action");
            const err = container.querySelector("#ta-error");
            if(!username || !password) { err.innerText="Fields Required"; err.style.display="block"; return; }
            btn.innerText = "Processing...";
            let msgType = type === "REGISTER" ? "TEACHER_SIGNUP" : (type === "RESET" ? "TEACHER_RESET_PASSWORD" : "TEACHER_LOGIN");
            let payload = { username, password };
            if (type === "REGISTER") {
                payload = { ...payload, name: container.querySelector("#ta-name").value, department: container.querySelector("#ta-dept").value, securityAnswer: container.querySelector("#ta-security").value };
            } else if (type === "RESET") {
                payload = { ...payload, securityAnswer: container.querySelector("#ta-security").value, newPassword: password };
            }
            chrome.runtime.sendMessage({ type: msgType, payload }, (res) => {
                if (res && res.success) {
                    if (type === "RESET") { alert("Password updated! Please login."); renderLogin(); }
                    else { 
                        sessionStorage.setItem("ta_teacher_session", JSON.stringify({ profile: res.profile, token: res.token })); 
                        modal.remove(); 
                        initTeacherDashboard(res.profile); 
                    }
                } else { btn.innerText = type; err.innerText = res.error || "Action Failed"; err.style.display = "block"; }
            });
        };
        renderLogin();
    }

    let automationRunning = true; 

    function initTeacherDashboard(profile) {
        if (dashboardContainer) {
            if (!automationRunning && !document.body.contains(dashboardContainer)) {
                document.body.appendChild(dashboardContainer);
            }
            return;
        }

        if (!sessionStorage.getItem("ta_init_done")) {
            const cover = document.createElement("div");
            cover.id = "ta-cover-screen";
            Object.assign(cover.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", background: "white", zIndex: "99999", display: "flex", flexDirection: "column", justify: "center", alignItems: "center" });
            cover.innerHTML = `<h1 style="color:#1a73e8;">Processing...</h1><p>Detecting Quiz Content...</p>`;
            document.body.appendChild(cover);
        }
        
        dashboardContainer = document.createElement("div");
        dashboardContainer.id = "ta-teacher-controls";
        Object.assign(dashboardContainer.style, { position: "fixed", bottom: "30px", left: "30px", zIndex: "2147483647", display: "flex", flexDirection: "column", gap: "10px", background: "white", padding: "15px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)", border: "1px solid #ddd" });
        
        const header = document.createElement("div");
        Object.assign(header.style, { marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid #eee" });
        header.innerHTML = `
            <div style="font-weight:bold; color:#202124; font-size:14px;">👤 ${profile.name || "Teacher"}</div>
            <div style="font-size:12px; color:#5f6368;">🏢 ${profile.department || "General"}</div>
        `;
        dashboardContainer.appendChild(header);

        const btnDash = document.createElement("button"); btnDash.innerHTML = "📊 Open Teacher Dashboard";
        const btnKey = document.createElement("button"); btnKey.innerHTML = "⚙️ Save This Section";
        const btnStart = document.createElement("button"); btnStart.innerHTML = "🚩 Mark Quiz Start";
        const btnReset = document.createElement("button"); btnReset.innerHTML = "🗑️ Reset Cloud";

        [btnDash, btnKey, btnStart, btnReset].forEach(b => {
            Object.assign(b.style, { padding: "10px 15px", background: "#1e8e3e", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", width: "100%" });
        });
        btnDash.style.background = "#5f6368";
        btnStart.style.background = "#1a73e8"; 
        btnReset.style.background = "#d93025";

        const timeRow = document.createElement("div");
        Object.assign(timeRow.style, { display: "flex", gap: "5px", width: "100%" });
        const timeInput = document.createElement("input");
        timeInput.type = "number"; timeInput.placeholder = "Timer (mins)";
        Object.assign(timeInput.style, { padding: "10px", border: "1px solid #ccc", borderRadius: "6px", flex: "1", boxSizing: "border-box" });
        const btnSetTimer = document.createElement("button"); btnSetTimer.innerHTML = "⏳ Set Timer";
        Object.assign(btnSetTimer.style, { padding: "10px", background: "#f4b400", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" });

        timeRow.appendChild(timeInput);
        timeRow.appendChild(btnSetTimer);

        dashboardContainer.appendChild(btnDash);
        dashboardContainer.appendChild(btnKey);
        dashboardContainer.appendChild(timeRow);
        dashboardContainer.appendChild(btnStart);
        dashboardContainer.appendChild(btnReset);
        
        // --- NEW: THE AI BATCH INJECTOR ---
        let isBatchingAI = false;

        setInterval(() => {
            if (!automationRunning) {
                const el = document.getElementById("ta-teacher-controls");
                if (!el && dashboardContainer) document.body.appendChild(dashboardContainer);
                
                if (isBatchingAI) return; // Wait if we are currently talking to Gemini

                let batchTexts = [];
                let batchBoxes = [];

                document.querySelectorAll("div[role='listitem']").forEach((q) => {
                    const entryInput = q.querySelector('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
                    const titleEl = q.querySelector('div[role="heading"], .M7eMe');
                    if (!entryInput || !titleEl) return; 

                    const rawTitle = normalize(titleEl.textContent);
                    if (window.predictFormType && window.predictFormType(rawTitle) === "info") return;

                    let box = q.querySelector('.ta-comp-box');
                    
                    if (!box) {
                        box = document.createElement("div");
                        box.className = "ta-comp-box";
                        box.style.cssText = "margin-top:20px; margin-bottom:10px; padding:12px; background:#f8f9fa; border-radius:6px; display:flex; gap:10px; align-items:center; border:1px solid #dadce0;";
                        box.innerHTML = `
                            <span style="font-size:12px; font-weight:bold; color:#1a73e8;">🤖 Gemini AI:</span>
                            <span class="ta-loading-txt" style="font-size:12px; color:#f4b400; font-weight:bold;">Grading...</span>
                            <select class="ta-comp-sel" style="padding:6px; border-radius:4px; border:1px solid #ccc; font-size:12px; outline:none; display:none;">
                                <option value="none">-- Select --</option>
                                <option value="Easy">Easy</option>
                                <option value="Medium">Medium</option>
                                <option value="Hard">Hard</option>
                            </select>
                            <input type="number" class="ta-time-inp" placeholder="Secs" style="width:60px; padding:6px; border-radius:4px; border:1px solid #ccc; font-size:12px; outline:none;">
                            <span style="font-size:12px; color:#5f6368;">secs target</span>
                        `;

                        const sel = box.querySelector('.ta-comp-sel');
                        const inp = box.querySelector('.ta-time-inp');

                        sel.addEventListener('change', () => {
                            if (sel.value === "Easy") inp.value = 10;
                            else if (sel.value === "Medium") inp.value = 30;
                            else if (sel.value === "Hard") inp.value = 60;
                        });

                        const innerCard = q.firstElementChild || q;
                        innerCard.appendChild(box);

                        // Push it into our cart to send to Gemini
                        batchTexts.push(rawTitle);
                        batchBoxes.push(box);
                    }
                });

                // If we found new questions, send them all to Gemini at once!
                if (batchTexts.length > 0) {
                    isBatchingAI = true;
                    chrome.runtime.sendMessage({ type: "RUN_COMPLEXITY_BATCH", questions: batchTexts }, (res) => {
                        const answers = res?.results || [];
                        
                        batchBoxes.forEach((b, index) => {
                            const sel = b.querySelector('.ta-comp-sel');
                            const inp = b.querySelector('.ta-time-inp');
                            const loadTxt = b.querySelector('.ta-loading-txt');

                            loadTxt.style.display = 'none'; // Hide loading text
                            sel.style.display = 'inline-block'; // Show dropdown

                            // Fallback to Medium if Gemini glitches
                            let aiDecision = answers[index] || "Medium"; 
                            
                            sel.value = aiDecision;
                            if (aiDecision === "Easy") inp.value = 10;
                            else if (aiDecision === "Medium") inp.value = 30;
                            else if (aiDecision === "Hard") inp.value = 60;
                        });
                        
                        isBatchingAI = false; 
                    });
                }
            }
        }, 1500);

        btnDash.onclick = () => {
             const id = getPublicId();
             chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", payload: { mode: "teacher", formId: id === "NOT_FOUND" ? "" : id } });
        };

        const getPublicId = () => {
            const urlM = location.href.match(/forms\/d\/e\/(.*?)\//);
            if (urlM && urlM[1]) return urlM[1];
            const form = document.querySelector("form");
            if (form && form.action) {
                const m = form.action.match(/d\/e\/(.*?)\//);
                if (m && m[1]) return m[1];
            }
            const bodyMatch = document.body.innerHTML.match(/(1FAIpQLS[a-zA-Z0-9_-]+)/);
            if (bodyMatch && bodyMatch[1]) return bodyMatch[1];
            return "NOT_FOUND";
        };

        const autoFillInfo = (el, text) => {
            const input = el.querySelector("input:not([type='hidden']):not([type='radio']):not([type='checkbox']), textarea");
            if (input) {
                let val = "Test_Input";
                const lowerText = text.toLowerCase();
                const words = lowerText.replace(/[^\w\s]/gi, '').split(/\s+/);
                
                if (words.includes("email")) val = "student@gmail.com";
                else if (words.some(w => ["url", "link", "website", "linkedin", "github"].includes(w))) val = "https://www.google.com";
                else if (words.some(w => ["number", "mobile", "phone", "aadhaar", "percentage", "cgpa", "roll", "id", "erp"].includes(w))) val = "9876543210";
                else if (words.includes("name")) val = "Test Student";
                else if (words.some(w => ["address", "location"].includes(w))) val = "123 Education St";
                else if (words.includes("nationality")) val = "Indian";
                else if (words.includes("backlog")) val = "0";

                if (input.type === "date") val = "2025-01-01";
                if (input.type === "time") val = "10:00";
                if (input.type === "email") val = "student@gmail.com";
                if (input.type === "url") val = "https://www.google.com";
                if (input.type === "number") val = "9";
                
                input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const choices = el.querySelectorAll("[role='radio'], [role='checkbox']");
            if (choices.length > 0 && !el.querySelector("[aria-checked='true']")) choices[0].click();
        };

        let lastClickedQuestion = null;
        document.addEventListener("click", (e) => {
            const qBox = e.target.closest("div[role='listitem']");
            if (qBox) {
                lastClickedQuestion = qBox;
                qBox.style.outline = "2px solid #1a73e8";
                setTimeout(() => qBox.style.outline = "none", 1000);
            }
        }, true);

        btnSetTimer.onclick = () => {
            const id = getPublicId();
            if (id === "NOT_FOUND") { alert("ERROR: Could not find Quiz ID."); return; }
            const timeLimitVal = parseInt(timeInput.value) || 0; 
            
            btnSetTimer.innerHTML = "⏳...";
            
            chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: id } }, (res) => {
                const currentConfig = res.config || {};
                currentConfig.timeLimit = timeLimitVal;
                
                chrome.runtime.sendMessage({ type: "SAVE_CONFIG_TO_CLOUD", payload: { formId: id, config: currentConfig, token: CURRENT_TOKEN } }, (saveRes) => {
                    btnSetTimer.innerHTML = (saveRes && saveRes.success) ? "✅ Saved!" : "❌ Error";
                    setTimeout(() => btnSetTimer.innerHTML = "⏳ Set Timer", 2000);
                });
            });
        };

        function getUniqueTitle(rawTitle, stableId, tState) {
            if (stableId && tState.assignedTitles[stableId]) {
                return tState.assignedTitles[stableId];
            }
            if (!tState.titleCounts[rawTitle]) tState.titleCounts[rawTitle] = 0;
            tState.titleCounts[rawTitle]++;
            const c = tState.titleCounts[rawTitle];
            const ut = c === 1 ? rawTitle : `${rawTitle} (${c-1})`;
            if (stableId) tState.assignedTitles[stableId] = ut;
            return ut;
        }

        btnKey.onclick = () => {
            const id = getPublicId();
            if (id === "NOT_FOUND") { alert("ERROR: Could not find Quiz ID."); return; }
            btnKey.innerHTML = "⏳ Saving...";
            
            const tState = JSON.parse(sessionStorage.getItem("ta_teacher_state") || '{"titleCounts":{},"assignedTitles":{}}');
            const currentBatch = {};
            const currentTimings = {}; 
            
            document.querySelectorAll("div[role='listitem']").forEach((q) => {
                const titleEl = q.querySelector('div[role="heading"], .M7eMe');
                if (!titleEl) return;
                
                const baseTitle = normalize(titleEl.textContent);
                // FIX: Prevents long questions with "email" from being ignored
                if (titlesToIgnore.some(i => baseTitle.length < 30 && baseTitle.toLowerCase().includes(i))) return; 

                const entryInput = q.querySelector('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
                const stableId = (entryInput && entryInput.name) ? entryInput.name : q.getAttribute("data-item-id");
                
                const uniqueTitle = getUniqueTitle(baseTitle, stableId, tState);
                
                const selectedEls = q.querySelectorAll("[aria-checked='true']");
                let ans = "";
                if (selectedEls.length > 0) {
                    ans = Array.from(selectedEls).map(el => el.dataset?.value ? normalize(el.dataset.value) : normalize(el.closest('label')?.textContent || el.parentElement.textContent)).sort().join(" | ");
                } else {
                    // FIX: Catches text, number, and email inputs
                    const txt = q.querySelector("input:not([type='radio']):not([type='checkbox']):not([type='hidden']), textarea");
                    if (txt && txt.value) ans = normalize(txt.value);
                }
                
                if (ans) currentBatch[uniqueTitle] = ans;

                const timeInp = q.querySelector('.ta-time-inp');
                const compSel = q.querySelector('.ta-comp-sel');
                if (timeInp && timeInp.value) {
                    currentTimings[uniqueTitle] = {
                        time: parseInt(timeInp.value),
                        complexity: compSel ? compSel.value : 'none'
                    };
                }
            });
            
            sessionStorage.setItem("ta_teacher_state", JSON.stringify(tState));
            
            chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: id } }, (res) => {
                const currentConfig = res.config || {};
                currentConfig.questionTimings = { ...(currentConfig.questionTimings || {}), ...currentTimings };
                
                chrome.runtime.sendMessage({ type: "SAVE_CONFIG_TO_CLOUD", payload: { formId: id, config: currentConfig, token: CURRENT_TOKEN } }, () => {
                    chrome.runtime.sendMessage({ type: "SAVE_KEYS_TO_CLOUD", payload: { formId: id, keys: currentBatch, token: CURRENT_TOKEN } }, (saveRes) => {
                        btnKey.innerHTML = (saveRes && saveRes.success) ? `✅ Saved` : "❌ Error";
                        setTimeout(() => btnKey.innerHTML = "⚙️ Save This Section", 3000);
                    });
                });
            });
        };

        btnStart.onclick = () => {
            const id = getPublicId();
            if (id === "NOT_FOUND") { alert("ERROR: Could not find Quiz ID."); return; }
            if (!lastClickedQuestion) { alert("Click the Start Question first!"); return; }
            const title = normalize(lastClickedQuestion.querySelector('div[role="heading"], .M7eMe')?.textContent);
            
            btnStart.innerHTML = "⏳ Saving...";
            
            chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: id } }, (res) => {
                const currentConfig = res.config || {};
                currentConfig.startAnchor = title;
                
                chrome.runtime.sendMessage({ type: "SAVE_CONFIG_TO_CLOUD", payload: { formId: id, config: currentConfig, token: CURRENT_TOKEN } }, (saveRes) => {
                    btnStart.innerHTML = (saveRes && saveRes.success) ? "✅ Saved!" : "❌ Error";
                    setTimeout(() => btnStart.innerHTML = "🚩 Mark Quiz Start", 2000);
                });
            });
        };

        btnReset.onclick = () => {
            const id = getPublicId();
            if (id === "NOT_FOUND") { alert("Quiz ID not found."); return; }
            if (confirm("Reset Quiz Data?")) {
                btnReset.innerHTML = "⏳ Deleting...";
                chrome.runtime.sendMessage({ type: "RESET_CLOUD_KEYS", payload: { formId: id, token: CURRENT_TOKEN } }, (res) => {
                    if(res && res.success) {
                        sessionStorage.removeItem("ta_form_id");
                        sessionStorage.removeItem("ta_teacher_state");
                        btnReset.innerHTML = "✅ Reset Done";
                        setTimeout(() => btnReset.innerHTML = "🗑️ Reset Cloud", 2000);
                    } else {
                        alert("Reset Failed: " + (res.error || "Check Login"));
                        btnReset.innerHTML = "❌ Failed";
                    }
                });
            }
        };

        // FIX: Extended timeout to 10 seconds to give AI enough time to load without interrupting Auto-Skip
        const safetyTimeout = setTimeout(() => { if (automationRunning) stopAutomation(); }, 10000);
        
        const loopId = setInterval(() => {
            if (!automationRunning || window.ta_is_navigating) return;
            
            const items = document.querySelectorAll("div[role='listitem']");
            if (items.length === 0) return;

            let realQuizCount = 0;
            let infoQuestionsToFill = [];
            let aiThinking = false;

            items.forEach(el => {
                const title = normalize(el.querySelector('div[role="heading"], .M7eMe')?.textContent || "");
                if (!title) return;

                const hasInput = el.querySelector('input, textarea, [role="radio"], [role="checkbox"], [role="listbox"], [role="option"]');
                if (!hasInput) return;

                let prediction = window.predictFormType ? window.predictFormType(title) : "quiz";

                if (prediction === "pending") {
                    aiThinking = true;
                    return;
                }

                let isInfo = (prediction === "info");
                let isQuiz = (prediction === "quiz");

                if (isQuiz) {
                    realQuizCount++;
                } else if (isInfo) {
                    infoQuestionsToFill.push({ element: el, text: title });
                }
            });

            if (aiThinking) return;

            if (realQuizCount > 0) {
                clearTimeout(safetyTimeout); 
                stopAutomation(); 
            } else if (infoQuestionsToFill.length > 0) {
                infoQuestionsToFill.forEach(q => {
                    autoFillInfo(q.element, q.text);
                });
                
                window.ta_is_navigating = true; 
                
                setTimeout(() => {
                    let nextBtn = null;
                    const spans = Array.from(document.querySelectorAll("span")); 
                    const targetSpan = spans.find(s => s.innerText.toLowerCase().includes("next") || s.innerText.includes("आगे")); 
                    if (targetSpan) nextBtn = targetSpan.closest("div[role='button']"); 

                    if (!nextBtn) {
                        const buttons = Array.from(document.querySelectorAll("div[role='button']"));
                        nextBtn = buttons.find(b => b.innerText.toLowerCase().includes("next") || b.innerText.includes("आगे"));
                    }

                    if (nextBtn) { 
                        nextBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        nextBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        nextBtn.click(); 
                    }
                    
                    setTimeout(() => { window.ta_is_navigating = false; }, 1500);
                }, 500); 
            }
        }, 1000);

        function stopAutomation() {
            automationRunning = false; 
            clearInterval(loopId);
            const c = document.getElementById("ta-cover-screen"); if(c) c.remove();
            sessionStorage.setItem("ta_init_done", "true");
            
            if (!document.getElementById("ta-teacher-controls")) {
                document.body.appendChild(dashboardContainer);
            }
        }
    }
})();