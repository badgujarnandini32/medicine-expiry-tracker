const $ = (selector) => document.querySelector(selector);

const getApiOverride = () => {
    const match = window.location.search.match(/[?&]api=([^&]+)/);

    if (!match) return "";

    try {
        return decodeURIComponent(match[1]).trim().replace(/\/+$/, "");
    } catch (error) {
        return match[1].trim().replace(/\/+$/, "");
    }
};

const getApiBaseUrl = () => {
    const override = getApiOverride();

    if (override) {
        return override.endsWith("/api") ? override : `${override}/api`;
    }

    const configuredBase =
        window.MEDICINE_API_BASE_URL ||
        window.location.origin;

    if (
        configuredBase.includes("localhost") ||
        configuredBase.includes("127.0.0.1")
    ) {
        return "http://localhost:3000/api";
    }

    return configuredBase.endsWith("/api")
        ? configuredBase
        : `${configuredBase}/api`;
};

const API_BASE_URL = getApiBaseUrl();


// =========================
// API HELPER
// =========================

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        throw new Error(
            data?.message ||
            data?.error ||
            `Request failed with status ${response.status}`
        );
    }

    return data;
}


// =========================
// LOCAL STORAGE HELPERS
// =========================

function getLocalMedicines() {
    try {
        return JSON.parse(
            localStorage.getItem("medicineTrackerMedicines") || "[]"
        );
    } catch (error) {
        return [];
    }
}

function saveLocalMedicines(medicines) {
    localStorage.setItem(
        "medicineTrackerMedicines",
        JSON.stringify(medicines)
    );
}


// =========================
// EXPIRY CALCULATION
// =========================

function calculateBestBeforeExpiry(manufacturingDate, months) {
    if (!manufacturingDate || !months) return "";

    const date = new Date(manufacturingDate);

    if (Number.isNaN(date.getTime())) return "";

    date.setMonth(date.getMonth() + Number(months));

    return date.toISOString().split("T")[0];
}


// =========================
// EXPIRY FIELDS
// =========================

function updateExpiryFields() {
    const selectedType = $(
        'input[name="expiryType"]:checked'
    )?.value;

    const exactExpiryField = $("#exactExpiryField");
    const bestBeforeField = $("#bestBeforeField");

    if (!exactExpiryField || !bestBeforeField) return;

    if (selectedType === "bestBefore") {
        exactExpiryField.classList.add("hidden");
        bestBeforeField.classList.remove("hidden");
    } else {
        exactExpiryField.classList.remove("hidden");
        bestBeforeField.classList.add("hidden");
    }
}


// =========================
// DATE / STATUS HELPERS
// =========================

