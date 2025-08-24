// index.js
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "my_secret_token"; // Must match your WhatsApp webhook verify token
const WHATSAPP_TOKEN = "EAAJ6yySAPogBPSZCefCjIZBUxEkvge72n6M9lfyjLfqyYZC68xmQsq1D7Kh8vpOjEnZCKABXyQOtLzgrsP26I6pZARwd16EEijYu9yTnRMN1cd0ZAdG6ZCBz1k8yEYVyt7yNIXsZBZA4dzSzZASCDlr7PZBASUqEov89QZBGq0A4eZANZAKZC2bbQJkIZCRvN04lSV0pAeUJKo9agcfFQwBQRs46KvYOMyl4MWCZAgT4UIdHhmGpQFcn9pZAoZD";
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
  const msgBody = message.text ? message.text.body : null;
  const buttonReply = message.button ? message.button.text : null;

  if (!sessions[from]) {
    sessions[from] = {};
    // Step 1: Ask which child
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

  // Step 2: If child not selected
  if (!session.child && buttonReply) {
    session.child = buttonReply;

    // Ask for payment amount
    await sendInteractiveButtons(
      from,
      "How much would you like to pay?",
      [
        { id: "5000", title: "₦5,000" },
        { id: "10000", title: "₦10,000" },
        { id: "15000", title: "₦15,000" },
        { id: "20000", title: "₦20,000" },
        { id: "25000", title: "₦25,000" },
        { id: "30000", title: "₦30,000" },
        { id: "35000", title: "₦35,000" },
        { id: "40000", title: "₦40,000" },
        { id: "45000", title: "₦45,000" },
        { id: "50000", title: "₦50,000" }
      ]
    );
    return res.sendStatus(200);
  }

  // Step 3: Amount selected
  if (!session.amount && buttonReply) {
    session.amount = parseInt(buttonReply);
    const totalAmount = session.amount + 100;

    // Send virtual account info
    await sendInteractiveButtons(
      from,
      `Please pay ₦${totalAmount} into virtual account 1234567890. This account will expire in 24h. Service charge ₦100 included.`,
      [{ id: "copy_account", title: "Copy Account Number" }]
    );
    return res.sendStatus(200);
  }

  // Step 4: Confirm payment
  if (msgBody && msgBody.toLowerCase() === "paid") {
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
