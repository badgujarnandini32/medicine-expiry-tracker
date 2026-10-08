const $ = (selector) => document.querySelector(selector);

// =========================
// API CONFIG
// =========================

const getApiBaseUrl = () => {
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
    const token = localStorage.getItem("medicineTrackerToken");

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
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
// LOCAL STORAGE
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
    const selectedType =
        document.querySelector(
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
// DATE / STATUS
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
                            ${escapeHtml(
                                medicine.batchNumber ||
                                medicine.batch ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>Company:</strong>
                            ${escapeHtml(
                                medicine.companyName ||
                                medicine.company ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>Manufacturing Date:</strong>
                            ${escapeHtml(
                                medicine.manufacturingDate || "-"
                            )}
                        </p>

                        <p>
                            <strong>Expiry Date:</strong>
                            ${escapeHtml(
                                medicine.expiryDate || "-"
                            )}
                        </p>

                        <p>
                            <strong>Quantity:</strong>
                            ${escapeHtml(
                                medicine.quantity || "-"
                            )}
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
    const total = medicines.length;

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
        $("#totalCount");

    const safeElement =
        $("#safeCount");

    const soonElement =
        $("#soonCount");

    const expiredElement =
        $("#expiredCount");

    if (totalElement) {
        totalElement.textContent = total;
    }

    if (safeElement) {
        safeElement.textContent = safe;
    }

    if (soonElement) {
        soonElement.textContent = expiringSoon;
    }

    if (expiredElement) {
        expiredElement.textContent = expired;
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

        saveLocalMedicines(medicines);

        displayMedicines(medicines);

    } catch (error) {
        console.warn(
            "Could not load medicines:",
            error
        );

        displayMedicines(getLocalMedicines());
    }
}


// =========================
// SAVE MEDICINE
// =========================

async function saveMedicine(medicine) {
    try {
        const data = await apiRequest("/medicines", {
            method: "POST",
            body: JSON.stringify(medicine)
        });

        const savedMedicine =
            data?.medicine ||
            data ||
            medicine;

        const medicines = getLocalMedicines();

        medicines.push(savedMedicine);

        saveLocalMedicines(medicines);

        return savedMedicine;

    } catch (error) {
        console.warn(
            "Could not save to backend. Saving locally.",
            error
        );

        const medicines = getLocalMedicines();

        const newMedicine = {
            ...medicine,
            id:
                medicine.id ||
                Date.now().toString()
        };

        medicines.push(newMedicine);

        saveLocalMedicines(medicines);

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
            "Could not delete from backend:",
            error
        );
    }

    const medicines =
        getLocalMedicines().filter(
            (medicine) =>
                String(medicine.id) !== String(id)
        );

    saveLocalMedicines(medicines);

    displayMedicines(medicines);

    loadMedicines();
}


// =========================
// DASHBOARD
// =========================

function showDashboard() {
    const loginPage = $("#loginPage");
    const dashboardPage = $("#dashboardPage");

    if (loginPage) {
        loginPage.classList.add("hidden");
    }

    if (dashboardPage) {
        dashboardPage.classList.remove("hidden");
    }

    const savedUser =
        localStorage.getItem("medicineTrackerUser") ||
        localStorage.getItem("medicineTrackerEmail") ||
        "there";

    if ($("#profileName")) {
        $("#profileName").textContent = savedUser;
    }

    if ($("#profileInitial")) {
        $("#profileInitial").textContent =
            savedUser.charAt(0).toUpperCase();
    }

    loadMedicines();
}


function showLogin() {
    const dashboardPage = $("#dashboardPage");
    const loginPage = $("#loginPage");

    if (dashboardPage) {
        dashboardPage.classList.add("hidden");
    }

    if (loginPage) {
        loginPage.classList.remove("hidden");
    }
}


// =========================
// CREATE ACCOUNT
// =========================

function showCreateAccount() {
    const createAccountCard =
        $("#createAccountCard");

    const loginCard =
        $("#loginCard");

    if (createAccountCard) {
        createAccountCard.classList.remove("hidden");
    }

    if (loginCard) {
        loginCard.classList.add("hidden");
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
        const data = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({
                username: email,
                password: password
            })
        });

        const token =
            data?.token;

        if (!token) {
            throw new Error("Login token was not received.");
        }

        localStorage.setItem(
            "medicineTrackerToken",
            token
        );

        localStorage.setItem(
            "medicineTrackerUser",
            email
        );

        localStorage.setItem(
            "medicineTrackerEmail",
            email
        );

        showDashboard();

    } catch (error) {
        console.error("Login failed:", error);

        alert(
            error.message ||
            "Invalid email or password."
        );
    }
}


// =========================
// SIGNUP
// =========================

async function handleSignup(event) {
    event.preventDefault();

    const email =
        $("#createAccountEmail")?.value.trim();

    const password =
        $("#createAccountPassword")?.value;

    const confirmPassword =
        $("#confirmAccountPassword")?.value;

    const message =
        $("#createAccountMessage");

    if (!email || !password || !confirmPassword) {
        if (message) {
            message.textContent =
                "Please fill all fields.";
        }

        return;
    }

    if (password !== confirmPassword) {
        if (message) {
            message.textContent =
                "Passwords do not match.";
        }

        return;
    }

    try {
        await apiRequest("/signup", {
            method: "POST",
            body: JSON.stringify({
                username: email,
                password: password
            })
        });

        if (message) {
            message.textContent =
                "Account created successfully. Please login.";
        }

        if ($("#createAccountForm")) {
            $("#createAccountForm").reset();
        }

        if ($("#createAccountCard")) {
            $("#createAccountCard").classList.add("hidden");
        }

        if ($("#loginCard")) {
            $("#loginCard").classList.remove("hidden");
        }

    } catch (error) {
        console.error("Signup failed:", error);

        if (message) {
            message.textContent =
                error.message ||
                "Could not create account.";
        }
    }
}


// =========================
// LOGOUT
// =========================

function logout() {
    localStorage.removeItem(
        "medicineTrackerToken"
    );

    localStorage.removeItem(
        "medicineTrackerUser"
    );

    localStorage.removeItem(
        "medicineTrackerEmail"
    );

    showLogin();
}


// =========================
// MEDICINE DIALOG
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
        quantity: Number(quantity)
    };

    try {
        await saveMedicine(medicine);

        closeMedicineDialog();

        await loadMedicines();

        alert("Medicine added successfully.");

    } catch (error) {
        alert(
            error.message ||
            "Could not add medicine."
        );
    }
}


