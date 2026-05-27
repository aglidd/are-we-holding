// app.js

let supabaseClient;
let realtimeDatabaseSubscription;
let masterMenuBlueprints = [];
let liveStoreTimers = [];
let mergedDisplayItems = [];
let currentlySelectedMenuItem = null;
let activeDashboardTab = 1;
let customTimerInputString = "";

// DYNAMIC CONTENT SECURITY: Populated asynchronously from your text file on startup
let profanityBlocklist = [];

// HIGH PERFORMANCE STORAGE: Caches raw DOM elements to eliminate layout recalculation lag
const cachedCountdownElements = {
    boh: {},
    foh: {},
    menu: {},
};

// =========================================================================
// MULTI-TENANT LOCATION ARCHITECTURE
// =========================================================================
let CURRENT_STORE_ID = localStorage.getItem("syncTimerStoreId");

function saveStoreId() {
    const input = document.getElementById("store-id-input").value.trim();

    if (!/^\d{5}$/.test(input)) {
        showToast("Please enter a valid 5-digit Store Number.", "error");
        return;
    }

    if (input === "00000") {
        showToast(
            "Access Denied: Store 00000 is reserved for system blueprints.",
            "error"
        );
        return;
    }

    localStorage.setItem("syncTimerStoreId", input);
    window.location.reload();
}

function changeStore() {
    const input = document.getElementById("store-id-input");
    const title = document.getElementById("setup-title");

    if (title) title.innerText = "Change Location";
    if (input) input.value = CURRENT_STORE_ID || "";

    document.getElementById("setup-takeover").classList.remove("hidden");
    document.getElementById("close-setup-btn").classList.remove("hidden");

    document.body.classList.add("overflow-hidden");

    if (input)
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
}

function closeSetup() {
    document.getElementById("setup-takeover").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

// LOGOUT MODAL MANAGEMENT
function openLogoutModal() {
    const input = document.getElementById("logout-confirm-input");
    if (input) input.value = "";
    document.getElementById("logout-takeover").classList.remove("hidden");

    document.body.classList.add("overflow-hidden");
    if (input) setTimeout(() => input.focus(), 100);
}

function closeLogoutModal() {
    document.getElementById("logout-takeover").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

// GLOBAL REAL-TIME COHORT WIPE (THE NUCLEAR OPTION)
async function wipeStore() {
    const input = document.getElementById("logout-confirm-input");

    if (!input || input.value !== CURRENT_STORE_ID) {
        showToast("Store number did not match. Action canceled.", "error");
        return;
    }

    closeLogoutModal();
    showToast("Wiping active timers and logging out network...", "success");

    await supabaseClient
        .from("active_timers")
        .delete()
        .eq("store_id", CURRENT_STORE_ID);

    if (realtimeDatabaseSubscription) {
        await realtimeDatabaseSubscription.send({
            type: "broadcast",
            event: "global-logout",
            payload: {},
        });
    }

    setTimeout(() => {
        localStorage.removeItem("syncTimerStoreId");
        window.location.reload();
    }, 1500);
}

// =========================================================================
// WAKE LOCK & TOAST API
// =========================================================================
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ("wakeLock" in navigator) {
            wakeLock = await navigator.wakeLock.request("screen");
        }
    } catch (err) {
        console.error("Wake Lock error:", err);
    }
}

document.addEventListener("visibilitychange", () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
        requestWakeLock();
    }
});

