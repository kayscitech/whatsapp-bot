const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your verify token
const VERIFY_TOKEN = "my_secret_token";

// Middleware
app.use(bodyParser.json());

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Webhook to receive messages
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object && body.entry) {
    body.entry.forEach((entry) => {
      const changes = entry.changes;
      changes.forEach((change) => {
        if (change.value.messages) {
          change.value.messages.forEach((message) => {
            const from = message.from;
            const msgBody = message.text ? message.text.body : "";

            console.log(`Message from ${from}: ${msgBody}`);

            // TODO: Here you can respond via the WhatsApp API
          });
        }
      });
    });
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
