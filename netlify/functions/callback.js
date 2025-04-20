const crypto = require("crypto");
const axios = require("axios");

exports.handler = async (event, context) => {
  try {
    const { code, state, shop } = event.queryStringParameters;

    if (!code || !state || !shop) {
      throw new Error("Missing required parameters");
    }

    // Decode and validate state
    const decodedState = JSON.parse(Buffer.from(state, "base64").toString());
    const { nonce } = decodedState;

    if (!nonce) {
      throw new Error("Invalid state parameter");
    }

    // Validate shop domain again
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      throw new Error("Invalid shop domain");
    }

    // Exchange the code for an access token
    const accessTokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }
    );

    const { access_token, scope } = accessTokenResponse.data;

    if (!access_token) {
      throw new Error("Failed to obtain access token");
    }

    // Verify the granted scopes match what we requested
    const requestedScopes =
      "read_products,write_products,read_orders,write_orders,read_customers,write_customers,read_inventory,write_inventory";
    if (scope !== requestedScopes) {
      throw new Error("Granted scopes do not match requested scopes");
    }

    // Store the access token securely (you should implement this)
    // For now, we'll just redirect back to the app
    const appUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_CLIENT_ID}`;

    return {
      statusCode: 302,
      headers: {
        Location: appUrl,
        "Cache-Control": "no-cache",
      },
    };
  } catch (error) {
    console.error("Callback Error:", error);
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
