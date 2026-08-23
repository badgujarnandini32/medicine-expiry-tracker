console.log("Medicine Expiry Tracker JavaScript connected!");

// Get HTML elements
const medicineList = document.getElementById("medicineList");
const medicineName = document.getElementById("medicineName");
const batchNumber = document.getElementById("batchNumber");
const manufacturingDate = document.getElementById("manufacturingDate");
const expiryDate = document.getElementById("expiryDate");
const quantity = document.getElementById("quantity");
const addMedicine = document.getElementById("addMedicine");

// Array to store medicines
const medicines = [];


// ================================
// LOAD SAVED MEDICINES
// ================================

const savedMedicines = localStorage.getItem("medicines");

if (savedMedicines) {
    medicines.push(...JSON.parse(savedMedicines));
    displayMedicines();
}


// ================================
// DISPLAY MEDICINES
// ================================

function displayMedicines() {

    medicineList.innerHTML = "";

    medicines.forEach(function(medicine, index) {

        // Get today's date
        const today = new Date();

        // Get medicine expiry date
        const expiry = new Date(medicine.expiryDate);

        // Remove time from dates
        today.setHours(0, 0, 0, 0);
        expiry.setHours(0, 0, 0, 0);

        // Calculate difference
        const difference = expiry - today;

        // Convert milliseconds into days
        const daysLeft = Math.ceil(
            difference / (1000 * 60 * 60 * 24)
        );

        // Determine status
        let status;

        if (daysLeft < 0) {
            status = "Expired";
        }
        else if (daysLeft <= 30) {
            status = "Expiring Soon";
        }
        else {
            status = "Safe";
        }


        // Display medicine
        medicineList.innerHTML += `
            <div>

                <h3>${medicine.name}</h3>

                <p>Batch: ${medicine.batch}</p>

                <p>
                    Manufacturing Date:
                    ${medicine.manufacturingDate}
                </p>

                <p>
                    Expiry Date:
                    ${medicine.expiryDate}
                </p>

                <p>
                    Quantity: ${medicine.quantity}
                </p>

                <p class="status ${status.toLowerCase().replace(" ", "-")}">
                    Status: ${status}
                </p>

                <p>
                    Days Left: ${daysLeft}
                </p>

                <button onclick="deleteMedicine(${index})">
                    Delete
                </button>

            </div>
        `;
    });
}


// ================================
// DELETE MEDICINE
// ================================

function deleteMedicine(index) {

    // Remove medicine from array
    medicines.splice(index, 1);

    // Update Local Storage
    localStorage.setItem(
        "medicines",
        JSON.stringify(medicines)
    );

    // Update webpage
    displayMedicines();
}


// ================================
// ADD MEDICINE
// ================================

addMedicine.addEventListener("click", function() {

    // Check empty fields
    if (
        medicineName.value === "" ||
        batchNumber.value === "" ||
        manufacturingDate.value === "" ||
        expiryDate.value === "" ||
        quantity.value === ""
    ) {

        alert("Please fill all fields");

        return;
    }


    // Create medicine object
    const medicine = {

        name: medicineName.value,

        batch: batchNumber.value,

        manufacturingDate: manufacturingDate.value,

        expiryDate: expiryDate.value,

        quantity: quantity.value
    };


    // Add medicine to array
    medicines.push(medicine);


    // Save medicines
    localStorage.setItem(
        "medicines",
        JSON.stringify(medicines)
    );


    // Display medicines
    displayMedicines();


    // Clear form
    medicineName.value = "";
    batchNumber.value = "";
    manufacturingDate.value = "";
    expiryDate.value = "";
    quantity.value = "";

});