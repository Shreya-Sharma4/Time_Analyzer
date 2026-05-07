document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherMode = urlParams.get('mode') === 'teacher';
    const targetFormId = urlParams.get('formId'); 
    
    if (isTeacherMode) {
        document.getElementById("dashboard-login").style.display = "none";
        document.getElementById("dashboard-content").style.display = "block";
        document.getElementById("user-welcome").innerText = "Teacher Administration";
        loadTeacherDashboard(targetFormId);
    }

    document.getElementById("logout-btn").onclick = () => {
        sessionStorage.clear();
        window.history.replaceState({}, document.title, window.location.pathname);
        location.reload();
    };

    document.getElementById("dash-btn").onclick = () => {
        const username = document.getElementById("dash-user").value;
        const password = document.getElementById("dash-pass").value;
        chrome.runtime.sendMessage({ type: "STUDENT_LOGIN", payload: { username, password } }, (res) => {
            if (res && res.success) {
                document.getElementById("dashboard-login").style.display = "none";
                document.getElementById("dashboard-content").style.display = "block";
                document.getElementById("user-welcome").innerText = `Student: ${username}`;
                loadStudentDashboard(res.uid, username);
            } else {
                document.getElementById("dash-error").innerText = "Invalid Student Credentials";
                document.getElementById("dash-error").style.display = "block";
            }
        });
    };

    // --- ADDED: Enter key support for student dashboard login ---
    document.getElementById("dashboard-login").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            document.getElementById("dash-btn").click();
        }
    });
    // ------------------------------------------------------------

    let allStudentData = [];

    async function loadTeacherDashboard(currentFormId) {
        document.getElementById("teacher-view").style.display = "block";
        const students = await fetch(`https://time-analyzer-453ed-default-rtdb.firebaseio.com/students.json`).then(r => r.json());
        
        const tbody = document.getElementById("teacher-table-body");
        tbody.innerHTML = "";
        allStudentData = [];

        const formIdsSet = new Set();
        Object.values(students || {}).forEach(s => {
            if (s.results) Object.keys(s.results).forEach(id => formIdsSet.add(id));
            if (s.last_result?.formId) formIdsSet.add(s.last_result.formId);
        });
        const formIds = [...formIdsSet];

        const keysMap = {};
        for(const fid of formIds) {
             const kRes = await new Promise(resolve => chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: fid } }, resolve));
             if(kRes && kRes.keys) keysMap[fid] = kRes.keys;
        }

        let studentCount = 0;

        Object.values(students || {}).forEach(std => {
            let resultsToProcess = [];
            
            if (currentFormId) {
                if (std.results && std.results[currentFormId]) {
                    resultsToProcess.push(std.results[currentFormId]);
                } else if (std.last_result && std.last_result.formId === currentFormId) {
                    resultsToProcess.push(std.last_result); 
                }
            } else {
                if (std.results) {
                    resultsToProcess = Object.values(std.results);
                } else if (std.last_result) {
                    resultsToProcess.push(std.last_result);
                }
            }

            resultsToProcess.forEach(res => {
                studentCount++;
                const keys = keysMap[res.formId] || {};
                
                let correct = 0, total = 0;
                Object.keys(keys).forEach(q => { 
                    const correctAns = keys[q];
                    if (correctAns) {
                        total++; 
                        const studentAns = res.answers && res.answers[q] ? res.answers[q] : "Not Answered";
                        const cleanStudent = studentAns.toLowerCase().trim();
                        const cleanKey = correctAns.toLowerCase().trim();
                        if(cleanStudent === cleanKey) correct++; 
                    }
                });

                const acc = total > 0 ? Math.round((correct/total)*100) : 0;
                const timeSec = Math.floor(res.totalElapsedMs/1000);
                
                let type = "Average";
                if (acc > 80 && timeSec < 60) type = "🚀 Fast & Accurate";
                else if (acc > 80) type = "🧠 Deep Thinker";
                else if (acc <= 80 && timeSec < 30) type = "🏃 Rusher";

                const stdRecord = { 
                    username: std.username, 
                    computedAccuracy: acc, 
                    computedType: type, 
                    currentResult: res 
                };
                allStudentData.push(stdRecord);

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${std.username}</td>
                    <td>${acc}%</td>
                    <td>${timeSec}s</td>
                    <td><span class="badge ${res.tabSwitches > 1 ? 'red' : 'green'}">${res.tabSwitches > 1 ? 'Suspicious' : 'Clean'}</span></td>
                    <td>${type}</td>
                `;
                tbody.appendChild(row);
            });
        });

        if (studentCount === 0) {
            const emptyRow = document.createElement("tr");
            emptyRow.innerHTML = `<td colspan="5" style="text-align:center; padding: 20px; color: #5f6368;">No students have submitted this specific quiz yet.</td>`;
            tbody.appendChild(emptyRow);
        }
    }

    document.getElementById("download-report-btn").onclick = () => {
        if (allStudentData.length === 0) { alert("No data to download."); return; }
        let csvContent = "data:text/csv;charset=utf-8,Username,Accuracy (%),Total Time (s),Integrity,Student Type\n";
        allStudentData.forEach(std => {
            const res = std.currentResult;
            const integrity = res.tabSwitches > 1 ? 'Suspicious' : 'Clean';
            csvContent += `${std.username},${std.computedAccuracy || 0},${Math.floor(res.totalElapsedMs/1000)},${integrity},${std.computedType || "Average"}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "class_report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    function loadStudentDashboard(uid, username) {
        document.getElementById("student-view").style.display = "block";
        chrome.runtime.sendMessage({ type: "GET_STUDENT_RESULT", payload: { uid } }, (res) => {
            if (res && res.success && res.data) {
                const d = res.data;
                chrome.runtime.sendMessage({ type: "GET_KEYS_FROM_CLOUD", payload: { formId: d.formId } }, (keyRes) => {
                    const keys = keyRes.keys || {};
                    const config = keyRes.config || {}; 
                    const qTimings = config.questionTimings || {}; 
                    
                    let correct = 0, total = 0;
                    const tbody = document.getElementById("student-table-body");
                    tbody.innerHTML = "";

                    const allQuestions = new Set([...Object.keys(keys), ...Object.keys(d.answers || {})]);
                    const totalQuestions = allQuestions.size;
                    
                    let speedCounts = { Fast: 0, Medium: 0, Slow: 0, NotAnswered: 0 }; 

                    allQuestions.forEach(q => {
                        const studentAns = d.answers && d.answers[q] ? d.answers[q] : "Not Answered";
                        const correctAns = keys[q];
                        let isCorrect = false;
                        let resultHtml = "";

                        if (correctAns) {
                            total++;
                            const cleanStudent = studentAns.toLowerCase().trim();
                            const cleanKey = correctAns.toLowerCase().trim();
                            
                            isCorrect = (cleanStudent === cleanKey);
                            if(isCorrect) correct++;
                            
                            resultHtml = `<span class="${isCorrect ? 'green' : 'red'}">${isCorrect ? '✔' : '✘'}</span>`;
                        } else {
                            resultHtml = `<span style="color:#aaa;">- No Key -</span>`;
                        }

                        const timing = d.timing && d.timing[q] ? d.timing[q] : { reactionMs: 0, totalActiveMs: 0 };
                        const reactionSec = Math.round(timing.reactionMs/1000);
                        const focusSec = Math.round(timing.totalActiveMs/1000);

                        let speedText = "Medium";
                        let speedColor = "#f4b400";
                        let target = 45; 
                        
                        if (qTimings[q] && qTimings[q].time) {
                            target = qTimings[q].time;
                        }

                        // FIX: Now checking reactionSec instead of focusSec!
                        if (studentAns === "Not Answered" || studentAns === "" || studentAns === "DISQUALIFIED") {
                            speedText = "Not Answered";
                            speedColor = "#9aa0a6"; // Grey
                            speedCounts.NotAnswered++;
                        } else if (reactionSec < (target * 0.8)) {
                            speedText = "Fast"; 
                            speedColor = "#137333"; 
                            speedCounts.Fast++;
                        } else if (reactionSec > (target * 1.2)) {
                            speedText = "Slow"; 
                            speedColor = "#c5221f"; 
                            speedCounts.Slow++;
                        } else {
                            speedText = "Medium"; 
                            speedColor = "#f4b400"; 
                            speedCounts.Medium++;
                        }

                        const row = document.createElement("tr");
                        row.innerHTML = `<td>${q}</td><td>${reactionSec}s</td><td>${focusSec}s</td><td>${resultHtml}</td><td style="color:${speedColor}; font-weight:bold;">${speedText}</td>`;
                        tbody.appendChild(row);
                    });

                    const acc = total > 0 ? Math.round((correct/total)*100) : 0;
                    
                    let timeSec = Math.floor(d.totalElapsedMs/1000);
                    const globalLimitSec = (config.timeLimit || 0) * 60;
                    if (globalLimitSec > 0 && timeSec > globalLimitSec) {
                        timeSec = globalLimitSec; 
                    }
                    
                    let type = "Average";
                    if (acc > 80 && timeSec < 60) type = "🚀 Fast & Accurate";
                    else if (acc > 80) type = "🧠 Deep Thinker";
                    else if (acc <= 80 && timeSec < 30) type = "🏃 Rusher";

                    let overallSpeed = type; 
                    const totalRated = speedCounts.Fast + speedCounts.Medium + speedCounts.Slow;
                    
                    if ((d.tabSwitches || 0) >= 3) {
                        overallSpeed = "🚫 Penalty: Tab Switched";
                    } else if (speedCounts.NotAnswered >= Math.ceil(totalQuestions / 2)) {
                        overallSpeed = "⚠️ Mostly Not Answered";
                    } else if (totalRated > 0) {
                        const speedScore = ((speedCounts.Fast * 1) + (speedCounts.Medium * 2) + (speedCounts.Slow * 3)) / totalRated;
                        
                        let avgSpeed = "Medium";
                        if (speedScore < 1.7) avgSpeed = "Fast";
                        else if (speedScore > 2.3) avgSpeed = "Slow";
                        
                        overallSpeed = "⚡ Overall " + avgSpeed;
                    }

                    document.getElementById("std-accuracy").innerText = acc + "%";
                    document.getElementById("std-time").innerText = timeSec + "s";
                    document.getElementById("std-switches").innerText = d.tabSwitches || 0;
                    document.getElementById("std-category").innerText = overallSpeed; 

                    let advice = "Keep practicing to improve your performance.";
                    if ((d.tabSwitches || 0) >= 3) {
                        advice = "Your quiz was auto-submitted because you switched tabs too many times. Integrity is key!";
                    } else if ((d.tabSwitches || 0) > 0) {
                        advice = "Your tab switches indicate a lack of focus. Try to stay on the quiz page to improve concentration and integrity.";
                    } else if (speedCounts.NotAnswered >= Math.ceil(totalQuestions / 2)) {
                        advice = "You ran out of time or skipped most of the questions. Make sure to manage your time better on the next quiz!";
                    } else if (acc < 60) {
                        advice = "Your accuracy is low. Spend more time reading questions carefully before answering to improve your score.";
                    } else if (acc >= 80 && timeSec < 60) {
                        advice = "Excellent work! You are both fast and accurate. Keep it up!";
                    } else if (acc >= 80) {
                        advice = "Great accuracy! To improve further, try to maintain this accuracy while slightly increasing your speed.";
                    }
                    document.getElementById("ai-suggestion").innerText = advice;
                    
                    renderCharts(d, acc);
                });
            } else {
                alert("No quiz data found. Please complete a quiz to see your dashboard stats.");
            }
        });
    }

    function renderCharts(data, accuracy) {
        const labels = Object.keys(data.timing || {});
        const active = Object.values(data.timing || {}).map(v => v.totalActiveMs / 1000);
        
        const totalActiveMs = Object.values(data.timing || {}).reduce((sum, q) => sum + (q.totalActiveMs || 0), 0);
        const focusScore = data.totalElapsedMs > 0 ? Math.min(100, Math.round((totalActiveMs / data.totalElapsedMs) * 100)) : 0;

        new Chart(document.getElementById('timingChart'), { 
            type: 'bar', 
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Active Focus Time (s)', 
                    data: active, 
                    backgroundColor: '#1a73e8',
                    barThickness: 20
                }] 
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Time Spent per Question' }
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Seconds' } }
                }
            }
        });

        new Chart(document.getElementById('radarChart'), { 
            type: 'radar', 
            data: { 
                labels: ['Accuracy', 'Speed', 'Integrity', 'Focus'], 
                datasets: [{ 
                    label: 'Performance Profile',
                    data: [
                        accuracy, 
                        Math.min(100, Math.max(0, 100 - (data.totalElapsedMs/5000))), 
                        Math.max(0, 100 - ((data.tabSwitches || 0) * 34)), 
                        focusScore 
                    ], 
                    backgroundColor: 'rgba(26,115,232,0.2)', 
                    borderColor: '#1a73e8' 
                }] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { stepSize: 20 }
                    }
                }
            }
        });
    }
});