const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const TOKEN = "EAAJ6yySAPogBPSZCefCjIZBUxEkvge72n6M9lfyjLfqyYZC68xmQsq1D7Kh8vpOjEnZCKABXyQOtLzgrsP26I6pZARwd16EEijYu9yTnRMN1cd0ZAdG6ZCBz1k8yEYVyt7yNIXsZBZA4dzSzZASCDlr7PZBASUqEov89QZBGq0A4eZANZAKZC2bbQJkIZCRvN04lSV0pAeUJKo9agcfFQwBQRs46KvYOMyl4MWCZAgT4UIdHhmGpQFcn9pZAoZD";

const PHONE_NUMBER_ID = "816500804874123";

// In-memory session storage
const sessions = {};

function sendText(to, message) {
  return axios.post(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: message }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

function sendInteractiveButtons(to, text, buttons) {
  return axios.post(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: { buttons: buttons.map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b } })) }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "my_secret_token";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry;
    if (!entry) return res.sendStatus(200);

    for (const e of entry) {
      const changes = e.changes;
      if (!changes) continue;

      for (const change of changes) {
        const value = change.value;
        const messages = value.messages;
        if (!messages) continue;

        for (const message of messages) {
          const from = message.from;
          const text = message.text?.body?.toLowerCase();

          if (!sessions[from]) sessions[from] = { step: 0 };

          if (sessions[from].step === 0) {
            // Step 0: Ask for child
            sessions[from].step = 1;
            await sendInteractiveButtons(from, "Who would you like to pay for?", ["Dapo Ayeloju", "Mariam Ayeloju", "Ramota Ayeloju"]);
          } else if (sessions[from].step === 1) {
            sessions[from].child = text;
            sessions[from].step = 2;
            // Step 1: Ask for amount
            await sendInteractiveButtons(from, "How much would you like to pay?", ["5000", "10000", "15000", "20000", "25000", "30000", "35000", "40000", "45000", "50000"]);
          } else if (sessions[from].step === 2) {
            const amount = parseInt(text.replace(/\D/g, ""), 10);
            if (!amount) {
              await sendText(from, "Please choose a valid amount from the buttons.");
            } else {
              const total = amount + 100;
              sessions[from].amount = total;
              sessions[from].step = 3;
              await sendText(from, `Please pay ₦${total} into this virtual account: 1234567890. Note: This account will expire in 1 hour. Service charge ₦100 included.`);
              await sendInteractiveButtons(from, "Copy account number", ["Copied"]);
            }
          } else if (sessions[from].step === 3) {
            if (text.includes("paid")) {
              sessions[from].step = 4;
              await sendText(from, `Thank you! We have received your payment for ${sessions[from].child}. Your school has been notified and will issue a receipt.`);
              sessions[from] = { step: 0 }; // Reset session
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
