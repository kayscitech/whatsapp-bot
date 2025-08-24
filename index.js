const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// === CONFIG ===
const TOKEN = "EAAJ6yySAPogBPSZCefCjIZBUxEkvge72n6M9lfyjLfqyYZC68xmQsq1D7Kh8vpOjEnZCKABXyQOtLzgrsP26I6pZARwd16EEijYu9yTnRMN1cd0ZAdG6ZCBz1k8yEYVyt7yNIXsZBZA4dzSzZASCDlr7PZBASUqEov89QZBGq0A4eZANZAKZC2bbQJkIZCRvN04lSV0pAeUJKo9agcfFQwBQRs46KvYOMyl4MWCZAgT4UIdHhmGpQFcn9pZAoZD";
const PHONE_NUMBER_ID = "816500804874123";
const VERIFY_TOKEN = "my_secret_token";

// === In-memory session store (simple) ===
const sessions = {};

// === VERIFY WEBHOOK ===
app.get("/webhook", (req, res) => {
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

// === HANDLE INCOMING MESSAGES ===
app.post("/webhook", async (req, res) => {
  const data = req.body;

  if (data.entry) {
    for (const entry of data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (value.messages) {
          for (const message of value.messages) {
            const from = message.from; // sender phone number
            await handleMessage(from, message);
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

// === HANDLE USER MESSAGES / INTERACTIONS ===
async function handleMessage(from, message) {
  // Init session
  if (!sessions[from]) {
    sessions[from] = { step: "start" };
  }

  const session = sessions[from];
  let text = message.text?.body;
  let buttonReply = message.button?.text;
  if (buttonReply) text = buttonReply;

  switch (session.step) {
    case "start":
      session.step = "select_child";
      await sendButtonMessage(from, "Who would you like to pay for?", [
        { title: "Child 1" },
        { title: "Child 2" },
        { title: "Child 3" },
      ]);
      break;

    case "select_child":
      session.child = text;
      session.step = "select_amount";
      await sendButtonMessage(from, "How much would you like to pay?", [
        { title: "5000" },
        { title: "10000" },
        { title: "15000" },
        { title: "20000" },
        { title: "25000" },
        { title: "30000" },
        { title: "35000" },
        { title: "40000" },
        { title: "45000" },
        { title: "50000" },
      ]);
      break;

    case "select_amount":
      session.amount = parseInt(text);
      session.total = session.amount + 100; // service charge
      session.step = "payment_info";

      await sendTextMessage(
        from,
        `You selected ${session.child} and amount ${session.amount} Naira.\n` +
          `Please pay into this virtual account: 1234567890.\n` +
          `This account will expire soon. 100 Naira service charge is added, total: ${session.total} Naira.\n` +
          `Press the button below to copy the account number.`
      );

      await sendButtonMessage(from, "Copy account number", [{ title: "Copy Account" }]);
      break;

    case "payment_info":
      if (text.toLowerCase().includes("paid")) {
        session.step = "done";
        await sendTextMessage(
          from,
          `Thank you, we have received your payment of ${session.total} Naira for ${session.child}. ` +
            `Your school has been notified and will issue a receipt shortly.`
        );
      } else {
        await sendTextMessage(
          from,
          `Please type "paid" once you have completed the payment.`
        );
      }
      break;

    case "done":
      await sendTextMessage(from, `You have already completed the payment. Thank you!`);
      break;
  }
}

// === SEND SIMPLE TEXT MESSAGE ===
async function sendTextMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

// === SEND BUTTON MESSAGE ===
async function sendButtonMessage(to, body, buttons) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: buttons.map((b, i) => ({
              type: "reply",
              reply: { id: `btn_${i}`, title: b.title },
            })),
          },
        },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
