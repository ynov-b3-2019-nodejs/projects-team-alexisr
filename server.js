require('dotenv').config();
const express = require('express');
const cookeParser = require('cookie-parser');
//const bodyParser = require('body-parser');
const expressValidator = require('express-validator');
const expressSession = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const request = require('request');
const path = require('path');
const uuidv4 = require('uuid/v4');

const app = express();
const server = require('http').createServer(app);

const io = require('socket.io').listen(server);
const ios = require('socket.io-express-session');

const port = process.env.PORT || 8080;
const db = require('./queries');

let session = expressSession({
    secret: 'alexis',
    resave: true,
    saveUninitialized: true
});

let client;
const getClient = async () => {
   if (client) {
      return client;
   }

   client = await db.pool.connect();
   await client.query('BEGIN');

   return client;   
}

let tabUser = [["0", "false"]];
function getIndexOf(arr, k) {
    for (var i = 0; i < arr.length; i++) {
        var index = arr[i].indexOf(k);
        if (index > -1) {
        return [i, index];
        }
    }
}

io.use(ios(session));

app.use(express.static('public'));
app.set('view engine', 'ejs');
//app.use(bodyParser.json());
//app.use(bodyParser.urlencoded({extended: true}));
app.use(cookeParser());
app.use(session);
app.use(expressValidator());
app.use(flash());

app.set('view options', { layout: false });
app.use('/public', express.static(__dirname + '/public'));

require('./routes/routes')(app);

app.use(passport.initialize());
app.use(passport.session());

app.get('/users', db.getUsers)
app.get('/users/:id', db.getUserById)
app.post('/users', db.createUser)
app.put('/users/:id', db.updateUser)
app.delete('/users/:id', db.deleteUser)

app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

io.sockets.on('connection', function(socket) {
    //socket.emit('message', 'Vous etes bien connecté !');
    //socket.broadcast.emit('message', 'Un autre client vient de se connecter !');
    console.log(socket.handshake.session);
    console.log('socket : '+socket.id)

    let session = socket.handshake.session;

    if(!session.user) {
        console.log('Vous n\'êtes pas connecté');
    } else {
        console.log('Connecté en tant que '+session.user.name);
        session.user.socket = socket.id;
    }
    console.log(JSON.stringify(session.user));

    socket.on('message', function(message) {
        socket.emit('message', message);
        console.log('Un message du client : '+message);
    });

    socket.on('saveToDb', async function(user, fname, conv, msg) {
        console.log('Saving to DB');
        console.log('User : '+user);
        console.log('Conversation : '+conv);
        console.log('Message : '+msg);

        await getClient();

        await JSON.stringify(client.query('INSERT INTO messages(id, user_id, conversation_id, content) VALUES($1, $2, $3, $4)', [uuidv4(), user, conv, msg], function(err, result) {
            if(err) {
                console.log(err);
            } else {
                client.query('COMMIT');
                console.log('Message Saved');
                socket.broadcast.emit('messageSaved', fname, msg, conv);
            }
        }));
    });

    socket.on('ecrit', function(writing, fname, conv) {
        socket.broadcast.emit('ecrit', writing, fname, conv);
    });
    
    socket.on('authenticated', async function(auth, uid) {
        console.log(uid + " is " + auth);

        await getClient();

        await JSON.stringify(client.query('SELECT * FROM users', function(err, result) {
            if(err) {
                console.log(err);
            } else {
                result.rows.forEach(function(element) {
                    if(!tabUser.some(row => row.includes(element.id))) {
                        tabUser.push([-1, "false"]);
                        let j = getIndexOf(tabUser, -1)[0];
                        tabUser[j][0] = element.id;
                    }
                });
            }
        }));
        
        if(!tabUser.some(row => row.includes(uid))) {
            tabUser.push([-1, "false"]);
            let j = getIndexOf(tabUser, -1)[0];
            tabUser[j][0] = uid;
        }
        let i = getIndexOf(tabUser, uid)[0];
        tabUser[i][1] = auth;

        socket.emit('authenticated', tabUser);
    });
});

server.listen(port, function() {
    console.log('App running on port '+port);
});