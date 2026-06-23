const Message = require('../models/Message');

async function getMessages(req, res) {
  try {
    const myId = req.user.id;
    const { otherUserId } = req.params;
    const { before } = req.query; // optional pagination cursor

    const messages = await Message.getConversation(myId, otherUserId, 50, before || null);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getMessages };