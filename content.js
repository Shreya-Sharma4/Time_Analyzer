(function () {
    if (!location.href.includes("/d/e/")) return; 
    if (!location.pathname.includes("/viewform") && !location.pathname.includes("/formResponse")) return;

    const SESSION_KEY = "ta_session_id";
    const UID_KEY = "ta_student_uid";
    const USER_KEY = "ta_student_username";
    const FORM_ID_KEY = "ta_form_id_cache"; 
    
    const getFormId = () => {
        let m = location.href.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
        if (m && m[1]) return m[1];
        m = location.href.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (m && m[1]) return m[1];
        const cached = sessionStorage.getItem(FORM_ID_KEY);
        if (cached) return cached;
        return "UNKNOWN";
    };

    // FIX 1: Prevent crash on long questions via .substring(0, 700)
    const normalize = (s) => s ? s.replace(/[*.\#$\[\]\/]/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 700) : "";

    const existingSession = sessionStorage.getItem(SESSION_KEY);
    const existingUid = sessionStorage.getItem(UID_KEY);
    const existingUser = sessionStorage.getItem(USER_KEY);

    const currentId = getFormId();
    if (currentId !== "UNKNOWN") sessionStorage.setItem(FORM_ID_KEY, currentId);

    if (existingSession && existingUid) {
        chrome.storage.local.set({ "active_student_uid": existingUid }); 
        startTrackingLogic(existingSession, existingUid, existingUser);
    } else {
        if (location.pathname.includes("/viewform")) { showLoginUI(); }
    }

    function showLoginUI() {
        if (document.getElementById("ta-student-login-box")) return;

        sessionStorage.clear();
        chrome.storage.local.remove(["active_student_uid", "activeSession", "tempAnswers"]);
        const overlay = document.createElement("div");
        overlay.id = "ta-student-login-box";
        Object.assign(overlay.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", background: "rgba(255,255,255,0.96)", backdropFilter: "blur(5px)", zIndex: "2147483647", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "'Segoe UI', Roboto, sans-serif", overflowY: "auto" });
        
        const box = document.createElement("div");
        Object.assign(box.style, { padding: "40px", border: "1px solid #dadce0", background: "white", borderRadius: "8px", textAlign: "center", width: "380px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" });
        
        // --- ADDED: Enter key support for student forms overlay ---
        box.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const btn = box.querySelector("#std-btn");
                if (btn) btn.click();
            }
        });
        // ----------------------------------------------------------

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // FIX: Replaced document.getElementById with box.querySelector to prevent the White Box crash
        const renderLogin = () => {
            box.innerHTML = `
                <h2 style="margin-top:0; color:#202124; font-size:24px; font-weight:500; margin-bottom:10px;">Student Login</h2>
                <input id="std-user" type="text" placeholder="Username" style="display:block; width:100%; padding:10px 12px; margin-bottom:15px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <input id="std-pass" type="password" placeholder="Password" style="display:block; width:100%; padding:10px 12px; margin-bottom:5px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <div style="text-align:right; margin-bottom:25px;"><a href="#" id="std-forgot" style="font-size:12px; color:#1a73e8; text-decoration:none;">Forgot password?</a></div>
                <button id="std-btn" style="width:100%; padding:10px 24px; background:#1a73e8; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:500; font-size:14px;">Next</button>
                <div style="margin-top:25px; font-size:13px;">Not registered? <a href="#" id="std-reg" style="color:#1a73e8; text-decoration:none;">Create account</a></div>
                <p id="std-err" style="color:#d93025; font-size:12px; margin-top:20px; display:none;"></p>`;
            
            box.querySelector("#std-reg").onclick = (e) => { e.preventDefault(); renderRegister(); };
            box.querySelector("#std-forgot").onclick = (e) => { e.preventDefault(); renderReset(); }; 
            box.querySelector("#std-btn").onclick = () => doAuth("LOGIN");
        };

        const renderRegister = () => {
            box.innerHTML = `
                <h2 style="margin-top:0; color:#202124; font-size:24px; font-weight:500; margin-bottom:10px;">Create Account</h2>
                <input id="std-user" type="text" placeholder="Choose Username" style="display:block; width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <input id="std-pass" type="password" placeholder="Create Password" style="display:block; width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <input id="std-sec" type="text" placeholder="Security Question (First Pet?)" style="display:block; width:100%; padding:10px 12px; margin-bottom:25px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <button id="std-btn" style="width:100%; padding:10px 24px; background:#188038; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:500; font-size:14px;">Register</button>
                <div style="margin-top:20px;"><a href="#" id="std-back" style="color:#1a73e8; font-size:13px; text-decoration:none;">Back to Login</a></div>
                <p id="std-err" style="color:#d93025; font-size:12px; margin-top:15px; display:none;"></p>`;
            box.querySelector("#std-back").onclick = (e) => { e.preventDefault(); renderLogin(); };
            box.querySelector("#std-btn").onclick = () => doAuth("REGISTER");
        };

        const renderReset = () => {
            box.innerHTML = `
                <h2 style="margin-top:0; color:#202124; font-size:24px; font-weight:500; margin-bottom:10px;">Reset Password</h2>
                <input id="std-user" type="text" placeholder="Username" style="display:block; width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <input id="std-sec" type="text" placeholder="Security Answer" style="display:block; width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <input id="std-pass" type="password" placeholder="New Password" style="display:block; width:100%; padding:10px 12px; margin-bottom:25px; border:1px solid #dadce0; border-radius:4px; box-sizing:border-box; font-size:14px;">
                <button id="std-btn" style="width:100%; padding:10px 24px; background:#f4b400; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:500; font-size:14px;">Update</button>
                <div style="margin-top:20px;"><a href="#" id="std-back" style="color:#1a73e8; font-size:13px; text-decoration:none;">Back to Login</a></div>
                <p id="std-err" style="color:red; font-size:12px; margin-top:15px; display:none;"></p>`;
            box.querySelector("#std-back").onclick = (e) => { e.preventDefault(); renderLogin(); };
            box.querySelector("#std-btn").onclick = () => doAuth("RESET");
        };

        const doAuth = (type) => {
            const username = box.querySelector("#std-user").value;
            const password = box.querySelector("#std-pass")?.value;
            const btn = box.querySelector("#std-btn");
            const err = box.querySelector("#std-err");
            if (!username) { err.innerText = "Username required."; err.style.display="block"; return; }
            if (type !== "RESET" && !password) { err.innerText = "Password required."; err.style.display="block"; return; }
            btn.innerText = "Processing...";
            let msgType = "STUDENT_LOGIN";
            let payload = { username, password };
            if (type === "REGISTER") { msgType = "STUDENT_SIGNUP"; payload.securityAnswer = box.querySelector("#std-sec").value; }
            else if (type === "RESET") { msgType = "STUDENT_RESET_PASSWORD"; payload = { username, securityAnswer: box.querySelector("#std-sec").value, newPassword: password }; }
            chrome.runtime.sendMessage({ type: msgType, payload }, (res) => {
                if (res && res.success) {
                    if (type === "RESET") { alert("Password Updated! Please Login."); renderLogin(); }
                    else if (type === "REGISTER") { alert("Success! Please Login."); renderLogin(); }
                    else {
                        const newSessId = Date.now().toString(36);
                        const fid = getFormId();
                        chrome.storage.local.get(["activeSession"], (db) => {
                            const sessions = db.activeSession || {};
                            if(fid !== "UNKNOWN") delete sessions[fid]; 
                            chrome.storage.local.set({ "activeSession": sessions, "active_student_uid": res.uid }, () => {
                                sessionStorage.setItem(SESSION_KEY, newSessId);
                                sessionStorage.setItem(UID_KEY, res.uid);
                                sessionStorage.setItem(USER_KEY, username);
                                if(fid !== "UNKNOWN") sessionStorage.setItem(FORM_ID_KEY, fid);
                                overlay.remove();
                                window.ta_tracking_started = true;
                                startTrackingLogic(newSessId, res.uid, username);
                            });
                        });
                    }
                } else { btn.innerText = "Retry"; err.innerText = res.error || "Failed"; err.style.display="block"; }
            });
        };
        renderLogin();
    }

    function startTrackingLogic(SESSION_ID, STUDENT_UID, STUDENT_USERNAME) {
        const STATE = { perQ: new Map(), capturedAnswers: {}, titleCounts: {}, assignedTitles: {}, startedAt: null, quizActive: false, submitted: false, tabSwitches: 0, anchorTriggered: false, penaltyTriggered: false, penaltyTs: 0, formId: getFormId(), masterKeys: {}, activeFocusMap: {}, startAnchor: null, lastActionTime: Date.now(), timeLimitMs: 0 };
        let hasFinalized = false, isInitialized = false;
        const titlesToIgnore = ["email", "quiz", "name", "roll no", "section", "class"];

        function getUniqueTitle(rawTitle, stableId) {
            if (stableId && STATE.assignedTitles[stableId]) {
                return STATE.assignedTitles[stableId];
            }
            if (!STATE.titleCounts[rawTitle]) STATE.titleCounts[rawTitle] = 0;
            STATE.titleCounts[rawTitle]++;
            const c = STATE.titleCounts[rawTitle];
            const ut = c === 1 ? rawTitle : `${rawTitle} (${c-1})`;
            if (stableId) STATE.assignedTitles[stableId] = ut;
            return ut;
        }

        function showToast(msg, isError = false) {
            let toast = document.getElementById("ta-toast");
            if (!toast) {
                toast = document.createElement("div"); toast.id = "ta-toast";
                Object.assign(toast.style, { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483647", padding: "15px 25px", borderRadius: "8px", color: "white", fontWeight: "bold", fontSize: "16px", boxShadow: "0 4px 15px rgba(0,0,0,0.3)", transition: "opacity 0.5s", pointerEvents: "none" });
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.background = isError ? "#d93025" : "#e65100";
            toast.style.opacity = "1";
            if(!isError) setTimeout(() => { toast.style.opacity = "0"; }, 4000);
        }

        let timerIntervalId = null;
        function initTimerUI() {
            if (document.getElementById("ta-timer")) return;
            const box = document.createElement("div"); box.id = "ta-timer";
            Object.assign(box.style, { position: "fixed", right: "20px", top: "20px", zIndex: "9999", padding: "10px", background: "#333", color: "#fff", borderRadius: "8px", fontWeight: "bold", pointerEvents: "none" });
            document.body.appendChild(box);
            
            if (!timerIntervalId) {
                timerIntervalId = setInterval(() => {
                    const tBox = document.getElementById("ta-timer");
                    if (!tBox) return;

                    if (STATE.submitted || STATE.penaltyTriggered || !STATE.startedAt) return;
                    
                    const elapsedMs = Date.now() - STATE.startedAt;
                    
                    if (STATE.timeLimitMs > 0) {
                        const remaining = STATE.timeLimitMs - elapsedMs;
                        if (remaining <= 0) {
                            tBox.textContent = `⏱ TIME UP!`;
                            initiatePenaltySequence("time");
                        } else {
                            const m = Math.floor(remaining / 60000);
                            const s = Math.floor((remaining % 60000) / 1000);
                            tBox.textContent = `⏱ Remaining: ${m}m ${s}s`;
                        }
                    } else {
                        tBox.textContent = `⏱ LIVE: ${Math.floor(elapsedMs / 1000)}s`;
                    }
                    
                    if (Date.now() % 2000 < 100) saveSession();
                }, 100);
            }
        }

        function saveSession(cb) {
            if (STATE.formId === "UNKNOWN") { if(cb) cb(); return; }
            const perQObj = {}; STATE.perQ.forEach((v, k) => { perQObj[k] = v; });
            
            const currentAnswers = { ...STATE.capturedAnswers }; 
            document.querySelectorAll("div[role='listitem']").forEach((q) => {
                const titleEl = q.querySelector('div[role="heading"], .M7eMe');
                if (!titleEl) return;
                const rawTitle = normalize(titleEl.textContent);
                
                // FIX: Prevents long questions with the word 'email' from being ignored
                if (titlesToIgnore.some(i => rawTitle.length < 30 && rawTitle.toLowerCase().includes(i))) return;
                
                const entryInput = q.querySelector('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
                const stableId = entryInput?.name;
                const uniqueTitle = stableId && STATE.assignedTitles[stableId] ? STATE.assignedTitles[stableId] : rawTitle;
                
                const selectedEls = q.querySelectorAll("[aria-checked='true']");
                let ans = "";
                if (selectedEls.length > 0) {
                    ans = Array.from(selectedEls).map(el => el.dataset?.value ? normalize(el.dataset.value) : normalize(el.closest('label')?.textContent || el.parentElement.textContent)).sort().join(" | ");
                } else {
                    // FIX: Catches text, numbers, and emails
                    const txt = q.querySelector("input:not([type='radio']):not([type='checkbox']):not([type='hidden']), textarea");
                    if (txt) ans = normalize(txt.value);
                }
                if (ans) currentAnswers[uniqueTitle] = ans;
            });
            STATE.capturedAnswers = currentAnswers;

            chrome.storage.local.get(["activeSession", "tempAnswers"], (res) => {
                const sessions = res.activeSession || {};
                sessions[STATE.formId] = { startedAt: STATE.startedAt, tabSwitches: STATE.tabSwitches, titleCounts: STATE.titleCounts, assignedTitles: STATE.assignedTitles, anchorTriggered: STATE.anchorTriggered, lastUpdated: Date.now(), penaltyTs: STATE.penaltyTs, perQuestionData: perQObj, lastActionTime: STATE.lastActionTime };
                
                const tAnswers = res.tempAnswers || {};
                tAnswers[STATE.formId] = currentAnswers;
                
                chrome.storage.local.set({ activeSession: sessions, tempAnswers: tAnswers }, () => { if (cb) cb(); });
            });
        }

        function initialize() {
            const pageText = document.body.innerText.toLowerCase();
            if (location.pathname.includes("/formResponse") && (pageText.includes("recorded") || pageText.includes("score"))) { finalizeAndOpenDashboard(); return; }
            chrome.storage.local.get(["activeSession", "tempAnswers"], (res) => {
                if (res.tempAnswers?.[STATE.formId]) STATE.capturedAnswers = res.tempAnswers[STATE.formId];
                chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: STATE.formId } }, (cloudRes) => {
                    if (cloudRes?.success) { 
                        STATE.masterKeys = cloudRes.keys || {}; 
                        STATE.startAnchor = cloudRes.config?.startAnchor; 
                        STATE.timeLimitMs = (cloudRes.config?.timeLimit || 0) * 60000;
                    }
                    
                    if (res.activeSession?.[STATE.formId]) {
                        const sess = res.activeSession[STATE.formId];
                        STATE.startedAt = sess.startedAt; STATE.tabSwitches = sess.tabSwitches || 0; STATE.titleCounts = sess.titleCounts || {}; STATE.assignedTitles = sess.assignedTitles || {}; STATE.anchorTriggered = sess.anchorTriggered || false; STATE.penaltyTs = sess.penaltyTs || 0; STATE.lastActionTime = Date.now();
                        if (sess.perQuestionData) Object.keys(sess.perQuestionData).forEach(k => STATE.perQ.set(k, sess.perQuestionData[k]));
                        STATE.quizActive = true; initTimerUI(); if (STATE.tabSwitches >= 3) initiatePenaltySequence("tab");
                    } else {
                        Object.keys(STATE.capturedAnswers).forEach(t => { let b = t.match(/\(\d+\)$/) ? t.replace(/\s\(\d+\)$/, "").trim() : t; if (!STATE.titleCounts[b]) STATE.titleCounts[b] = 0; STATE.titleCounts[b]++; });
                        
                        if (!STATE.startAnchor) {
                            STATE.quizActive = true;
                            STATE.startedAt = Date.now();
                            STATE.lastActionTime = STATE.startedAt;
                            saveSession();
                            initTimerUI();
                        }
                    }
                    isInitialized = true; scan();
                });
            });
        }
        initialize();

        function finalizeAndOpenDashboard() {
            if (hasFinalized) return; hasFinalized = true;
            chrome.storage.local.get(["tempAnswers", "activeSession"], (res) => {
                const sessData = res.activeSession?.[STATE.formId]; if (!sessData) return;
                const totalMs = Date.now() - (sessData.startedAt || STATE.startedAt || Date.now());
                const finalData = { 
                    sessionId: SESSION_ID, 
                    studentUid: STUDENT_UID, 
                    studentUsername: STUDENT_USERNAME || "Student", 
                    formId: STATE.formId, 
                    totalElapsedMs: totalMs, 
                    tabSwitches: sessData.tabSwitches ?? STATE.tabSwitches, 
                    answers: res.tempAnswers?.[STATE.formId] || {}, 
                    timing: sessData.perQuestionData || Object.fromEntries(STATE.perQ) 
                };
                chrome.runtime.sendMessage({ type: "SAVE_STUDENT_RESULT", payload: { uid: STUDENT_UID, data: finalData } });
                chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
                const sessions = res.activeSession || {}; delete sessions[STATE.formId]; chrome.storage.local.set({ activeSession: sessions });
            });
        }

        const obs = new MutationObserver(() => scan());
        obs.observe(document.body, { childList: true, subtree: true });

        function stopAllTracking() {
            const now = Date.now();
            Object.keys(STATE.activeFocusMap).forEach(key => {
                const dur = now - STATE.activeFocusMap[key];
                if (dur > 0 && STATE.perQ.has(key)) STATE.perQ.get(key).totalActiveMs += dur;
                delete STATE.activeFocusMap[key];
            });
        }

        function scan() {
            if (!isInitialized) return;
            if (STATE.formId === "UNKNOWN") { STATE.formId = getFormId(); if(STATE.formId !== "UNKNOWN") sessionStorage.setItem(FORM_ID_KEY, STATE.formId); }
            
            if (STATE.quizActive && !document.getElementById("ta-timer") && !STATE.submitted) {
                initTimerUI();
            }

            if (STATE.startAnchor && !STATE.anchorTriggered) {
                let foundAnchor = false;
                document.querySelectorAll("div[role='listitem']").forEach((el) => {
                    const titleEl = el.querySelector('div[role="heading"], .M7eMe');
                    if (titleEl && normalize(titleEl.textContent).includes(STATE.startAnchor)) foundAnchor = true;
                });
                
                if (foundAnchor) {
                    STATE.anchorTriggered = true;
                    STATE.quizActive = true;
                    STATE.startedAt = Date.now();
                    STATE.lastActionTime = STATE.startedAt;
                    saveSession();
                    initTimerUI();
                } else {
                    return; 
                }
            }

            document.querySelectorAll("div[role='listitem']").forEach((el) => {
                const titleEl = el.querySelector('div[role="heading"], .M7eMe');
                const rawTitle = normalize(titleEl?.textContent);
                if (!rawTitle || titlesToIgnore.some(i => rawTitle.length < 30 && rawTitle.toLowerCase().includes(i))) return;
                
                if (!STATE.startedAt) { STATE.quizActive = true; STATE.startedAt = Date.now(); STATE.lastActionTime = STATE.startedAt; saveSession(); initTimerUI(); }
                if (!STATE.quizActive) return;
                
                const entryInput = el.querySelector('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
                const stableId = entryInput?.name;
                let uniqueTitle = stableId ? (STATE.assignedTitles[stableId] || (() => { if (!STATE.titleCounts[rawTitle]) STATE.titleCounts[rawTitle] = 0; STATE.titleCounts[rawTitle]++; const c = STATE.titleCounts[rawTitle]; const ut = c === 1 ? rawTitle : `${rawTitle} (${c-1})`; STATE.assignedTitles[stableId] = ut; saveSession(); return ut; })()) : rawTitle;

                if (!STATE.perQ.has(uniqueTitle)) STATE.perQ.set(uniqueTitle, { firstFocusAt: null, reactionMs: 0, totalActiveMs: 0 });
                if (!el.dataset.taTimerBound) {
                    el.dataset.taTimerBound = "1";
                    const startTracking = () => { if (STATE.quizActive && !STATE.penaltyTriggered && !STATE.activeFocusMap[uniqueTitle]) STATE.activeFocusMap[uniqueTitle] = Date.now(); };
                    const stopTracking = () => { if (STATE.activeFocusMap[uniqueTitle]) { const dur = Date.now() - STATE.activeFocusMap[uniqueTitle]; if(dur > 0) STATE.perQ.get(uniqueTitle).totalActiveMs += dur; delete STATE.activeFocusMap[uniqueTitle]; } };
                    el.addEventListener("mouseenter", startTracking); el.addEventListener("mouseleave", stopTracking);
                    el.querySelectorAll("input, textarea, [role='radio'], [role='checkbox']").forEach(inp => {
                        inp.addEventListener("click", () => {
                            if (STATE.penaltyTriggered) return;
                            const now = Date.now(); const interval = now - (STATE.lastActionTime || STATE.startedAt);
                            if (interval > 50) { STATE.perQ.get(uniqueTitle).reactionMs += interval; STATE.lastActionTime = now; }
                            stopTracking(); startTracking(); saveSession();
                        });
                    });
                }
            });
        }

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === 'hidden') {
                stopAllTracking();
                if (STATE.quizActive && !STATE.submitted && !STATE.penaltyTriggered) {
                    STATE.tabSwitches++; saveSession();
                    if (STATE.tabSwitches === 1) showToast("⚠️ WARNING (1/3): Tab switch detected.");
                    else if (STATE.tabSwitches === 2) showToast("⚠️ CRITICAL (2/3): Next switch will auto-submit!");
                    else if (STATE.tabSwitches >= 3) initiatePenaltySequence("tab");
                }
            }
        });

        function initiatePenaltySequence(reason = "tab") {
            if (STATE.submitted || STATE.penaltyTriggered) return;
            STATE.penaltyTriggered = true; STATE.penaltyTs = Date.now(); saveSession();
            
            if (reason === "time") {
                showToast("⏰ TIME UP: Auto-filling & Submitting...", true);
            } else {
                showToast("🚫 VIOLATION (3/3): Auto-filling & Submitting...", true);
            }
            runPenaltyStep();
        }

        function runPenaltyStep() {
            document.body.style.overflow = "auto";
            document.querySelectorAll("[role='dialog']").forEach(d => { const b = d.querySelector("[role='button']"); if(b) b.click(); d.remove(); });
            
            document.querySelectorAll("div[role='listitem']").forEach((el) => {
                if (el.offsetHeight === 0) return; 
                
                const isAnswered = !!el.querySelector("[aria-checked='true']");
                const textInput = el.querySelector("input:not([type='radio']):not([type='checkbox']):not([type='hidden']), textarea");
                const isTextAnswered = textInput && !!textInput.value;

                if (!isAnswered && !isTextAnswered) {
                    const entryInput = el.querySelector('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
                    const stableId = entryInput ? entryInput.name : null;
                    const titleEl = el.querySelector('div[role="heading"], .M7eMe');
                    const rawTitle = normalize(titleEl ? titleEl.textContent : "");
                    const uniqueTitle = stableId && STATE.assignedTitles[stableId] ? STATE.assignedTitles[stableId] : rawTitle;

                    if (!STATE.perQ.has(uniqueTitle)) STATE.perQ.set(uniqueTitle, { firstFocusAt: 0, reactionMs: 0, totalActiveMs: 0 });

                    if (textInput) { 
                        textInput.focus && textInput.focus();
                        textInput.value = "DISQUALIFIED"; 
                        textInput.dispatchEvent(new Event('input', { bubbles: true })); 
                        textInput.dispatchEvent(new Event('change', { bubbles: true }));
                        textInput.blur && textInput.blur();
                        STATE.capturedAnswers[uniqueTitle] = "DISQUALIFIED"; 
                    } else {
                        const options = el.querySelectorAll("[role='radio'], [role='checkbox']");
                        if (options.length > 0) {
                            const correctVal = STATE.masterKeys[uniqueTitle];
                            let optionToClick = null;
                            if (correctVal) { 
                                for (let i = 0; i < options.length; i++) { 
                                    const optLabel = options[i].closest('label') || options[i].parentElement; 
                                    const optText = normalize(optLabel.textContent); 
                                    if (optText !== correctVal) { optionToClick = options[i]; break; } 
                                } 
                            }
                            if (!optionToClick) { const randomIdx = Math.floor(Math.random() * options.length); optionToClick = options[randomIdx]; }
                            
                            optionToClick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            optionToClick.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                            optionToClick.click();
                            
                            const labelText = optionToClick.dataset?.value || (optionToClick.closest('label') ? optionToClick.closest('label').textContent : optionToClick.parentElement.textContent);
                            if (labelText) STATE.capturedAnswers[uniqueTitle] = normalize(labelText);
                        }
                    }
                }
            });

            chrome.storage.local.get(["tempAnswers"], (res) => {
                const temp = res.tempAnswers || {}; temp[STATE.formId] = { ...temp[STATE.formId], ...STATE.capturedAnswers };
                chrome.storage.local.set({ tempAnswers: temp }, () => { saveSession(); setTimeout(attemptNavigation, 500); });
            });
        }

        function attemptNavigation() {
            let btn = document.querySelector("div[role='button'][jsname='M2UYVd']");
            if (!btn) { 
                const spans = Array.from(document.querySelectorAll("span")); 
                const targetSpan = spans.find(s => ["submit", "next", "आगे", "जमा करें"].some(t => s.innerText.toLowerCase().includes(t))); 
                if (targetSpan) btn = targetSpan.closest("div[role='button']"); 
            }
            if (!btn) {
                const buttons = Array.from(document.querySelectorAll("div[role='button']"));
                btn = buttons.find(b => ["submit", "next", "आगे", "जमा करें"].some(t => b.innerText.toLowerCase().includes(t)));
            }

            if (btn) { 
                btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                btn.click(); 
            }
        }
    }
})();