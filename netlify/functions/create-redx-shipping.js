const { Shopify } = require("@shopify/shopify-api");
require("dotenv").config();

const shopify = new Shopify({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: [
    "read_orders",
    "write_orders",
    "read_fulfillments",
    "write_fulfillments",
  ],
  hostName: "sundora-bd.myshopify.com",
  isEmbeddedApp: true,
  apiVersion: "2025-04",
});

exports.handler = async (event, context) => {
  try {
    const { orderId } = JSON.parse(event.body);
    const session = await shopify.session.create("sundora-bd.myshopify.com");
    const client = new shopify.clients.Graphql({ session });

    // Get order details
    const orderQuery = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          shippingAddress {
            name
            phone
            address1
            city
            zip
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          totalLineItemsPriceSet {
            shopMoney {
              amount
            }
          }
          note
          lineItems(first: 10) {
            edges {
              node {
                title
                quantity
                variant {
                  title
                }
                priceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
          fulfillments(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

    const orderResponse = await client.query({
      data: {
        query: orderQuery,
        variables: {
          id: `gid://shopify/Order/${orderId}`,
        },
      },
    });

    const order = orderResponse.body.data.order;

    // Process address to get area
    const addressParts = order.shippingAddress.address1.split(",");
    const lastPart = addressParts[addressParts.length - 1].trim();
    const addressWithoutLastPart = addressParts.slice(0, -1).join(",").trim();

    // Find matching area
    const areas = require("../../areas.json").areas;
    const matchingArea = areas.find(
      (area) =>
        area.name === lastPart &&
        area.district_name === order.shippingAddress.city &&
        area.post_code.toString() === order.shippingAddress.zip
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
      customer_name: order.shippingAddress.name,
      customer_phone: order.shippingAddress.phone,
      delivery_area: matchingArea.name,
      delivery_area_id: matchingArea.redx_id,
      customer_address: addressWithoutLastPart,
      merchant_invoice_id: order.name,
      cash_collection_amount: order.totalPriceSet.shopMoney.amount,
      parcel_weight: 1000,
      instruction: order.note || "",
      value: order.totalLineItemsPriceSet.shopMoney.amount,
      is_closed_box: true,
      parcel_details_json: order.lineItems.edges.map((item) => ({
        name: item.node.title,
        category: item.node.variant?.title || "General",
        value: item.node.priceSet.shopMoney.amount,
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
    const fulfillmentId = order.fulfillments.edges[0]?.node.id;
    if (!fulfillmentId) {
      throw new Error("No fulfillment found for order");
    }

    const trackingUpdateMutation = `
      mutation FulfillmentTrackingInfoUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
        fulfillmentTrackingInfoUpdate(
          fulfillmentId: $fulfillmentId
          trackingInfoInput: $trackingInfoInput
          notifyCustomer: true
        ) {
          fulfillment {
            id
            status
            trackingInfo {
              company
              number
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const trackingResponse = await client.query({
      data: {
        query: trackingUpdateMutation,
        variables: {
          fulfillmentId,
          trackingInfoInput: {
            company: "RedX",
            number: redxData.tracking_id,
            url: `https://redx.com.bd/track-parcel/?trackingId=${redxData.tracking_id}`,
          },
        },
      },
    });

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
