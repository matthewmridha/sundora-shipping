require("isomorphic-fetch");
const express = require("express");
const { Shopify } = require("@shopify/shopify-api");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Shopify API configuration
const shopify = new Shopify({
  apiKey: "9dc52f6031a0a5949e3229272a640e10",
  apiSecretKey: "7ba4ec8378de74efe1c458e370f81d9a",
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

// Middleware
app.use(express.json());

// Shopify OAuth routes
app.get("/auth", async (req, res) => {
  const authRoute = await shopify.auth.begin({
    shop: "sundora-bd.myshopify.com",
    callbackPath: "/auth/callback",
    isOnline: false,
  });
  res.redirect(authRoute);
});

app.get("/auth/callback", async (req, res) => {
  try {
    await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(500).send("Authentication failed");
  }
});

// API endpoints
app.post("/api/create-redx-shipping", async (req, res) => {
  try {
    const { orderId } = req.body;
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
    const areas = require("./areas.json").areas;
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

    res.json({
      success: true,
      trackingId: redxData.tracking_id,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const session = await shopify.session.create("sundora-bd.myshopify.com");
    const client = new shopify.clients.Graphql({ session });

    const ordersQuery = `
            query {
                orders(first: 50, query: "status:any") {
                    edges {
                        node {
                            id
                            name
                            shippingAddress {
                                name
                                address1
                                city
                                zip
                            }
                            totalPriceSet {
                                shopMoney {
                                    amount
                                }
                            }
                            fulfillments(first: 1) {
                                edges {
                                    node {
                                        trackingInfo {
                                            number
                                            url
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

    const response = await client.query({
      data: {
        query: ordersQuery,
      },
    });

    const orders = response.body.data.orders.edges.map((edge) => {
      const order = edge.node;
      const fulfillment = order.fulfillments.edges[0]?.node;
      return {
        id: order.id.split("/").pop(),
        name: order.name,
        customerName: order.shippingAddress.name,
        shippingAddress: order.shippingAddress.address1,
        totalPrice: order.totalPriceSet.shopMoney.amount,
        trackingNumber: fulfillment?.trackingInfo?.number,
        trackingUrl: fulfillment?.trackingInfo?.url,
      };
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
app.use(express.static("public"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
