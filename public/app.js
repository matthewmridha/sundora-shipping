// Initialize Shopify App Bridge
const app = window.shopifyAppBridge.default;
const client = app.createClient({
  apiKey: "9dc52f6031a0a5949e3229272a640e10",
  host: "sundora-bd.myshopify.com",
});

// Global variables
let orders = [];
const selectedOrders = new Set();

// DOM Elements
const ordersTable = document.getElementById("ordersTable");
const ordersBody = document.getElementById("ordersBody");
const selectAllCheckbox = document.getElementById("selectAll");
const bulkShipButton = document.getElementById("bulkShipButton");
const filterShippedCheckbox = document.getElementById("filterShipped");
const successModal = new bootstrap.Modal(
  document.getElementById("successModal")
);
const errorModal = new bootstrap.Modal(document.getElementById("errorModal"));

// Event Listeners
selectAllCheckbox.addEventListener("change", handleSelectAll);
bulkShipButton.addEventListener("click", handleBulkShip);
filterShippedCheckbox.addEventListener("change", filterOrders);

// Initialize
fetchOrders();

async function fetchOrders() {
  try {
    const response = await fetch("/.netlify/functions/orders");
    orders = await response.json();
    renderOrders();
  } catch (error) {
    showError("Failed to fetch orders: " + error.message);
  }
}

function renderOrders() {
  ordersBody.innerHTML = "";
  const filteredOrders = filterShippedCheckbox.checked
    ? orders.filter((order) => !order.trackingNumber)
    : orders;

  filteredOrders.forEach((order) => {
    const row = document.createElement("tr");
    row.innerHTML = `
            <td><input type="checkbox" class="order-checkbox" data-order-id="${
              order.id
            }"></td>
            <td>${order.name}</td>
            <td>${order.customerName}</td>
            <td>${order.shippingAddress}</td>
            <td>${order.totalPrice}</td>
            <td>${order.trackingNumber ? "Shipped" : "Pending"}</td>
            <td>
                ${
                  order.trackingNumber
                    ? `<a href="${order.trackingUrl}" class="tracking-link" target="_blank">TRACK</a>`
                    : `<button class="btn btn-sm btn-primary ship-redx" data-order-id="${order.id}">SHIP REDX</button>`
                }
            </td>
        `;
    ordersBody.appendChild(row);
  });

  // Add event listeners to checkboxes and buttons
  document.querySelectorAll(".order-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", handleOrderSelect);
  });

  document.querySelectorAll(".ship-redx").forEach((button) => {
    button.addEventListener("click", handleShipRedx);
  });

  updateBulkShipButton();
}

function handleSelectAll(e) {
  const checkboxes = document.querySelectorAll(".order-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = e.target.checked;
    handleOrderSelect({ target: checkbox });
  });
}

function handleOrderSelect(e) {
  const orderId = e.target.dataset.orderId;
  if (e.target.checked) {
    selectedOrders.add(orderId);
  } else {
    selectedOrders.delete(orderId);
  }
  updateBulkShipButton();
}

function updateBulkShipButton() {
  bulkShipButton.style.display = selectedOrders.size > 0 ? "block" : "none";
}

async function handleShipRedx(e) {
  const orderId = e.target.dataset.orderId;
  try {
    const response = await fetch("/.netlify/functions/create-redx-shipping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId }),
    });

    const result = await response.json();
    if (result.success) {
      showSuccess(
        `Shipping created successfully. Tracking ID: ${result.trackingId}`
      );
      fetchOrders(); // Refresh the orders list
    } else {
      showError(result.error);
    }
  } catch (error) {
    showError("Failed to create shipping: " + error.message);
  }
}

async function handleBulkShip() {
  const orderIds = Array.from(selectedOrders);
  let successCount = 0;
  let errorCount = 0;

  for (const orderId of orderIds) {
    try {
      const response = await fetch("/.netlify/functions/create-redx-shipping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId }),
      });

      const result = await response.json();
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      errorCount++;
    }
  }

  if (successCount > 0) {
    showSuccess(`Successfully created shipping for ${successCount} orders`);
  }
  if (errorCount > 0) {
    showError(`Failed to create shipping for ${errorCount} orders`);
  }

  selectedOrders.clear();
  fetchOrders(); // Refresh the orders list
}

function filterOrders() {
  renderOrders();
}

function showSuccess(message) {
  document.getElementById("successMessage").textContent = message;
  successModal.show();
}

function showError(message) {
  document.getElementById("errorMessage").textContent = message;
  errorModal.show();
}
