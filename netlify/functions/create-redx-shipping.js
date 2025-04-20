const fetch = require("node-fetch");
require("dotenv").config();

exports.handler = async (event, context) => {
  try {
    const { orderId } = JSON.parse(event.body);

    // Get order details from Shopify REST API
    const orderResponse = await fetch(
      `https://sundora-bd.myshopify.com/admin/api/2025-04/orders/${orderId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      throw new Error(orderData.errors || "Failed to fetch order details");
    }

    const order = orderData.order;

    // Process address to get area
    const addressParts = order.shipping_address.address1.split(",");
    const lastPart = addressParts[addressParts.length - 1].trim();
    const addressWithoutLastPart = addressParts.slice(0, -1).join(",").trim();

    // Find matching area
    const areas = require("../../areas.json").areas;
    const matchingArea = areas.find(
      (area) =>
        area.name === lastPart &&
        area.district_name === order.shipping_address.city &&
        area.post_code.toString() === order.shipping_address.zip
    );

    if (!matchingArea) {
      throw new Error("No matching area found");
    }

    // Prepare RedX API call
    const redxHeaders = {
      "API-ACCESS-TOKEN": `Bearer ${process.env.REDX_TOKEN}`,
      "Content-Type": "application/json",
    };

    const redxBody = {
      customer_name: order.shipping_address.name,
      customer_phone: order.shipping_address.phone,
      delivery_area: matchingArea.name,
      delivery_area_id: matchingArea.redx_id,
      customer_address: addressWithoutLastPart,
      merchant_invoice_id: order.name,
      cash_collection_amount: order.total_price,
      parcel_weight: 1000,
      instruction: order.note || "",
      value: order.total_line_items_price,
      is_closed_box: true,
      parcel_details_json: order.line_items.map((item) => ({
        name: item.title,
        category: item.variant_title || "General",
        value: item.price,
      })),
    };

    // Call RedX API
    const redxResponse = await fetch(
      "https://openapi.redx.com.bd/v1.0.0-beta/parcel",
      {
        method: "POST",
        headers: redxHeaders,
        body: JSON.stringify(redxBody),
      }
    );

    const redxData = await redxResponse.json();

    if (!redxResponse.ok) {
      throw new Error(redxData.message || "RedX API call failed");
    }

    // Update Shopify fulfillment tracking
    const fulfillmentId = order.fulfillments?.[0]?.id;
    if (!fulfillmentId) {
      throw new Error("No fulfillment found for order");
    }

    const trackingUpdateResponse = await fetch(
      `https://sundora-bd.myshopify.com/admin/api/2025-04/fulfillments/${fulfillmentId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fulfillment: {
            tracking_info: {
              number: redxData.tracking_id,
              url: `https://redx.com.bd/track-parcel/?trackingId=${redxData.tracking_id}`,
              company: "RedX",
            },
            notify_customer: true,
          },
        }),
      }
    );

    const trackingData = await trackingUpdateResponse.json();

    if (!trackingUpdateResponse.ok) {
      throw new Error(
        trackingData.errors || "Failed to update tracking information"
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        trackingId: redxData.tracking_id,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