function getDaysLeft(expiryDate) {
    if (!expiryDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const difference =
        expiry.getTime() - today.getTime();

    return Math.ceil(
        difference / (1000 * 60 * 60 * 24)
    );
}


function getStatus(expiryDate) {
    const daysLeft = getDaysLeft(expiryDate);

    if (daysLeft === null) {
        return {
            text: "Unknown",
            className: "status-warning"
        };
    }

    if (daysLeft < 0) {
        return {
            text: "Expired",
            className: "status-expired"
        };
    }

    if (daysLeft <= 30) {
        return {
            text: "Expiring Soon",
            className: "status-warning"
        };
    }

    return {
        text: "Safe",
        className: "status-safe"
    };
}


// =========================
// HTML ESCAPE
// =========================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =========================
// DISPLAY MEDICINES
// =========================

function displayMedicines(medicines) {
    const container = $("#medicineList");

    if (!container) return;

    if (!medicines || medicines.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No medicines found</h3>
                <p>Add a medicine to start tracking expiry dates.</p>
            </div>
        `;

        updateSummaryCards([]);
        return;
    }

    container.innerHTML = medicines
        .map((medicine) => {
            const status = getStatus(medicine.expiryDate);
            const daysLeft = getDaysLeft(medicine.expiryDate);

            let daysText = "";

            if (daysLeft < 0) {
                daysText = `${Math.abs(daysLeft)} days ago`;
            } else if (daysLeft === 0) {
                daysText = "Expires today";
            } else {
                daysText = `${daysLeft} days left`;
            }

            return `
                <div class="medicine-card">
                    <div class="medicine-info">
                        <h3>${escapeHtml(medicine.name)}</h3>

                        <p>
                            <strong>Batch:</strong>
                            ${escapeHtml(medicine.batchNumber || "-")}
                        </p>

                        <p>
                            <strong>Company:</strong>
                            ${escapeHtml(medicine.companyName || "-")}
                        </p>

                        <p>
                            <strong>Manufacturing Date:</strong>
                            ${escapeHtml(medicine.manufacturingDate || "-")}
                        </p>

                        <p>
                            <strong>Expiry Date:</strong>
                            ${escapeHtml(medicine.expiryDate || "-")}
                        </p>

                        <p>
                            <strong>Quantity:</strong>
                            ${escapeHtml(medicine.quantity || "-")}
                        </p>
                    </div>

                    <div class="medicine-status">
                        <span class="status-badge ${status.className}">
                            ${status.text}
                        </span>

                        <p>${daysText}</p>

                        <button
                            class="delete-medicine"
                            data-id="${escapeHtml(medicine.id)}"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");

    updateSummaryCards(medicines);
}


// =========================
// SUMMARY CARDS
// =========================

function updateSummaryCards(medicines) {
    const totalMedicines = medicines.length;

    const expired = medicines.filter(
        (medicine) =>
            getDaysLeft(medicine.expiryDate) < 0
    ).length;

    const expiringSoon = medicines.filter(
        (medicine) => {
            const days = getDaysLeft(medicine.expiryDate);
            return days >= 0 && days <= 30;
        }
    ).length;

    const safe = medicines.filter(
        (medicine) =>
            getDaysLeft(medicine.expiryDate) > 30
    ).length;

    const totalElement =
        $("#totalMedicines") ||
        $("#totalCount");

    const expiredElement =
        $("#expiredMedicines") ||
        $("#expiredCount");

    const expiringElement =
        $("#expiringSoon") ||
        $("#expiringCount");

    const safeElement =
        $("#safeMedicines") ||
        $("#safeCount");

    if (totalElement) {
        totalElement.textContent = totalMedicines;
    }

    if (expiredElement) {
        expiredElement.textContent = expired;
    }

    if (expiringElement) {
        expiringElement.textContent = expiringSoon;
    }

    if (safeElement) {
        safeElement.textContent = safe;
    }
}


// =========================
// LOAD MEDICINES
// =========================

async function loadMedicines() {
    try {
        const data = await apiRequest("/medicines");

        const medicines =
            Array.isArray(data)
                ? data
                : data?.medicines || [];

        localStorage.setItem(
            "medicineTrackerMedicines",
            JSON.stringify(medicines)
        );

        displayMedicines(medicines);
    } catch (error) {
        console.warn(
            "Backend unavailable. Using local storage.",
            error
        );

        displayMedicines(getLocalMedicines());
    }
}


// =========================
// SAVE MEDICINE
// =========================

async function saveMedicine(medicine) {
    const localMedicines = getLocalMedicines();

    const newMedicine = {
        ...medicine,
        id:
            medicine.id ||
            Date.now().toString()
    };

    try {
        const data = await apiRequest("/medicines", {
            method: "POST",
            body: JSON.stringify(newMedicine)
        });

        const savedMedicine =
            data?.medicine || data || newMedicine;

        localMedicines.push(savedMedicine);
        saveLocalMedicines(localMedicines);

        return savedMedicine;
    } catch (error) {
        console.warn(
            "Backend unavailable. Saving locally.",
            error
        );

        localMedicines.push(newMedicine);
        saveLocalMedicines(localMedicines);

        return newMedicine;
    }
}


// =========================
// DELETE MEDICINE
// =========================

async function deleteMedicine(id) {
    try {
        await apiRequest(`/medicines/${id}`, {
            method: "DELETE"
        });
    } catch (error) {
        console.warn(
            "Could not delete from backend. Removing locally.",
            error
        );
    }

    const medicines = getLocalMedicines().filter(
        (medicine) =>
            String(medicine.id) !== String(id)
    );

    saveLocalMedicines(medicines);

    await loadMedicines();
}


// =========================
// LOGIN / DASHBOARD
// =========================

function showDashboard() {
    $("#loginPage").classList.add("hidden");
    $("#dashboardPage").classList.remove("hidden");

    const savedUser =
        localStorage.getItem("medicineTrackerUser") ||
        "there";

    $("#profileName").textContent = savedUser;

    if ($("#profileInitial")) {
        $("#profileInitial").textContent =
            savedUser.charAt(0).toUpperCase();
    }

    loadMedicines();
}


function showLogin() {
    $("#dashboardPage").classList.add("hidden");
    $("#loginPage").classList.remove("hidden");

    const loginForm = $("#loginForm");

    if (loginForm) {
        loginForm.reset();
    }
}


function showCreateAccount() {
    const loginPage = $("#loginPage");

    if (!loginPage) return;

    loginPage.innerHTML = `
        <div class="login-container">
            <h1>Create Account</h1>

            <form id="signupForm">
                <div class="form-group">
                    <label>Name</label>
                    <input
                        type="text"
                        id="signupName"
                        required
                    >
                </div>

                <div class="form-group">
                    <label>Email</label>
                    <input
                        type="email"
                        id="signupEmail"
                        required
                    >
                </div>

                <div class="form-group">
                    <label>Password</label>
                    <input
                        type="password"
                        id="signupPassword"
                        required
                    >
                </div>

                <button type="submit">
                    Create Account
                </button>
            </form>

            <button
                type="button"
                id="backToLogin"
            >
                Back to Login
            </button>
        </div>
    `;

    $("#signupForm").addEventListener(
        "submit",
        handleSignup
    );

    $("#backToLogin").addEventListener(
        "click",
        () => location.reload()
    );
}


// =========================
// SIGNUP
// =========================

async function handleSignup(event) {
    event.preventDefault();

    const name =
        $("#signupName")?.value.trim();

    const email =
        $("#signupEmail")?.value.trim();

    const password =
        $("#signupPassword")?.value;

    if (!name || !email || !password) {
        alert("Please fill all fields.");
        return;
    }

    try {
        await apiRequest("/auth/signup", {
            method: "POST",
            body: JSON.stringify({
                name,
                email,
                password
            })
        });

        alert("Account created successfully.");

        location.reload();
    } catch (error) {
        localStorage.setItem(
            "medicineTrackerUser",
            name
        );

        localStorage.setItem(
            "medicineTrackerEmail",
            email
        );

        localStorage.setItem(
            "medicineTrackerPassword",
            password
        );

        alert("Account created successfully.");

        location.reload();
    }
}


// =========================
// LOGIN
// =========================

async function handleLogin(event) {
    event.preventDefault();

    const email =
        $("#loginEmail")?.value.trim();

    const password =
        $("#loginPassword")?.value;

    if (!email || !password) {
        alert("Please enter email and password.");
        return;
    }

    try {
        const data = await apiRequest(
            "/auth/login",
            {
                method: "POST",
                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const user =
            data?.user || data;

        localStorage.setItem(
            "medicineTrackerUser",
            user?.name || email
        );

        localStorage.setItem(
            "medicineTrackerEmail",
            email
        );

        showDashboard();
    } catch (error) {
        const savedEmail =
            localStorage.getItem(
                "medicineTrackerEmail"
            );

        const savedPassword =
            localStorage.getItem(
                "medicineTrackerPassword"
            );

        if (
            email === savedEmail &&
            password === savedPassword
        ) {
            showDashboard();
        } else {
            alert(
                "Invalid email or password."
            );
        }
    }
}


// =========================
// LOGOUT
// =========================

function logout() {
    localStorage.removeItem(
        "medicineTrackerUser"
    );

    localStorage.removeItem(
        "medicineTrackerEmail"
    );

    localStorage.removeItem(
        "medicineTrackerPassword"
    );

    showLogin();
}


// =========================
// ADD MEDICINE DIALOG
// =========================

function openMedicineDialog() {
    const dialog =
        $("#medicineDialog");

    if (!dialog) return;

    dialog.classList.remove("hidden");

    const form =
        $("#medicineForm");

    if (form) {
        form.reset();
    }

    updateExpiryFields();
}


function closeMedicineDialog() {
    const dialog =
        $("#medicineDialog");

    if (!dialog) return;

    dialog.classList.add("hidden");
}


// =========================
// MEDICINE FORM
// =========================

async function handleMedicineSubmit(event) {
    event.preventDefault();

    const name =
        $("#medicineName")?.value.trim();

    const batchNumber =
        $("#batchNumber")?.value.trim();

    const companyName =
        $("#companyName")?.value.trim();

    const manufacturingDate =
        $("#manufacturingDate")?.value;

    const quantity =
        $("#quantity")?.value;

    const expiryType =
        document.querySelector(
            'input[name="expiryType"]:checked'
        )?.value;

    if (
        !name ||
        !batchNumber ||
        !companyName ||
        !manufacturingDate ||
        !quantity
    ) {
        alert("Please fill all required fields.");
        return;
    }

    let expiryDate = "";

    if (expiryType === "bestBefore") {
        const months =
            $("#bestBeforeMonths")?.value;

        if (!months) {
            alert(
                "Please enter the shelf life in months."
            );
            return;
        }

        expiryDate =
            calculateBestBeforeExpiry(
                manufacturingDate,
                months
            );
    } else {
        expiryDate =
            $("#expiryDate")?.value;

        if (!expiryDate) {
            alert(
                "Please select an expiry date."
            );
            return;
        }
    }

    const medicine = {
        name,
        batchNumber,
        companyName,
        manufacturingDate,
        expiryDate,
        quantity,
        expiryType
    };

    await saveMedicine(medicine);

    closeMedicineDialog();

    await loadMedicines();

    alert("Medicine added successfully.");
}


// =========================
// SEARCH + FILTER
// =========================

function filterMedicines() {
    const searchInput =
        $("#searchInput");

    const filterSelect =
        $("#statusFilter");

    const searchText =
        searchInput?.value
            .toLowerCase()
            .trim() || "";

    const selectedFilter =
        filterSelect?.value || "all";

    const medicines =
        getLocalMedicines();

    const filtered =
        medicines.filter((medicine) => {
            const searchableText = `
                ${medicine.name}
                ${medicine.batchNumber}
                ${medicine.companyName}
            `.toLowerCase();

            const matchesSearch =
                searchableText.includes(searchText);

            const days =
                getDaysLeft(
                    medicine.expiryDate
                );

            let matchesFilter = true;

            if (selectedFilter === "expired") {
                matchesFilter = days < 0;
            }

            if (
                selectedFilter ===
                "expiring"
            ) {
                matchesFilter =
                    days >= 0 &&
                    days <= 30;
            }

            if (selectedFilter === "safe") {
                matchesFilter = days > 30;
            }

            return (
                matchesSearch &&
                matchesFilter
            );
        });

    displayMedicines(filtered);
}


// =========================
// EVENT LISTENERS
// =========================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        // Login
        const loginForm =
            $("#loginForm");

        if (loginForm) {
            loginForm.addEventListener(
                "submit",
                handleLogin
            );
        }


        // Create account
        const createAccountButton =
            $("#createAccountButton");

        if (createAccountButton) {
            createAccountButton.addEventListener(
                "click",
                showCreateAccount
            );
        }


        // Logout
        const logoutButton =
            $("#logoutButton");

        if (logoutButton) {
            logoutButton.addEventListener(
                "click",
                logout
            );
        }


        // Add medicine buttons
        document.addEventListener(
            "click",
            (event) => {
                const addButton =
                    event.target.closest(
                        '[data-action="add"]'
                    );

                if (addButton) {
                    openMedicineDialog();
                }
            }
        );


        // Medicine form
        const medicineForm =
            $("#medicineForm");

        if (medicineForm) {
            medicineForm.addEventListener(
                "submit",
                handleMedicineSubmit
            );
        }


        // Expiry type
        document
            .querySelectorAll(
                'input[name="expiryType"]'
            )
            .forEach((radio) => {
                radio.addEventListener(
                    "change",
                    updateExpiryFields
                );
            });


        // Close dialog
        const closeDialogButton =
            $("#closeMedicineDialog");

        if (closeDialogButton) {
            closeDialogButton.addEventListener(
                "click",
                closeMedicineDialog
            );
        }


        const cancelMedicineButton =
            $("#cancelMedicine");

        if (cancelMedicineButton) {
            cancelMedicineButton.addEventListener(
                "click",
                closeMedicineDialog
            );
        }


        // Delete medicine
        document.addEventListener(
            "click",
            (event) => {
                const deleteButton =
                    event.target.closest(
                        ".delete-medicine"
                    );

                if (!deleteButton) return;

                const id =
                    deleteButton.dataset.id;

                if (
                    confirm(
                        "Are you sure you want to delete this medicine?"
                    )
                ) {
                    deleteMedicine(id);
                }
            }
        );


        // Search
        const searchInput =
            $("#searchInput");

        if (searchInput) {
            searchInput.addEventListener(
                "input",
                filterMedicines
            );
        }


        // Filter
        const statusFilter =
            $("#statusFilter");

        if (statusFilter) {
            statusFilter.addEventListener(
                "change",
                filterMedicines
            );
        }


        // Navbar navigation
        document
            .querySelectorAll(".nav-item")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        document
                            .querySelectorAll(
                                ".nav-item"
                            )
                            .forEach((item) =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        if (
                            !button.hasAttribute(
                                "data-action"
                            ) &&
                            button.id !==
                                "logoutButton"
                        ) {
                            button.classList.add(
                                "active"
                            );
                        }
                    }
                );
            });


        // Keep logged-in user on dashboard
        const savedUser =
            localStorage.getItem(
                "medicineTrackerUser"
            );

        if (savedUser) {
            showDashboard();
        } else {
            showLogin();
        }
    }
);