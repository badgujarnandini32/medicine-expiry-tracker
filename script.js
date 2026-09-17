const API_BASE_URL = "http://localhost:3000/api";
const $ = (selector) => document.querySelector(selector);
const medicineList = $("#medicineList");
let medicines = [];
let activeFilter = "All";
let authToken = localStorage.getItem("medicineTrackerToken") || "";

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...(options.headers || {})
        },
        ...options
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
        const message = typeof data === "string" ? data : (data.message || "Request failed.");
        throw new Error(message);
    }

    return data;
}

function updateExpiryDate() {
    const manufacturingDate = $("#manufacturingDate").value;
    const shelfLifeYears = Number($("#shelfLifeYears").value);
    if (!manufacturingDate || !Number.isInteger(shelfLifeYears) || shelfLifeYears < 1) {
        $("#expiryDate").value = "";
        return;
    }

    const expiryDate = new Date(`${manufacturingDate}T00:00:00`);
    expiryDate.setFullYear(expiryDate.getFullYear() + shelfLifeYears);
    const year = expiryDate.getFullYear();
    const month = String(expiryDate.getMonth() + 1).padStart(2, "0");
    const day = String(expiryDate.getDate()).padStart(2, "0");
    $("#expiryDate").value = `${year}-${month}-${day}`;
}

function getDaysLeft(medicine) {
    const today = new Date();
    const expiry = new Date(`${medicine.expiryDate}T00:00:00`);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / 86400000);
}

function getStatus(daysLeft) {
    if (daysLeft < 0) return "Expired";
    if (daysLeft <= 30) return "Expiring Soon";
    return "Safe";
}