// =========================
// SEARCH + FILTER
// =========================

function filterMedicines() {
    const searchText =
        $("#searchInput")?.value
            .toLowerCase()
            .trim() || "";

    const selectedFilter =
        $("#statusFilter")?.value || "All";

    const medicines =
        getLocalMedicines();

    const filtered =
        medicines.filter((medicine) => {

            const searchableText = `
                ${medicine.name || ""}
                ${medicine.batchNumber || medicine.batch || ""}
                ${medicine.companyName || medicine.company || ""}
            `.toLowerCase();

            const matchesSearch =
                searchableText.includes(searchText);

            const days =
                getDaysLeft(
                    medicine.expiryDate
                );

            let matchesFilter = true;

            if (selectedFilter === "Expired") {
                matchesFilter = days < 0;
            }

            if (selectedFilter === "Expiring Soon") {
                matchesFilter =
                    days >= 0 &&
                    days <= 30;
            }

            if (selectedFilter === "Safe") {
                matchesFilter =
                    days > 30;
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


        // Create Account
        const createAccountForm =
            $("#createAccountForm");

        if (createAccountForm) {
            createAccountForm.addEventListener(
                "submit",
                handleSignup
            );
        }


        // Show Create Account
        const showCreateAccountButton =
            $("#showCreateAccountButton");

        if (showCreateAccountButton) {
            showCreateAccountButton.addEventListener(
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


        // Add Medicine
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


        // Welcome Add Medicine button
        const openAddMedicine =
            $("#openAddMedicine");

        if (openAddMedicine) {
            openAddMedicine.addEventListener(
                "click",
                openMedicineDialog
            );
        }


        // Medicine Form
        const medicineForm =
            $("#medicineForm");

        if (medicineForm) {
            medicineForm.addEventListener(
                "submit",
                handleMedicineSubmit
            );
        }


        // Expiry Type
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


        // Close Dialog
        const closeDialog =
            $("#closeDialog");

        if (closeDialog) {
            closeDialog.addEventListener(
                "click",
                closeMedicineDialog
            );
        }


        // Cancel Medicine
        const cancelMedicine =
            $("#cancelMedicine");

        if (cancelMedicine) {
            cancelMedicine.addEventListener(
                "click",
                closeMedicineDialog
            );
        }


        // Delete Medicine
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


        // Navbar
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
                            .forEach((item) => {
                                item.classList.remove(
                                    "active"
                                );
                            });

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


        // Initial screen
        const token =
            localStorage.getItem(
                "medicineTrackerToken"
            );

        if (token) {
            showDashboard();
        } else {
            showLogin();
        }
    }
);