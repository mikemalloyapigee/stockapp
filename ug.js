var usergrid = require('usergrid');
var config = require('./config');

var client = new usergrid.client({
    'orgName': config.USERGRID_ORG,
    'appName': config.USERGRID_APP,
    "clientId" : config.USERGRID_CLIENT_ID,
    "clientSecret" : config.USERGRID_CLIENT_SECRET
});

client.login(config.USERGRID_USER, config.USERGRID_PASSWORD, function(err, data, user){ if(err){console.log(err);}});


exports.client=client


