'use strict';

/**** Init ****/

var config = require('./config');
var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , bodyParser = require('body-parser')
  , favicon = require('serve-favicon')
  , logger = require('morgan')
  , methodOverride = require('method-override')
  , cookieParser = require('cookie-parser')
  , session = require('express-session')
  , init = require('./init')
  , volos = require('./volos')
  , request = require('request')
  , usergrid = require('usergrid')
  , portfolio = require('./portfolio');
 

var passport = require('passport'), FacebookStrategy = require('passport-facebook').Strategy;

var _ = require('underscore');
init.createApp(initOauth);

/**** Express ****/
function startExpress(){
  var app = express();
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(favicon(__dirname + '/public/images/favicon.png'));
  app.use(logger('dev'));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(methodOverride('_method'));
  app.use(require('stylus').middleware(__dirname + '/public'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(cookieParser());
  app.use(session({ secret: 'keyboard cat' }));
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/success', setAccessToken, setupAccess, oauth.expressMiddleware().authenticate(), portfolio.setupPortfolio);
  app.get('/view_portfolio', setupAccess, oauth.expressMiddleware().authenticate(), routes.view_portfolio );
  app.get('/buy', setupAccess, oauth.expressMiddleware().authenticate(), routes.show_buy_form);
  app.post('/buy', portfolio.enforceTradeLimit, setupAccess, oauth.expressMiddleware().authenticate(), portfolio.buyStock);
  app.get('/sell', setupAccess, oauth.expressMiddleware().authenticate(), routes.show_sell_form);
  app.post('/sell', portfolio.enforceTradeLimit, setupAccess, oauth.expressMiddleware().authenticate(), portfolio.sellStock);
  app.get('/summary', setupAccess, oauth.expressMiddleware().authenticate(), routes.summary);
  app.get('/error', function(req, res, next) {
    msg = "There was an error while logging in"
    res.render("error_page", {error_message: msg});
  });
  app.get('/', routes.index);
  app.get('/auth/facebook', passport.authenticate('facebook'));
  app.get('/auth/facebook/callback', passport.authenticate('facebook', {
    successRedirect: '/success',
    failureRedirect: '/error'
  }));
  app.listen(app.get('port'));
  console.log("Express server listening on port " + app.get('port'));
}



passport.use(new FacebookStrategy({
  clientID: config.FACEBOOK_APP_ID,
  clientSecret: config.FACEBOOK_SECRET,
  callbackURL: '/auth/facebook/callback'
}, function(accessToken, refreshToken, profile, done) {
    var user = profile;
    return done(null, user);
}));
 
passport.serializeUser(function(user, done) {
  done(null, user);
});
 
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

/**** OAuth ****/

var oauth;
var application;
var token;
function initOauth(app) {
  console.log("App:" + app);
  application = app;
  console.log("Application:\n"+application);
  var oAuth = volos.oAuth;

  var oauthConfig = _.extend({
    encryptionKey: 'abc123',
    validGrantTypes: [ 'client_credentials', 'authorization_code', 'implicit_grant', 'password' ],
    passwordCheck: oauthCheckPassword
    }, config.redisConfig);

  oauth = oAuth.create(oauthConfig);

  function oauthCheckPassword(username, password, cb) {
    cb(null, true);
  }
  
  console.log('Initialized OAuth');
  
  startExpress();

}

function setupAccess(req, res, next){
  if(req.user === undefined || req.session.access_token === undefined){res.redirect("/");}
  else{
    token = req.session.access_token;
    req.headers.authorization = "Bearer " + token;
    next();
  }
}

function setAccessToken(req, res, next){
  init.createToken(application, oauth, function(creds) {
    req.session.access_token = creds.accessToken;
    next();
  });
}





