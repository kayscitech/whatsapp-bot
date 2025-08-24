const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = 'my_secret_token';

app.get('/webhook', (req, res) => {
  // Verification handshake
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  // Make sure it's a WhatsApp message
  if (body.object) {
    body.entry.forEach(entry => {
      const changes = entry.changes;
      changes.forEach(change => {
        const value = change.value;
        if (value.messages) {
          const message = value.messages[0];
          const from = message.from; // Sender ID
          const msgBody = message.text ? message.text.body : '';

          console.log(`Message from ${from}: ${msgBody}`);

          // Here you can send a reply
          sendMessage(from, `You said: ${msgBody}`);
        }
      });
    });

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const axios = require('axios');
const TOKEN = 'EAAJ6yySAPogBPWb6rape5udLSkF5HkdDgMzQc0t4Blp9qZBAZAcdJoPUHTZClAFfgB4ZCDcYAXTw2sXNWUpI9aZB6mov3eLnJLp1wXdhVQJVvpfA7dcCMSlMEcX5zRDNjHNjw2WbiVAUBYIHZCWb5K9GUDWZBg6uZCzKQ53EAW81nFZBnoc2ld27c6o6HzrPvKzRSyUqZAJzVMlz2UsNZBmdgaYm6A79ViQSw2Gk4GjP5uh2Ya58DMZD';

function sendMessage(to, text) {
  axios.post(`https://graph.facebook.com/v22.0/816500804874123/messages`, {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: text }
  }, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  }).then(response => {
    console.log('Message sent', response.data);
  }).catch(err => {
    console.error('Error sending message', err.response ? err.response.data : err);
  });
}

app.listen(process.env.PORT || 3000, () => console.log('Server is running'));
