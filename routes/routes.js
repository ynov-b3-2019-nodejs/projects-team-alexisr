const express = require('express');
//const router =  express.Router();
//let app = express();
const passport = require('passport');
const request = require('request');
const bcrypt = require('bcrypt')
const uuidv4 = require('uuid/v4');
const LocalStrategy = require('passport-local').Strategy;
const bodyParser = require('body-parser');
const { check, validationResult } = require('express-validator/check');

const db = require('../queries');
let client;

const getClient = async () => {
   if (client) {
      return client;
   }

   client = await db.pool.connect();
   await client.query('BEGIN');

   return client;   
}

passport.use(new LocalStrategy({passReqToCallback: true}, function(req, username, password, done) {
   console.log("Verification function called");

   loginAttempt();

   async function loginAttempt() {
      
      try {
        await getClient();
         client.query('SELECT id, first_name, email, password FROM users WHERE email = $1', [username], function(err, result) {
            if(err) {
               console.log(err);
               return done(err);
            }

            if(result.rows[0] == null) {
               console.log('Incorrect login details.');
               req.flash('danger', 'Incorrect login details');
               return done(null, false);
            }

               bcrypt.compare(password, result.rows[0].password, function(err, check) {
                  if(err) {
                     console.log('Error while checking password.');
                     return done();
                  }
                  
                  else if(check) {
                     console.log('Logged in');
                     return done(null, [{id: result.rows[0].id, email: result.rows[0].email, first_name: result.rows[0].first_name, last_name: result.rows[0].first_name}]);
                  }
                  else {
                     console.log('Incorrect login details.');
                     req.flash('danger', 'Incorrect login details');

                     return done(null, false);
                  }
               });
            }
         )
      }
      catch(e) { 
         console.log(e);
         throw(e); 
      }
   };
}));

passport.serializeUser(function(user, done) {
   done(null, user);
});

passport.deserializeUser(function(user, done) {
   done(null, user);
});

