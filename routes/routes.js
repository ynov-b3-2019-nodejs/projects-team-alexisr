const express = require('express');
//const router =  express.Router();
//let app = express();
const passport = require('passport');
const request = require('request');
const bcrypt = require('bcrypt')
const uuidv4 = require('uuid/v4');
const LocalStrategy = require('passport-local').Strategy;
const bodyParser = require('body-parser');

const db = require('../queries');

passport.use(new LocalStrategy({passReqToCallback: true}, function(req, username, password, done) {
   console.log("Verification function called");
   //return done(null, {username, id: 1});

   loginAttempt();

   async function loginAttempt() {
      const client = await db.pool.connect();
      try {
         await client.query('BEGIN');
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
                     return done(null, [{email: result.rows[0].email, first_name: result.rows[0].first_name}]);
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
      res.render('index', {title: 'Home', authenticated: req.isAuthenticated(), userData: req.user, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      
      console.log(req.user);
   });

   app.get('/join', function (req, res, next) {
      res.render('join', {title: 'Join', authenticated: req.isAuthenticated(), userData: req.user, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      
      console.log(req.user);
   });

   app.post('/join', async function(req, res) {
      try {
         const client = await db.pool.connect();
         await client.query('BEGIN');

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
         res.render('messages', {title: 'Messages', authenticated: req.isAuthenticated(), userData: req.user, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      } else {
         res.redirect('/login');
      }
   });

   app.get('/login', function(req, res, next) {
      req.session.errors = null;
      if(req.isAuthenticated()) {
         res.redirect('/messages');
      } else {
         res.render('login', {errors: req.session.errors, title: 'Log-in', authenticated: req.isAuthenticated(), userData: req.user, messages: {danger: req.flash('danger'), warning: req.flash('warning'), success: req.flash('success')}});
      }
   });

   app.post('/login', passport.authenticate('local', {
      successRedirect: '/messages',
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

   /*app.post('/login',
  // wrap passport.authenticate call in a middleware function
  function (req, res, next) {
    // call passport authentication passing the "local" strategy name and a callback function
    passport.authenticate('local', function (error, user, info) {
      // this will execute in any case, even if a passport strategy will find an error
      // log everything to console
      console.log(error);
      console.log(user);
      console.log(info);
      console.log("username : " + req.body.username);
      console.log("password : " + req.body.password);

      if (error) {
        res.status(401).send(error);
      } else if (!user) {
        res.status(401).send(info);
      } else {
        next();
      }

      res.send(info);
      })(req, res);
   },

   // function to call once successfully authenticated
   function (req, res) {
      res.status(200).send('logged in!');
   });*/

   

   app.get('/logout', function(req, res, next) {
      console.log(req.isAuthenticated());
      req.logout();
      console.log(req.isAuthenticated());
      req.flash('success', 'Logged out ! See you soon.');
      res.redirect('/login');
   });



}

/*router.get('/add', function(req, res){
   res.render('add', { errors: req.session.errors });
   req.session.errors = null;
});

router.post('/add', function(req, res) {
    let name = req.body.name;
    let email = req.body.email;
  
    req.checkBody('name', 'Name is required').notEmpty();
    req.checkBody('email', 'Email is required').notEmpty();
    req.checkBody('email', 'Please enter a valid email').isEmail();
  
    const errors = req.validationErrors();
    if(errors){
       req.session.errors = errors;
       res.redirect('/login');
    }
    else{
       req.session.success = true;
       req.session.user = {name: name, email: email};
       res.redirect('/compter/5');
    }
 });*/