function escapeHtml(value) {
    return String(value).replace(/[&<>\'\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character]));
}

function displayMedicines() {
    const searchTerm = $("#searchInput").value.trim().toLowerCase();
    const filtered = medicines
        .map((medicine, index) => ({ medicine, index, daysLeft: getDaysLeft(medicine) }))
        .filter(({ medicine, daysLeft }) => {
            const status = getStatus(daysLeft);
            const matchesFilter = activeFilter === "All" || status === activeFilter;
            const matchesSearch = (medicine.name || "").toLowerCase().includes(searchTerm) || (medicine.batch || "").toLowerCase().includes(searchTerm);
            return matchesFilter && matchesSearch;
        });

    $("#totalCount").textContent = medicines.length;
    $("#safeCount").textContent = medicines.filter((medicine) => getStatus(getDaysLeft(medicine)) === "Safe").length;
    $("#soonCount").textContent = medicines.filter((medicine) => getStatus(getDaysLeft(medicine)) === "Expiring Soon").length;
    $("#expiredCount").textContent = medicines.filter((medicine) => getStatus(getDaysLeft(medicine)) === "Expired").length;

    if (!filtered.length) {
        medicineList.innerHTML = `<div class="empty-state"><span>~</span><h3>No medicines found</h3><p>Add a medicine or adjust your search and filters.</p></div>`;
        return;
    }

    medicineList.innerHTML = `<div class="medicine-table"><div class="table-row table-header"><span>Medicine</span><span>Batch number</span><span>Dates</span><span>Quantity</span><span>Status</span><span></span></div>${filtered.map(({ medicine, index, daysLeft }) => {
        const status = getStatus(daysLeft);
        const daysLabel = daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`;
        const statusClass = status.toLowerCase().replace(" ", "-");
        return `<div class="table-row"><div class="medicine-name"><span class="medicine-icon">+</span><strong>${escapeHtml(medicine.name)}</strong></div><span class="muted">${escapeHtml(medicine.batch)}</span><span class="date-stack"><b>${escapeHtml(medicine.expiryDate)}</b><small>Made ${escapeHtml(medicine.manufacturingDate)}</small></span><span>${escapeHtml(medicine.quantity)} units</span><span><b class="status ${statusClass}">${status}</b><small class="days-left">${daysLabel}</small></span><button class="delete-button" data-id="${medicine.id || index}" aria-label="Delete ${escapeHtml(medicine.name)}">Delete</button></div>`;
    }).join("")}</div>`;
}

async function loadMedicines() {
    if (!authToken) {
        medicines = [];
        displayMedicines();
        return;
    }

    try {
        medicines = await apiRequest("/medicines");
        displayMedicines();
    } catch (error) {
        $("#loginMessage").textContent = error.message;
        logout();
    }
}

async function saveMedicine(event) {
    event.preventDefault();

    try {
        const payload = {
            name: $("#medicineName").value.trim(),
            batch: $("#batchNumber").value.trim(),
            manufacturingDate: $("#manufacturingDate").value,
            expiryDate: $("#expiryDate").value,
            quantity: Number($("#quantity").value)
        };

        await apiRequest("/medicines", { method: "POST", body: JSON.stringify(payload) });
        event.target.reset();
        $("#medicineDialog").close();
        await loadMedicines();
    } catch (error) {
        $("#loginMessage").textContent = error.message;
    }
}

async function deleteMedicine(medicineId) {
    try {
        await apiRequest(`/medicines/${medicineId}`, { method: "DELETE" });
        await loadMedicines();
    } catch (error) {
        $("#loginMessage").textContent = error.message;
    }
}

function showDashboard() {
    $("#loginPage").classList.add("hidden");
    $("#dashboardPage").classList.remove("hidden");
    const savedUser = localStorage.getItem("medicineTrackerUser") || "there";
    $("#profileName").textContent = savedUser;
    $("#profileInitial").textContent = savedUser.charAt(0).toUpperCase();
    loadMedicines();
}

function showLogin() {
    $("#createAccountCard").classList.add("hidden");
    $("#loginCard").classList.remove("hidden");
    $("#loginMessage").textContent = "";
}

function showCreateAccount() {
    $("#loginCard").classList.add("hidden");
    $("#createAccountCard").classList.remove("hidden");
    $("#createAccountMessage").textContent = "";
}

function logout() {
    authToken = "";
    localStorage.removeItem("medicineTrackerToken");
    localStorage.removeItem("medicineTrackerUser");
    localStorage.removeItem("medicineTrackerRemembered");
    sessionStorage.removeItem("medicineTrackerSession");
    $("#dashboardPage").classList.add("hidden");
    $("#loginPage").classList.remove("hidden");
    showLogin();
}

$("#createAccountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#createAccountEmail").value.trim();
    const password = $("#createAccountPassword").value;

    if (password !== $("#confirmAccountPassword").value) {
        $("#createAccountMessage").textContent = "Passwords do not match.";
        return;
    }

    try {
        await apiRequest("/signup", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        event.target.reset();
        showLogin();
        $("#loginEmail").value = username;
        $("#loginMessage").textContent = "Account created. Log in to continue.";
    } catch (error) {
        $("#createAccountMessage").textContent = error.message;
    }
});

$("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;

    try {
        const response = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({ username: user, password })
        });

        authToken = response.token;
        localStorage.setItem("medicineTrackerToken", authToken);
        localStorage.setItem("medicineTrackerUser", user);
        sessionStorage.setItem("medicineTrackerSession", "true");
        if ($("#rememberMe").checked) localStorage.setItem("medicineTrackerRemembered", "true");
        showDashboard();
    } catch (error) {
        $("#loginMessage").textContent = error.message;
    }
});

$("#showCreateAccountButton").addEventListener("click", showCreateAccount);

$("#togglePassword").addEventListener("click", () => {
    const password = $("#loginPassword");
    const isPassword = password.type === "password";
    password.type = isPassword ? "text" : "password";
    $("#togglePassword").textContent = isPassword ? "Hide" : "Show";
});

$("#loginEmail").value = localStorage.getItem("medicineTrackerRemembered") ? localStorage.getItem("medicineTrackerUser") || "" : "";
$("#openAddMedicine").addEventListener("click", () => $("#medicineDialog").showModal());
$("#closeDialog").addEventListener("click", () => $("#medicineDialog").close());
$("#medicineDialog").addEventListener("click", (event) => { if (event.target === $("#medicineDialog")) $("#medicineDialog").close(); });
$("#manufacturingDate").addEventListener("change", updateExpiryDate);
$("#shelfLifeYears").addEventListener("input", updateExpiryDate);
$("#medicineForm").addEventListener("submit", saveMedicine);

$("#medicineList").addEventListener("click", (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) return;
    deleteMedicine(button.dataset.id);
});

$("#searchInput").addEventListener("input", displayMedicines);
$("#statusFilter").addEventListener("change", (event) => { activeFilter = event.target.value; displayMedicines(); });
document.querySelectorAll(".nav-item[data-filter]").forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter; $("#statusFilter").value = activeFilter; displayMedicines(); }));
$("#logoutButton").addEventListener("click", () => { logout(); });
document.querySelectorAll(".nav-item[data-action='add']").forEach((button) => button.addEventListener("click", () => $("#medicineDialog").showModal()));

if (authToken && sessionStorage.getItem("medicineTrackerSession") === "true") showDashboard();
else if (authToken) showDashboard();
else showLogin();
