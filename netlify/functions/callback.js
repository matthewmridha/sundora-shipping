const crypto = require("crypto");
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  try {
    const { code, shop, state } = event.queryStringParameters;

    // Exchange the authorization code for an access token
    const accessTokenResponse = await fetch(
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

    const { access_token } = await accessTokenResponse.json();

    // Store the access token securely (you might want to save this in your database)
    // For now, we'll redirect back to the app with the token
    return {
      statusCode: 302,
      headers: {
        Location: `/?shop=${shop}&token=${access_token}`,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
