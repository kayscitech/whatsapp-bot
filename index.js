const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "my_secret_token"; // Must match your WhatsApp webhook verify token
const WHATSAPP_TOKEN = "EAAJ6yySAPogBPdddPdZCiYS0uxFYqQ0qQ4szgF6a9c1Dap6PnXXT2VZCpo9aCXdSR0KDiaG0OxvhZBzn9maC9vB606Wers2VOMXkB3wKNe1ORcVcmIYWFeYlHuwgr9O29vCMU0Y0eev0yX3kEF0I1M848pIq4qumZAqPgsJaTwowBoiMmUd6VEsslrNpZCAPIXIZATCb0ZCk9aGdx70yBcxLx3ZB0oUZBZAnv2mFmjqEOk3PBCNwZDZD";
const PHONE_NUMBER_ID = "816500804874123";

const sessions = {}; // Store user sessions in memory

// Helper function to format numbers with commas
const formatNumber = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

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

  const session = sessions[from] || {};

  // Step 1: Initial message with "Click Here to Pay" button
  if (!session.start && !userInput) {
    await sendInteractiveButtons(
      from,
      "Welcome to our payment system. Click the button below to get started.",
      [{ id: "start_payment", title: "Click Here to Pay" }]
    );
    return res.sendStatus(200);
  }

  // Handle start button click
  if (userInput === "Click Here to Pay" || !session.child) {
    session.start = true;
    await sendInteractiveButtons(
      from,
      "Who would you like to pay for?",
      [
        { id: "child_1", title: "Tosin Akinpelu" },
        { id: "child_2", title: "Dapo Akinpelu" }
      ]
    );
    sessions[from] = session;
    return res.sendStatus(200);
  }

  // Step 2: Select child
  if (!session.child && (userInput === "Tosin Akinpelu" || userInput === "Dapo Akinpelu")) {
    session.child = userInput;

    await sendInteractiveButtons(
      from,
      `How much would you like to pay for ${session.child}?`,
      [
        { id: "5000", title: "₦5,000" },
        { id: "10000", title: "₦10,000" },
        { id: "custom_amount", title: "Type custom amount" }
      ]
    );
    sessions[from] = session;
    return res.sendStatus(200);
  }

  // Step 3: Amount selected
  if (session.child && !session.amount) {
    if (userInput === "Type custom amount") {
      session.awaitingCustomAmount = true;
      await sendText(from, "Please type the amount you would like to pay in Naira.");
      sessions[from] = session;
      return res.sendStatus(200);
    } else {
      session.amount = parseInt(userInput.replace(/₦|,/g, ""));
    }
  }

  // Handle custom amount input
  if (session.awaitingCustomAmount && userInput) {
    const customAmount = parseInt(userInput.replace(/₦|,/g, ""));
    if (!isNaN(customAmount) && customAmount > 0) {
      session.amount = customAmount;
      session.awaitingCustomAmount = false;
    } else {
      await sendText(from, "That doesn't look like a valid amount. Please type a number in Naira.");
      return res.sendStatus(200);
    }
  }

  // Once amount is set (either by button or custom input)
  if (session.amount) {
    const totalAmount = session.amount + 100;
    const formattedTotalAmount = formatNumber(totalAmount);

    const paymentMessage = `Please pay ₦${formattedTotalAmount} into virtual account 1234567890. This account will expire in 24h. Service charge ₦100 included.`;
    const copyUrl = `https://your-payment-provider-link.com/pay?amount=${totalAmount}&account=1234567890`;

    await sendText(from, paymentMessage);

    // Send the "Click to Pay" button separately
    await sendUrlButton(
        from,
        "Click the button to pay and copy the account number.",
        "Click Here to Pay",
        copyUrl
    );

    // Prompt user to confirm payment
    await sendText(from, "Please type 'paid' when you have completed the payment.");
    sessions[from] = session;
    return res.sendStatus(200);
  }

  // Step 4: Confirm payment
  if (userInput && userInput.toLowerCase() === "paid") {
    await sendText(
      from,
      "Thank you! We have received your payment. Your school has been notified and will issue a receipt for you."
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

// Helper: Send a URL button
async function sendUrlButton(to, bodyText, buttonText, url) {
    await axios.post(
        `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "cta_url",
                body: { text: bodyText },
                action: {
                    name: "cta_url",
                    url: url,
                    buttons: [{
                        type: "url",
                        title: buttonText
                    }]
                }
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
