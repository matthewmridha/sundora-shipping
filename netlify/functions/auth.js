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

    // Validate the shop domain
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid shop domain" }),
      };
    }

    // Generate a nonce for security
    const nonce = crypto.randomBytes(16).toString("hex");

    // Construct the authorization URL
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const scopes =
      "read_orders,write_orders,read_fulfillments,write_fulfillments,write_shipping,read_shipping";
    const redirectUri = `${process.env.APP_URL}/.netlify/functions/callback`;
    const state = Buffer.from(JSON.stringify({ shop, nonce })).toString(
      "base64"
    );

    const authUrl =
      `https://${shop}/admin/oauth/authorize?` +
      `client_id=${clientId}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    // Redirect to Shopify OAuth
    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
        "Cache-Control": "no-cache",
      },
    };
  } catch (error) {
    console.error("Auth Error:", error);
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.APP_URL}/error?message=${encodeURIComponent(
          error.message
        )}`,
      },
    };
  }
};