function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    const bgClass = type === "error" ? "bg-red-600" : "bg-emerald-600";
    toast.className = `${bgClass} text-white px-6 py-4 rounded-xl shadow-2xl font-black tracking-wide transform transition-all duration-300 -translate-y-full opacity-0`;
    toast.innerText = message;

    container.appendChild(toast);

    requestAnimationFrame(() =>
        toast.classList.remove("-translate-y-full", "opacity-0")
    );

    setTimeout(() => {
        toast.classList.add("-translate-y-full", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// VIEW NAVIGATION MOTOR
function switchView(viewNum) {
    activeDashboardTab = viewNum;
    const views = {
        1: document.getElementById("view-1"),
        2: document.getElementById("view-2"),
    };
    const buttons = {
        1: document.getElementById("nav-btn-1"),
        2: document.getElementById("nav-btn-2"),
    };

    closeSelectionMenu();

    if (viewNum === 1) {
        if (views[1]) views[1].classList.remove("view-hidden");
        if (views[2]) views[2].classList.add("view-hidden");
        if (buttons[1])
            buttons[1].className =
                "px-4 py-2 bg-blue-600 text-white rounded-xl font-bold cursor-pointer transition";
        if (buttons[2])
            buttons[2].className =
                "px-4 py-2 bg-gray-700 text-gray-300 rounded-xl font-bold cursor-pointer transition";
    } else {
        if (views[1]) views[1].classList.add("view-hidden");
        if (views[2]) views[2].classList.remove("view-hidden");
        if (buttons[1])
            buttons[1].className =
                "px-4 py-2 bg-gray-700 text-gray-300 rounded-xl font-bold cursor-pointer transition";
        if (buttons[2])
            buttons[2].className =
                "px-4 py-2 bg-blue-600 text-white rounded-xl font-bold cursor-pointer transition";
    }
}

// =========================================================================
// THE ARCHITECTURAL NORMALIZATION MERGE ENGINE
// =========================================================================
function rebuildMergedDisplayItems() {
    mergedDisplayItems = masterMenuBlueprints.map((menuItem) => {
        const activeTimer = liveStoreTimers.find(
            (t) => t.menu_item_id === menuItem.id
        );
        return {
            ...menuItem,
            is_active: !!activeTimer,
            active_timer_id: activeTimer ? activeTimer.id : null,
            ends_at: activeTimer ? activeTimer.ends_at : null,
            is_custom: false,
        };
    });

    const customTimers = liveStoreTimers.filter((t) => t.custom_name);
    customTimers.forEach((t) => {
        mergedDisplayItems.push({
            id: t.id,
            active_timer_id: t.id,
            name: t.custom_name,
            is_active: true,
            ends_at: t.ends_at,
            image_url: null,
            preset_1: 1,
            preset_2: 2,
            preset_3: 3,
            preset_4: 4,
            is_custom: true,
            menu_period: "all",
            sort_order: 999,
        });
    });

    mergedDisplayItems.sort((a, b) => {
        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        return orderA - orderB || a.name.localeCompare(b.name);
    });
}

// INITIALIZATION AND REALTIME CHANNELS
async function initApp() {
    if (!CURRENT_STORE_ID) {
        document.getElementById("setup-takeover").classList.remove("hidden");
        document.body.classList.add("overflow-hidden");
        return;
    }

    document.getElementById(
        "nav-store-id"
    ).innerText = `Store: ${CURRENT_STORE_ID}`;

    if (!window.supabase) {
        setTimeout(initApp, 100);
        return;
    }

    supabaseClient = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.key
    );

    requestWakeLock();
    startGlobalTicker();

    const [menuResponse, timerResponse, nsfwRawText] = await Promise.all([
        supabaseClient
            .from("global_menu")
            .select("*")
            .order("sort_order", { ascending: true }),
        supabaseClient
            .from("active_timers")
            .select("*")
            .eq("store_id", CURRENT_STORE_ID),
        fetch("assets/nsfw_words.txt")
            .then((r) => (r.ok ? r.text() : ""))
            .catch(() => ""),
    ]);

    if (menuResponse.error || timerResponse.error) {
        showToast("Database connection fault. Please check Wi-Fi.", "error");
        return;
    }

    if (nsfwRawText) {
        // BULLETPROOF PARSING: Automatically strips asterisks and punctuation from the text file!
        profanityBlocklist = nsfwRawText
            .split("\n")
            .map((word) =>
                word
                    .replace(/[^a-zA-Z]/g, "")
                    .trim()
                    .toLowerCase()
            )
            .filter((word) => word.length > 0);
    }

    masterMenuBlueprints = menuResponse.data || [];
    liveStoreTimers = timerResponse.data || [];

    rebuildMergedDisplayItems();
    renderViews();

    setInterval(() => {
        if (activeDashboardTab === 1) renderViews();
    }, 60000);

    realtimeDatabaseSubscription = supabaseClient.channel(
        `schema-db-changes-${CURRENT_STORE_ID}`
    );

    realtimeDatabaseSubscription
        .on("broadcast", { event: "global-logout" }, () => {
            localStorage.removeItem("syncTimerStoreId");
            window.location.reload();
        })
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "active_timers",
                filter: `store_id=eq.${CURRENT_STORE_ID}`,
            },
            (payload) => {
                if (payload.eventType === "INSERT") {
                    liveStoreTimers.push(payload.new);
                } else if (payload.eventType === "DELETE") {
                    liveStoreTimers = liveStoreTimers.filter(
                        (t) => t.id !== payload.old.id
                    );
                    delete cachedCountdownElements.boh[payload.old.id];
                    delete cachedCountdownElements.foh[payload.old.id];
                    delete cachedCountdownElements.menu[payload.old.id];
                    if (
                        currentlySelectedMenuItem &&
                        currentlySelectedMenuItem.active_timer_id ===
                            payload.old.id
                    )
                        closeSelectionMenu();
                } else if (payload.eventType === "UPDATE") {
                    liveStoreTimers = liveStoreTimers.map((t) =>
                        t.id === payload.new.id ? payload.new : t
                    );
                    if (
                        currentlySelectedMenuItem &&
                        currentlySelectedMenuItem.active_timer_id ===
                            payload.new.id
                    ) {
                        currentlySelectedMenuItem.ends_at = payload.new.ends_at;
                    }
                }
                rebuildMergedDisplayItems();
                renderViews();
            }
        )
        .subscribe();
}

