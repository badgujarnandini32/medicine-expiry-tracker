const getApiOverride = () => {
    const match = window.location.search.match(/[?&]api=([^&]+)/);
    if (!match) return "";

    try {
        return decodeURIComponent(match[1]).trim().replace(/\/+$/, "");
    } catch (error) {
        return match[1].trim().replace(/\/+$/, "");
    }
};

const API_BASE_URL = (() => {
    const configuredBase = (
        getApiOverride() ||
        window.MEDICINE_API_BASE_URL ||
        ""
    ).trim().replace(/\/+$/, "");

    if (configuredBase) {
        return `${configuredBase}/api`;
    }

    if (
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    ) {
        return "http://localhost:3000/api";
    }

    return "";
})();

const $ = (selector) => document.querySelector(selector);

const medicineList = $("#medicineList");
let medicines = [];
let activeFilter = "All";
let authToken = localStorage.getItem("medicineTrackerToken") || "";
let expiryDateWasEntered = false;


// ===============================
// USER FUNCTIONS
// ===============================

function normalizeUsername(value) {
    const trimmed = String(value || "").trim();

    if (!trimmed) return "";

    const lower = trimmed.toLowerCase();

    return lower.endsWith("@gmail.com")
        ? lower
        : `${lower}@gmail.com`;
}


function getUsersStore() {
    try {
        return JSON.parse(
            localStorage.getItem("medicineTrackerUsers") || "{}"
        ) || {};
    } catch (error) {
        return {};
    }
}


function saveUsersStore(users) {
    localStorage.setItem(
        "medicineTrackerUsers",
        JSON.stringify(users)
    );
}


function getMedicinesStore() {
    try {
        return JSON.parse(
            localStorage.getItem("medicineTrackerMedicines") || "{}"
        ) || {};
    } catch (error) {
        return {};
    }
}


function saveMedicinesStore(store) {
    localStorage.setItem(
        "medicineTrackerMedicines",
        JSON.stringify(store)
    );
}


function getCurrentUsername() {
    return localStorage.getItem("medicineTrackerUser") || "";
}


// ===============================
// LOCAL API
// ===============================