module.exports =  function(app) {
   app.use(express.static('public'));
   app.use(bodyParser.json());
   app.use(bodyParser.urlencoded({extended: true}));
   app.use(passport.initialize());
   app.use(passport.session());

   app.get('/', function (req, res, next) {
      //res.render('index', {title: 'Home', authenticated: req.isAuthenticated(), userData: req.user[0], messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      res.redirect('/login');
      console.log(req.user);
   });

   app.get('/join', function (req, res, next) {
      res.render('join', {title: 'Join', authenticated: req.isAuthenticated(), userData: req.user ? req.user[0] : {id: 0}, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      
      console.log(req.user);
   });

   app.post('/join', async function(req, res) {
      try {
         
         
        await getClient();
         const pwd = await bcrypt.hash(req.body.pwd, 10);

         await JSON.stringify(client.query('SELECT id FROM users WHERE email=$1', [req.body.mail], function(err, result) {
            if(result.rows[0]) {
               req.flash('warning', 'This email is already registered. <a href="/login">Log in</a>');
               res.redirect('/join');
            } else {
               client.query('INSERT INTO users(id, first_name, last_name, email, password) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), req.body.fname, req.body.lname, req.body.mail, pwd], function(err, result) {
                  if(err) {
                     console.log(err);
                  } else {
                     client.query('COMMIT');
                     console.log(result);
                     req.flash('success', 'User created !');
                     
                     res.redirect('/login');
                     return;
                  }
               });
            }
         }));
         client.release();
      }
      catch(e) { throw(e); }
   });

   app.get('/messages', function(req, res, next) {
      if(req.isAuthenticated()) {
         res.render('messages', {title: 'Messages', authenticated: req.isAuthenticated(), userData: req.user[0], messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      } else {
         res.redirect('/login');
      }
   });

   app.get('/login', function(req, res, next) {
      req.session.errors = null;
      if(req.isAuthenticated()) {
         res.redirect('/conversations');
      } else {
         res.render('login', {errors: req.session.errors, title: 'Log-in', authenticated: req.isAuthenticated(), userData: req.user ? req.user[0] : {id: 0}, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      }
   });

   app.post('/login', passport.authenticate('local', {
      successRedirect: '/conversations',
      failureRedirect: '/login',
      failureFlash: true
   }), function(req, res) {
      if(req.body.remember) {
         req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // cookies expirent apres 30 jours
      } else {
         req.session.cookie.expires = false; // cookies expirent a la finnde la session
      }

      res.redirect('/');
   });

   app.get('/logout', function(req, res, next) {
      console.log(req.isAuthenticated());
      req.logout();
      console.log(req.isAuthenticated());
      req.flash('success', 'Logged out ! See you soon.');
      res.redirect('/login');
   });

   app.get('/conversations', async function(req, res , next) {
      console.log('Attempting to load conversations');
      if(req.isAuthenticated()) {
        await getClient();
         await JSON.stringify(client.query('SELECT conversations_users.conversation_id, users.first_name, users.last_name FROM (SELECT conversation_id FROM conversations_users WHERE user_id = $1) AS convs, conversations, conversations_users, users WHERE convs.conversation_id = conversations.id AND conversations_users.conversation_id = conversations.id AND conversations_users.user_id = users.id', [req.user[0].id], function(err, result) {
            const aa = result;
            let groupedData = {};
            result.rows.forEach(r => {
               if (groupedData[r.conversation_id]){
                  groupedData[r.conversation_id] = [...groupedData[r.conversation_id], {first_name: r.first_name, last_name: r.last_name}];
               } else {
                  groupedData[r.conversation_id] = [ {first_name: r.first_name, last_name: r.last_name}];
               }
            });
            console.log(groupedData);
            res.render('conversations', {convs: groupedData, errors: req.session.errors, title: 'My conversations', authenticated: req.isAuthenticated(), userData: req.user[0], messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});   
         }));
      } else {
         res.redirect('/login');
      }
   });

   app.get('/conversations/new', async function(req, res, next) {
      if(req.isAuthenticated()) {
         
         
        await getClient();
         await JSON.stringify(client.query('SELECT DISTINCT * FROM users', function(err, result) {
            res.render('newconv', {utilisateurs: result.rows, errors: req.session.errors, title: 'Create a new conversation', authenticated: req.isAuthenticated(), userData: req.user[0], messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});   
         }));
      } else {
         res.redirect('/login');
      }
   })

   app.post('/conversations', check('fields').custom((value, {req}) =>{
      return !(value[1] === req.user[0].id)
   }), async function(req, res) {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
         req.flash('danger', 'User cannot be the same !');
         return res.redirect('/conversations/new');
      }
      console.log('Attempting to create conversation');
      const conv_id = uuidv4();
      let erreurs;
      if(req.isAuthenticated()) {
         
        await getClient();

         await JSON.stringify(client.query('INSERT INTO conversations(id) VALUES ($1)', [conv_id], async function(erreur, result) {
            if(erreur) {
               erreurs += erreur;
               console.log(result);
            } else {
               /*req.body.nbUsers.forEach(function(element) {
               client.query('INSERT INTO conversations_users(user_id, conversation_id) VALUES ($1, $2)', [element.id, conv_id], function(err, result) {

               })
               })*/
               const test1 = req.body.fields[1];
               await client.query('INSERT INTO conversations_users(user_id, conversation_id) VALUES ($1, $2)', [req.body.fields[1], conv_id], function(err, res) {
                  if(err) {
                     erreurs += err;
                  }
                  console.log(res);
               });
               await client.query('INSERT INTO conversations_users(user_id, conversation_id) VALUES ($1, $2)', [req.user[0].id, conv_id], function(err, res) {
                  if(err) {
                     erreurs += err;
                  }
                  console.log(res);
               });
               if(erreurs) {
                  console.log(erreurs);
                  res.redirect('/messages')
               } else {
                  console.log("Conversation créée");
                  await client.query('COMMIT');
                  res.redirect('/conversations'); 
               }
            }  
         }));
      } else {
         res.redirect('/login');
      }
   });

   app.get('/conversations/:id', async function(req, res, next) {
      if(!req.isAuthenticated()) {
         return res.redirect('/login');
      }

      await getClient()
      
      const {rows: msgs} = await client.query('SELECT * FROM messages, users where conversation_id = $1 and users.id = messages.user_id', [req.params.id])
      const {rows: users} = await client.query('SELECT users.* from users, conversations_users where conversations_users.conversation_id = $1 and conversations_users.user_id = users.id', [req.params.id])
   
      if(users.map(a => a.id).includes(req.user[0].id)) {
         return res.render('messages', {users, client: client, conv_id: req.params.id, msgs, errors: req.session.errors, title: 'Messages', authenticated: req.isAuthenticated(), userData: req.user[0], messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      }

      req.flash('danger', 'You do not have access to this conversation !');
      return res.redirect('back');
   });

   async function envoyerMessage(user, conv, msg) {
   //app.post('/conversations/:id', async function(req, res) {
     await getClient();
      

      await JSON.stringify(client.query('INSERT INTO messages(id, user_id, conversation_id, content, date_creat) VALUES($1, $2, $3, $4)', [uuidv4(), user, conv, msg], function(err, result) {
         if(err) {
            console.log(err);
         } else {
            client.query('COMMIT');
         }
      }));
   //});
   }
}