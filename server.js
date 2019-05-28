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

app.get('/compter/:nombre', function(req, res) {
    if(!isNaN(req.params.nombre) && req.params.nombre > 0) {
        let tNoms = ['Alexis', 'Bob', 'Peter'];
        let a = tNoms.length;
        res.render('compter.ejs', {nombre: req.params.nombre, noms: tNoms, title: 'Compter'});
    } else {
        res.setHeader('Content-Type', 'text/plain');
        res.status(404).send('Page introuvable !');
    }
})

app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

io.sockets.on('connection', function(socket) {
    socket.emit('message', 'Vous etes bien connecté !');
    socket.broadcast.emit('message', 'Un autre client vient de se connecter !');
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
        console.log('Un message du client : '+message);
    });
});

server.listen(port, function() {
    console.log('App running on port '+port);
});