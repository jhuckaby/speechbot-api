# Overview

Bot API for the SpeechBubble Chat Server.  Unreleased as of this writing.  Docs in progress.

## Example Use

```js
const SpeechBotAPI = require('speechbot-api');

let api = new SpeechBotAPI( {
	hostname: 'myspeechbubble.com',
	port: 443,
	ssl: true,
	username: 'mybot',
	password: '1234',
	channels: ['lobby', 'ops'],
	reconnect: true,
	reconnectDelaySec: 5,
	connectTimeoutSec: 5
} );

api.on('connecting', function() {
	console.log("Connecting to server...");
});
api.on('connect', function() {
	console.log("Successfully connected to server.");
});
api.on('error', function(err) {
	console.error("Bot API Error: " + err);
});
api.on('close', function(code, msg) {
	console.log("Server connection closed: " + code + ": " + (msg || "(No message)"));
});
api.on('login', function() {
	console.log("Successfully authenticated! Ready to send commands.");
});

api.on('said', function(chat) {
	// someone said something!
	// chat: { text, content, type, channel_id, username, nickname, full_name, is_admin }
	
	if (chat.text.match(/bot/)) {
		// someone mentioned "bot", so let's reply in the same channel!
		// Note: your text will be interpreted as HTML
		api.say(chat.channel_id, `You rang, ${chat.nickname}?  This is <b>bold</b>.`);
	}
});

// Advanced:

api.on('speechbubble', function(cmd, data) {
	// firehose listener for all internal server commands
	// e.g. error, pong, joined, welcome, said, left, user_updated, avatar_changed, channel_updated, topic_changed
	console.log("SPEECH COMMAND: ", cmd, data);
});
```

# License

**The MIT License (MIT)**

*Copyright (c) 2018 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