// RELATIONAL READ / WRITE OPERATIONS
function openAddItemMenu() {
    const menu = document.getElementById("add-item-takeover");
    const nameInput = document.getElementById("new-item-name-input");
    const timeInput = document.getElementById("new-item-time-input");

    if (!menu || !nameInput || !timeInput) return;

    nameInput.value = "";
    timeInput.value = "";

    menu.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    setTimeout(() => nameInput.focus(), 100);
}

function closeAddItemMenu() {
    const menu = document.getElementById("add-item-takeover");
    if (menu) menu.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

function sanitizeCustomItemName(input) {
    if (!input) return "";

    let safeStr = input.replace(/[^a-zA-Z\s]/g, "");
    safeStr = safeStr.replace(/[<>{}()=`]/g, "");
    safeStr = safeStr.replace(/\s+/g, " ").trim();

    return safeStr;
}

async function submitNewItem() {
    try {
        const nameInput = document.getElementById("new-item-name-input");
        const timeInput = document.getElementById("new-item-time-input");

        if (!nameInput || !timeInput) {
            showToast("System Error: Input fields not found.", "error");
            return;
        }

        // 1. STRICT XSS AND LAYOUT SANITIZATION PASS
        const itemName = sanitizeCustomItemName(nameInput.value);
        const timeValue = parseFloat(timeInput.value.trim());

        if (!itemName) {
            showToast(
                "Validation Error: Please enter a valid item name.",
                "error"
            );
            return;
        }

        // 2. NSFW SECURITY LOOP (Safeguarded against empty arrays)
        if (profanityBlocklist && profanityBlocklist.length > 0) {
            const profanityFlagged = profanityBlocklist.some((profaneWord) => {
                const structuralPattern = new RegExp(
                    `\\b${profaneWord}\\b`,
                    "i"
                );
                return structuralPattern.test(itemName);
            });

            if (profanityFlagged) {
                showToast("Profanity Detected: Please use SFW names.", "error");
                return;
            }
        }

        // 3. LOGIC VALIDATION
        if (isNaN(timeValue) || timeValue <= 0) {
            showToast(
                "Validation Error: Please enter a valid amount of minutes.",
                "error"
            );
            return;
        }

        const endTime = new Date(
            Date.now() + timeValue * 60 * 1000
        ).toISOString();

        // 4. SECURE DATABASE INSERT WITH FORCED DIAGNOSTICS
        const { error } = await supabaseClient.from("active_timers").insert([
            {
                store_id: CURRENT_STORE_ID,
                custom_name: itemName,
                ends_at: endTime,
            },
        ]);

        // If Supabase rejects the item, force a red toast onto the screen!
        if (error) {
            showToast(`Database Error: ${error.message}`, "error");
            console.error("Supabase Rejection:", error);
            return;
        }

        // Only close the menu and clear the inputs if the database actually accepted the item
        closeAddItemMenu();
        nameInput.value = "";
        timeInput.value = "";
    } catch (err) {
        // If the JavaScript engine itself crashes, force a red toast!
        showToast(`Crash: ${err.message}`, "error");
        console.error("Fatal function crash:", err);
    }
}

async function deleteItem(itemId) {
    const confirmed = confirm(
        "Are you sure you want to permanently delete this item from the board?"
    );
    if (!confirmed) return;

    closeSelectionMenu();
    await supabaseClient.from("active_timers").delete().eq("id", itemId);
}

async function startTimer(itemId, totalSeconds) {
    const item = mergedDisplayItems.find((i) => i.id === itemId);
    if (!item) return;

    const endTime = new Date(Date.now() + totalSeconds * 1000).toISOString();

    if (item.active_timer_id) {
        await supabaseClient
            .from("active_timers")
            .update({ ends_at: endTime })
            .eq("id", item.active_timer_id);
    } else {
        await supabaseClient.from("active_timers").insert({
            store_id: CURRENT_STORE_ID,
            menu_item_id: item.id,
            ends_at: endTime,
        });
    }

    closeSelectionMenu();
}

async function addTime(itemId, additionalSeconds) {
    const item = mergedDisplayItems.find((i) => i.id === itemId);
    if (!item || !item.active_timer_id) return;

    const currentEnd = new Date(item.ends_at).getTime();
    const targetBaseTime = Math.max(Date.now(), currentEnd);
    const newEnd = new Date(
        targetBaseTime + additionalSeconds * 1000
    ).toISOString();

    await supabaseClient
        .from("active_timers")
        .update({ ends_at: newEnd })
        .eq("id", item.active_timer_id);
    showToast(`Added ${additionalSeconds} seconds!`, "success");
}

async function stopTimer(itemId) {
    const item = mergedDisplayItems.find((i) => i.id === itemId);
    closeSelectionMenu();

    if (item && item.active_timer_id) {
        await supabaseClient
            .from("active_timers")
            .delete()
            .eq("id", item.active_timer_id);
    }
}

function openSelectionMenu(item) {
    currentlySelectedMenuItem = item;
    renderSelectionMenu();
}

function renderSelectionMenu() {
    const stage = document.getElementById("selection-takeover");
    const template = document.getElementById("takeover-template");
    const item = currentlySelectedMenuItem;
    if (!stage || !template || !item) return;

    stage.innerHTML = "";
    stage.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    const clone = template.content.cloneNode(true);

    const menuName = clone.querySelector(".item-name");
    const closeBtn = clone.querySelector(".close-btn");
    if (menuName) menuName.innerText = item.name;
    if (closeBtn) closeBtn.onclick = () => closeSelectionMenu();

    const deleteBtn = clone.querySelector(".delete-btn");
    if (deleteBtn) {
        if (item.is_custom) {
            deleteBtn.onclick = () => deleteItem(item.id);
            deleteBtn.classList.remove("hidden");
        } else {
            deleteBtn.classList.add("hidden");
        }
    }

    const presetOneMinutes = item.preset_1 || 1;
    const presetTwoMinutes = item.preset_2 || 2;
    const presetThreeMinutes = item.preset_3 || 3;
    const presetFourMinutes = item.preset_4 || 4;

    const presetOneButton = clone.querySelector(".timer-btn-1");
    const presetOneTimeText = clone.querySelector(".preset-val-1");
    const presetOneLabelText = clone.querySelector(".preset-label-1");
    if (presetOneTimeText)
        presetOneTimeText.innerText = `${presetOneMinutes}:00`;
    if (presetOneLabelText)
        presetOneLabelText.innerText = `Initialize ${presetOneMinutes} Min`;
    if (presetOneButton)
        presetOneButton.onclick = () =>
            startTimer(item.id, presetOneMinutes * 60);

    const presetTwoButton = clone.querySelector(".timer-btn-2");
    const presetTwoTimeText = clone.querySelector(".preset-val-2");
    const presetTwoLabelText = clone.querySelector(".preset-label-2");
    if (presetTwoTimeText)
        presetTwoTimeText.innerText = `${presetTwoMinutes}:00`;
    if (presetTwoLabelText)
        presetTwoLabelText.innerText = `Initialize ${presetTwoMinutes} Min`;
    if (presetTwoButton)
        presetTwoButton.onclick = () =>
            startTimer(item.id, presetTwoMinutes * 60);

    const presetThreeButton = clone.querySelector(".timer-btn-3");
    const presetThreeTimeText = clone.querySelector(".preset-val-3");
    const presetThreeLabelText = clone.querySelector(".preset-label-3");
    if (presetThreeTimeText)
        presetThreeTimeText.innerText = `${presetThreeMinutes}:00`;
    if (presetThreeLabelText)
        presetThreeLabelText.innerText = `Initialize ${presetThreeMinutes} Min`;
    if (presetThreeButton)
        presetThreeButton.onclick = () =>
            startTimer(item.id, presetThreeMinutes * 60);

    const presetFourButton = clone.querySelector(".timer-btn-4");
    const presetFourTimeText = clone.querySelector(".preset-val-4");
    const presetFourLabelText = clone.querySelector(".preset-label-4");
    if (presetFourTimeText)
        presetFourTimeText.innerText = `${presetFourMinutes}:00`;
    if (presetFourLabelText)
        presetFourLabelText.innerText = `Initialize ${presetFourMinutes} Min`;
    if (presetFourButton)
        presetFourButton.onclick = () =>
            startTimer(item.id, presetFourMinutes * 60);

    const customBtn = clone.querySelector(".timer-btn-custom");
    if (customBtn) {
        customBtn.onclick = () => {
            customTimerInputString = "";
            const pPanel = document.querySelector(".preset-view-panel");
            const nPanel = document.querySelector(".numpad-view-panel");
            if (pPanel) pPanel.classList.add("hidden");
            if (nPanel) nPanel.classList.remove("hidden");
            updateNumpadDisplay();
        };
    }

    if (item.image_url) {
        const img = clone.querySelector(".item-image");
        if (img) {
            img.src = item.image_url;
            img.classList.remove("hidden");
        }
    }

    const activeControls = clone.querySelector(".active-timer-controls");
    const menuCountdown = clone.querySelector(".menu-countdown-display");

    if (activeControls) {
        if (item.is_active) {
            activeControls.classList.remove("hidden");

            if (menuCountdown) {
                menuCountdown.classList.remove("hidden");

                cachedCountdownElements.menu[item.id] = menuCountdown;

                const timeLeft = new Date(item.ends_at).getTime() - Date.now();
                if (timeLeft > 0) {
                    const minutesLeft = Math.floor(
                        (timeLeft % 3600000) / 60000
                    );
                    const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
                    menuCountdown.innerText = `${String(minutesLeft).padStart(
                        2,
                        "0"
                    )}:${String(secondsLeft).padStart(2, "0")}`;
                }
            }

            const btn30s = clone.querySelector(".add-30s-btn");
            if (btn30s) btn30s.onclick = () => addTime(item.id, 30);

            const btn1m = clone.querySelector(".add-1m-btn");
            if (btn1m) btn1m.onclick = () => addTime(item.id, 60);

            const stopBtn = clone.querySelector(".stop-btn");
            if (stopBtn) stopBtn.onclick = () => stopTimer(item.id);
        } else {
            activeControls.classList.add("hidden");
        }
    }

    stage.appendChild(clone);
}

function closeSelectionMenu() {
    currentlySelectedMenuItem = null;
    const stage = document.getElementById("selection-takeover");
    if (stage) stage.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

// =========================================================================
// OPTIMIZED GLOBAL TICKER (DIRECT TRACKING)
// =========================================================================
function startGlobalTicker() {
    setInterval(() => {
        const now = Date.now();
        mergedDisplayItems.forEach((item) => {
            if (item.is_active && item.ends_at) {
                const timeLeft = new Date(item.ends_at).getTime() - now;

                if (timeLeft <= 0) {
                    stopTimer(item.id);
                } else {
                    const minutesLeft = Math.floor(
                        (timeLeft % 3600000) / 60000
                    );
                    const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
                    const timeString = `${String(minutesLeft).padStart(
                        2,
                        "0"
                    )}:${String(secondsLeft).padStart(2, "0")}`;

                    const bohNode = cachedCountdownElements.boh[item.id];
                    if (bohNode && bohNode.innerText !== timeString)
                        bohNode.innerText = timeString;

                    const fofNode = cachedCountdownElements.foh[item.id];
                    if (fofNode && fofNode.innerText !== timeString)
                        fofNode.innerText = timeString;

                    const menuNode = cachedCountdownElements.menu[item.id];
                    if (menuNode && menuNode.innerText !== timeString)
                        menuNode.innerText = timeString;
                }
            }
        });
    }, 1000);
}

function renderViews() {
    renderKitchenView();
    renderFohView();
    if (currentlySelectedMenuItem) renderSelectionMenu();
}

function shouldShowInKitchen(item) {
    if (item.is_active || item.is_custom) return true;
    if (!item.menu_period || item.menu_period === "all") return true;

    const now = new Date();
    const currentTime = now.getHours() + now.getMinutes() / 60;
    const crossoverTime = 10.5;

    if (item.menu_period === "breakfast") {
        return currentTime < crossoverTime;
    }
    if (item.menu_period === "lunch") {
        return currentTime >= crossoverTime;
    }
    return true;
}

function renderKitchenView() {
    const container = document.getElementById("client-items-list");
    const template = document.getElementById("kitchen-card-template");
    if (!container || !template) return;

    const loadingMsg = document.getElementById("loading-matrix-msg");
    if (loadingMsg) loadingMsg.remove();

    const visibleItems = mergedDisplayItems.filter(shouldShowInKitchen);
    const activeIds = visibleItems.map((i) => i.id);

    Array.from(container.children).forEach((child) => {
        if (child.dataset.itemId && !activeIds.includes(child.dataset.itemId)) {
            child.remove();
        }
    });

    visibleItems.forEach((item, index) => {
        let card = container.querySelector(`[data-item-id="${item.id}"]`);

        if (!card) {
            const clone = template.content.cloneNode(true);
            card = clone.querySelector(".card-root");
            card.dataset.itemId = item.id;
            container.appendChild(card);
        }

        card.onclick = () => openSelectionMenu(item);
        const nameEl = card.querySelector(".item-name");
        if (nameEl) nameEl.innerText = item.name;

        if (item.image_url) {
            const img = card.querySelector(".item-image");
            const fallback = card.querySelector(".image-fallback");
            if (img) {
                img.src = item.image_url;
                img.classList.remove("hidden");
            }
            if (fallback) fallback.classList.add("hidden");
        } else if (item.is_custom) {
            const imgWrapper = card.querySelector(".image-wrapper");
            const textWrapper = card.querySelector(".text-wrapper");
            if (imgWrapper) imgWrapper.classList.add("hidden");
            if (nameEl && !nameEl.classList.contains("text-2xl"))
                nameEl.classList.replace("text-lg", "text-2xl");
            if (textWrapper) textWrapper.classList.remove("border-t");
        }

        const badge = card.querySelector(".active-badge");
        const displayElement = card.querySelector(".boh-countdown-display");

        if (displayElement)
            cachedCountdownElements.boh[item.id] = displayElement;

        if (item.is_active) {
            if (badge) badge.classList.remove("hidden");
        } else {
            if (badge) badge.classList.add("hidden");
            if (displayElement) displayElement.innerText = "00:00";
        }

        if (container.children[index] !== card) {
            container.insertBefore(card, container.children[index]);
        }
    });

    let addCard = document.getElementById("add-custom-card-btn");
    if (!addCard) {
        addCard = document.createElement("div");
        addCard.id = "add-custom-card-btn";
        addCard.className =
            "bg-gray-800/40 border-2 border-dashed border-gray-600 hover:border-gray-400 hover:bg-gray-800 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition duration-200 min-h-[140px] py-6 group";
        addCard.innerHTML = `<span class="text-4xl mb-2 group-hover:scale-110 transition-transform">➕</span><span class="text-gray-400 group-hover:text-white font-bold tracking-widest uppercase text-sm">Add Custom Item</span>`;
        addCard.onclick = () => openAddItemMenu();
    }
    container.appendChild(addCard);
}

function renderFohView() {
    const container = document.getElementById("dashboard-items-list");
    const noTimersMsg = document.getElementById("no-timers-msg");
    const template = document.getElementById("foh-card-template");
    if (!container || !template) return;

    const activeItems = mergedDisplayItems.filter((item) => item.is_active);
    if (noTimersMsg)
        noTimersMsg.classList.toggle("hidden", activeItems.length > 0);

    const activeIds = activeItems.map((i) => i.id);

    Array.from(container.children).forEach((child) => {
        if (child.dataset.itemId && !activeIds.includes(child.dataset.itemId)) {
            child.remove();
        }
    });

    activeItems.forEach((item, index) => {
        let card = container.querySelector(`[data-item-id="${item.id}"]`);

        if (!card) {
            const clone = template.content.cloneNode(true);
            card = clone.querySelector(".card-root");
            card.dataset.itemId = item.id;
            container.appendChild(card);
        }

        card.onclick = () => stopTimer(item.id);
        const nameEl = card.querySelector(".item-name");
        if (nameEl) nameEl.innerText = item.name;

        if (item.image_url) {
            const img = card.querySelector(".item-image");
            if (img) {
                img.src = item.image_url;
                img.classList.remove("hidden");
            }
        }

        const displayElement = card.querySelector(".countdown-display");

        if (displayElement)
            cachedCountdownElements.foh[item.id] = displayElement;

        if (container.children[index] !== card) {
            container.insertBefore(card, container.children[index]);
        }
    });
}

// =========================================================================
// TOUCH NUMPAD INTERFACE INTERACTION MOTOR
// =========================================================================
function pressNum(digit) {
    if (customTimerInputString.length >= 4) return;
    if (customTimerInputString === "" && digit === 0) return;

    customTimerInputString += digit;
    updateNumpadDisplay();
}

function clearNum() {
    customTimerInputString = "";
    updateNumpadDisplay();
}

function updateNumpadDisplay() {
    const display = document.querySelector(".numpad-display");
    if (!display) return;

    let padded = customTimerInputString.padStart(4, "0");
    let displayMinutes = padded.substring(0, 2);
    let displaySeconds = padded.substring(2, 4);

    display.innerText = `${displayMinutes}:${displaySeconds}`;
}

function submitCustomNum() {
    let padded = customTimerInputString.padStart(4, "0");
    let parsedMinutes = parseInt(padded.substring(0, 2), 10);
    let parsedSeconds = parseInt(padded.substring(2, 4), 10);

    let totalSeconds = parsedMinutes * 60 + parsedSeconds;

    if (totalSeconds <= 0) {
        showToast("Please enter a valid timeline length.", "error");
        return;
    }

    startTimer(currentlySelectedMenuItem.id, totalSeconds);
}

function revealPresetPanel() {
    const pPanel = document.querySelector(".preset-view-panel");
    const nPanel = document.querySelector(".numpad-view-panel");
    if (nPanel) nPanel.classList.add("hidden");
    if (pPanel) pPanel.classList.remove("hidden");
}

window.addEventListener("load", initApp);
