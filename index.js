const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "my_secret_token"; // Must match your WhatsApp webhook verify token
const WHATSAPP_TOKEN = "EAAJ6yySAPogBPdddPdZCiYS0uxFYqQ0qQ4szgF6a9c1Dap6PnXXT2VZCpo9aCXdSR0KDiaG0OxvhZBzn9maC9vB606Wers2VOMXkB3wKNe1ORcVcmIYWFeYlHuwgr9O29vCMU0Y0eev0yX3kEF0I1M848pIq4qumZAqPgsJaTwowBoiMmUd6VEsslrNpZCAPIXIZATCb0ZCk9aGdx70yBcxLx3ZB0oUZBZAnv2mFmjqEOk3PBCNwZDZD";
const PHONE_NUMBER_ID = "816500804874123";

const sessions = {}; // Store user sessions in memory

// Verify webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive messages
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry && req.body.entry[0];
  if (!entry) return res.sendStatus(200);

  const changes = entry.changes && entry.changes[0];
  if (!changes) return res.sendStatus(200);

  const value = changes.value;
  const messages = value.messages;
  if (!messages) return res.sendStatus(200);

  const message = messages[0];
  const from = message.from; // WhatsApp user number

  let userInput = null;
  if (message.type === "text") {
    userInput = message.text.body;
  } else if (message.type === "interactive" && message.interactive.button_reply) {
    userInput = message.interactive.button_reply.title;
  } else {
    return res.sendStatus(200);
  }

  // Initialize session or handle first-time users
  if (!sessions[from]) {
    sessions[from] = {};
    await sendInteractiveButtons(
      from,
      "Who would you like to pay for?",
      [
        { id: "child_1", title: "Child 1" },
        { id: "child_2", title: "Child 2" }
      ]
    );
    return res.sendStatus(200);
  }

  const session = sessions[from];

  // Step 2: Select child
  if (!session.child) {
    session.child = userInput;

    // Ask for payment amount (3 options)
    await sendInteractiveButtons(
      from,
      `How much would you like to pay for ${session.child}?`,
      [
        { id: "5000", title: "₦5,000" },
        { id: "10000", title: "₦10,000" },
        { id: "15000", title: "₦15,000" }
      ]
    );
    return res.sendStatus(200);
  }

  // Step 3: Amount selected
  if (session.child && !session.amount) {
    // Clean formatting and convert to number
    session.amount = parseInt(userInput.replace(/₦|,/g, ""));
    const totalAmount = session.amount + 100;

    // Send virtual account info with copy button
    await sendInteractiveButtons(
      from,
      `Please pay ₦${totalAmount} into virtual account 1234567890. This account will expire in 24h. Service charge ₦100 included.`,
      [{ id: "copy_account", title: "Copy Account Number" }]
    );
    return res.sendStatus(200);
  }

  // Step 4: Confirm payment
  if (userInput.toLowerCase() === "paid") {
    await sendText(
      from,
      "Thank you! We have received your payment. Your school has been notified and will issue a receipt."
    );
    delete sessions[from]; // Reset session
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Helper: Send text message
async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Helper: Send interactive buttons
async function sendInteractiveButtons(to, bodyText, buttons) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } })) }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
