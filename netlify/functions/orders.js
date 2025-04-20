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
