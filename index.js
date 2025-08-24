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
  let buttonId = null;

  if (message.type === "text") {
    userInput = message.text.body;
  } else if (message.type === "interactive" && message.interactive.button_reply) {
    userInput = message.interactive.button_reply.title;
    buttonId = message.interactive.button_reply.id;
  } else {
    // If it's a different message type, just acknowledge it.
    return res.sendStatus(200);
  }

  // Handle the start of the conversation. If a session doesn't exist, create one.
  if (!sessions[from]) {
    sessions[from] = {};
  }

  const session = sessions[from];

  // Step 4: Check for the "I have paid" button click FIRST
  if (buttonId === "paid_button") {
    await sendText(
      from,
      "Thank you! We have received your payment. Your school has been notified and will issue a receipt for you."
    );
    delete sessions[from]; // Reset session
    return res.sendStatus(200);
  }

  // Step 3 (Continued): Handle custom amount input
  if (session.awaitingCustomAmount) {
    const customAmount = parseInt(userInput.replace(/₦|,/g, ""));
    if (!isNaN(customAmount) && customAmount > 0) {
      session.amount = customAmount;
      session.awaitingCustomAmount = false;
      // Continue to the next step to send invoice details
    } else {
      await sendText(from, "That doesn't look like a valid amount. Please type a number in Naira.");
      return res.sendStatus(200);
    }
  }

  // Step 3: Amount selected (from button or custom input)
  if (session.child && !session.amount) {
    if (buttonId === "custom_amount") {
      session.awaitingCustomAmount = true;
      await sendText(from, "Please type the amount you would like to pay in Naira.");
    } else {
      const parsedAmount = parseInt(userInput.replace(/₦|,/g, ""));
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        session.amount = parsedAmount;
      } else {
        await sendText(from, "That doesn't look like a valid amount. Please select an option or type a number.");
      }
    }
    return res.sendStatus(200);
  }

  // Step 2: Child selected
  if (userInput === "Tosin Akinpelu" || userInput === "Dapo Akinpelu") {
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
    return res.sendStatus(200);
  }

  // Final step before payment: Send invoice details and the 'I have paid' button
  // This block only runs after an amount is successfully set and we are not awaiting a custom amount.
  if (session.amount && !session.awaitingCustomAmount && !session.awaitingPaidConfirmation) {
    const totalAmount = session.amount + 100;
    const formattedTotalAmount = formatNumber(totalAmount);

    await sendText(
      from,
      `Your invoice details for ${session.child}:\n\nAmount: ₦${formattedTotalAmount}\nAccount Number: 1234567890\nService Charge: ₦100`
    );

    await sendInteractiveButtons(
      from,
      "Please click the button below after you have completed the payment.",
      [{ id: "paid_button", title: "I have paid" }]
    );
    session.awaitingPaidConfirmation = true; // Set flag to prevent re-sending
    return res.sendStatus(200);
  }

  // Step 1: Initial message or a fallback
  if (userInput === "Click Here to Pay" || !session.start) {
    session.start = true;
    await sendInteractiveButtons(
      from,
      "Who would you like to pay for?",
      [
        { id: "child_1", title: "Tosin Akinpelu" },
        { id: "child_2", title: "Dapo Akinpelu" }
      ]
    );
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Helper: Send text message
async function sendText(to, text) {
  try {
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
  } catch (error) {
    console.error("Error sending text message:", error.response ? error.response.data : error.message);
  }
}

// Helper: Send interactive buttons
async function sendInteractiveButtons(to, bodyText, buttons) {
  try {
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
  } catch (error) {
    console.error("Error sending interactive buttons:", error.response ? error.response.data : error.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