function handleLocalApiRequest(path, options = {}) {

    const method = (options.method || "GET").toUpperCase();

    const body = options.body
        ? JSON.parse(options.body)
        : null;


    // SIGN UP
    if (path === "/signup") {

        const username = normalizeUsername(body?.username);
        const password = String(body?.password || "");

        if (!username || !password) {
            throw new Error("Username and password are required.");
        }

        const users = getUsersStore();

        if (users[username]) {
            throw new Error("User already exists.");
        }

        users[username] = {
            username,
            password
        };

        saveUsersStore(users);

        return {
            user: { username },
            message: "Account created successfully."
        };
    }


    // LOGIN
    if (path === "/login") {

        const username = normalizeUsername(body?.username);
        const password = String(body?.password || "");

        if (!username || !password) {
            throw new Error("Username and password are required.");
        }

        const users = getUsersStore();

        const userRecord = users[username];

        if (!userRecord || userRecord.password !== password) {
            throw new Error("Incorrect username or password.");
        }

        const token =
            `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;

        localStorage.setItem(
            "medicineTrackerUser",
            username
        );

        localStorage.setItem(
            "medicineTrackerToken",
            token
        );

        return {
            token,
            user: { username }
        };
    }


    // MEDICINES
    if (path === "/medicines") {

        const username = getCurrentUsername();

        if (!username) {
            throw new Error("Missing token");
        }


        // GET
        if (method === "GET") {

            const medicinesStore = getMedicinesStore();

            return (medicinesStore[username] || []).map(
                (medicine) => ({
                    ...medicine,
                    id: String(
                        medicine.id ||
                        `${medicine.name}-${medicine.batch}`
                    )
                })
            );
        }


        // POST
        if (method === "POST") {

            const medicine = {

                ...body,

                id:
                    body?.id ||
                    `med-${Date.now()}-${Math.random()
                        .toString(16)
                        .slice(2)}`,

                quantity: Number(
                    body?.quantity || 0
                )
            };


            if (
                !medicine.name ||
                !medicine.companyName ||
                !medicine.manufacturingDate ||
                !medicine.expiryDate ||
                medicine.quantity <= 0
            ) {
                throw new Error(
                    "All required medicine fields must be filled."
                );
            }


            const store = getMedicinesStore();

            const currentList =
                store[username] || [];


            const existingIndex =
                currentList.findIndex(
                    (item) => item.id === medicine.id
                );


            if (existingIndex >= 0) {

                currentList[existingIndex] =
                    medicine;

            } else {

                currentList.push(medicine);

            }


            store[username] = currentList;

            saveMedicinesStore(store);

            return medicine;
        }
    }


    // DELETE MEDICINE
    if (path.startsWith("/medicines/")) {

        const username = getCurrentUsername();

        if (!username) {
            throw new Error("Missing token");
        }

        const medicineId =
            path.split("/medicines/", 2)[1];

        const store =
            getMedicinesStore();

        const items =
            store[username] || [];


        store[username] =
            items.filter(
                (medicine) =>
                    String(medicine.id) !==
                    String(medicineId)
            );


        saveMedicinesStore(store);

        return {
            message:
                "Medicine deleted successfully."
        };
    }


    throw new Error("Request failed.");
}


// ===============================
// API REQUEST
// ===============================

async function apiRequest(path, options = {}) {

    if (!API_BASE_URL) {
        return handleLocalApiRequest(
            path,
            options
        );
    }


    const response = await fetch(
        `${API_BASE_URL}${path}`,
        {
            headers: {
                "Content-Type":
                    "application/json",

                ...(authToken
                    ? {
                        Authorization:
                            `Bearer ${authToken}`
                    }
                    : {}),

                ...(options.headers || {})
            },

            ...options
        }
    );


    const contentType =
        response.headers.get(
            "content-type"
        ) || "";


    const data =
        contentType.includes(
            "application/json"
        )
            ? await response.json()
            : await response.text();


    if (!response.ok) {

        const message =
            typeof data === "string"
                ? data
                : (
                    data.message ||
                    "Request failed."
                );

        throw new Error(message);
    }


    return data;
}


// ===============================
// EXPIRY CALCULATION
// ===============================

function calculateBestBeforeExpiry() {

    const manufacturingDate =
        $("#manufacturingDate").value;

    const months =
        Number(
            $("#bestBeforeMonths").value
        );


    if (
        !manufacturingDate ||
        !Number.isInteger(months) ||
        months < 1
    ) {
        return "";
    }


    const [year, month, day] =
        manufacturingDate
            .split("-")
            .map(Number);


    const expiry =
        new Date(
            Date.UTC(
                year,
                month - 1 + months,
                day
            )
        );


    // Handle months with fewer days
    if (
        expiry.getUTCDate() !== day
    ) {
        expiry.setUTCDate(0);
    }


    return [
        expiry.getUTCFullYear(),

        String(
            expiry.getUTCMonth() + 1
        ).padStart(2, "0"),

        String(
            expiry.getUTCDate()
        ).padStart(2, "0")

    ].join("-");
}



function updateExpiryFields() {

    const expiryType =
        document.querySelector(
            'input[name="expiryType"]:checked'
        )?.value || "exact";


    const exactField =
        $("#exactExpiryField");

    const bestBeforeField =
        $("#bestBeforeField");

    const expiryDate =
        $("#expiryDate");

    const bestBeforeMonths =
        $("#bestBeforeMonths");


    if (expiryType === "bestBefore") {

        exactField?.classList.add(
            "hidden"
        );

        bestBeforeField?.classList.remove(
            "hidden"
        );


        if (expiryDate) {
            expiryDate.required = false;
        }


        if (bestBeforeMonths) {
            bestBeforeMonths.required = true;
        }

    } else {

        exactField?.classList.remove(
            "hidden"
        );

        bestBeforeField?.classList.add(
            "hidden"
        );


        if (expiryDate) {
            expiryDate.required = true;
        }


        if (bestBeforeMonths) {
            bestBeforeMonths.required = false;
        }
    }
}


// ===============================
// MEDICINE STATUS
// ===============================

function getDaysLeft(medicine) {

    const today = new Date();

    const expiry =
        new Date(
            `${medicine.expiryDate}T00:00:00`
        );


    today.setHours(
        0,
        0,
        0,
        0
    );


    return Math.ceil(
        (expiry - today) /
        86400000
    );
}



function getStatus(daysLeft) {

    if (daysLeft < 0)
        return "Expired";

    if (daysLeft <= 30)
        return "Expiring Soon";

    return "Safe";
}


// ===============================
// SECURITY
// ===============================

function escapeHtml(value) {

    return String(value).replace(
        /[&<>'"]/g,
        (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#039;",
            '"': "&quot;"
        }[character])
    );
}


// ===============================
// DISPLAY MEDICINES
// ===============================

function displayMedicines() {

    const searchTerm =
        $("#searchInput")
            .value
            .trim()
            .toLowerCase();


    const filtered =
        medicines

            .map(
                (medicine, index) => ({
                    medicine,
                    index,
                    daysLeft:
                        getDaysLeft(medicine)
                })
            )

            .filter(
                ({
                    medicine,
                    daysLeft
                }) => {

                    const status =
                        getStatus(daysLeft);


                    const matchesFilter =
                        activeFilter === "All" ||
                        status === activeFilter;


                    const matchesSearch =
                        (medicine.name || "")
                            .toLowerCase()
                            .includes(searchTerm)

                        ||

                        (medicine.batch || "")
                            .toLowerCase()
                            .includes(searchTerm);


                    return (
                        matchesFilter &&
                        matchesSearch
                    );
                }
            );


    $("#totalCount").textContent =
        medicines.length;


    $("#safeCount").textContent =
        medicines.filter(
            (medicine) =>
                getStatus(
                    getDaysLeft(medicine)
                ) === "Safe"
        ).length;


    $("#soonCount").textContent =
        medicines.filter(
            (medicine) =>
                getStatus(
                    getDaysLeft(medicine)
                ) === "Expiring Soon"
        ).length;


    $("#expiredCount").textContent =
        medicines.filter(
            (medicine) =>
                getStatus(
                    getDaysLeft(medicine)
                ) === "Expired"
        ).length;


    if (!filtered.length) {

        medicineList.innerHTML = `
            <div class="empty-state">
                <span>~</span>
                <h3>No medicines found</h3>
                <p>
                    Add a medicine or adjust
                    your search and filters.
                </p>
            </div>
        `;

        return;
    }


    medicineList.innerHTML = `
        <div class="medicine-table">

            <div class="table-row table-header">
                <span>Medicine</span>
                <span>Batch number</span>
                <span>Dates</span>
                <span>Quantity</span>
                <span>Status</span>
                <span></span>
            </div>

            ${filtered.map(
                ({
                    medicine,
                    index,
                    daysLeft
                }) => {

                    const status =
                        getStatus(daysLeft);


                    const daysLabel =
                        daysLeft < 0
                            ? `${Math.abs(daysLeft)} days overdue`
                            : `${daysLeft} days left`;


                    const statusClass =
                        status
                            .toLowerCase()
                            .replace(
                                " ",
                                "-"
                            );


                    return `
                        <div class="table-row">

                            <div class="medicine-name">
                                <span class="medicine-icon">+</span>

                                <div>
                                    <strong>
                                        ${escapeHtml(
                                            medicine.name
                                        )}
                                    </strong>

                                    <small>
                                        ${escapeHtml(
                                            medicine.companyName || ""
                                        )}
                                    </small>
                                </div>
                            </div>


                            <span class="muted">
                                ${escapeHtml(
                                    medicine.batch || ""
                                )}
                            </span>


                            <span class="date-stack">
                                <b>
                                    ${escapeHtml(
                                        medicine.expiryDate
                                    )}
                                </b>

                                <small>
                                    Made
                                    ${escapeHtml(
                                        medicine.manufacturingDate
                                    )}
                                </small>
                            </span>


                            <span>
                                ${escapeHtml(
                                    medicine.quantity
                                )}
                                units
                            </span>


                            <span>
                                <b class="status ${statusClass}">
                                    ${status}
                                </b>

                                <small class="days-left">
                                    ${daysLabel}
                                </small>
                            </span>


                            <button
                                class="delete-button"
                                data-id="${medicine.id || index}"
                                aria-label="Delete ${
                                    escapeHtml(
                                        medicine.name
                                    )
                                }"
                            >
                                Delete
                            </button>

                        </div>
                    `;
                }
            ).join("")}

        </div>
    `;
}


// ===============================
// LOAD MEDICINES
// ===============================

async function loadMedicines() {

    if (!authToken) {

        medicines = [];

        displayMedicines();

        return;
    }


    try {

        medicines =
            await apiRequest(
                "/medicines"
            );

        displayMedicines();

    } catch (error) {

        $("#loginMessage")
            .textContent =
            error.message;

        logout();
    }
}


// ===============================
// SAVE MEDICINE
// ===============================

async function saveMedicine(event) {

    event.preventDefault();


    const expiryType =
        document.querySelector(
            'input[name="expiryType"]:checked'
        )?.value || "exact";


    const manufacturingDate =
        $("#manufacturingDate").value;


    const exactExpiryDate =
        $("#expiryDate").value;


    const bestBeforeMonths =
        Number(
            $("#bestBeforeMonths").value
        );


    const expiryDate =
        expiryType === "bestBefore"
            ? calculateBestBeforeExpiry()
            : exactExpiryDate;


    if (!manufacturingDate) {

        $("#loginMessage").textContent =
            "Manufacturing date is required.";

        return;
    }


    if (!expiryDate) {

        $("#loginMessage").textContent =
            expiryType === "bestBefore"
                ? "Enter the best-before period in months."
                : "Enter the expiry date.";

        return;
    }


    try {

        const payload = {

            name:
                $("#medicineName")
                    .value
                    .trim(),

            companyName:
                $("#companyName")
                    .value
                    .trim(),

            batch:
                $("#batchNumber")
                    .value
                    .trim(),

            manufacturingDate,

            expiryType,

            bestBeforeMonths:
                expiryType === "bestBefore"
                    ? bestBeforeMonths
                    : null,

            expiryDate,

            quantity:
                Number(
                    $("#quantity").value
                )
        };


        await apiRequest(
            "/medicines",
            {
                method: "POST",

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );


        event.target.reset();

        expiryDateWasEntered =
            false;


        const exactRadio =
            document.querySelector(
                'input[name="expiryType"][value="exact"]'
            );


        if (exactRadio) {
            exactRadio.checked = true;
        }


        updateExpiryFields();


        $("#medicineDialog").close();


        await loadMedicines();

    } catch (error) {

        $("#loginMessage")
            .textContent =
            error.message;
    }
}


// ===============================
// DELETE MEDICINE
// ===============================

async function deleteMedicine(medicineId) {

    try {

        await apiRequest(
            `/medicines/${medicineId}`,
            {
                method: "DELETE"
            }
        );


        await loadMedicines();

    } catch (error) {

        $("#loginMessage")
            .textContent =
            error.message;
    }
}


// ===============================
// DASHBOARD
// ===============================

function showDashboard() {

    $("#loginPage")
        .classList
        .add("hidden");


    $("#dashboardPage")
        .classList
        .remove("hidden");


    const savedUser =
        localStorage.getItem(
            "medicineTrackerUser"
        ) || "there";


    $("#profileName")
        .textContent =
        savedUser;


    $("#profileInitial")
        .textContent =
        savedUser
            .charAt(0)
            .toUpperCase();


    loadMedicines();
}



function showLogin() {

    $("#createAccountCard")
        .classList
        .add("hidden");


    $("#loginCard")
        .classList
        .remove("hidden");


    $("#loginMessage")
        .textContent = "";
}



function showCreateAccount() {

    $("#loginCard")
        .classList
        .add("hidden");


    $("#createAccountCard")
        .classList
        .remove("hidden");


    $("#createAccountMessage")
        .textContent = "";
}



function logout() {

    authToken = "";

    localStorage.removeItem(
        "medicineTrackerToken"
    );

    localStorage.removeItem(
        "medicineTrackerUser"
    );

    localStorage.removeItem(
        "medicineTrackerRemembered"
    );

    sessionStorage.removeItem(
        "medicineTrackerSession"
    );


    $("#dashboardPage")
        .classList
        .add("hidden");


    $("#loginPage")
        .classList
        .remove("hidden");


    showLogin();
}


// ===============================
// CREATE ACCOUNT
// ===============================

$("#createAccountForm")
    .addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const username =
                $("#createAccountEmail")
                    .value
                    .trim();


            const password =
                $("#createAccountPassword")
                    .value;


            if (
                password !==
                $("#confirmAccountPassword")
                    .value
            ) {

                $("#createAccountMessage")
                    .textContent =
                    "Passwords do not match.";

                return;
            }


            try {

                await apiRequest(
                    "/signup",
                    {
                        method: "POST",

                        body:
                            JSON.stringify({
                                username,
                                password
                            })
                    }
                );


                event.target.reset();

                showLogin();


                $("#loginEmail")
                    .value =
                    username;


                $("#loginMessage")
                    .textContent =
                    "Account created. Log in to continue.";

            } catch (error) {

                $("#createAccountMessage")
                    .textContent =
                    error.message;
            }
        }
    );


// ===============================
// LOGIN
// ===============================

$("#loginForm")
    .addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const user =
                $("#loginEmail")
                    .value
                    .trim();


            const password =
                $("#loginPassword")
                    .value;


            try {

                const response =
                    await apiRequest(
                        "/login",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    username: user,
                                    password
                                })
                        }
                    );


                authToken =
                    response.token;


                localStorage.setItem(
                    "medicineTrackerToken",
                    authToken
                );


                localStorage.setItem(
                    "medicineTrackerUser",
                    user
                );


                sessionStorage.setItem(
                    "medicineTrackerSession",
                    "true"
                );


                if (
                    $("#rememberMe").checked
                ) {

                    localStorage.setItem(
                        "medicineTrackerRemembered",
                        "true"
                    );
                }


                showDashboard();

            } catch (error) {

                $("#loginMessage")
                    .textContent =
                    error.message;
            }
        }
    );


// ===============================
// UI EVENTS
// ===============================

$("#showCreateAccountButton")
    .addEventListener(
        "click",
        showCreateAccount
    );


$("#togglePassword")
    .addEventListener(
        "click",
        () => {

            const password =
                $("#loginPassword");


            const isPassword =
                password.type === "password";


            password.type =
                isPassword
                    ? "text"
                    : "password";


            $("#togglePassword")
                .textContent =
                isPassword
                    ? "Hide"
                    : "Show";
        }
    );


$("#loginEmail").value =
    localStorage.getItem(
        "medicineTrackerRemembered"
    )
        ? localStorage.getItem(
            "medicineTrackerUser"
        ) || ""
        : "";


$("#openAddMedicine")
    .addEventListener(
        "click",
        () =>
            $("#medicineDialog")
                .showModal()
    );


$("#closeDialog")
    .addEventListener(
        "click",
        () =>
            $("#medicineDialog")
                .close()
    );


$("#medicineDialog")
    .addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                $("#medicineDialog")
            ) {
                $("#medicineDialog")
                    .close();
            }
        }
    );


// EXPIRY TYPE
document
    .querySelectorAll(
        'input[name="expiryType"]'
    )
    .forEach(
        (radio) => {

            radio.addEventListener(
                "change",
                updateExpiryFields
            );
        }
    );


$("#expiryDate")
    .addEventListener(
        "input",
        (event) => {

            expiryDateWasEntered =
                Boolean(
                    event.target.value
                );
        }
    );


$("#medicineForm")
    .addEventListener(
        "submit",
        saveMedicine
    );


// DELETE
$("#medicineList")
    .addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    ".delete-button"
                );


            if (!button) return;


            deleteMedicine(
                button.dataset.id
            );
        }
    );


// SEARCH
$("#searchInput")
    .addEventListener(
        "input",
        displayMedicines
    );


// FILTER
$("#statusFilter")
    .addEventListener(
        "change",
        (event) => {

            activeFilter =
                event.target.value;

            displayMedicines();
        }
    );


$("#logoutButton")
    .addEventListener(
        "click",
        () => logout()
    );


document
    .querySelectorAll(
        ".nav-item[data-action='add']"
    )
    .forEach(
        (button) => {

            button.addEventListener(
                "click",
                () =>
                    $("#medicineDialog")
                        .showModal()
            );
        }
    );


// INITIALIZE
updateExpiryFields();


if (
    authToken &&
    sessionStorage.getItem(
        "medicineTrackerSession"
    ) === "true"
) {

    showDashboard();

} else if (authToken) {

    showDashboard();

} else {

    showLogin();
}