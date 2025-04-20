const fetch = require("node-fetch");
require("dotenv").config();

exports.handler = async (event, context) => {
  try {
    const response = await fetch(
      "https://sundora-bd.myshopify.com/admin/api/2025-04/orders.json?status=any",
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors || "Failed to fetch orders");
    }

    const orders = data.orders.map((order) => {
      const fulfillment = order.fulfillments?.[0];
      return {
        id: order.id,
        name: order.name,
        customerName: order.shipping_address.name,
        shippingAddress: order.shipping_address.address1,
        totalPrice: order.total_price,
        trackingNumber: fulfillment?.tracking_number,
        trackingUrl: fulfillment?.tracking_url,
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify(orders),
    };
  } catch (error) {
    console.error("Error fetching orders:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
