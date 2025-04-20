const crypto = require("crypto");

exports.handler = async (event, context) => {
  // Initialize Shopify OAuth
  const shop = event.queryStringParameters.shop || "sundora-bd.myshopify.com";
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes =
    "read_orders,write_orders,read_fulfillments,write_fulfillments,write_shipping,read_shipping";
  const redirectUri = `${process.env.APP_URL}/.netlify/functions/callback`;
  const nonce = crypto.randomBytes(16).toString("hex");

  // Construct the authorization URL
  const authUrl =
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${clientId}&` +
    `scope=${scopes}&` +
    `redirect_uri=${redirectUri}&` +
    `state=${nonce}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
  };
};
