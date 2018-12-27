// Bot API for the SpeechBubble Chat Server
// Copyright (c) 2018 Joseph Huckaby
// Released under the MIT License

var EventEmitter = require('events').EventEmitter;
var WebSocket = require('ws');
var Tools = require('pixl-tools');
var pkg = require('./package.json');

module.exports = class SpeechBotAPI extends EventEmitter {
	
	constructor(args) {
		// class constructor
		super();
		
		this.version = pkg.version;
		this.hostname = args.hostname || 'localhost';
		this.port = args.port || 4480;
		this.ssl = args.ssl || false;
		this.username = args.username || '';
		this.password = args.password || '';
		this.autojoin = args.channels || [];
		this.reconnect = ("reconnect" in args) ? args.reconnect : true;
		this.reconnectDelaySec = args.reconnectDelaySec || 5;
		this.connectTimeoutSec = args.connectTimeoutSec || 5;
		this.heyFreqSec = args.heyFreqSec || 20;
		this.statusTimeoutSec = args.statusTimeoutSec || 5;
		this.connected = false;
		this.connect();
	}
	
	connect() {
		// connect to server
		var self = this;
		var url = (this.ssl ? 'wss' : 'ws') + "://" + this.hostname + ":" + this.port + "/";
		
		this.disconnect();
		delete this.forceDisconnect;
		
		this.emit('connecting');
		
		this.socket = new WebSocket(url, {
			timeout: this.connectTimeoutSec * 1000,
			handshakeTimeout: this.connectTimeoutSec * 1000,
			headers: { "User-Agent": "SpeechBubble Bot API v" + this.version }
		});
		
		this.socket.on('open', function() {
			self.connected = true;
			self.lastPing = Tools.timeNow();
			
			if (self.session_id) {
				// resume existing session
				self.send( 'authenticate', { 
					session_id: self.session_id 
				} );
			}
			else {
				self.send( 'authenticate', {
					username: self.username,
					password: self.password
				} );
			}
			
			self.emit('connect');
			
			if (!self.heyTimer) {
				self.heyTimer = setInterval( self.sendHey.bind(self), self.heyFreqSec * 1000 );
			}
		});
		
		this.socket.on('message', function(message) {
			// parse JSON and pass to receive
			var json = null;
			try { json = JSON.parse(message); }
			catch(err) { self.emit('error', err); }
			if (json) self.receive(json);
		});
		
		this.socket.on('error', function(err) {
			self.emit('error', err);
		} );
		
		this.socket.on('close', function(code, msg) {
			self.connected = false;
			self.emit('close', code, msg);
			
			if (self.heyTimer) {
				clearTimeout( self.heyTimer );
				delete self.heyTimer;
			}
			
			if (self.forceDisconnect) {
				// deliberate disconnect, stop here
				return;
			}
			
			if (self.reconnect) {
				self.reconnectTimer = setTimeout( function() { 
					delete self.reconnectTimer;
					self.connect(); 
				}, self.reconnectDelaySec * 1000 );
			}
			self.socket = null;
		} );
	}
	
	disconnect() {
		// kill socket if connected, and prevent auto-reconnect
		if (this.socket) {
			this.forceDisconnect = true;
			try { this.socket.close(); } 
			catch(err) {}
			this.socket = null;
		}
		else {
			if (this.reconnectTimer) clearTimeout( this.reconnectTimer );
		}
	}
	
	receive(json) {
		// receive json, convert to cmd/data and process
		var self = this;
		var cmd = json.cmd;
		var data = json.data;
		
		switch (cmd) {
			case 'status':
				this.epoch = data.epoch;
				this.lastPing = Tools.timeNow();
			break;
			
			case 'auth_failure':
				// authentiation failure
				this.emit('error', new Error("Authentication failure"));
				this.disconnect();
			break;
			
			case 'login':
				// auth successful
				this.session_id = data.session_id;
				this.username = data.username;
				this.user = data.user;
				this.users = data.users;
				this.server_config = data.config;
				
				// merge in channels, in case this is a relog
				if (!this.channels) this.channels = {};
				for (var chan in data.channels) {
					if (!this.channels[chan]) this.channels[chan] = data.channels[chan];
					else Tools.mergeHashInto( this.channels[chan], data.channels[chan] );
				}
				
				this.emit('login');
				
				// join standard channels
				this.autojoin.forEach( function(chan) {
					self.sendCommand('join', { channel_id: chan });
				} );
				
				// also rejoin PMs if this is a relog (preserve above)
				for (var chan in this.channels) {
					if (this.channels[chan].pm) {
						this.sendCommand('join', { channel_id: chan });
					}
				}
			break;
			
			case 'speechbubble':
				// speechbubble message from server
				// error, pong, joined, welcome, said, left, user_updated, avatar_changed, channel_updated, topic_changed
				var sb_cmd = data.cmd;
				delete data.cmd;
				
				// invoke function for command, if defined
				var func = 'server_' + sb_cmd.replace(/\W+/g, '');
				if (this[func]) this[func](data);
				
				// always emit event
				this.emit( 'speechbubble', sb_cmd, data ); // firehose listener
				this.emit( sb_cmd, data ); // specific command listener
			break;
		} // switch cmd
	}
	
	send(cmd, data) {
		// send low-level command to server
		if (this.socket && this.connected) {
			this.socket.send( JSON.stringify({ cmd: cmd, data: data }) );
		}
	}
	
	sendCommand(cmd, data) {
		// send high-level SpeechBubble formatted command
		data.cmd = cmd;
		this.send('speechbubble', data);
	}
	
	sendHey() {
		// send hey (ping) to server to keep connection alive
		if (this.socket && this.connected) {
			this.send('hey', {});
		}
	}
	
	say(chan, html, overrides) {
		// convenience method for sending message to channel
		var chat = Tools.mergeHashes({
			id: Tools.generateUniqueID(32, this.username),
			username: this.username,
			channel_id: chan,
			date: Tools.timeNow(),
			type: 'standard',
			content: html
		}, overrides || {});
		
		this.sendCommand('say', chat);
	}
	
	pose(chan, html, overrides) {
		// shortcut for pose
		if (!overrides) overrides = {};
		overrides.type = 'pose';
		
		this.say(chan, html, overrides);
	}
	
	whisper(chan, username, html, overrides) {
		// shortcut for whisper
		if (!overrides) overrides = {};
		overrides.type = 'whisper';
		overrides.to = username;
		
		this.say(chan, html, overrides);
	}
	
	join(chan) {
		// join channel
		this.sendCommand('join', { channel_id: chan });
	}
	
	leave(chan) {
		// leave channel
		this.sendCommand('leave', { channel_id: chan });
	}
	
	// 
	// Commands from server:
	// 
	
	server_joined(data) {
		// a user has joined a channel that we're in
		// (could be us, could be other user)
		// data: { channel_id, username, user }
		var username = data.user.username;
		var chan = data.channel_id;
		var channel = this.channels[chan];
		if (!channel) return;
		
		if (!channel.live_users) channel.live_users = {};
		channel.live_users[username] = { live: 1 };
	}
	
	server_left(data) {
		// a user has left a channel that we're still in
		// example: {"channel_id":"lobby","username":"tinymouse449","reason":"self","cmd":"left"}
		var username = data.username;
		var chan = data.channel_id;
		var channel = this.channels[chan];
		if (!channel) return;
		
		if (!channel.live_users) channel.live_users = {};
		delete channel.live_users[username];
	}
	
	server_welcome(data) {
		// server is welcoming us, and only us, to a new channel we just joined
		// this is the cue to setup the UI for a new channel
		// data: { channel_id, channel }
		var chan = data.channel_id;
		
		// update local channel in memory (this version contains live_users)
		if (!this.channels[chan]) this.channels[chan] = data.channel;
		else Tools.mergeHashInto( this.channels[chan], data.channel );
		
		var channel = this.channels[chan];
		delete channel.history; // release memory
		
		channel.ui = true;
	}
	
	server_goodbye(data) {
		// we left a channel
		// example: {"channel_id":"lobby", "reason":"self"}
		var username = data.username;
		var chan = data.channel_id;
		var channel = this.channels[chan];
		if (!channel) return;
		
		// delete channel elements
		delete channel.ui;
		delete channel.live_users;
		
		// show notification if reason was 'private', 'delete', etc.
		switch (data.reason) {
			case 'private':
			case 'delete':
			case 'kick':
				this.emit("error", "You were kicked from channel '"+chan+"'.");
			break;
		}
	}
	
	server_said(chat) {
		// a user has said something in a channel that we're in
		// (could be us, could be other user)
		// chat: { channel_id, type, content }
		var channel = this.channels[ chat.channel_id ] || { users: {} };
		
		// make sure chat has a type
		if (!chat.type) chat.type = 'standard';
		
		// provide a html-to-text conversion, for bot api convenience
		chat.text = htmlToText( chat.content || '', true );
		
		// merge in some user properties, for bot api convenience
		var user = this.users[chat.username];
		if (user) {
			chat.nickname = user.nickname;
			chat.full_name = user.full_name;
			chat.is_admin = !!user.privileges.admin;
			
			// user may be channel admin, but not a full server admin
			if (!chat.is_admin && channel.users[chat.username] && channel.users[chat.username].admin) chat.is_admin = true;
		}
	}
	
	server_user_updated(user) {
		// a user has been created or updated
		var username = user.username;
		
		// could be us
		if (username == this.username) {
			for (var key in user) this.user[key] = user[key]; 
		}
		
		if (!this.users[username]) this.users[username] = user;
		else {
			for (var key in user) this.users[username][key] = user[key];
		}
	}
	
	server_channel_updated(data) {
		// a channel has been created, updated, or deleted
		var chan = data.channel_id;
		var update = data.channel;
		
		if (!this.channels[chan]) {
			this.channels[chan] = {};
		}
		var channel = this.channels[chan];
		for (var key in update) {
			channel[key] = update[key];
		}
		
		// Check for channel.deleted
		if (channel.deleted) delete this.channels[chan];
		
		// check for private channel invite (this piggybacks on the channel update cmd)
		if (channel.pm) {
			// adjust title, find other username
			var friend_username = '';
			for (var key in channel.users) {
				if (key != this.username) friend_username = key;
			}
			var friend = this.users[friend_username] || { nickname: friend_username, full_name: friend_username };
			
			if (!channel.ui) {
				// join pm channel
				this.sendCommand('join', { channel_id: chan });
			}
		} // PM
	}
	
} // class

//
// Utility Functions
//

function htmlToText(html, decode_emoji) {
	// convert HTML to text, mainly for inline code snippets
	var text = '' + html;
	if (decode_emoji) {
		text = text.replace(/<img[^>]*?data\-emoji\=\"([\w\-\+]+)\"[^>]+>/g, ':$1:');
	}
	text = text.replace(/<(\/p|\/div|\/h\d|br)\w?\/?>/ig, "\n");
	text = text.replace(/<[A-Za-z\/][^<>]*>/ig, "");
	text = text.replace(/\n{3,}/g, "\n\n");
	text = decodeEntities(text).trim();
	return text;
};

function decodeEntities(text) {
	// Decode XML entities into raw ASCII
	if (text == null) return '';

	if (text && text.replace) {
		text = text.replace(/\&lt\;/g, "<");
		text = text.replace(/\&gt\;/g, ">");
		text = text.replace(/\&quot\;/g, '"');
		text = text.replace(/\&apos\;/g, "'");
		text = text.replace(/\&nbsp\;/g, " ");
		text = text.replace(/\&amp\;/g, "&"); // MUST BE LAST
	}

	return text;
};
