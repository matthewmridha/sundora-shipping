const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  try {
    const { code, shop, state } = event.queryStringParameters;

    if (!code || !shop) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters" }),
      };
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        tokenData.error_description || "Failed to exchange token"
      );
    }

    // Redirect back to the app with the shop parameter
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.APP_URL}?shop=${shop}`,
      },
    };
  } catch (error) {
    console.error("OAuth Error:", error);
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
