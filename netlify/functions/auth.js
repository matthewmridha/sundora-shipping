const crypto = require("crypto");

exports.handler = async (event, context) => {
  try {
    // Get the shop parameter
    const shop = event.queryStringParameters.shop;

    if (!shop) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing shop parameter" }),
      };
    }

    // Construct the authorization URL
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const scopes =
      "read_orders,write_orders,read_fulfillments,write_fulfillments,write_shipping,read_shipping";
    const redirectUri = `${process.env.APP_URL}/.netlify/functions/callback`;
    const state = Buffer.from(JSON.stringify({ shop })).toString("base64");

    const authUrl =
      `https://${shop}/admin/oauth/authorize?` +
      `client_id=${clientId}&` +
      `scope=${scopes}&` +
      `redirect_uri=${redirectUri}&` +
      `state=${state}`;

    // Redirect to Shopify OAuth
    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
