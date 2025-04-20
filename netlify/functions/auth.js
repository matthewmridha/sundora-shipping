const crypto = require("crypto");

exports.handler = async (event, context) => {
  try {
    const { shop } = event.queryStringParameters;

    if (!shop) {
      throw new Error("Missing shop parameter");
    }

    // Validate shop domain format
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      throw new Error("Invalid shop domain");
    }

    // Generate a random nonce
    const nonce = crypto.randomBytes(16).toString("hex");

    // Create state parameter with nonce
    const state = Buffer.from(
      JSON.stringify({
        shop,
        nonce,
      })
    ).toString("base64");

    // Build authorization URL
    const authUrl =
      `https://${shop}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        scope:
          "read_products,write_products,read_orders,write_orders,read_customers,write_customers,read_inventory,write_inventory",
        redirect_uri: `${process.env.APP_URL}/.netlify/functions/callback`,
        state,
        grant_options: "per-user",
      }).toString();

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
