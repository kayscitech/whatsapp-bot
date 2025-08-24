const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "my_secret_token";
const WHATSAPP_TOKEN = "EAAJ6yySAPogBPUjO2zUulgL1PIkL79Wg2MdXDzcxhgxJn42dQZBmgOZCGkksfkp7oEt2Vq3ZAp7Ki1aHCfE3YUgCWIkLjVwxmuFYaR7PmQ2pgZA9db8qjLdfZCxK7dp0oDsViYHSvVqrrBZA9rlBfo5QcXZAQh5cWKLQ9eKM0c6yeoxvqV8skywpJ8uwdqNu82rKtfZBbs7yNlifIHOfZADEblqW7ekAT19639duqrke1JUYUTAZDZD";
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
    // Acknowledge other message types (like status updates)
    console.log("Received unhandled message type:", message.type);
    return res.sendStatus(200);
  }

  // Initialize or get the user's session
  if (!sessions[from]) {
    sessions[from] = { state: 'initial' };
  }
  const session = sessions[from];

  console.log(`User: ${from}, Input: "${userInput}", Button ID: "${buttonId}", Current State: "${session.state}"`);

  // State Machine Logic
  try {
    switch (session.state) {
      case 'initial':
        await sendInteractiveButtons(
          from,
          "Welcome to our payment system. Click the button below to get started.",
          [{ id: "start_payment", title: "Click Here to Pay" }]
        );
        session.state = 'awaiting_start_button';
        break;

      case 'awaiting_start_button':
        if (buttonId === 'start_payment') {
          await sendInteractiveButtons(
            from,
            "Who would you like to pay for?",
            [
              { id: "child_1", title: "Tosin Akinpelu" },
              { id: "child_2", title: "Dapo Akinpelu" }
            ]
          );
          session.state = 'awaiting_child_selection';
        } else {
          // If the user sends something else, just resend the initial message
          await sendText(from, "Please click the 'Click Here to Pay' button to begin.");
        }
        break;

      case 'awaiting_child_selection':
        if (buttonId === 'child_1' || buttonId === 'child_2') {
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
          session.state = 'awaiting_amount_selection';
        } else {
          await sendText(from, "Please select one of the children from the list.");
        }
        break;

      case 'awaiting_amount_selection':
        if (buttonId === 'custom_amount') {
          await sendText(from, "Please type the amount you would like to pay in Naira.");
          session.state = 'awaiting_custom_amount';
        } else {
          const parsedAmount = parseInt(userInput.replace(/₦|,/g, ""));
          if (!isNaN(parsedAmount) && parsedAmount > 0) {
            session.amount = parsedAmount;
            session.state = 'awaiting_paid_confirmation';
            // Fall through to the next case to send the invoice and paid button
          } else {
            await sendText(from, "That doesn't look like a valid amount. Please try again.");
            // Keep the user in the current state to allow them to re-select
            return res.sendStatus(200);
          }
        }
        break;
      
      case 'awaiting_custom_amount':
        const customAmount = parseInt(userInput.replace(/₦|,/g, ""));
        if (!isNaN(customAmount) && customAmount > 0) {
          session.amount = customAmount;
          session.state = 'awaiting_paid_confirmation';
          // Fall through to the next case to send the invoice and paid button
        } else {
          await sendText(from, "That doesn't look like a valid amount. Please type a number in Naira.");
          return res.sendStatus(200);
        }
        break;

      case 'awaiting_paid_confirmation':
        // This case is only for sending the invoice details and the 'I have paid' button
        // and is triggered by a previous state change.
        if (buttonId === 'paid_button') {
          await sendText(
            from,
            "Thank you! We have received your payment. Your school has been notified and will issue a receipt for you."
          );
          delete sessions[from]; // Reset session
        } else {
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
        }
        break;

      default:
        // Handles any unexpected state by resetting to initial
        await sendText(from, "I'm sorry, an error occurred. Let's start over.");
        delete sessions[from];
        break;
    }
  } catch (error) {
    console.error("Failed to process message:", error.response?.data || error.message);
    await sendText(from, "I'm sorry, an error occurred. Please try again later.");
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
    console.error("Error sending text message:", error.response?.data || error.message);
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
    console.error("Error sending interactive buttons:", error.response?.data || error.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

